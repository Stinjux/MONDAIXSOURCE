import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_THRESHOLDS as T, buyScore, planTotals, verdict } from "../src/lib/decision";

const m = (profit: number | null, roi: number | null, margin: number | null, sales: number | null) => ({
  profit, roi, margin, estimatedSales: sales, monthlyProfit: profit != null && sales != null ? profit * sales : null,
});

test("verdict : tous les critères atteints = Acheter", () => {
  assert.deepEqual(verdict(m(16.69, 153, 49, 50), T), { verdict: "BUY", reasons: [] });
});

test("verdict : un ou deux critères manqués = À considérer, avec la raison", () => {
  const r = verdict(m(4, 25, 20, 50), T);
  assert.equal(r.verdict, "CONSIDER");
  assert.deepEqual(r.reasons, ["ROI 25 % < 30 %"]);
  assert.equal(verdict(m(5, 40, 20, null), T).verdict, "CONSIDER"); // ventes inconnues
});

test("verdict : profit négatif ou trop de critères manqués = Éviter", () => {
  assert.equal(verdict(m(-2, -10, -5, 100), T).verdict, "AVOID");
  assert.equal(verdict(m(1, 10, 5, 2), T).verdict, "AVOID");
});

test("verdict : rentabilité non calculable = Incomplet", () => {
  assert.equal(verdict(m(null, null, null, 30), T).verdict, "INCOMPLETE");
});

test("score d'achat : borné 0–100, croissant avec ROI, profit mensuel et marge", () => {
  assert.equal(buyScore(m(null, null, null, null)), null);
  assert.equal(buyScore(m(-1, -5, -2, 100)), 0);
  assert.equal(buyScore({ profit: 50, roi: 300, margin: 80, monthlyProfit: 1e6, estimatedSales: 1 }), 100);
  const low = buyScore(m(3, 30, 15, 10))!;
  const high = buyScore(m(16.69, 153, 49, 50))!;
  assert.ok(low > 0 && low < high && high <= 100, `${low} < ${high}`);
});

test("panier : investissement, profit et ROI global", () => {
  const t = planTotals([
    { cost: 10, profit: 5, qty: 4 },
    { cost: 20, profit: 6, qty: 2 },
    { cost: 15, profit: 9, qty: 0 },
    { cost: null, profit: 3, qty: 5 },
  ]);
  assert.deepEqual(t, { investment: 80, profit: 32, units: 6, roi: 40 });
});

test("listes Achat · Rejeté · À définir : chaque statut va dans une seule liste", async () => {
  const { BUCKET_STATUS, REVIEW_STATUSES, bucketOf } = await import("../src/lib/labels");
  assert.equal(bucketOf("VALIDATED"), "BUY");
  assert.equal(bucketOf("REJECTED"), "REJECT");
  for (const s of ["TO_REVIEW", "IN_PROGRESS", "FOLLOW_UP"]) assert.equal(bucketOf(s), "UNDECIDED");
  // Déplacer vers une liste puis relire le statut retombe dans la même liste
  for (const [bucket, status] of Object.entries(BUCKET_STATUS)) assert.equal(bucketOf(status), bucket);
  assert.equal(REVIEW_STATUSES.map(bucketOf).length, 5);
});

test("vue agrandie : adresse lisible pour chaque liste", async () => {
  const { VIEW_SLUGS, bucketFromSlug } = await import("../src/lib/labels");
  for (const [bucket, slug] of Object.entries(VIEW_SLUGS)) assert.equal(bucketFromSlug(slug), bucket);
  assert.equal(bucketFromSlug("achat"), "BUY");
  assert.equal(bucketFromSlug("inconnu"), null);
  assert.equal(bucketFromSlug(undefined), null);
});
