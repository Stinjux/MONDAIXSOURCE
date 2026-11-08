import test from "node:test";
import assert from "node:assert/strict";
import { storeDomain, storeInitials, storeName } from "../src/lib/stores";

test("commerce : nom lisible, sans lien ni .ca", () => {
  assert.equal(storeName({ supplierName: "canadiantire.ca", supplierUrl: "https://www.canadiantire.ca/fr/pdp/x", supplierKey: "canadiantire.ca/fr/pdp/x" }), "Canadian Tire");
  assert.equal(storeName({ supplierName: "Walmart", supplierKey: "store:walmart" }), "Walmart");
  assert.equal(storeName({ supplierName: "bestbuy.ca", supplierUrl: "https://www.bestbuy.ca/p/1" }), "Best Buy");
  assert.equal(storeName({ supplierName: "Boutique Chez Paul", supplierKey: "store:boutiquechezpaul" }), "Boutique Chez Paul");
  assert.equal(storeName({ supplierName: "petitmagasin.ca", supplierUrl: "https://petitmagasin.ca/p/1" }), "Petitmagasin");
  assert.equal(storeName({ supplierName: "petit-magasin.ca", supplierUrl: "https://www.petit-magasin.ca/p" }), "Petit Magasin");
  assert.equal(storeName({ supplierName: "shop.petit-magasin.co.uk", supplierUrl: "https://shop.petit-magasin.co.uk/p" }), "Petit Magasin");
  assert.equal(storeName({ supplierKey: "unknown" }), "Fournisseur");
});

test("commerce : domaine pour le logo et initiales", () => {
  assert.equal(storeDomain({ supplierUrl: "https://www.costco.ca/x.html" }), "costco.ca");
  assert.equal(storeDomain({ supplierKey: "store:walmart", supplierName: "Walmart" }), null);
  assert.equal(storeInitials("Canadian Tire"), "CT");
  assert.equal(storeInitials("Costco"), "CO");
});
