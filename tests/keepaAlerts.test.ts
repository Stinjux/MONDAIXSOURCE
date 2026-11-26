import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_THRESHOLDS as T } from "../src/lib/decision";
import { keepaSalePrice, keepaTotalFees } from "../src/lib/keepa";
import { keepaAlerts } from "../src/lib/keepaAlerts";
import { preliminaryProfit } from "../src/lib/profit";
import type { KeepaView, OfferView, ProductView } from "../src/lib/queries";

const NOW = new Date("2026-11-26T18:00:00Z");
// Sheet : Buy Box 40 $, coût 30 $, frais 7 $ → profit 3 $, ROI 10 % (sous les critères)
const offer = (sheet: { bb: number; cost: number; fee: number; sales: number }): OfferView => ({
  id: "o", supplierKey: "walmart.ca/x", supplierName: "walmart.ca", supplierUrl: "https://www.walmart.ca/x", firstSeenAt: "2026-10-01T16:00:00Z", lastSeenAt: "2026-10-01T16:00:00Z",
  salePrice: sheet.bb, buyBox90: sheet.bb, amazonPrice: sheet.bb, priceE: null, origin: { price: "sheet", fees: "sheet", sales: "sheet" }, fbaFee: sheet.fee, costPrice: sheet.cost,
  estimatedSales: sheet.sales, sheetFbaFee: sheet.fee, sheetEstimatedSales: sheet.sales, currency: "CAD", valuesSource: "LEADS", stockStatus: "UNKNOWN", stockCheckedAt: null, stockDetail: null,
  backInStockAt: null, backInStockAlert: false, needsRecheck: false, verifiedCostPrice: null, verifiedAvailability: null, verifiedAt: null, occurrences: 1, sources: ["LEADS"], present: true,
  oosAvailability: null, oosNotes: null, sheetRoi: null, sheetProfit: null, profit: preliminaryProfit({ salePrice: sheet.bb, costPrice: sheet.cost, fbaFee: sheet.fee, estimatedSales: sheet.sales }),
});
const keepa = (avg90: number, at: string, monthlySold = 100): KeepaView => ({
  buyBox: avg90, buyBoxAvg90: avg90, amazonPrice: null, amazonSelling: false, newOffers: 4, fbaOffers: 3, salesRank: 1000, salesRankAvg90: 1100, monthlySold,
  fbaFee: 5, referralPct: 15, capturedAt: at, priceDrop: null,
});
/** Le lead tel que loadProducts le construit : Keepa appliqué avant la Sheet */
function lead(id: string, k: KeepaView | null, opts: { reviewStatus?: string; sheet?: { bb: number; cost: number; fee: number; sales: number } } = {}): ProductView {
  const o = offer(opts.sheet ?? { bb: 40, cost: 30, fee: 7, sales: 50 });
  const price = (k ? keepaSalePrice(k) : null) ?? o.amazonPrice;
  const withKeepa: OfferView = k ? { ...o, amazonPrice: price, fbaFee: keepaTotalFees(k, price) ?? o.fbaFee, estimatedSales: k.monthlySold ?? o.estimatedSales } : o;
  return {
    id, asin: `B0${id.padStart(8, "0")}`.slice(0, 10), name: `Lead ${id}`, amazonUrl: null, firstSeenAt: "2026-10-01T16:00:00Z", lastSeenAt: "2026-11-20T16:00:00Z", firstSource: "LEADS",
    countsTowardGoal: true, goalWeek: "2026-09-28", reviewStatus: opts.reviewStatus ?? "TO_REVIEW", reviewNotes: null, reviewTags: [], reviewChecklist: {}, reviewedAt: opts.reviewStatus === "REJECTED" ? "2026-10-05T16:00:00Z" : null,
    reviewedBy: opts.reviewStatus === "REJECTED" ? "partner" : null, confirmedBy: null, verifiedSalePrice: null, verifiedFbaFee: null, restriction: "UNKNOWN", verifiedAt: null,
    exportedAt: "2026-11-20T16:00:00Z", confirmedAt: null, freshSince: k?.capturedAt ?? "2026-11-20T16:00:00Z", keepa: k, lastDuplicateAt: null, duplicateAlert: false,
    dup: { exactOfferIds: [], crossSheet: false, crossSheetOfferIds: [], multiSupplier: false, any: false }, occurrences: 1, sources: ["LEADS"], present: true, offers: [withKeepa], best: withKeepa,
  };
}
const TODAY = "2026-11-26T15:00:00.000Z";

test("Keepa Alert : sous vos critères avant, Acheter maintenant grâce à la Buy Box Keepa", () => {
  // Keepa : moyenne 90 j 60 $ → frais 15 % × 60 + 5 = 14 $ → profit 16 $, ROI 53 %
  const alerts = keepaAlerts({ products: [lead("1", keepa(60, TODAY))], previous: new Map(), thresholds: T, purchased: new Set(), now: NOW });
  assert.equal(alerts.length, 1);
  const a = alerts[0];
  assert.equal(a.reason, "CRITERIA");
  assert.equal(a.beforeFrom, null); // avant = la Sheet
  assert.deepEqual([a.before.price, a.before.verdict, a.now.price, a.now.verdict], [40, "CONSIDER", 60, "BUY"]); // profit 3 $ = le minimum, ROI et marge sous les critères
  assert.equal(Math.round(a.now.roi!), 53);
});

test("Keepa Alert : rejeté qui répond maintenant aux critères ; déjà bon ou encore mauvais : pas d'alerte", () => {
  const products = [
    lead("2", keepa(60, TODAY), { reviewStatus: "REJECTED", sheet: { bb: 60, cost: 30, fee: 14, sales: 100 } }), // rejeté, même s'il était déjà bon
    lead("3", keepa(60, TODAY), { sheet: { bb: 60, cost: 30, fee: 14, sales: 100 } }), // déjà « Acheter » avant : rien de nouveau
    lead("4", keepa(42, TODAY)), // Keepa ne suffit pas : ROI toujours sous 30 %
  ];
  const alerts = keepaAlerts({ products, previous: new Map(), thresholds: T, purchased: new Set(), now: NOW });
  assert.deepEqual(alerts.map((a) => [a.asin, a.reason, a.rejectedBy]), [["B000000002", "REJECTED", "partner"]]);
});

test("Keepa Alert : avant = analyse Keepa précédente ; ignorer jusqu'à la prochaine analyse ; achetés exclus", () => {
  const p = lead("5", keepa(60, TODAY));
  const previous = new Map([[p.id, keepa(42, "2026-11-25T15:00:00.000Z")]]);
  const [a] = keepaAlerts({ products: [p], previous, thresholds: T, purchased: new Set(), now: NOW });
  assert.deepEqual([a.beforeFrom, a.before.price, a.before.verdict === "BUY"], ["2026-11-25T15:00:00.000Z", 42, false]);
  // Déjà bon à l'analyse précédente : pas d'alerte
  assert.equal(keepaAlerts({ products: [p], previous: new Map([[p.id, keepa(60, "2026-11-25T15:00:00.000Z")]]), thresholds: T, purchased: new Set(), now: NOW }).length, 0);
  // Ignorée pour cette analyse : masquée ; une analyse plus récente la refait apparaître
  assert.equal(keepaAlerts({ products: [p], previous, thresholds: T, purchased: new Set(), dismissed: { [p.id]: TODAY }, now: NOW }).length, 0);
  assert.equal(keepaAlerts({ products: [p], previous, thresholds: T, purchased: new Set(), dismissed: { [p.id]: "2026-11-20T15:00:00.000Z" }, now: NOW }).length, 1);
  assert.equal(keepaAlerts({ products: [p], previous, thresholds: T, purchased: new Set([p.id]), now: NOW }).length, 0);
});

test("Keepa Alert : selon les critères de chacun", () => {
  const products = [lead("6", keepa(60, TODAY))]; // ROI 53 %
  assert.equal(keepaAlerts({ products, previous: new Map(), thresholds: { ...T, minRoi: 30 }, purchased: new Set(), now: NOW }).length, 1); // Justin : ROI min 30 %
  assert.equal(keepaAlerts({ products, previous: new Map(), thresholds: { ...T, minRoi: 60 }, purchased: new Set(), now: NOW }).length, 0); // Hamza : ROI min 60 %
});
