import test from "node:test";
import assert from "node:assert/strict";
import { isOrderHeader, orderAmounts, orderSupplier, ordersBySupplier, ordersTotals, parseOrderRow, type OrderView } from "../src/lib/orders";
import { matchSupplierKey } from "../src/lib/suppliers";

const view = (id: string, supplierText: string, totalPaid: number, quantity: number, orderedAt: string): OrderView => {
  const s = orderSupplier(supplierText);
  return {
    id, sheetRow: 2, supplierText, supplierKey: s.key, supplierName: s.name, supplierUrl: s.url, totalPaid, quantity, orderedAt, dateFromSheet: true,
    orderedText: orderedAt.slice(0, 10), emailUrl: null, taxRate: 14.975, ...orderAmounts({ totalPaid, quantity }),
  };
};

test("commande : taxes du Québec retirées du prix total, puis divisé par le nombre d'unités", () => {
  // 114,98 $ TTC pour 10 unités : 100,00 $ HT, 14,98 $ de TPS + TVQ, 10,00 $ / u. HT
  assert.deepEqual(orderAmounts({ totalPaid: 114.98, quantity: 10 }), { beforeTax: 100, taxes: 14.98, unitCost: 10, unitPaid: 11.5 });
  assert.deepEqual(orderAmounts({ totalPaid: 57.49, quantity: 3 }), { beforeTax: 50, taxes: 7.49, unitCost: 16.67, unitPaid: 19.16 });
  // Taux figé à l'import : un autre taux enregistré donne son propre calcul
  assert.equal(orderAmounts({ totalPaid: 105, quantity: 1, taxRate: 5 }).beforeTax, 100);
});

test("commande : lecture d'une ligne de la Sheet COMMANDES", () => {
  const ok = parseOrderRow(["Walmart", "1 234,56 $", "24", "2026-11-03", "https://mail.google.com/mail/u/0/#inbox/abc"], 5);
  assert.ok(ok.ok);
  assert.deepEqual(ok.row, {
    sheetRow: 5, supplierText: "Walmart", supplierKey: "walmart", supplierName: "Walmart", supplierUrl: null, totalPaid: 1234.56, quantity: 24,
    orderedText: "2026-11-03", emailUrl: "https://mail.google.com/mail/u/0/#inbox/abc",
  });
  assert.deepEqual(ok.warnings, []);
  const url = parseOrderRow(["https://www.canadiantire.ca/fr/pdp/x.html", "45", "2", "", ""], 6);
  assert.ok(url.ok);
  assert.equal(url.row.supplierKey, "canadiantire");
  assert.equal(url.row.supplierName, "Canadian Tire");
  assert.deepEqual(url.warnings, ["Date de commande manquante (colonne D) : date d'import utilisée"]);
  assert.deepEqual(parseOrderRow(["Costco", "", "2", "2026-11-03", ""], 7), { ok: false, error: "Prix total manquant (colonne B)" });
  assert.deepEqual(parseOrderRow(["Costco", "40", "2,5", "2026-11-03", ""], 8), { ok: false, error: "Quantité invalide « 2,5 » : nombre entier d'au moins 1 attendu (colonne C)" });
  assert.deepEqual(parseOrderRow(["Costco", "40", "0", "2026-11-03", ""], 9), { ok: false, error: "Quantité invalide « 0 » : nombre entier d'au moins 1 attendu (colonne C)" });
  assert.ok(isOrderHeader(["Fournisseur", "Prix total ($ CA)", "Quantité", "Date de commande", "Lien vers le courriel"]));
  assert.ok(!isOrderHeader(["Walmart", "40", "2", "", ""]));
});

test("commandes : classement des fournisseurs par montant payé", () => {
  const orders = [
    view("1", "Walmart", 114.98, 10, "2026-11-01T12:00:00Z"),
    view("2", "walmart.ca", 57.49, 5, "2026-11-08T12:00:00Z"),
    view("3", "Costco", 229.95, 8, "2026-10-20T12:00:00Z"),
    view("4", "", 11.5, 1, "2026-10-21T12:00:00Z"),
  ];
  const by = ordersBySupplier(orders);
  assert.deepEqual(by.map((s) => [s.key, s.name, s.orders, s.units, s.totalPaid, s.beforeTax, s.avgUnitCost]), [
    ["costco", "Costco", 1, 8, 229.95, 200, 25],
    ["walmart", "Walmart", 2, 15, 172.47, 150, 10],
    ["unknown", "Fournisseur non indiqué", 1, 1, 11.5, 10, 10],
  ]);
  assert.equal(by[1].lastAt, "2026-11-08T12:00:00Z");
  assert.equal(by[1].domain, "walmart.ca");
  assert.deepEqual(ordersTotals(orders), { orders: 4, units: 24, totalPaid: 413.92, taxes: 53.92, beforeTax: 360, avgUnitCost: 15 });
});

test("commandes : rattachement au fournisseur de la section Fournisseurs", () => {
  assert.equal(matchSupplierKey("walmart", ["walmart", "costco"]), "walmart");
  assert.equal(matchSupplierKey("costcowholesale", ["walmart", "costco"]), "costco");
  assert.equal(matchSupplierKey("bestbuy", ["walmart", "costco"]), null);
  assert.equal(matchSupplierKey("unknown", ["unknown"]), null);
  assert.equal(matchSupplierKey("abc", ["abcdef"]), null); // trop court pour un rapprochement
});

test("commande : date ambiguë signalée (jour et mois tous deux ≤ 12)", async () => {
  const { ambiguousDate } = await import("../src/lib/orders");
  assert.equal(ambiguousDate("03/11/2026"), true);
  assert.equal(ambiguousDate("3-11-26"), true);
  assert.equal(ambiguousDate("13/11/2026"), false);
  assert.equal(ambiguousDate("11/11/2026"), false);
  assert.equal(ambiguousDate("2026-11-03"), false);
  assert.equal(ambiguousDate(null), false);
});
