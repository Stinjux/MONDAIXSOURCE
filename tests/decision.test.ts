import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_THRESHOLDS as T, DEFAULT_WEIGHTS, amazonPenalty, buyScore, normalizeWeights, planTotals, verdict, volumeNote } from "../src/lib/decision";

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
  assert.equal(buyScore({ profit: 50, roi: 300, margin: 80, monthlyProfit: 1e6, estimatedSales: 60 }), 100);
  const low = buyScore(m(3, 30, 15, 10))!;
  const high = buyScore(m(16.69, 153, 49, 50))!;
  assert.ok(low > 0 && low < high && high <= 100, `${low} < ${high}`);
});

test("score d'achat : le volume pèse selon vos poids (plein à 60 ventes / mois)", () => {
  assert.deepEqual(DEFAULT_WEIGHTS, { roi: 30, monthlyProfit: 25, margin: 20, volume: 25 });
  assert.equal(volumeNote(0), 0);
  assert.equal(volumeNote(60), 1);
  assert.equal(volumeNote(500), 1);
  assert.ok(volumeNote(10) > 0.5 && volumeNote(30) > volumeNote(10), "les premières ventes comptent plus");
  // Même rentabilité, volume différent
  const few = buyScore(m(10, 50, 25, 5))!;
  const many = buyScore(m(10, 50, 25, 60))!;
  assert.ok(many > few, `${many} > ${few}`);
  // Sans poids du volume, le volume ne change rien
  const noVol = { ...DEFAULT_WEIGHTS, volume: 0 };
  const same = (sales: number) => ({ profit: 10, roi: 50, margin: 25, monthlyProfit: 300, estimatedSales: sales });
  assert.equal(buyScore(same(5), noVol), buyScore(same(60), noVol));
  assert.ok(buyScore(same(60))! > buyScore(same(5))!);
  // Seulement le volume : 60 ventes = 100
  assert.equal(buyScore({ profit: 1, roi: 1, margin: 1, monthlyProfit: 60, estimatedSales: 60 }, { roi: 0, monthlyProfit: 0, margin: 0, volume: 10 }), 100);
  // Poids invalides : poids par défaut
  assert.deepEqual(normalizeWeights({ roi: -3, volume: Number.NaN }), DEFAULT_WEIGHTS);
  assert.deepEqual(normalizeWeights({ roi: 0, monthlyProfit: 0, margin: 0, volume: 0 }), DEFAULT_WEIGHTS);
});

test("score d'achat : pénalité si Amazon vend (−10, −25 au-delà de 70 % de la Buy Box)", () => {
  assert.equal(amazonPenalty(null), 0);
  assert.equal(amazonPenalty({ selling: false, share: 0 }), 0);
  assert.equal(amazonPenalty({ selling: true, share: null }), 10);
  assert.equal(amazonPenalty({ selling: false, share: 40 }), 10);
  assert.equal(amazonPenalty({ selling: true, share: 82 }), 25);
  const base = buyScore(m(10, 50, 25, 30))!;
  assert.equal(buyScore(m(10, 50, 25, 30), undefined, { selling: true, share: 82 }), base - 25);
  assert.equal(buyScore(m(0.5, 2, 1, 1), undefined, { selling: true, share: 90 }), 0); // jamais négatif
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
