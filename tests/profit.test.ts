import test from "node:test";
import assert from "node:assert/strict";
import { pick, preliminaryProfit } from "../src/lib/profit";

const close = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("profit, ROI, marge et profit mensuel préliminaires", () => {
  const r = preliminaryProfit({ salePrice: 45, costPrice: 20, fbaFee: 7, estimatedSales: 90 });
  close(r.profit, 18);
  close(r.roi, 90);
  close(r.margin, 40);
  close(r.monthlyProfit, 1620);
  assert.equal(r.issue, null);
});

test("profit négatif", () => {
  const r = preliminaryProfit({ salePrice: 20, costPrice: 18, fbaFee: 6 });
  close(r.profit, -4);
  close(r.roi, (-4 / 18) * 100);
  assert.equal(r.monthlyProfit, null);
});

test("aucune valeur inventée si une donnée manque", () => {
  const r = preliminaryProfit({ salePrice: 45, costPrice: null, fbaFee: 7 });
  assert.equal(r.profit, null);
  assert.equal(r.roi, null);
  assert.match(r.issue!, /coût/);
});

test("devise étrangère : pas de calcul sans conversion", () => {
  const r = preliminaryProfit({ salePrice: 45, costPrice: 20, fbaFee: 7, currency: "USD" });
  assert.equal(r.profit, null);
  assert.match(r.issue!, /USD/);
});

test("coût nul : ROI non défini", () => {
  const r = preliminaryProfit({ salePrice: 10, costPrice: 0, fbaFee: 2 });
  close(r.profit, 8);
  assert.equal(r.roi, null);
});

test("valeur vérifiée prioritaire sur la valeur importée", () => {
  assert.deepEqual(pick(19.5, 22), { value: 19.5, origin: "verified" });
  assert.deepEqual(pick(null, 22), { value: 22, origin: "imported" });
  assert.deepEqual(pick(undefined, null), { value: null, origin: "missing" });
});
