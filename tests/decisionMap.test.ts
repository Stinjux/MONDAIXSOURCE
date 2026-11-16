import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MAP, inPeriod, mapPoints, parseMapConfig, type MapConfig, type MapRow } from "../src/lib/decisionMap";

const W = "2026-11-16"; // semaine en cours (lundi)
const row = (i: number, extra: Partial<MapRow> = {}): MapRow => ({
  productId: `p${i}`, asin: `B0${String(i).padStart(8, "0")}`, name: `Produit ${i}`, verdict: "BUY",
  roi: 30 + i, estimatedSales: 10 * i, margin: 20, costPrice: 10 + i, profit: 4, monthlyProfit: 40 * i, amazonPrice: 30, score: 50, week: W, ...extra,
});
const cfg = (c: Partial<MapConfig>): MapConfig => ({ ...DEFAULT_MAP, ...c });

test("carte : axes et taille au choix, leads sans valeur non placés", () => {
  const rows = [row(1), row(2, { roi: null }), row(3, { monthlyProfit: -50 })];
  const { points, missing, trimmed } = mapPoints(rows, cfg({ x: "estimatedSales", y: "roi", size: "monthlyProfit" }), W);
  assert.deepEqual(points.map((p) => [p.row.productId, p.x, p.y, p.z]), [["p1", 10, 31, 40], ["p3", 30, 33, 0]]);
  assert.deepEqual([missing, trimmed], [1, 0]);
  const same = mapPoints(rows, cfg({ x: "costPrice", y: "margin", size: "none" }), W);
  assert.deepEqual(same.points.map((p) => [p.x, p.y, p.z]), [[11, 20, 1], [12, 20, 1], [13, 20, 1]]);
});

test("carte : valeurs extrêmes masquées sur demande (dès 20 leads)", () => {
  const rows = Array.from({ length: 40 }, (_, i) => row(i + 1));
  rows.push(row(99, { estimatedSales: 100000 }));
  const off = mapPoints(rows, cfg({ trim: false }), W);
  const on = mapPoints(rows, cfg({ trim: true }), W);
  assert.equal(off.points.length, 41);
  assert.ok(on.trimmed >= 1 && on.trimmed <= 6);
  assert.ok(!on.points.some((p) => p.row.productId === "p99"));
  assert.equal(mapPoints(rows.slice(0, 10), cfg({ trim: true }), W).trimmed, 0);
});

test("carte : période (cette semaine, 4 ou 12 semaines) et ROI maximum", () => {
  assert.ok(inPeriod("2026-11-16", "week", W));
  assert.ok(!inPeriod("2026-11-09", "week", W));
  assert.ok(inPeriod("2026-10-26", "4w", W)); // 4e semaine en arrière
  assert.ok(!inPeriod("2026-10-19", "4w", W));
  assert.ok(inPeriod("2026-08-31", "12w", W) && !inPeriod("2026-08-24", "12w", W));
  assert.ok(inPeriod("2020-01-06", "all", W));

  const rows = [row(1), row(2, { week: "2026-11-09" }), row(3, { roi: 900 }), row(4, { roi: null, week: "2026-11-02" })];
  const week = mapPoints(rows, cfg({ period: "week" }), W);
  assert.deepEqual(week.points.map((p) => p.row.productId), ["p1", "p3"]);
  assert.equal(week.outOfPeriod, 2);
  const capped = mapPoints(rows, cfg({ roiMax: 200 }), W);
  assert.deepEqual(capped.points.map((p) => p.row.productId), ["p1", "p2"]);
  assert.deepEqual([capped.aboveRoiMax, capped.missing], [1, 1]); // p4 : ROI inconnu, gardé mais non placé
});

test("carte : réglages enregistrés relus sans planter", () => {
  assert.deepEqual(parseMapConfig(undefined), DEFAULT_MAP);
  assert.deepEqual(parseMapConfig({ x: "costPrice", y: "margin", size: "none", trim: true, period: "week", roiMax: 250 }), {
    x: "costPrice", y: "margin", size: "none", trim: true, period: "week", roiMax: 250,
  });
  assert.deepEqual(parseMapConfig({ x: "nimporte", y: 3, size: "roi", period: "hier", roiMax: "abc" }), { ...DEFAULT_MAP, size: "roi" });
});

test("carte : bornes d'axe rondes, critères minimum inclus", async () => {
  const { niceDomain } = await import("../src/lib/decisionMap");
  assert.deepEqual(niceDomain([7, 163]), { min: 0, max: 200, step: 50 });
  assert.deepEqual(niceDomain([-23, 86, 30]), { min: -25, max: 100, step: 25 });
  assert.deepEqual(niceDomain([3, 380, 10]), { min: 0, max: 400, step: 100 });
  assert.deepEqual(niceDomain([12, 12]), { min: 10.5, max: 13.5, step: 0.5 });
  assert.deepEqual(niceDomain([]), { min: 0, max: 1, step: 0.25 });
});
