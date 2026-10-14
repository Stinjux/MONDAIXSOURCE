// Moteur de synchronisation Google Sheets -> PostgreSQL.
//
// Garanties :
//  * Idempotent : relancer une synchronisation sans changement dans la Sheet ne modifie rien.
//  * Insensible au tri : une occurrence est identifiée par (source, offre, rang) et non par numéro de ligne.
//  * Ne supprime jamais rien : une ligne disparue passe à present=false (missingSince renseigné).
//  * Une seule synchronisation à la fois (verrou en base, expirant après 15 minutes).

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultDb } from "../prisma";
import { readSheet, sheetConfig } from "../google";
import { config } from "../config";
import { parseSheetDate, weekKey, type DateOrder } from "../dates";
import { matchOffer } from "../duplicates";
import { isBlankRow, isHeaderRow, isCad, parseRow, supplierIdentity, type ParsedRow, type SheetSource } from "../normalize";
import { stockFromSheet } from "../stock";
import { PRICE_FIELDS, pickOfferValues, pricesChanged, prioritize, rowHash } from "./values";

export type RowReader = (source: SheetSource) => Promise<string[][]>;
export type Trigger = "MANUAL" | "CRON" | "CLI" | "LEGACY_MIGRATION" | "TEST";

export type SyncOptions = { trigger?: Trigger; read?: RowReader; now?: Date; db?: PrismaClient; dateOrder?: DateOrder };

export type SyncResult = {
  source: SheetSource | "ALL";
  runId?: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  rowsRead: number;
  imported: number;
  duplicates: number;
  updated: number;
  unchanged: number;
  errors: number;
  warnings: number;
  missing: number;
  message?: string;
};

type Issue = { sheetRow?: number; severity: "ERROR" | "WARNING"; message: string; raw?: Prisma.InputJsonValue };
type Counters = Omit<SyncResult, "source" | "runId" | "status" | "message">;

type ProductState = { id: string; asin: string };
type OfferState = {
  id: string;
  productId: string;
  supplierKey: string;
  supplierName: string | null;
  supplierUrl: string | null;
  stockStatus: string;
};
type IngestItem = { row: ParsedRow; discoveredAt: Date; firstDiscovery: Date; raw: Prisma.InputJsonValue };
type OccState = {
  id: string;
  ordinal: number;
  offerId: string;
  productId: string;
  present: boolean;
  rowHash: string;
  sheetRow: number;
  availability: string | null;
  lastChecked: string | null;
  checkDetail: string | null;
} & Record<(typeof PRICE_FIELDS)[number], number | null>;

const MAX_ISSUES_PER_RUN = 500;
const LOCK_KEY = "sync.lock";

const occFields = (row: ParsedRow) => ({
  name: row.name,
  salePrice: row.salePrice ?? null,
  buyBox90: row.buyBox90 ?? null,
  fbaFee: row.fbaFee ?? null,
  costPrice: row.costPrice ?? null,
  estimatedSales: row.estimatedSales ?? null,
  currency: row.currency ?? null,
  exportDate: row.exportDate ?? null,
  sheetRoi: row.sheetRoi ?? null,
  sheetMargin: row.sheetMargin ?? null,
  sheetProfit: row.sheetProfit ?? null,
  notes: row.notes ?? null,
  availability: row.availability ?? null,
  lastChecked: row.lastChecked ?? null,
  checkDetail: row.checkDetail ?? null,
});

const snapshotFields = (row: ParsedRow) => ({
  salePrice: row.salePrice ?? null,
  buyBox90: row.buyBox90 ?? null,
  fbaFee: row.fbaFee ?? null,
  costPrice: row.costPrice ?? null,
  estimatedSales: row.estimatedSales ?? null,
  currency: row.currency ?? null,
});

function chunk<T>(items: T[], size = 1000): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Applique des lignes normalisées à la base. Partagé par la synchronisation et la migration historique. */
class Ingestor {
  private products = new Map<string, ProductState>();
  private asinById = new Map<string, string>();
  private offersByProduct = new Map<string, OfferState[]>();
  /** Occurrences existantes de la source, par offre */
  private occurrences = new Map<string, OccState[]>();
  private ordinals = new Map<string, number>();
  private seen = new Set<string>();
  private unchangedIds: string[] = [];
  readonly touchedOffers = new Set<string>();
  readonly touchedProducts = new Set<string>();
  private duplicateProducts = new Set<string>();
  readonly counters: Counters = { rowsRead: 0, imported: 0, duplicates: 0, updated: 0, unchanged: 0, errors: 0, warnings: 0, missing: 0 };
  readonly issues: Issue[] = [];

  constructor(
    private db: PrismaClient,
    private source: SheetSource,
    private runId: string,
    private now: Date,
    private dateOrder: DateOrder,
  ) {}

  async load() {
    const [products, offers, occs] = await Promise.all([
      this.db.product.findMany({ select: { id: true, asin: true } }),
      this.db.supplierOffer.findMany({ select: { id: true, productId: true, supplierKey: true, supplierName: true, supplierUrl: true, stockStatus: true } }),
      this.db.occurrence.findMany({
        where: { source: this.source },
        select: {
          id: true, offerId: true, productId: true, ordinal: true, present: true, rowHash: true, sheetRow: true,
          availability: true, lastChecked: true, checkDetail: true,
          salePrice: true, buyBox90: true, fbaFee: true, costPrice: true, estimatedSales: true,
        },
      }),
    ]);
    for (const p of products) {
      this.products.set(p.asin, p);
      this.asinById.set(p.id, p.asin);
    }
    for (const o of offers) {
      if (!this.offersByProduct.has(o.productId)) this.offersByProduct.set(o.productId, []);
      this.offersByProduct.get(o.productId)!.push(o);
    }
    for (const o of occs) {
      if (!this.occurrences.has(o.offerId)) this.occurrences.set(o.offerId, []);
      this.occurrences.get(o.offerId)!.push(o);
    }
  }

  issue(i: Issue) {
    if (i.severity === "ERROR") this.counters.errors++;
    else this.counters.warnings++;
    if (this.issues.length < MAX_ISSUES_PER_RUN) this.issues.push(i);
  }

  /**
   * Applique un lot de lignes, en trois temps :
   *  1. rattachement de chaque ligne à son produit (ASIN) et à son offre fournisseur (créés si besoin) ;
   *  2. appariement aux occurrences existantes de l'offre — d'abord à valeurs identiques, puis par rang —
   *     pour qu'un tri ou une insertion dans la Sheet ne soit pas pris pour une modification ;
   *  3. écriture (création, mise à jour ou simple « vu »).
   * `firstDiscovery` = date la plus ancienne de l'ASIN dans le lot (fixe la semaine d'objectif).
   */
  async ingestBatch(items: IngestItem[], firstSource?: string) {
    const { db, now, runId } = this;
    const createdProducts = new Set<string>();
    const createdOffers = new Set<string>();
    const resolved: (IngestItem & { product: ProductState; offer: OfferState; hash: string; existing?: OccState })[] = [];

    // 1. Produit et offre
    for (const item of items) {
      const { row, discoveredAt, firstDiscovery } = item;
      let product = this.products.get(row.asin);
      if (!product) {
        const countsTowardGoal = row.source === "LEADS";
        product = await db.product.create({
          data: {
            asin: row.asin,
            name: row.name,
            amazonUrl: row.amazonUrl ?? null,
            firstSeenAt: firstDiscovery,
            lastSeenAt: discoveredAt,
            firstSource: firstSource ?? row.source,
            countsTowardGoal,
            goalWeek: countsTowardGoal ? weekKey(firstDiscovery) : null,
          },
          select: { id: true, asin: true },
        });
        this.products.set(row.asin, product);
        this.asinById.set(product.id, product.asin);
        this.offersByProduct.set(product.id, []);
        createdProducts.add(product.id);
        this.counters.imported++;
      }
      this.touchedProducts.add(product.id);

      const offers = this.offersByProduct.get(product.id) ?? [];
      const match = matchOffer(offers, row);
      let offer: OfferState;
      if (match) {
        offer = match.offer;
        if (match.upgrade) {
          await db.supplierOffer.update({ where: { id: offer.id }, data: { supplierKey: row.supplierKey, supplierUrl: row.supplierUrl ?? null, supplierName: offer.supplierName ?? row.supplierName ?? null } });
          Object.assign(offer, { supplierKey: row.supplierKey, supplierUrl: row.supplierUrl ?? null });
        }
      } else {
        offer = await db.supplierOffer.create({
          data: {
            productId: product.id,
            supplierKey: row.supplierKey,
            supplierName: row.supplierName ?? null,
            supplierUrl: row.supplierUrl ?? null,
            firstSeenAt: discoveredAt,
            lastSeenAt: discoveredAt,
            currency: row.currency && !isCad(row.currency) ? row.currency : "CAD",
          },
          select: { id: true, productId: true, supplierKey: true, supplierName: true, supplierUrl: true, stockStatus: true },
        });
        offers.push(offer);
        this.offersByProduct.set(product.id, offers);
        createdOffers.add(offer.id);
      }
      resolved.push({ ...item, product, offer, hash: rowHash(row) });
    }

    // 2. Appariement des occurrences, offre par offre
    const byOffer = new Map<string, typeof resolved>();
    for (const r of resolved) {
      if (!byOffer.has(r.offer.id)) byOffer.set(r.offer.id, []);
      byOffer.get(r.offer.id)!.push(r);
    }
    for (const [offerId, group] of byOffer) {
      const free = [...(this.occurrences.get(offerId) ?? [])].filter((o) => !this.seen.has(o.id)).sort((a, b) => a.ordinal - b.ordinal);
      const claim = (o: OccState) => {
        free.splice(free.indexOf(o), 1);
        this.seen.add(o.id);
        return o;
      };
      for (const r of group) {
        const same = free.find((o) => o.rowHash === r.hash);
        if (same) r.existing = claim(same);
      }
      for (const r of group) if (!r.existing && free.length) r.existing = claim(free[0]);
    }

    // 3. Écriture, dans l'ordre de la Sheet
    const firstOccurrenceDone = new Set<string>();
    for (const r of resolved) {
      const { row, offer, product, existing, hash, discoveredAt, raw } = r;
      let occurrenceId: string;
      if (existing) {
        occurrenceId = existing.id;
        const valuesChanged = existing.rowHash !== hash;
        if (valuesChanged || existing.sheetRow !== row.sheetRow || !existing.present) {
          await db.occurrence.update({
            where: { id: existing.id },
            data: { ...occFields(row), raw, sheetRow: row.sheetRow, rowHash: hash, lastImportedAt: now, present: true, missingSince: null, lastRunId: runId },
          });
          this.touchedOffers.add(offer.id);
          if (valuesChanged) {
            this.counters.updated++;
            if (pricesChanged(existing, row)) {
              await db.priceSnapshot.create({ data: { offerId: offer.id, occurrenceId: existing.id, source: row.source, runId, capturedAt: now, ...snapshotFields(row) } });
            }
          } else this.counters.unchanged++;
        } else {
          this.unchangedIds.push(existing.id);
          this.counters.unchanged++;
        }
      } else {
        const kind =
          createdProducts.has(product.id) && !firstOccurrenceDone.has(product.id)
            ? "NEW_PRODUCT"
            : createdOffers.has(offer.id) && !firstOccurrenceDone.has(offer.id)
              ? "NEW_SUPPLIER"
              : "REPEAT";
        const ordinal = this.nextOrdinal(offer.id);
        const created = await db.occurrence.create({
          data: {
            productId: product.id, offerId: offer.id, source: row.source, ordinal, sheetRow: row.sheetRow, kind,
            discoveredAt, firstImportedAt: now, lastImportedAt: now, rowHash: hash, raw, firstRunId: runId, lastRunId: runId,
            ...occFields(row),
          },
          select: { id: true },
        });
        occurrenceId = created.id;
        this.seen.add(created.id);
        this.touchedOffers.add(offer.id);
        await db.priceSnapshot.create({ data: { offerId: offer.id, occurrenceId: created.id, source: row.source, runId, capturedAt: now, ...snapshotFields(row) } });
        if (kind !== "NEW_PRODUCT") {
          this.counters.duplicates++;
          this.duplicateProducts.add(product.id);
        }
      }
      firstOccurrenceDone.add(product.id);
      firstOccurrenceDone.add(offer.id);
      if (row.source === "OUT_OF_STOCK") await this.trackStock(row, offer, existing, occurrenceId);
    }
  }

  private nextOrdinal(offerId: string): number {
    const existing = this.occurrences.get(offerId) ?? [];
    const next = Math.max(this.ordinals.get(offerId) ?? 0, ...existing.map((o) => o.ordinal + 1));
    this.ordinals.set(offerId, next + 1);
    return next;
  }

  private async trackStock(row: ParsedRow, offer: OfferState, existing: OccState | undefined, _occurrenceId: string) {
    const changed =
      !existing ||
      existing.availability !== (row.availability ?? null) ||
      existing.lastChecked !== (row.lastChecked ?? null) ||
      existing.checkDetail !== (row.checkDetail ?? null);
    if (!changed) return;
    const { status, checkedAt } = stockFromSheet(row.availability, row.lastChecked, { order: this.dateOrder, now: this.now });
    if (row.lastChecked && !checkedAt) this.issue({ sheetRow: row.sheetRow, severity: "WARNING", message: `Date de vérification illisible « ${row.lastChecked} » (colonne O)` });
    if (changed && (row.availability || row.lastChecked || row.checkDetail)) {
      await this.db.stockCheck.create({
        data: { offerId: offer.id, origin: "SHEET", status, availability: row.availability ?? null, checkedAt, checkedText: row.lastChecked ?? null, detail: row.checkDetail ?? null, runId: this.runId, recordedAt: this.now },
      });
    }
    const backInStock = status === "IN_STOCK" && offer.stockStatus !== "IN_STOCK";
    await this.db.supplierOffer.update({
      where: { id: offer.id },
      data: {
        stockStatus: status,
        stockCheckedAt: checkedAt,
        stockDetail: row.checkDetail ?? null,
        ...(backInStock ? { backInStockAt: this.now } : {}),
      },
    });
    offer.stockStatus = status;
  }

  /** Marque les lignes disparues, recalcule les valeurs courantes des offres et produits touchés. */
  async finish(opts: { markMissing: boolean; validRows: number }) {
    const { db, now, runId } = this;
    for (const ids of chunk(this.unchangedIds)) {
      await db.occurrence.updateMany({ where: { id: { in: ids } }, data: { lastImportedAt: now, lastRunId: runId } });
    }

    if (opts.markMissing) {
      const present = [...this.occurrences.values()].flat().filter((o) => o.present);
      const missing = present.filter((o) => !this.seen.has(o.id));
      if (opts.validRows === 0 && present.length > 0) {
        this.issue({ severity: "WARNING", message: "Aucune ligne valide lue : les lignes existantes n'ont PAS été marquées comme retirées (vérifiez la plage de la Sheet)." });
      } else if (missing.length) {
        for (const ids of chunk(missing.map((o) => o.id))) {
          await db.occurrence.updateMany({ where: { id: { in: ids } }, data: { present: false, missingSince: now } });
        }
        for (const o of missing) {
          this.touchedOffers.add(o.offerId);
          this.touchedProducts.add(o.productId);
        }
        this.counters.missing = missing.length;
      }
    }

    if (this.duplicateProducts.size) {
      await db.product.updateMany({ where: { id: { in: [...this.duplicateProducts] } }, data: { lastDuplicateAt: now } });
    }

    // Recalcul des valeurs dérivées
    const productIds = [...this.touchedProducts];
    for (const ids of chunk(productIds, 500)) {
      const occs = await db.occurrence.findMany({
        where: { productId: { in: ids } },
        select: {
          productId: true, offerId: true, source: true, present: true, lastImportedAt: true, discoveredAt: true, name: true, currency: true,
          salePrice: true, buyBox90: true, fbaFee: true, costPrice: true, estimatedSales: true, raw: true,
        },
      });
      const byProduct = new Map<string, typeof occs>();
      const byOffer = new Map<string, typeof occs>();
      for (const o of occs) {
        if (!byProduct.has(o.productId)) byProduct.set(o.productId, []);
        byProduct.get(o.productId)!.push(o);
        if (!byOffer.has(o.offerId)) byOffer.set(o.offerId, []);
        byOffer.get(o.offerId)!.push(o);
      }
      for (const [offerId, list] of byOffer) {
        if (!this.touchedOffers.has(offerId)) continue;
        const times = list.map((o) => o.discoveredAt.getTime());
        await db.supplierOffer.update({
          where: { id: offerId },
          data: { ...pickOfferValues(list), firstSeenAt: new Date(Math.min(...times)), lastSeenAt: new Date(Math.max(...times)) },
        });
      }
      for (const [productId, list] of byProduct) {
        const times = list.map((o) => o.discoveredAt.getTime());
        const best = prioritize(list).find((o) => o.name && o.name !== this.asinOf(productId));
        await db.product.update({
          where: { id: productId },
          data: {
            firstSeenAt: new Date(Math.min(...times)),
            lastSeenAt: new Date(Math.max(...times)),
            ...(best ? { name: best.name } : {}),
          },
        });
      }
    }
  }

  private asinOf(productId: string) {
    return this.asinById.get(productId) ?? "";
  }

  async updateAmazonUrls(rows: ParsedRow[]) {
    // L'URL Amazon la plus récente d'une ligne LEADS (sinon OOS) est conservée sur le produit.
    const urls = new Map<string, string>();
    for (const r of rows) if (r.amazonUrl && (!urls.has(r.asin) || r.source === "LEADS")) urls.set(r.asin, r.amazonUrl);
    for (const [asin, amazonUrl] of urls) {
      const p = this.products.get(asin);
      if (p) await this.db.product.updateMany({ where: { id: p.id, OR: [{ amazonUrl: null }, { amazonUrl: { not: amazonUrl } }] }, data: { amazonUrl } });
    }
  }
}

/** Numéro de la première ligne d'une plage A1 ("Feuille!A2:J" -> 2). */
export function firstRowOfRange(range: string): number {
  const m = range.split("!").pop()!.match(/^[A-Z]*(\d+)/i);
  return m ? Number(m[1]) : 1;
}

async function acquireLock(db: PrismaClient): Promise<boolean> {
  const rows = await db.$queryRaw<{ key: string }[]>`
    INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES (${LOCK_KEY}, '{}'::jsonb, NOW())
    ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = NOW()
    WHERE "AppSetting"."updatedAt" < NOW() - INTERVAL '15 minutes'
    RETURNING "key"`;
  return rows.length > 0;
}

async function releaseLock(db: PrismaClient) {
  await db.appSetting.deleteMany({ where: { key: LOCK_KEY } });
}

async function saveIssues(db: PrismaClient, runId: string, source: string, issues: Issue[]) {
  for (const part of chunk(issues, 200)) {
    await db.importIssue.createMany({ data: part.map((i) => ({ runId, source, sheetRow: i.sheetRow ?? null, severity: i.severity, message: i.message, raw: i.raw ?? undefined })) });
  }
}

/** Synchronise une Sheet. Lève une erreur si la lecture échoue (le run est alors marqué FAILED). */
export async function syncSource(source: SheetSource, opts: SyncOptions = {}): Promise<SyncResult> {
  const db = opts.db ?? defaultDb;
  const now = opts.now ?? new Date();
  const dateOrder = opts.dateOrder ?? config.dateOrder;
  const read = opts.read ?? readSheet;
  const run = await db.importRun.create({ data: { source, status: "RUNNING", trigger: opts.trigger ?? "CLI", startedAt: now } });
  const ing = new Ingestor(db, source, run.id, now, dateOrder);
  try {
    const rows = await read(source);
    await ing.load();
    const firstRow = firstRowOfRange(sheetConfig(source).range);

    // 1. Lecture et validation
    const parsed: { row: ParsedRow; raw: string[]; discoveredAt: Date }[] = [];
    rows.forEach((r, index) => {
      const sheetRow = index + firstRow;
      if (isBlankRow(r) || isHeaderRow(r)) return;
      ing.counters.rowsRead++;
      const result = parseRow(source, r, sheetRow);
      if (!result.ok) return ing.issue({ sheetRow, severity: "ERROR", message: result.error, raw: r });
      for (const w of result.warnings) ing.issue({ sheetRow, severity: "WARNING", message: w });
      let discoveredAt = now;
      if (source === "LEADS" && result.row.exportDate) {
        const d = parseSheetDate(result.row.exportDate, { order: dateOrder, now });
        if (d) discoveredAt = d;
        else ing.issue({ sheetRow, severity: "WARNING", message: `Export Date illisible ou future « ${result.row.exportDate} » : date d'import utilisée` });
      }
      parsed.push({ row: result.row, raw: r, discoveredAt });
    });

    // 2. Date de première découverte par ASIN (fixe la semaine d'objectif des nouveaux produits)
    const firstByAsin = new Map<string, Date>();
    for (const p of parsed) {
      const cur = firstByAsin.get(p.row.asin);
      if (!cur || p.discoveredAt < cur) firstByAsin.set(p.row.asin, p.discoveredAt);
    }

    // 3. Application
    await ing.ingestBatch(parsed.map((p) => ({ row: p.row, discoveredAt: p.discoveredAt, firstDiscovery: firstByAsin.get(p.row.asin)!, raw: p.raw })));
    await ing.updateAmazonUrls(parsed.map((p) => p.row));
    await ing.finish({ markMissing: true, validRows: parsed.length });

    await saveIssues(db, run.id, source, ing.issues);
    await db.importRun.update({ where: { id: run.id }, data: { ...ing.counters, status: "SUCCESS", finishedAt: new Date() } });
    return { source, runId: run.id, status: "SUCCESS", ...ing.counters };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    await saveIssues(db, run.id, source, ing.issues).catch(() => undefined);
    await db.importRun.update({ where: { id: run.id }, data: { ...ing.counters, status: "FAILED", details: message, finishedAt: new Date() } });
    return { source, runId: run.id, status: "FAILED", ...ing.counters, message };
  }
}

const LEGACY_STATUS: Record<string, string> = { REVIEWED: "VALIDATED", REJECTED: "REJECTED", FOLLOW_UP: "FOLLOW_UP" };

/**
 * Migration unique des lignes de l'ancienne table "Lead" vers le nouveau modèle.
 * La table d'origine n'est ni modifiée ni supprimée. Les statuts de revue sont conservés.
 */
export async function migrateLegacy(opts: SyncOptions = {}): Promise<SyncResult[]> {
  const db = opts.db ?? defaultDb;
  const now = opts.now ?? new Date();
  const dateOrder = opts.dateOrder ?? config.dateOrder;
  if (await db.appSetting.findUnique({ where: { key: "legacy.migratedAt" } })) return [];
  const legacy = await db.legacyLead.findMany({ orderBy: [{ sourceRow: "asc" }] });
  const results: SyncResult[] = [];
  for (const source of ["LEADS", "OUT_OF_STOCK"] as SheetSource[]) {
    const leads = legacy.filter((l) => l.source === source);
    if (!leads.length) continue;
    const run = await db.importRun.create({ data: { source, status: "RUNNING", trigger: "LEGACY_MIGRATION", startedAt: now } });
    const ing = new Ingestor(db, source, run.id, now, dateOrder);
    await ing.load();
    const items = leads.map((l) => {
      const supplier = source === "LEADS" ? supplierIdentity(l.supplierUrl ?? undefined) : supplierIdentity(/^https?:/i.test(l.store ?? "") ? l.store! : undefined, l.store ?? undefined);
      const row: ParsedRow = {
        source, sheetRow: l.sourceRow, asin: l.asin, name: l.name || l.asin, amazonUrl: l.amazonUrl ?? undefined,
        supplierKey: supplier.key, supplierName: supplier.name, supplierUrl: supplier.url,
        salePrice: l.salePrice ?? undefined, buyBox90: l.buyBox90 ?? undefined, fbaFee: l.fbaFee ?? undefined, costPrice: l.costPrice ?? undefined,
        estimatedSales: l.estimatedSales ?? undefined, currency: l.currency ? (isCad(l.currency) ? "CAD" : l.currency.toUpperCase()) : undefined,
        exportDate: l.exportDate ?? undefined, sheetRoi: l.sheetRoi ?? undefined, sheetMargin: l.sheetMargin ?? undefined, sheetProfit: l.sheetProfit ?? undefined,
        notes: l.notes ?? undefined, availability: l.availability ?? undefined, lastChecked: l.lastChecked ?? undefined, checkDetail: l.checkDetail ?? undefined,
      };
      const exported = source === "LEADS" ? parseSheetDate(l.exportDate, { order: dateOrder, now }) : null;
      return { lead: l, row, discoveredAt: exported && exported < l.firstSeenAt ? exported : l.firstSeenAt };
    });
    const firstByAsin = new Map<string, Date>();
    for (const i of items) {
      const cur = firstByAsin.get(i.row.asin);
      if (!cur || i.discoveredAt < cur) firstByAsin.set(i.row.asin, i.discoveredAt);
    }
    ing.counters.rowsRead = items.length;
    await ing.ingestBatch(
      items.map((i) => ({ row: i.row, discoveredAt: i.discoveredAt, firstDiscovery: firstByAsin.get(i.row.asin)!, raw: { legacyLeadId: i.lead.id } })),
      "LEGACY",
    );
    await ing.finish({ markMissing: false, validRows: items.length });

    // Statuts de revue : la décision la plus récente par ASIN
    const decided = items
      .filter((i) => LEGACY_STATUS[i.lead.reviewStatus])
      .sort((a, b) => (a.lead.reviewedAt?.getTime() ?? 0) - (b.lead.reviewedAt?.getTime() ?? 0));
    for (const i of decided) {
      await db.product.updateMany({
        where: { asin: i.row.asin, reviewStatus: "TO_REVIEW" },
        data: { reviewStatus: LEGACY_STATUS[i.lead.reviewStatus], reviewedAt: i.lead.reviewedAt ?? now },
      });
    }
    await db.importRun.update({ where: { id: run.id }, data: { ...ing.counters, status: "SUCCESS", finishedAt: new Date(), details: `${leads.length} lignes migrées depuis la table historique Lead` } });
    results.push({ source, runId: run.id, status: "SUCCESS", ...ing.counters });
  }
  await db.appSetting.upsert({ where: { key: "legacy.migratedAt" }, create: { key: "legacy.migratedAt", value: now.toISOString() }, update: {} });
  return results;
}

/** Synchronise LEADS puis OUT OF STOCK (l'ordre compte : seul LEADS alimente l'objectif hebdomadaire). */
export async function syncAll(opts: SyncOptions = {}): Promise<SyncResult[]> {
  const db = opts.db ?? defaultDb;
  if (!(await acquireLock(db))) {
    const empty = { rowsRead: 0, imported: 0, duplicates: 0, updated: 0, unchanged: 0, errors: 0, warnings: 0, missing: 0 };
    return [{ source: "ALL", status: "SKIPPED", ...empty, message: "Une synchronisation est déjà en cours" }];
  }
  try {
    const results: SyncResult[] = [];
    results.push(...(await migrateLegacy(opts)));
    for (const source of ["LEADS", "OUT_OF_STOCK"] as SheetSource[]) results.push(await syncSource(source, opts));
    return results;
  } finally {
    await releaseLock(db);
  }
}
