import test from "node:test";
import assert from "node:assert/strict";
import { classifyAvailability, needsRecheck, stockFromSheet } from "../src/lib/stock";
import { duplicateAlertActive, duplicateFlags, matchOffer } from "../src/lib/duplicates";
import { pickOfferValues, rowHash } from "../src/lib/sync/values";
import type { ParsedRow } from "../src/lib/normalize";

const NOW = new Date("2026-10-14T16:00:00Z");

test("disponibilité : négations avant affirmations", () => {
  assert.equal(classifyAvailability("Indisponible"), "OUT_OF_STOCK");
  assert.equal(classifyAvailability("Non disponible"), "OUT_OF_STOCK");
  assert.equal(classifyAvailability("Out of stock"), "OUT_OF_STOCK");
  assert.equal(classifyAvailability("En stock"), "IN_STOCK");
  assert.equal(classifyAvailability("Disponible"), "IN_STOCK");
  assert.equal(classifyAvailability("Erreur 403"), "CHECK_FAILED");
  assert.equal(classifyAvailability("Échec de la vérification"), "CHECK_FAILED");
  assert.equal(classifyAvailability(""), "UNKNOWN");
  assert.equal(classifyAvailability("peut-être"), "UNKNOWN");
});

test("jamais « en stock » sans date de vérification fiable", () => {
  assert.equal(stockFromSheet("En stock", "", { now: NOW }).status, "UNVERIFIED");
  assert.equal(stockFromSheet("En stock", "pas sûr", { now: NOW }).status, "UNVERIFIED");
  assert.equal(stockFromSheet("En stock", "2026-10-13", { now: NOW }).status, "IN_STOCK");
  assert.equal(stockFromSheet("Rupture", "", { now: NOW }).status, "OUT_OF_STOCK");
});

test("nouvelle vérification nécessaire", () => {
  assert.ok(needsRecheck("OUT_OF_STOCK", null, NOW, 7));
  assert.ok(needsRecheck("OUT_OF_STOCK", "2026-10-01T12:00:00Z", NOW, 7));
  assert.ok(!needsRecheck("OUT_OF_STOCK", "2026-10-12T12:00:00Z", NOW, 7));
  assert.ok(needsRecheck("CHECK_FAILED", "2026-10-14T12:00:00Z", NOW, 7));
});

test("rapprochement d'offres", () => {
  const offers = [
    { id: "a", supplierKey: "walmart.ca/ip/1", supplierUrl: "https://walmart.ca/ip/1" },
    { id: "b", supplierKey: "bestbuy.ca/p/2", supplierUrl: "https://bestbuy.ca/p/2" },
  ];
  assert.equal(matchOffer(offers, { supplierKey: "walmart.ca/ip/1" })?.offer.id, "a");
  // Nom de boutique (OUT OF STOCK) rattaché à l'URL du même fournisseur
  assert.equal(matchOffer(offers, { supplierKey: "store:walmart", supplierName: "Walmart" })?.offer.id, "a");
  assert.equal(matchOffer(offers, { supplierKey: "store:costco", supplierName: "Costco" }), null);
  // Une URL rattachée à une offre « boutique seulement » -> mise à niveau
  const storeOnly = [{ id: "s", supplierKey: "store:walmart", supplierName: "Walmart" }];
  assert.deepEqual(matchOffer(storeOnly, { supplierKey: "walmart.ca/ip/9", supplierUrl: "https://walmart.ca/ip/9" }), { offer: storeOnly[0], upgrade: true });
  // Ambigu (2 URL Walmart) : pas de rattachement automatique
  const two = [...offers, { id: "c", supplierKey: "walmart.ca/ip/3", supplierUrl: "https://walmart.ca/ip/3" }];
  assert.equal(matchOffer(two, { supplierKey: "store:walmart" }), null);
});

test("classification des doublons", () => {
  const f = duplicateFlags(["a", "b"], [
    { offerId: "a", source: "LEADS" },
    { offerId: "a", source: "LEADS" },
    { offerId: "a", source: "OUT_OF_STOCK" },
    { offerId: "b", source: "LEADS" },
  ]);
  assert.deepEqual(f.exactOfferIds, ["a"]);
  assert.equal(f.crossSheet, true);
  assert.deepEqual(f.crossSheetOfferIds, ["a"]);
  assert.equal(f.multiSupplier, true);
  const none = duplicateFlags(["a"], [{ offerId: "a", source: "LEADS" }]);
  assert.equal(none.any, false);
});

test("alerte de doublon active jusqu'à examen", () => {
  assert.equal(duplicateAlertActive(null, null), false);
  assert.equal(duplicateAlertActive("2026-10-10", null), true);
  assert.equal(duplicateAlertActive("2026-10-10", "2026-10-11"), false);
  assert.equal(duplicateAlertActive("2026-10-12", "2026-10-11"), true);
});

test("valeurs d'offre : LEADS prioritaire, lignes présentes d'abord", () => {
  const t = (s: string) => new Date(s);
  const v = pickOfferValues([
    { source: "OUT_OF_STOCK", present: true, lastImportedAt: t("2026-10-14"), costPrice: 25, salePrice: 50, currency: "CAD" },
    { source: "LEADS", present: true, lastImportedAt: t("2026-10-13"), costPrice: 20, salePrice: null, fbaFee: 7 },
    { source: "LEADS", present: false, lastImportedAt: t("2026-10-14"), costPrice: 99 },
  ]);
  assert.equal(v.costPrice, 20);
  assert.equal(v.salePrice, 50);
  assert.equal(v.fbaFee, 7);
  assert.equal(v.currency, "CAD");
  assert.equal(v.valuesSource, "LEADS");
});

test("empreinte de ligne indépendante du numéro de ligne", () => {
  const row: ParsedRow = { source: "LEADS", sheetRow: 2, asin: "B012345678", name: "X", supplierKey: "k", costPrice: 1 };
  assert.equal(rowHash(row), rowHash({ ...row, sheetRow: 99 }));
  assert.notEqual(rowHash(row), rowHash({ ...row, costPrice: 2 }));
});
