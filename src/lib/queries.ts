// Chargement des données pour les pages (serveur uniquement).
// Les objets retournés sont sérialisables (dates en ISO) pour être passés aux composants client.
import "server-only";
import { prisma } from "./prisma";
import { config } from "./config";
import { recentWeekKeys, weekBoundsFromKey, weekKey } from "./dates";
import { duplicateAlertActive, duplicateFlags, type DuplicateFlags } from "./duplicates";
import { isDecided, parseChecklist, type Checklist } from "./labels";
import { amazonPrice, preliminaryProfit, type ProfitResult } from "./profit";
import { getTaxConfig } from "./settings";
import { needsRecheck } from "./stock";

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
  /** Prix Amazon retenu : Buy Box 90 j, sinon Sale Price */
  amazonPrice: number | null;
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
  reviewChecklist: Checklist;
  reviewedAt: string | null;
  verifiedSalePrice: number | null;
  verifiedFbaFee: number | null;
  restriction: string;
  verifiedAt: string | null;
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

export async function loadProducts(now = new Date()) {
  const tax = await getTaxConfig();
  const products = await prisma.product.findMany({
    orderBy: { firstSeenAt: "desc" },
    include: {
      offers: { orderBy: { firstSeenAt: "asc" } },
      occurrences: {
        select: { offerId: true, source: true, present: true, kind: true, firstImportedAt: true, lastImportedAt: true, availability: true, notes: true, sheetRoi: true, sheetProfit: true },
      },
    },
  });
  const recheckDays = config.recheckDays;
  const duplicateEvents: DuplicateEvent[] = [];

  const views: ProductView[] = products.map((p) => {
    for (const o of p.occurrences) if (o.kind !== "NEW_PRODUCT") duplicateEvents.push({ productId: p.id, kind: o.kind, source: o.source, firstImportedAt: o.firstImportedAt.toISOString() });
    const offers: OfferView[] = p.offers.map((o) => {
      const occs = p.occurrences.filter((x) => x.offerId === o.id);
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
        amazonPrice: amazonPrice(o),
        fbaFee: o.fbaFee,
        costPrice: o.costPrice,
        estimatedSales: o.estimatedSales,
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
        profit: preliminaryProfit({ ...o, salePrice: amazonPrice(o) }, tax),
      };
    });
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
      reviewChecklist: parseChecklist(p.reviewChecklist),
      reviewedAt: iso(p.reviewedAt),
      verifiedSalePrice: p.verifiedSalePrice,
      verifiedFbaFee: p.verifiedFbaFee,
      restriction: p.restriction,
      verifiedAt: iso(p.verifiedAt),
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
export async function navCounts(now = new Date()) {
  const current = weekKey(now);
  const [duplicates, review, backInStock] = await Promise.all([
    prisma.product.findMany({ where: { lastDuplicateAt: { not: null } }, select: { lastDuplicateAt: true, duplicateAckAt: true } }),
    prisma.product.count({ where: { countsTowardGoal: true, goalWeek: { lte: current }, reviewStatus: { in: ["TO_REVIEW", "IN_PROGRESS"] } } }),
    prisma.supplierOffer.findMany({ where: { stockStatus: "IN_STOCK", backInStockAt: { not: null } }, select: { backInStockAt: true, backInStockAckAt: true } }),
  ]);
  return {
    duplicates: duplicates.filter((p) => duplicateAlertActive(p.lastDuplicateAt, p.duplicateAckAt)).length,
    review,
    backInStock: backInStock.filter((o) => duplicateAlertActive(o.backInStockAt, o.backInStockAckAt)).length,
  };
}

