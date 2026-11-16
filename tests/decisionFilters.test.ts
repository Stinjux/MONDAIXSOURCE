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

test("périmètre : ruptures masquées par défaut, filtre de semaine", () => {
  const f = { weekOnly: false, includeUnavailable: false };
  assert.equal(inScope(row({ id: "a", unavailable: true }), f, "2026-10-12"), false);
  assert.equal(inScope(row({ id: "a", unavailable: true }), { ...f, includeUnavailable: true }, "2026-10-12"), true);
  assert.equal(inScope(row({ id: "b", goalWeek: "2026-10-05" }), { ...f, weekOnly: true }, "2026-10-12"), false);
  assert.equal(inScope(row({ id: "c" }), { ...f, weekOnly: true }, "2026-10-12"), true);
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
  assert.equal(p.thresholds.minRoi, 40);
  assert.equal(p.thresholds.minProfit, T.minProfit);
  assert.equal(parseFilters({ strategy: "hack", verdict: 3 }).strategy, "score");
});
