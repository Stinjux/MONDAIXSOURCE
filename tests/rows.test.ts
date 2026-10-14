import test from "node:test";
import assert from "node:assert/strict";
import { toLeadRows } from "../src/lib/rows";
import { preliminaryProfit } from "../src/lib/profit";
import type { OfferView, ProductView } from "../src/lib/queries";

const offer = (id: string, name: string, cost: number): OfferView => ({
  id, supplierKey: name.toLowerCase(), supplierName: name, supplierUrl: null, firstSeenAt: "2026-10-12T16:00:00Z", lastSeenAt: "2026-10-13T16:00:00Z",
  salePrice: 42, buyBox90: 40, amazonPrice: 40, fbaFee: 7, costPrice: cost, estimatedSales: 50, currency: "CAD", valuesSource: "LEADS",
  stockStatus: "UNKNOWN", stockCheckedAt: null, stockDetail: null, backInStockAt: null, backInStockAlert: false, needsRecheck: true,
  verifiedCostPrice: null, verifiedAvailability: null, verifiedAt: null, occurrences: 1, sources: ["LEADS"], present: true,
  oosAvailability: null, oosNotes: null, sheetRoi: null, sheetProfit: null,
  profit: preliminaryProfit({ salePrice: 40, costPrice: cost, fbaFee: 7, estimatedSales: 50 }),
});

test("un ASIN = une ligne, avec tous ses fournisseurs et la meilleure offre en tête", () => {
  const walmart = offer("o1", "Walmart", 20);
  const costco = offer("o2", "Costco", 15);
  const product = {
    id: "p1", asin: "B0AAAAAAAA", name: "Produit A", amazonUrl: null, firstSeenAt: "2026-10-12T16:00:00Z", lastSeenAt: "2026-10-13T16:00:00Z",
    firstSource: "LEADS", countsTowardGoal: true, goalWeek: "2026-10-12", reviewStatus: "TO_REVIEW", reviewNotes: null, reviewChecklist: {},
    reviewedAt: null, verifiedSalePrice: null, verifiedFbaFee: null, restriction: "UNKNOWN", verifiedAt: null, lastDuplicateAt: null, duplicateAlert: false,
    dup: { exactOfferIds: [], crossSheet: false, crossSheetOfferIds: [], multiSupplier: true, any: true },
    occurrences: 2, sources: ["LEADS"], present: true, offers: [walmart, costco], best: costco,
  } satisfies ProductView;

  const rows = toLeadRows([product]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].supplierCount, 2);
  assert.deepEqual(rows[0].suppliers.map((s) => s.supplierName), ["Costco", "Walmart"]);
  assert.equal(rows[0].costPrice, 15);
  assert.equal(rows[0].profit, 18);
});
