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

test("prix Amazon = Buy Box moyenne 90 jours, Sale Price seulement si la Buy Box est vide", async () => {
  const { amazonPrice } = await import("../src/lib/profit");
  assert.equal(amazonPrice({ buyBox90: 33.89, salePrice: 31.49 }), 33.89);
  assert.equal(amazonPrice({ buyBox90: null, salePrice: 31.49 }), 31.49);
  assert.equal(amazonPrice({}), null);
  // Exemple réel : Buy Box 33,89 − coût 10,87 − FBA 6,33 = 16,69
  const r = preliminaryProfit({ salePrice: amazonPrice({ buyBox90: 33.89, salePrice: 31.49 }), costPrice: 10.87, fbaFee: 6.33 });
  close(r.profit, 16.69);
});

test("taxes : reproduit exactement le calculateur SellerAmp (exemple réel)", async () => {
  const { maxCost } = await import("../src/lib/profit");
  // SellerAmp : Cost 8,13 · Sale 20,20 · Total Fees 9,46 · taxe 20 % → Profit 0,60 · ROI 7,38 % · Marge 2,97 % · Max cost 5,24
  const tax = { mode: "REGISTERED" as const, rate: 20 };
  const r = preliminaryProfit({ salePrice: 20.2, costPrice: 8.13, fbaFee: 9.46 }, tax);
  assert.equal(r.profit!.toFixed(2), "0.60");
  assert.equal(r.roi!.toFixed(2), "7.38");
  assert.equal(r.margin!.toFixed(2), "2.97");
  assert.equal(r.taxes!.toFixed(2), "2.01"); // VAT on Fees 1,89 + VAT Due 0,12
  assert.equal(maxCost({ salePrice: 20.2, fbaFee: 9.46 }, { minProfit: 3, minRoi: 30 }, tax)!.toFixed(2), "5.24");
});

test("taxes : modes sans taxe et non inscrit", async () => {
  const base = { salePrice: 20.2, costPrice: 8.13, fbaFee: 9.46 };
  close(preliminaryProfit(base).profit, 2.61);
  close(preliminaryProfit(base, { mode: "NONE", rate: 14.975 }).profit, 2.61);
  // Non inscrit : TPS/TVQ (14,975 %) payées sur les frais Amazon
  // 9,46 × 14,975 % = 1,4166 → 1,42 $ de taxes (arrondi au cent)
  close(preliminaryProfit(base, { mode: "NOT_REGISTERED", rate: 14.975 }).profit, 20.2 - 8.13 - 9.46 - 1.42);
});

test("coût maximum : contrainte la plus stricte entre profit et ROI, null si impossible", async () => {
  const { maxCost } = await import("../src/lib/profit");
  // Sans taxe : profit ≥ 3 → coût ≤ 40 − 7 − 3 = 30 ; ROI ≥ 30 % → coût ≤ 33 / 1,3 = 25,38
  close(maxCost({ salePrice: 40, fbaFee: 7 }, { minProfit: 3, minRoi: 30 }), 25.38); // 33 / 1,3 = 25,384…
  assert.equal(maxCost({ salePrice: 5, fbaFee: 7 }, { minProfit: 3, minRoi: 30 }), null);
  assert.equal(maxCost({ salePrice: null, fbaFee: 7 }, { minProfit: 3, minRoi: 30 }), null);
});
