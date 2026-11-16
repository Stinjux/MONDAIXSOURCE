import test from "node:test";
import assert from "node:assert/strict";
import type { CogsLine } from "../src/lib/cogs";
import { change, cogsByPeriod, periodBreakdown, periodKey, periodKeys, periodLabel, shiftPeriod } from "../src/lib/cogsPeriods";

const line = (o: Partial<CogsLine>): CogsLine => ({
  purchaseId: "p1", asin: "B0AAAAAAAA", name: "Produit A", quantity: 1, unitCost: 10, supplierName: "Costco", supplierUrl: null,
  orderedAt: "2026-11-04T17:00:00.000Z", cancelled: false, source: "MANUAL", note: null, ...o,
});

test("périodes : semaine (lundi, heure du Québec), mois, année", () => {
  // Dimanche 8 nov. 23 h au Québec = lundi 9 nov. 4 h UTC : reste dans la semaine du 2 nov.
  assert.equal(periodKey(new Date("2026-11-09T04:00:00Z"), "week"), "2026-11-02");
  assert.equal(periodKey(new Date("2026-11-09T04:00:00Z"), "month"), "2026-11");
  assert.equal(periodKey(new Date("2027-01-01T03:00:00Z"), "year"), "2026");
  assert.deepEqual(periodKeys("2026-02", "month", 3), ["2025-12", "2026-01", "2026-02"]);
  assert.equal(shiftPeriod("2026-11-02", "week", -1), "2026-10-26");
  assert.equal(periodLabel("2026-11", "month", true), "Nov. 2026");
  assert.equal(periodLabel("2026-11", "month"), "nov. 26");
});

test("COGS par période : totaux, périodes vides, annulations exclues", () => {
  const lines = [
    line({ purchaseId: "a", quantity: 4, unitCost: 10 }),
    line({ purchaseId: "b", asin: "B0BBBBBBBB", name: "Produit B", quantity: 2, unitCost: 25, supplierName: "walmart.ca", supplierUrl: "https://www.walmart.ca/ip/1" }),
    line({ purchaseId: "c", quantity: 1, unitCost: 99, orderedAt: "2026-09-10T17:00:00.000Z" }),
    line({ purchaseId: "d", quantity: 50, unitCost: 1, cancelled: true }),
  ];
  const p = cogsByPeriod(lines, "month", periodKeys("2026-11", "month", 3));
  assert.deepEqual(p.map((x) => [x.key, x.cost, x.units, x.orders, x.products, x.avgUnitCost]), [
    ["2026-09", 99, 1, 1, 1, 99],
    ["2026-10", 0, 0, 0, 0, null],
    ["2026-11", 90, 6, 2, 2, 15],
  ]);
  const d = periodBreakdown(lines, "month", "2026-11");
  assert.deepEqual(d.products.map((x) => [x.name, x.cost]), [["Produit B", 50], ["Produit A", 40]]);
  assert.deepEqual(d.suppliers.map((x) => [x.name, x.cost]), [["Walmart", 50], ["Costco", 40]]);
  assert.equal(change(90, 60), 50);
  assert.equal(change(90, 0), null);
});
