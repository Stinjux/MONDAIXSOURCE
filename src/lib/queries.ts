// Chargement des données pour les pages (serveur uniquement).
// Les objets retournés sont sérialisables (dates en ISO) pour être passés aux composants client.
import "server-only";
import { prisma } from "./prisma";
import { config } from "./config";
import { parseSheetDate, recentWeekKeys, weekBoundsFromKey, weekKey } from "./dates";
import { duplicateAlertActive, duplicateFlags, type DuplicateFlags } from "./duplicates";
import { isDecided, parseChecklist, type Checklist } from "./labels";
import { amazonPrice, columnEPrice, preliminaryProfit, type ProfitResult } from "./profit";
import { getTaxConfig } from "./settings";
import { needsRecheck } from "./stock";
import { freshSince, freshness, lastExportDate } from "./freshness";
import { keepaSalePrice, keepaTotalFees, priceDrop, type KeepaFacts } from "./keepa";
import { actorKey, type UserKey } from "./users";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export type OfferView = {
  id: string;
  supplierKey: string;
  supplierName: string | null;
  supplierUrl: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  salePrice: number | null;
  buyBox90: number | null;
  /** Prix Amazon retenu : Keepa (Buy Box moyenne 90 j) s'il est connu, sinon Buy Box 90 j de la Sheet, sinon Sale Price */
  amazonPrice: number | null;
  /** D'où viennent le prix, les frais et les ventes utilisés dans les calculs */
  origin: { price: "keepa" | "sheet"; fees: "keepa" | "sheet"; sales: "keepa" | "sheet" };
  /** Sale Price (colonne E) affiché sous la Buy Box ; null si la Buy Box est vide */
  priceE: number | null;
  fbaFee: number | null;
  costPrice: number | null;
  estimatedSales: number | null;
  currency: string;
  valuesSource: string | null;
  stockStatus: string;
  stockCheckedAt: string | null;
  stockDetail: string | null;
  backInStockAt: string | null;
  backInStockAlert: boolean;
  needsRecheck: boolean;
  verifiedCostPrice: number | null;
  verifiedAvailability: string | null;
  verifiedAt: string | null;
  occurrences: number;
  sources: string[];
  present: boolean;
  oosAvailability: string | null;
  oosNotes: string | null;
  sheetRoi: number | null;
  sheetProfit: number | null;
  profit: ProfitResult;
};

export type ProductView = {
  id: string;
  asin: string;
  name: string;
  amazonUrl: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  firstSource: string;
  countsTowardGoal: boolean;
  goalWeek: string | null;
  reviewStatus: string;
  reviewNotes: string | null;
  reviewTags: string[];
  reviewChecklist: Checklist;
  reviewedAt: string | null;
  /** Compte qui a fixé le statut de revue (null = avant les comptes : le propriétaire) */
  reviewedBy: UserKey | null;
  /** Compte qui a reconfirmé le lead */
  confirmedBy: UserKey | null;
  verifiedSalePrice: number | null;
  verifiedFbaFee: number | null;
  restriction: string;
  verifiedAt: string | null;
  /** Dernier export dans la Sheet (LEADS en priorité) */
  exportedAt: string | null;
  /** Dernière reconfirmation complète */
  confirmedAt: string | null;
  /** Référence de fraîcheur : la plus récente des deux dates ci-dessus et de la dernière mise à jour Keepa */
  freshSince: string | null;
  /** Dernières données Keepa (Amazon.ca), null si le lead n'a jamais été mis à jour */
  keepa: KeepaView | null;
  lastDuplicateAt: string | null;
  duplicateAlert: boolean;
  dup: DuplicateFlags;
  occurrences: number;
  sources: string[];
  present: boolean;
  offers: OfferView[];
  /** Offre la plus rentable (ROI préliminaire) parmi les offres calculables */
  best: OfferView | null;
};

export type DuplicateEvent = { productId: string; kind: string; source: string; firstImportedAt: string };

/** Export Date actuelle (colonne G) de chaque ligne, lue comme à la synchronisation. */
function withExportDates<T extends { exportDate: string | null }>(occurrences: T[], now: Date) {
  return occurrences.map((o) => ({ ...o, exportedAt: parseSheetDate(o.exportDate, { order: config.dateOrder, now }) }));
}

export type KeepaView = Omit<KeepaFacts, "title" | "asin"> & {
  capturedAt: string;
  /** Baisse de la Buy Box actuelle sous sa moyenne 90 j (en %), si au moins 10 % */
  priceDrop: number | null;
};

/** Dernière mise à jour Keepa de chaque lead. */
async function latestKeepa(productIds?: string[]): Promise<Map<string, KeepaView>> {
  const rows = await prisma.keepaSnapshot.findMany({
    where: productIds ? { productId: { in: productIds } } : undefined,
    distinct: ["productId"],
    orderBy: [{ productId: "asc" }, { capturedAt: "desc" }],
  });
  return new Map(
    rows.map((k) => [
      k.productId,
      {
        buyBox: k.buyBox, buyBoxAvg90: k.buyBoxAvg90, amazonPrice: k.amazonPrice, amazonSelling: k.amazonSelling, newOffers: k.newOffers, fbaOffers: k.fbaOffers,
        salesRank: k.salesRank, salesRankAvg90: k.salesRankAvg90, monthlySold: k.monthlySold, fbaFee: k.fbaFee, referralPct: k.referralPct,
        capturedAt: k.capturedAt.toISOString(), priceDrop: priceDrop(k),
      },
    ]),
  );
}

export async function loadProducts(now = new Date(), filter: { asin?: string } = {}) {
  const tax = await getTaxConfig();
  const keepaFor = filter.asin ? (await prisma.product.findUnique({ where: { asin: filter.asin }, select: { id: true } }))?.id : undefined;
  const keepa = await latestKeepa(filter.asin ? (keepaFor ? [keepaFor] : []) : undefined);
  const products = await prisma.product.findMany({
    where: filter.asin ? { asin: filter.asin } : undefined,
    orderBy: { firstSeenAt: "desc" },
    include: {
      offers: { orderBy: { firstSeenAt: "asc" } },
      occurrences: {
        select: { offerId: true, source: true, present: true, kind: true, discoveredAt: true, exportDate: true, firstImportedAt: true, lastImportedAt: true, availability: true, notes: true, sheetRoi: true, sheetProfit: true },
      },
    },
  });
  const recheckDays = config.recheckDays;
  const duplicateEvents: DuplicateEvent[] = [];

  const views: ProductView[] = products.map((p) => {
    for (const o of p.occurrences) if (o.kind !== "NEW_PRODUCT") duplicateEvents.push({ productId: p.id, kind: o.kind, source: o.source, firstImportedAt: o.firstImportedAt.toISOString() });
    const k = keepa.get(p.id) ?? null;
    const offers: OfferView[] = p.offers.map((o) => {
      const occs = p.occurrences.filter((x) => x.offerId === o.id);
      // Keepa passe avant la Sheet (les valeurs vérifiées passent avant les deux, plus loin)
      const kPrice = k ? keepaSalePrice(k) : null;
      const price = kPrice ?? amazonPrice(o);
      const kFees = k ? keepaTotalFees(k, price) : null;
      const kSales = k?.monthlySold ?? null;
      const latestOos = occs.filter((x) => x.source === "OUT_OF_STOCK").sort((a, b) => Number(b.present) - Number(a.present) || b.lastImportedAt.getTime() - a.lastImportedAt.getTime())[0];
      return {
        id: o.id,
        supplierKey: o.supplierKey,
        supplierName: o.supplierName,
        supplierUrl: o.supplierUrl,
        firstSeenAt: o.firstSeenAt.toISOString(),
        lastSeenAt: o.lastSeenAt.toISOString(),
        salePrice: o.salePrice,
        buyBox90: o.buyBox90,
        amazonPrice: price,
        origin: { price: kPrice != null ? "keepa" : "sheet", fees: kFees != null ? "keepa" : "sheet", sales: kSales != null ? "keepa" : "sheet" },
        priceE: columnEPrice(o),
        fbaFee: kFees ?? o.fbaFee,
        costPrice: o.costPrice,
        estimatedSales: kSales ?? o.estimatedSales,
        currency: o.currency,
        valuesSource: o.valuesSource,
        stockStatus: o.stockStatus,
        stockCheckedAt: iso(o.stockCheckedAt),
        stockDetail: o.stockDetail,
        backInStockAt: iso(o.backInStockAt),
        backInStockAlert: o.stockStatus === "IN_STOCK" && duplicateAlertActive(o.backInStockAt, o.backInStockAckAt),
        needsRecheck: needsRecheck(o.stockStatus, o.stockCheckedAt, now, recheckDays),
        verifiedCostPrice: o.verifiedCostPrice,
        verifiedAvailability: o.verifiedAvailability,
        verifiedAt: iso(o.verifiedAt),
        occurrences: occs.length,
        sources: [...new Set(occs.map((x) => x.source))],
        present: occs.some((x) => x.present),
        oosAvailability: latestOos?.availability ?? null,
        oosNotes: latestOos?.notes ?? null,
        sheetRoi: latestOos?.sheetRoi ?? null,
        sheetProfit: latestOos?.sheetProfit ?? null,
        profit: preliminaryProfit({ ...o, salePrice: price, fbaFee: kFees ?? o.fbaFee, estimatedSales: kSales ?? o.estimatedSales }, tax),
      };
    });
    const exportedAt = lastExportDate(withExportDates(p.occurrences, now), p.lastSeenAt);
    const ranked = offers.filter((o) => o.profit.roi !== null).sort((a, b) => b.profit.roi! - a.profit.roi!);
    return {
      id: p.id,
      asin: p.asin,
      name: p.name,
      amazonUrl: p.amazonUrl,
      firstSeenAt: p.firstSeenAt.toISOString(),
      lastSeenAt: p.lastSeenAt.toISOString(),
      firstSource: p.firstSource,
      countsTowardGoal: p.countsTowardGoal,
      goalWeek: p.goalWeek,
      reviewStatus: p.reviewStatus,
      reviewNotes: p.reviewNotes,
      reviewTags: p.reviewTags,
      reviewChecklist: parseChecklist(p.reviewChecklist),
      reviewedAt: iso(p.reviewedAt),
      reviewedBy: p.reviewedAt ? (actorKey(p.reviewedBy) ?? "owner") : null,
      confirmedBy: p.confirmedAt ? (actorKey(p.confirmedBy) ?? "owner") : null,
      verifiedSalePrice: p.verifiedSalePrice,
      verifiedFbaFee: p.verifiedFbaFee,
      restriction: p.restriction,
      verifiedAt: iso(p.verifiedAt),
      exportedAt: iso(exportedAt),
      confirmedAt: iso(p.confirmedAt),
      freshSince: iso(freshSince(exportedAt, p.confirmedAt, k?.capturedAt)),
      keepa: k,
      lastDuplicateAt: iso(p.lastDuplicateAt),
      duplicateAlert: duplicateAlertActive(p.lastDuplicateAt, p.duplicateAckAt),
      dup: duplicateFlags(p.offers.map((o) => o.id), p.occurrences),
      occurrences: p.occurrences.length,
      sources: [...new Set(p.occurrences.map((x) => x.source))],
      present: p.occurrences.some((x) => x.present),
      offers,
      best: ranked[0] ?? offers[0] ?? null,
    };
  });
  return { products: views, duplicateEvents, tax };
}

/** Dernier achat confirmé (non annulé) de chaque produit : date et unités achetées au total. */
export async function purchasedProducts(): Promise<Map<string, { lastAt: string; units: number }>> {
  const items = await prisma.purchaseItem.findMany({
    where: { purchase: { cancelledAt: null } },
    select: { productId: true, asin: true, quantity: true, purchase: { select: { createdAt: true } } },
  });
  const ids = new Map((await prisma.product.findMany({ where: { asin: { in: [...new Set(items.map((i) => i.asin))] } }, select: { id: true, asin: true } })).map((p) => [p.asin, p.id]));
  const out = new Map<string, { lastAt: string; units: number }>();
  for (const i of items) {
    const id = i.productId ?? ids.get(i.asin);
    if (!id) continue;
    const prev = out.get(id);
    const at = i.purchase.createdAt.toISOString();
    out.set(id, { lastAt: prev && prev.lastAt > at ? prev.lastAt : at, units: (prev?.units ?? 0) + i.quantity });
  }
  return out;
}

export type WeekStats = {
  key: string;
  found: number;
  goal: number;
  toReview: number;
  inProgress: number;
  validated: number;
  rejected: number;
  followUp: number;
  decided: number;
  duplicates: number;
};

export function weekStats(products: ProductView[], duplicateEvents: DuplicateEvent[], key: string): WeekStats {
  const found = products.filter((p) => p.countsTowardGoal && p.goalWeek === key);
  const { start, end } = weekBoundsFromKey(key);
  const count = (s: string) => found.filter((p) => p.reviewStatus === s).length;
  return {
    key,
    found: found.length,
    goal: config.weeklyGoal,
    toReview: count("TO_REVIEW"),
    inProgress: count("IN_PROGRESS"),
    validated: count("VALIDATED"),
    rejected: count("REJECTED"),
    followUp: count("FOLLOW_UP"),
    decided: found.filter((p) => isDecided(p.reviewStatus)).length,
    duplicates: duplicateEvents.filter((e) => {
      const t = new Date(e.firstImportedAt);
      return t >= start && t < end;
    }).length,
  };
}

export function history(products: ProductView[], duplicateEvents: DuplicateEvent[], now: Date, weeks = 12): WeekStats[] {
  return recentWeekKeys(now, weeks).map((k) => weekStats(products, duplicateEvents, k));
}

/** Leads de semaines passées encore sans décision (restent visibles après le dimanche). */
export function overdueReviews(products: ProductView[], now: Date): ProductView[] {
  const current = weekKey(now);
  return products.filter((p) => p.countsTowardGoal && p.goalWeek && p.goalWeek < current && !isDecided(p.reviewStatus));
}

export async function latestRuns(take = 50) {
  const runs = await prisma.importRun.findMany({
    orderBy: { startedAt: "desc" },
    take,
    include: { issues: { orderBy: [{ severity: "asc" }, { sheetRow: "asc" }], take: 200 } },
  });
  return runs.map((r) => ({
    ...r,
    startedAt: r.startedAt.toISOString(),
    finishedAt: iso(r.finishedAt),
    issues: r.issues.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })),
  }));
}

export async function lastSuccessfulSync() {
  const run = await prisma.importRun.findFirst({ where: { status: "SUCCESS", trigger: { not: "LEGACY_MIGRATION" } }, orderBy: { startedAt: "desc" } });
  return run ? { at: run.startedAt.toISOString(), source: run.source } : null;
}

/** Compteurs affichés dans la navigation latérale. */
export async function navCounts(now = new Date(), me: UserKey = "owner") {
  const current = weekKey(now);
  const { buyActionCount } = await import("./buyQueries");
  const [duplicates, review, backInStock] = await Promise.all([
    prisma.product.findMany({ where: { lastDuplicateAt: { not: null } }, select: { lastDuplicateAt: true, duplicateAckAt: true } }),
    prisma.product.count({ where: { countsTowardGoal: true, goalWeek: { lte: current }, reviewStatus: { in: ["TO_REVIEW", "IN_PROGRESS"] } } }),
    prisma.supplierOffer.findMany({ where: { stockStatus: "IN_STOCK", backInStockAt: { not: null } }, select: { backInStockAt: true, backInStockAckAt: true } }),
  ]);
  const approvals = await buyActionCount(me);
  return {
    approvals,
    duplicates: duplicates.filter((p) => duplicateAlertActive(p.lastDuplicateAt, p.duplicateAckAt)).length,
    review,
    backInStock: backInStock.filter((o) => duplicateAlertActive(o.backInStockAt, o.backInStockAckAt)).length,
  };
}
