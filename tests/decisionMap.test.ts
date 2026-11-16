import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MAP, mapPoints, parseMapConfig, type MapRow } from "../src/lib/decisionMap";

const row = (i: number, extra: Partial<MapRow> = {}): MapRow => ({
  productId: `p${i}`, asin: `B0${String(i).padStart(8, "0")}`, name: `Produit ${i}`, verdict: "BUY",
  roi: 30 + i, estimatedSales: 10 * i, margin: 20, costPrice: 10 + i, profit: 4, monthlyProfit: 40 * i, amazonPrice: 30, score: 50, ...extra,
});

test("carte : axes et taille au choix, leads sans valeur non placés", () => {
  const rows = [row(1), row(2, { roi: null }), row(3, { monthlyProfit: -50 })];
  const { points, missing, trimmed } = mapPoints(rows, { x: "estimatedSales", y: "roi", size: "monthlyProfit", trim: false });
  assert.deepEqual(points.map((p) => [p.row.productId, p.x, p.y, p.z]), [["p1", 10, 31, 40], ["p3", 30, 33, 0]]);
  assert.deepEqual([missing, trimmed], [1, 0]);
  const same = mapPoints(rows, { x: "costPrice", y: "margin", size: "none", trim: false });
  assert.deepEqual(same.points.map((p) => [p.x, p.y, p.z]), [[11, 20, 1], [12, 20, 1], [13, 20, 1]]);
});

test("carte : valeurs extrêmes masquées sur demande (dès 20 leads)", () => {
  const rows = Array.from({ length: 40 }, (_, i) => row(i + 1));
  rows.push(row(99, { estimatedSales: 100000 }));
  const off = mapPoints(rows, { ...DEFAULT_MAP, trim: false });
  const on = mapPoints(rows, { ...DEFAULT_MAP, trim: true });
  assert.equal(off.points.length, 41);
  assert.ok(on.trimmed >= 1 && on.trimmed <= 6);
  assert.ok(!on.points.some((p) => p.row.productId === "p99"));
  assert.equal(mapPoints(rows.slice(0, 10), { ...DEFAULT_MAP, trim: true }).trimmed, 0);
});

test("carte : réglages enregistrés relus sans planter", () => {
  assert.deepEqual(parseMapConfig(undefined), DEFAULT_MAP);
  assert.deepEqual(parseMapConfig({ x: "costPrice", y: "margin", size: "none", trim: true }), { x: "costPrice", y: "margin", size: "none", trim: true });
  assert.deepEqual(parseMapConfig({ x: "nimporte", y: 3, size: "roi" }), { ...DEFAULT_MAP, size: "roi" });
});
