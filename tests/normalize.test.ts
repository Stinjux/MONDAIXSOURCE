import test from "node:test";
import assert from "node:assert/strict";
import { amount, extractAsin, normalizeUrl, parseRow, supplierBrand, supplierIdentity } from "../src/lib/normalize";

const ok = (r: ReturnType<typeof parseRow>) => {
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r.row;
};

test("LEADS : colonnes A à J", () => {
  const r = parseRow("LEADS", ["Nike Socks", "b012345678", "https://amazon.ca/dp/B012345678", "$40.00", "$45.00", "90", "2026-10-13", "$7.10", "$20.00", "https://shop.ca/item?utm_source=x"], 2);
  const row = ok(r);
  assert.equal(row.asin, "B012345678");
  assert.equal(row.buyBox90, 40);
  assert.equal(row.salePrice, 45);
  assert.equal(row.estimatedSales, 90);
  assert.equal(row.exportDate, "2026-10-13");
  assert.equal(row.fbaFee, 7.1);
  assert.equal(row.costPrice, 20);
  assert.equal(row.supplierKey, "shop.ca/item");
  assert.equal(row.currency, "CAD");
  assert.equal(r.ok && r.warnings.length, 0);
});

test("OUT OF STOCK : colonnes A à P", () => {
  const row = ok(parseRow("OUT_OF_STOCK", ["Brush", "B012345678", "", "30", "40", "50%", "30", "12", "100", "Walmart", "note", "22", "CAD", "Rupture", "2026-10-13", "checked"], 5));
  assert.equal(row.sheetRoi, 50);
  assert.equal(row.sheetProfit, 12);
  assert.equal(row.estimatedSales, 100);
  assert.equal(row.costPrice, 22);
  assert.equal(row.availability, "Rupture");
  assert.equal(row.lastChecked, "2026-10-13");
  assert.equal(row.checkDetail, "checked");
  assert.equal(row.sheetRow, 5);
  assert.equal(row.supplierKey, "store:walmart");
});

test("OUT OF STOCK : devise étrangère signalée", () => {
  const r = parseRow("OUT_OF_STOCK", ["X", "B012345678", "", "", "", "", "", "", "", "Target", "", "10", "usd"], 3);
  assert.ok(r.ok);
  assert.equal(r.row.currency, "USD");
  assert.ok(r.warnings.some((w) => w.includes("USD")));
});

test("lignes invalides", () => {
  const missing = parseRow("LEADS", ["Produit", "", ""], 4);
  assert.equal(missing.ok, false);
  const bad = parseRow("LEADS", ["Produit", "12345"], 4);
  assert.equal(bad.ok, false);
  assert.match(!bad.ok ? bad.error : "", /12345/);
});

test("ASIN récupéré depuis l'URL Amazon si la colonne B est vide", () => {
  assert.equal(extractAsin("", "https://www.amazon.ca/Some-Product/dp/B0ABCDEF12?th=1"), "B0ABCDEF12");
  assert.equal(extractAsin("n/a", "https://www.amazon.ca/gp/product/B0ABCDEF12/"), "B0ABCDEF12");
  assert.equal(extractAsin("", ""), null);
});

test("montants localisés", () => {
  assert.equal(amount("1 234,56 $"), 1234.56);
  assert.equal(amount("$1,234.56"), 1234.56);
  assert.equal(amount("1,234"), 1234);
  assert.equal(amount("12,5"), 12.5);
  assert.equal(amount("12,5 %"), 12.5);
  assert.equal(amount("1.234,50"), 1234.5);
  assert.equal(amount("-$5.25"), -5.25);
  assert.equal(amount("(4.20)"), -4.2);
  assert.equal(amount("CA$ 19.99"), 19.99);
  assert.equal(amount("—"), undefined);
  assert.equal(amount(""), undefined);
  assert.equal(amount("N/A"), undefined);
});

test("URL fournisseur normalisée", () => {
  assert.equal(normalizeUrl("https://www.shop.ca/a/?utm_x=1"), "shop.ca/a");
  assert.equal(normalizeUrl("https://WWW.Walmart.ca/ip/Thing/123?from=search&sku=9"), "walmart.ca/ip/thing/123?sku=9");
  assert.equal(normalizeUrl("https://store.ca/p?pid=7&gclid=abc"), "store.ca/p?pid=7");
});

test("marque fournisseur : nom de boutique ↔ URL", () => {
  assert.equal(supplierBrand("https://www.walmart.ca/ip/1"), "walmart");
  assert.equal(supplierBrand("Walmart Canada"), "walmart");
  assert.equal(supplierBrand("Canadian Tire"), "canadiantire");
  assert.equal(supplierBrand("https://www.canadiantire.ca/en/pdp/x.html"), "canadiantire");
  assert.equal(supplierBrand("The Home Depot"), "homedepot");
  assert.equal(supplierBrand("https://shop.lego.com/fr-ca/x"), "lego");
  assert.equal(supplierBrand("Pharmaprix"), "pharmaprix");
  assert.deepEqual(supplierIdentity(undefined, ""), { key: "unknown" });
});
