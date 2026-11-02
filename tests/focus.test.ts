import test from "node:test";
import assert from "node:assert/strict";
import { changedValues, evaluateFocus, hasChanges, type FocusLead } from "../src/lib/focus";
import { DEFAULT_TAX } from "../src/lib/profit";
import type { DecisionRow } from "../src/lib/decisionRows";

const offer = (id: string, cost: number, extra: Partial<FocusLead["offers"][number]> = {}) => ({
  id, supplier: id, url: null, importedAmazonPrice: 40, importedFees: 12, importedCost: cost, verifiedCost: null, verifiedAvailability: null,
  sheetUnavailable: false, currency: "CAD", estimatedSales: 50, ...extra,
});
const lead = (offers: FocusLead["offers"]): FocusLead => ({
  productId: "p1", asin: "B0AAAAAAAA", name: "Produit", amazonUrl: "https://www.amazon.ca/dp/B0AAAAAAAA", notes: null, reviewStatus: "TO_REVIEW",
  restricted: false, verifiedSalePrice: null, verifiedFbaFee: null, offers,
  row: { amazonPrice: 40, fees: 12, costPrice: 15 } as DecisionRow, purchased: null,
});

test("décision : sans saisie, la meilleure offre disponible fait foi", () => {
  const l = lead([offer("cher", 20), offer("moins-cher", 15), offer("rupture", 5, { sheetUnavailable: true })]);
  const { best } = evaluateFocus(l, {}, DEFAULT_TAX);
  assert.equal(best?.offer.id, "moins-cher");
  assert.ok(best!.metrics.roi! > 0);
});

test("décision : un nouveau prix fournisseur ou une rupture saisie recalcule tout", () => {
  const l = lead([offer("a", 15), offer("b", 18)]);
  const before = evaluateFocus(l, {}, DEFAULT_TAX).best!;
  const after = evaluateFocus(l, { offers: { a: { cost: 22 } } }, DEFAULT_TAX).best!;
  assert.equal(after.offer.id, "b");
  assert.ok(after.metrics.roi! < before.metrics.roi!);
  const ruptured = evaluateFocus(l, { offers: { a: { availability: "OUT_OF_STOCK" } } }, DEFAULT_TAX).best!;
  assert.equal(ruptured.offer.id, "b");
  // Prix Amazon saisi : appliqué à toutes les offres
  assert.ok(evaluateFocus(l, { salePrice: 30 }, DEFAULT_TAX).best!.metrics.profit! < before.metrics.profit!);
});

test("reconfirmation : seuls les champs réellement modifiés sont envoyés", () => {
  const l = lead([offer("a", 15)]);
  assert.equal(hasChanges(changedValues(l, { salePrice: 40, fees: 12, offers: { a: { cost: 15 } } })), false);
  assert.deepEqual(changedValues(l, { salePrice: 38.5, offers: { a: { cost: 15, availability: "IN_STOCK" } } }), {
    verifiedSalePrice: 38.5,
    offers: [{ id: "a", verifiedAvailability: "IN_STOCK" }],
  });
});
