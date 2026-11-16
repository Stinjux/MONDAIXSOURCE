import test from "node:test";
import assert from "node:assert/strict";
import { toDecisionRows } from "../src/lib/decisionRows";
import { preliminaryProfit } from "../src/lib/profit";
import type { OfferView, ProductView } from "../src/lib/queries";
import { orderAmounts, orderSupplier, type OrderView } from "../src/lib/orders";
import { groupBySupplier } from "../src/lib/suppliers";

const offer = (id: string, key: string, name: string, url: string | null, cost: number, extra: Partial<OfferView> = {}): OfferView => ({
  id, supplierKey: key, supplierName: name, supplierUrl: url, firstSeenAt: "2026-10-12T16:00:00Z", lastSeenAt: "2026-10-13T16:00:00Z",
  salePrice: 42, buyBox90: 40, amazonPrice: 40, priceE: 42, fbaFee: 7, costPrice: cost, estimatedSales: 50, currency: "CAD", valuesSource: "LEADS",
  stockStatus: "UNKNOWN", stockCheckedAt: null, stockDetail: null, backInStockAt: null, backInStockAlert: false, needsRecheck: true,
  verifiedCostPrice: null, verifiedAvailability: null, verifiedAt: null, occurrences: 1, sources: ["LEADS"], present: true,
  oosAvailability: null, oosNotes: null, sheetRoi: null, sheetProfit: null,
  profit: preliminaryProfit({ salePrice: 40, costPrice: cost, fbaFee: 7, estimatedSales: 50 }), ...extra,
});
const product = (id: string, asin: string, offers: OfferView[], reviewStatus = "TO_REVIEW"): ProductView => ({
  id, asin, name: `Produit ${id}`, amazonUrl: null, firstSeenAt: "2026-11-02T16:00:00Z", lastSeenAt: "2026-11-02T16:00:00Z", firstSource: "LEADS",
  countsTowardGoal: true, goalWeek: "2026-11-02", reviewStatus, reviewNotes: null, reviewTags: [], reviewChecklist: {}, reviewedAt: null, verifiedSalePrice: null,
  verifiedFbaFee: null, restriction: "UNKNOWN", verifiedAt: null, exportedAt: "2026-11-02T16:00:00Z", confirmedAt: null, freshSince: "2026-11-02T16:00:00Z",
  lastDuplicateAt: null, duplicateAlert: false, dup: { exactOfferIds: [], crossSheet: false, crossSheetOfferIds: [], multiSupplier: offers.length > 1, any: offers.length > 1 },
  occurrences: offers.length, sources: ["LEADS"], present: true, offers, best: offers[0],
});

test("fournisseurs : une URL walmart.ca et la boutique « Walmart » forment un seul fournisseur", () => {
  const products = [
    product("a", "B0AAAAAAAA", [offer("o1", "walmart.ca/ip/a", "walmart.ca", "https://www.walmart.ca/ip/a", 15), offer("o2", "costco.ca/a", "costco.ca", "https://www.costco.ca/a", 20)]),
    product("b", "B0BBBBBBBB", [offer("o3", "store:walmart", "Walmart", null, 30, { sources: ["OUT_OF_STOCK"], stockStatus: "OUT_OF_STOCK" })], "REJECTED"),
  ];
  const now = new Date("2026-11-08T16:00:00Z");
  const groups = groupBySupplier(products, toDecisionRows(products, undefined, now), undefined, new Map(), [
    { supplierName: "walmart.ca", supplierUrl: "https://www.walmart.ca/ip/a", quantity: 3, unitCost: 15 },
  ]);
  assert.deepEqual(groups.map((g) => [g.key, g.name, g.products.length]), [["walmart", "Walmart", 2], ["costco", "Costco", 1]]);
  const walmart = groups[0];
  assert.equal(walmart.domain, "walmart.ca");
  assert.deepEqual(walmart.products.map((p) => [p.asin, p.stage, p.best, p.unavailable]), [
    ["B0AAAAAAAA", "NEW", true, false],
    ["B0BBBBBBBB", "REJECTED", true, true],
  ]);
  assert.equal(walmart.stats.rejected, 1);
  assert.equal(walmart.stats.stages.NEW, 1);
  assert.equal(walmart.stats.stages.REJECTED, 1);
  assert.deepEqual(walmart.stats.bought, { units: 3, spend: 45 });
  assert.equal(groups[1].products[0].best, false);
});

test("fournisseurs : les commandes de la Sheet COMMANDES s'ajoutent au bon commerce", () => {
  const order = (id: string, text: string, totalPaid: number, quantity: number, orderedAt: string): OrderView => {
    const s = orderSupplier(text);
    return { id, sheetRow: 2, supplierText: text, supplierKey: s.key, supplierName: s.name, supplierUrl: s.url, totalPaid, quantity, orderedAt, dateFromSheet: true, orderedText: null, emailUrl: null, taxRate: 14.975, ...orderAmounts({ totalPaid, quantity }) };
  };
  const products = [product("a", "B0AAAAAAAA", [offer("o1", "walmart.ca/ip/a", "walmart.ca", "https://www.walmart.ca/ip/a", 15)])];
  const now = new Date("2026-11-08T16:00:00Z");
  const groups = groupBySupplier(products, toDecisionRows(products, undefined, now), undefined, new Map(), [], [
    order("1", "Walmart", 114.98, 10, "2026-11-01T12:00:00Z"),
    order("2", "Walmart", 57.49, 5, "2026-11-08T12:00:00Z"),
    order("3", "Best Buy", 229.95, 8, "2026-10-20T12:00:00Z"),
  ]);
  assert.deepEqual(groups.map((g) => [g.key, g.name, g.products.length, g.orders.length]), [["walmart", "Walmart", 1, 2], ["bestbuy", "Best Buy", 0, 1]]);
  assert.deepEqual(groups[0].stats.ordered, { orders: 2, units: 15, totalPaid: 172.47, taxes: 22.47, beforeTax: 150, avgUnitCost: 10, lastAt: "2026-11-08T12:00:00Z" });
  assert.deepEqual(groups[0].orders.map((o) => o.id), ["2", "1"]);
  assert.equal(groups[1].domain, "bestbuy.ca");
  assert.equal(groups[0].stats.bought.units, 0);
});
