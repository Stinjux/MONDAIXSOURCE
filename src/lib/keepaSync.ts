// Mise à jour des leads depuis Keepa (Amazon.ca).
//
// Garanties :
//  * Respecte le quota : vérifie d'abord les jetons (gratuit), n'envoie que ce qu'il peut payer,
//    s'arrête dès que Keepa répond « plus de jetons ». Pensée pour tourner toutes les 15 minutes.
//  * Chaque lead actif est mis à jour au plus une fois par jour (jour calendaire, heure du Québec) ;
//    les leads jamais mis à jour, puis ceux mis à jour il y a le plus longtemps, passent en premier.
//  * Les leads rejetés sont analysés une fois par semaine, après les actifs, avec les jetons restants
//    (Keepa Alert : un rejeté peut redevenir intéressant). Les leads achetés ne sont plus analysés.
//  * N'efface ni ne modifie rien : une ligne KeepaSnapshot par mise à jour, les valeurs de la Sheet
//    restent intactes ; seul Product.keepaCheckedAt (colonne propre à Keepa) avance.
//  * Un seul passage à la fois (verrou en base qui expire seul, jamais supprimé).

import type { PrismaClient } from "@prisma/client";
import { prisma as defaultDb } from "./prisma";
import { localDateKey } from "./dates";
import { KEEPA_DEFAULT_COST, KEEPA_MAX_ASINS, KeepaError, keepaKey, keepaProducts, keepaTokenStatus, type KeepaFacts } from "./keepa";

const LOCK_KEY = "keepa.lock";
const COST_KEY = "keepa.cost";
/** Résultat du dernier passage (affiché dans Settings), y compris une erreur avant tout appel (clé invalide…) */
export const KEEPA_STATUS_KEY = "keepa.status";

/** Les leads rejetés sont analysés une fois par semaine (Keepa Alert) */
export const REJECTED_EVERY_DAYS = 7;

export type KeepaRunResult = {
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  requested: number;
  updated: number;
  noData: number;
  tokensLeft: number | null;
  message?: string;
  runId?: string;
};

/** Nombre d'ASIN à demander avec les jetons disponibles. */
export function batchSize(tokensLeft: number, costPerAsin: number, remaining: number): number {
  if (tokensLeft <= 0 || remaining <= 0) return 0;
  return Math.max(0, Math.min(KEEPA_MAX_ASINS, remaining, Math.floor(tokensLeft / Math.max(1, costPerAsin))));
}

/**
 * Leads à mettre à jour, dans l'ordre : jamais interrogés (les plus récents d'abord), puis les plus anciens.
 * Un lead déjà interrogé aujourd'hui (heure du Québec) n'est jamais repris le même jour.
 */
export function dueOrder<T extends { keepaCheckedAt: Date | null; firstSeenAt: Date }>(items: T[], now: Date, everyDays = 1): T[] {
  // Dû si la dernière analyse date d'un jour (heure du Québec) antérieur ou égal à « aujourd'hui − everyDays »
  const limit = localDateKey(new Date(now.getTime() - everyDays * 86_400_000));
  return items
    .filter((p) => !p.keepaCheckedAt || localDateKey(p.keepaCheckedAt) <= limit)
    .sort((a, b) => {
      if (!a.keepaCheckedAt !== !b.keepaCheckedAt) return a.keepaCheckedAt ? 1 : -1;
      if (!a.keepaCheckedAt) return b.firstSeenAt.getTime() - a.firstSeenAt.getTime();
      return a.keepaCheckedAt.getTime() - b.keepaCheckedAt!.getTime();
    });
}

async function acquireLock(db: PrismaClient): Promise<boolean> {
  const rows = await db.$queryRaw<{ key: string }[]>`
    INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES (${LOCK_KEY}, '{}'::jsonb, NOW())
    ON CONFLICT ("key") DO UPDATE SET "updatedAt" = NOW()
    WHERE "AppSetting"."updatedAt" < NOW() - INTERVAL '15 minutes'
    RETURNING "key"`;
  return rows.length > 0;
}
async function releaseLock(db: PrismaClient) {
  // Le verrou n'est jamais supprimé : il est simplement rendu expiré
  await db.$executeRaw`UPDATE "AppSetting" SET "updatedAt" = to_timestamp(0) WHERE "key" = ${LOCK_KEY}`;
}

export type KeepaRunOptions = {
  db?: PrismaClient;
  fetch?: typeof fetch;
  now?: Date;
  trigger?: string;
  /** Mise à jour à la demande de ces ASIN (bouton de la fiche lead : passe outre la règle d'un passage par jour) */
  asins?: string[];
  maxBatches?: number;
};

export async function runKeepa(opts: KeepaRunOptions = {}): Promise<KeepaRunResult> {
  const db = opts.db ?? defaultDb;
  const r = await runKeepaInner(opts);
  if (r.status !== "SKIPPED" || /jetons/i.test(r.message ?? "")) {
    const value = { at: (opts.now ?? new Date()).toISOString(), status: r.status, updated: r.updated, tokensLeft: r.tokensLeft, message: r.message ?? null };
    await db.appSetting.upsert({ where: { key: KEEPA_STATUS_KEY }, create: { key: KEEPA_STATUS_KEY, value }, update: { value } }).catch(() => undefined);
  }
  return r;
}

async function runKeepaInner(opts: KeepaRunOptions): Promise<KeepaRunResult> {
  const db = opts.db ?? defaultDb;
  const now = opts.now ?? new Date();
  const fetchImpl = opts.fetch ?? fetch;
  const empty = { requested: 0, updated: 0, noData: 0, tokensLeft: null };
  if (!keepaKey()) return { status: "SKIPPED", ...empty, message: "KEEPA_API_KEY n'est pas configurée" };
  if (!(await acquireLock(db))) return { status: "SKIPPED", ...empty, message: "Une mise à jour Keepa est déjà en cours" };

  let runId: string | undefined;
  const result: KeepaRunResult = { status: "SUCCESS", ...empty };
  try {
    // Leads concernés : actifs chaque jour, puis rejetés chaque semaine (jamais les achetés), ou ceux demandés
    const purchased = new Set(
      (await db.purchaseItem.findMany({ where: { purchase: { cancelledAt: null } }, select: { asin: true } })).map((i) => i.asin),
    );
    const candidates = await db.product.findMany({
      where: opts.asins ? { asin: { in: opts.asins } } : undefined,
      select: { id: true, asin: true, keepaCheckedAt: true, firstSeenAt: true, reviewStatus: true },
    });
    const pool = candidates.filter((p) => !purchased.has(p.asin));
    const due = opts.asins
      ? candidates
      : [...dueOrder(pool.filter((p) => p.reviewStatus !== "REJECTED"), now), ...dueOrder(pool.filter((p) => p.reviewStatus === "REJECTED"), now, REJECTED_EVERY_DAYS)];
    if (!due.length) return { ...result, status: "SKIPPED", message: "Aucun lead à mettre à jour pour l'instant" };

    const status = await keepaTokenStatus(fetchImpl);
    const costRow = await db.appSetting.findUnique({ where: { key: COST_KEY } });
    let cost = typeof costRow?.value === "number" && costRow.value > 0 ? costRow.value : KEEPA_DEFAULT_COST;
    let tokens = status.tokensLeft;
    result.tokensLeft = tokens;
    if (batchSize(tokens, cost, due.length) === 0) {
      return { ...result, status: "SKIPPED", message: `Pas assez de jetons Keepa (${tokens}) : prochain passage dans quelques minutes` };
    }

    const run = await db.importRun.create({ data: { source: "KEEPA", status: "RUNNING", trigger: opts.trigger ?? "CLI", startedAt: now } });
    runId = run.id;
    const byAsin = new Map(due.map((p) => [p.asin, p]));
    let queue = due.map((p) => p.asin);
    const maxBatches = opts.maxBatches ?? 10;
    for (let b = 0; b < maxBatches && queue.length; b++) {
      const size = batchSize(tokens, cost, queue.length);
      if (!size) break;
      const batch = queue.slice(0, size);
      queue = queue.slice(size);
      let products: KeepaFacts[];
      try {
        const res = await keepaProducts(batch, fetchImpl);
        products = res.products;
        if (res.tokens) {
          tokens = res.tokens.tokensLeft;
          if (res.tokens.tokensConsumed) cost = Math.max(1, Math.round((res.tokens.tokensConsumed / batch.length) * 10) / 10);
        }
      } catch (e) {
        if (e instanceof KeepaError && (e.status === 429 || e.status === 503)) {
          result.message = "Quota Keepa atteint : la suite au prochain passage";
          result.tokensLeft = e.tokens?.tokensLeft ?? result.tokensLeft;
          break;
        }
        throw e;
      }
      const found = new Set<string>();
      await db.$transaction(async (tx) => {
        for (const k of products) {
          const p = byAsin.get(k.asin);
          if (!p) continue;
          found.add(k.asin);
          await tx.keepaSnapshot.create({
            data: {
              productId: p.id, asin: k.asin, capturedAt: now, buyBox: k.buyBox, buyBoxAvg90: k.buyBoxAvg90, amazonPrice: k.amazonPrice, amazonSelling: k.amazonSelling,
              newOffers: k.newOffers, fbaOffers: k.fbaOffers, salesRank: k.salesRank, salesRankAvg90: k.salesRankAvg90, monthlySold: k.monthlySold,
              fbaFee: k.fbaFee, referralPct: k.referralPct, runId,
            },
          });
        }
        // Interrogés, avec ou sans données : pas redemandés avant demain
        await tx.product.updateMany({ where: { asin: { in: batch } }, data: { keepaCheckedAt: now } });
      });
      result.requested += batch.length;
      result.updated += found.size;
      result.noData += batch.length - found.size;
      result.tokensLeft = tokens;
    }
    await db.appSetting.upsert({ where: { key: COST_KEY }, create: { key: COST_KEY, value: cost }, update: { value: cost } });
    if (queue.length && !result.message) result.message = `${queue.length} lead${queue.length > 1 ? "s" : ""} au prochain passage (jetons)`;
    await db.importRun.update({
      where: { id: runId },
      data: { status: "SUCCESS", finishedAt: new Date(), rowsRead: result.requested, imported: result.updated, warnings: result.noData, missing: queue.length, details: result.message ?? null },
    });
    return { ...result, runId };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur Keepa";
    if (runId) await db.importRun.update({ where: { id: runId }, data: { status: "FAILED", finishedAt: new Date(), rowsRead: result.requested, imported: result.updated, details: message } });
    return { ...result, status: "FAILED", message, runId };
  } finally {
    await releaseLock(db);
  }
}
