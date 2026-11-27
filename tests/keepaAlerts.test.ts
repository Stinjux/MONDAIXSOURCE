import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_THRESHOLDS as T } from "../src/lib/decision";
import { keepaSalePrice, keepaTotalFees } from "../src/lib/keepa";
import { daysSince, keepaAlerts, needsFullHistory } from "../src/lib/keepaAlerts";
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
  fbaFee: 5, referralPct: 15, amazonBuyBoxPct: null, capturedAt: at, priceDrop: null,
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

const D = (day: number) => `2026-11-${String(day).padStart(2, "0")}T15:00:00.000Z`;
const run = (products: ProductView[], history = new Map<string, KeepaView[]>(), extra: { thresholds?: typeof T; seen?: Record<string, string>; purchased?: Set<string> } = {}) =>
  keepaAlerts({ products, history, thresholds: extra.thresholds ?? T, purchased: extra.purchased ?? new Set(), seen: extra.seen, now: NOW });

test("Keepa Alert : New good = sous vos critères avant (Sheet), profitable à la dernière analyse, avec date et prix extrait", () => {
  // Keepa : moyenne 90 j 60 $ → frais 15 % × 60 + 5 = 14 $ → profit 16 $, ROI 53 %
  const [a] = run([lead("1", keepa(60, TODAY))]);
  assert.equal(a.group, "NEW_GOOD");
  assert.equal(a.beforeFrom, null); // avant = la Sheet
  assert.deepEqual([a.goodSince, a.keepaAt, a.now.price], [TODAY, TODAY, 60]);
  assert.deepEqual([a.before.price, a.before.verdict, a.now.verdict, a.trend], [40, "CONSIDER", "BUY", "UP"]);
  assert.equal(Math.round(a.now.roi!), 53);
});

test("Keepa Alert : tous les leads analysés sont rangés ; jamais analysés et achetés exclus", () => {
  const products = [
    lead("2", keepa(60, TODAY), { reviewStatus: "REJECTED", sheet: { bb: 60, cost: 30, fee: 14, sales: 100 } }), // rejeté mais déjà bon dans la Sheet
    lead("3", keepa(60, TODAY), { sheet: { bb: 60, cost: 30, fee: 14, sales: 100 } }), // déjà bon dans la Sheet
    lead("4", keepa(50, TODAY)), // Keepa 50 $ : profit 7,50 $ au lieu de 3 $, mais ROI 25 % sous 30 %
    lead("5", null), // pas encore analysé
    lead("6", keepa(60, TODAY)), // acheté
  ];
  const alerts = run(products, new Map(), { purchased: new Set(["6"]) });
  assert.deepEqual(
    alerts.map((a) => [a.productId, a.group]),
    [["2", "STILL_GOOD"], ["3", "STILL_GOOD"], ["4", "BELOW"]],
  );
  const [r] = alerts;
  assert.deepEqual([r.rejectedBy, r.goodSince, r.goodBeforeKeepa], ["partner", TODAY, true]);
  const below = alerts[2];
  assert.ok(below.reasons.some((x) => x.startsWith("ROI")), "ce qui manque est indiqué");
  assert.equal(below.trend, "UP"); // en hausse, mais pas assez
});

test("Keepa Alert : New good jusqu'à la prochaine analyse, puis Still good depuis la date où il est devenu bon", () => {
  const p = lead("7", keepa(60, TODAY));
  // Avant : 42 $ hier → New good
  assert.equal(run([p], new Map([[p.id, [keepa(42, D(25))]]]))[0].group, "NEW_GOOD");
  // Bon hier et avant-hier, pas bon le 20 → Still good depuis le 24
  const history = new Map([[p.id, [keepa(60, D(25)), keepa(61, D(24)), keepa(42, D(20)), keepa(60, D(10))]]]);
  const [a] = run([p], history);
  assert.deepEqual([a.group, a.goodSince, a.goodBeforeKeepa, a.beforeFrom], ["STILL_GOOD", D(24), false, D(25)]);
  assert.equal(needsFullHistory(a, history), false);
  assert.equal(daysSince(a.goodSince!, NOW), 2);
  // Bon à toutes ses analyses, sous les critères dans la Sheet → depuis la 1re analyse, pas « déjà bon dans la Sheet »
  const allGood = new Map([[p.id, [keepa(60, D(25)), keepa(60, D(18))]]]);
  const [b] = run([p], allGood);
  assert.deepEqual([b.goodSince, b.goodBeforeKeepa, needsFullHistory(b, allGood)], [D(18), false, true]);
  // Plus bon à la dernière analyse → Still below target, en baisse
  const [c] = run([lead("7", keepa(42, TODAY))], new Map([[p.id, [keepa(60, D(25))]]]));
  assert.deepEqual([c.group, c.goodSince, c.trend], ["BELOW", null, "DOWN"]);
});

test("Keepa Alert : « vu » seulement pour cette analyse ; selon les critères de chacun", () => {
  const p = lead("8", keepa(60, TODAY));
  assert.equal(run([p], new Map(), { seen: { [p.id]: TODAY } })[0].seen, true);
  assert.equal(run([p], new Map(), { seen: { [p.id]: D(20) } })[0].seen, false); // analyse plus récente : redevient à voir
  assert.equal(run([p], new Map(), { thresholds: { ...T, minRoi: 30 } })[0].group, "NEW_GOOD"); // Justin : ROI min 30 %
  assert.equal(run([p], new Map(), { thresholds: { ...T, minRoi: 60 } })[0].group, "BELOW"); // Hamza : ROI min 60 %
});

test("Keepa Alert : ordre — New good pas vus d'abord, Still below target en hausse d'abord", () => {
  const products = [lead("9", keepa(42, TODAY)), lead("10", keepa(50, TODAY)), lead("11", keepa(60, TODAY)), lead("12", keepa(65, TODAY))];
  const alerts = run(products, new Map(), { seen: { "12": TODAY } });
  assert.deepEqual(alerts.map((a) => a.productId), ["11", "12", "10", "9"]);
});
