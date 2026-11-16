import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_FILTERS, compareRows, evaluateRow, inScope, matchesVerdict, parseFilters } from "../src/lib/decisionFilters";
import { DEFAULT_THRESHOLDS as T } from "../src/lib/decision";

const row = (o: Partial<Parameters<typeof evaluateRow>[0]> & { id: string }) => ({
  profit: 10, roi: 50, margin: 30, monthlyProfit: 500, estimatedSales: 50, score: 70,
  unavailable: false, restricted: false, countsTowardGoal: true, goalWeek: "2026-10-12", ...o,
});

test("verdict : rupture ou ASIN restreint ne peut pas être « Acheter »", () => {
  assert.equal(evaluateRow(row({ id: "a" }), T).verdict, "BUY");
  const out = evaluateRow(row({ id: "b", unavailable: true }), T);
  assert.equal(out.verdict, "CONSIDER");
  assert.deepEqual(out.reasons, ["Fournisseur en rupture"]);
  assert.equal(evaluateRow(row({ id: "c", restricted: true }), T).verdict, "CONSIDER");
});

test("filtre d'avis", () => {
  assert.ok(matchesVerdict("BUY", "ACTIONABLE") && matchesVerdict("CONSIDER", "ACTIONABLE"));
  assert.ok(!matchesVerdict("AVOID", "ACTIONABLE"));
  assert.ok(matchesVerdict("AVOID", "ALL") && matchesVerdict("AVOID", "AVOID") && !matchesVerdict("BUY", "AVOID"));
});

test("périmètre : ruptures masquées par défaut, période de découverte", () => {
  const f = { includeUnavailable: false };
  assert.equal(inScope(row({ id: "a", unavailable: true }), f, "2026-10-12"), false);
  assert.equal(inScope(row({ id: "a", unavailable: true }), { ...f, includeUnavailable: true }, "2026-10-12"), true);
  assert.equal(inScope(row({ id: "b", goalWeek: "2026-10-05" }), { ...f, period: "week" }, "2026-10-12"), false);
  assert.equal(inScope(row({ id: "c" }), { ...f, period: "week" }, "2026-10-12"), true);
  assert.equal(inScope(row({ id: "b", goalWeek: "2026-10-05" }), { ...f, period: "4w" }, "2026-10-12"), true);
  assert.equal(inScope(row({ id: "d", goalWeek: "2026-09-14" }), { ...f, period: "4w" }, "2026-10-12"), false);
  // Sans semaine d'objectif : la semaine de première apparition
  assert.equal(inScope(row({ id: "e", goalWeek: null, firstSeenAt: "2026-10-14T16:00:00Z" }), { ...f, period: "week" }, "2026-10-12"), true);
});

test("périmètre : plages « afficher seulement » (ROI, ventes, coût)", () => {
  const f = { includeUnavailable: false };
  const r = (o: Parameters<typeof row>[0]) => inScope(row(o), { ...f, roiMin: 30, roiMax: 200, salesMin: 20, costMax: 25 }, "2026-10-12");
  assert.equal(r({ id: "ok", roi: 50, estimatedSales: 50, costPrice: 12 }), true);
  assert.equal(r({ id: "roi-bas", roi: 20 }), false);
  assert.equal(r({ id: "roi-extreme", roi: 900 }), false);
  assert.equal(r({ id: "roi-inconnu", roi: null }), false); // écarté par le minimum
  assert.equal(r({ id: "peu-vendu", estimatedSales: 5 }), false);
  assert.equal(r({ id: "trop-cher", costPrice: 40 }), false);
  assert.equal(r({ id: "cout-inconnu", costPrice: null }), true); // une valeur inconnue n'est pas écartée par un maximum
  assert.equal(inScope(row({ id: "x", roi: 900 }), { ...f, roiMax: null }, "2026-10-12"), true);
});

test("tri : stratégie choisie, valeurs manquantes en dernier, départage par score", () => {
  const rows = [
    evaluateRow(row({ id: "low", roi: 20, score: 40 }), T),
    evaluateRow(row({ id: "none", roi: null, profit: null, score: null }), T),
    evaluateRow(row({ id: "high", roi: 90, score: 60 }), T),
    evaluateRow(row({ id: "tie", roi: 90, score: 80 }), T),
  ];
  assert.deepEqual([...rows].sort(compareRows("roi")).map((r) => r.id), ["tie", "high", "low", "none"]);
});

test("préférences : valeurs invalides ignorées, défauts appliqués", () => {
  assert.deepEqual(parseFilters(null), DEFAULT_FILTERS);
  const p = parseFilters({ strategy: "roi", verdict: "BUY", weekOnly: true, thresholds: { minRoi: 40, minProfit: "x" }, budget: "1500" });
  assert.equal(p.strategy, "roi");
  assert.equal(p.verdict, "BUY");
  assert.equal(p.weekOnly, true);
  assert.equal(p.period, "week"); // ancien réglage « cette semaine seulement » repris comme période
  assert.deepEqual([p.roiMin, p.roiMax, p.salesMin, p.costMax], [null, null, null, null]);
  const q = parseFilters({ period: "12w", roiMin: 25, roiMax: "x", salesMin: 30, costMax: 18.5 });
  assert.deepEqual([q.period, q.weekOnly, q.roiMin, q.roiMax, q.salesMin, q.costMax], ["12w", false, 25, null, 30, 18.5]);
  assert.equal(p.thresholds.minRoi, 40);
  assert.equal(p.thresholds.minProfit, T.minProfit);
  assert.equal(parseFilters({ strategy: "hack", verdict: 3 }).strategy, "score");
});
