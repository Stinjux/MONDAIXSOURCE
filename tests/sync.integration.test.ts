// Tests d'intégration du moteur de synchronisation sur une vraie base PostgreSQL.
// Lancement : TEST_DATABASE_URL=postgresql://…/mondaix_test npm test
// Le nom de la base doit contenir "test" : toutes ses tables sont vidées.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";

const url = process.env.TEST_DATABASE_URL;
const skip = !url ? "TEST_DATABASE_URL non défini" : !/test/i.test(new URL(url).pathname) ? "le nom de la base doit contenir « test »" : false;

type Engine = typeof import("../src/lib/sync/engine");
type Db = import("@prisma/client").PrismaClient;
let engine: Engine;
let db: Db;

const NOW = new Date("2026-10-14T16:00:00Z"); // mercredi, semaine du 2026-10-12
const HEADER_LEADS = ["Product Name", "ASIN", "Amazon URL", "Buy Box 90", "Sale Price", "Estimated Sales", "Export Date", "FBA Fee", "Cost Price", "Supplier URL"];
const HEADER_OOS = ["Name", "ASIN", "AMZ", "BB(90)", "Sale Price", "ROI", "PROFIT (%)", "PROFIT", "EST SALES", "STORE", "NOTES", "Prix fournisseur", "Devise", "Disponibilité", "Dernière vérification", "Détail du contrôle"];

const lead = (name: string, asin: string, supplier: string, cost = "20", exportDate = "2026-10-13", sale = "45") =>
  [name, asin, `https://www.amazon.ca/dp/${asin}`, "40", sale, "90", exportDate, "7", cost, supplier];
const oos = (name: string, asin: string, store: string, availability: string, checked = "", cost = "22") =>
  [name, asin, "", "30", "40", "50", "30", "12", "100", store, "", cost, "CAD", availability, checked, ""];

const WALMART_A = "https://www.walmart.ca/ip/a?utm_source=x";
const BASE_LEADS = [
  HEADER_LEADS,
  lead("Produit A", "B0AAAAAAAA", WALMART_A),
  lead("Produit A (doublon exact)", "B0AAAAAAAA", "https://walmart.ca/ip/a"),
  lead("Produit A chez Best Buy", "B0AAAAAAAA", "https://www.bestbuy.ca/p/a"),
  lead("Produit B", "B0BBBBBBBB", "https://www.costco.ca/b.html", "15", "2026-10-06"),
  ["Ligne invalide", "12345", "", "", "", "", "", "", "", ""],
  [],
  lead("Produit D", "B0DDDDDDDD", "https://shop.ca/d", "10", ""),
];
const BASE_OOS = [
  HEADER_OOS,
  oos("Produit A", "B0AAAAAAAA", "Walmart", "Rupture", "2026-10-12"),
  oos("Produit E", "B0EEEEEEEE", "Canadian Tire", "Rupture", "2026-10-12"),
  oos("Produit F", "B0FFFFFFFF", "Staples", "Out of stock", "2026-10-10"),
];

function reader(sheets: { LEADS: string[][]; OUT_OF_STOCK: string[][] }) {
  return async (source: "LEADS" | "OUT_OF_STOCK") => sheets[source];
}

async function reset() {
  await db.$executeRawUnsafe(
    `TRUNCATE "ImportIssue", "ImportEvent", "PriceSnapshot", "StockCheck", "Occurrence", "SupplierOffer", "Product", "ChangeLog", "AppSetting", "Lead" CASCADE`,
  );
}

const run = (sheets: { LEADS: string[][]; OUT_OF_STOCK: string[][] }, now = NOW) => engine.syncAll({ read: reader(sheets), now, trigger: "TEST", db, dateOrder: "MDY" });
const bySource = (results: Awaited<ReturnType<Engine["syncAll"]>>, s: string) => results.find((r) => r.source === s && r.status !== "SKIPPED")!;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  execSync("npx prisma db push --skip-generate", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
  engine = await import("../src/lib/sync/engine");
  db = (await import("../src/lib/prisma")).prisma;
});
after(async () => {
  if (!skip) await db.$disconnect();
});
beforeEach(async () => {
  if (!skip) await reset();
});

test("import initial : nouveaux produits, doublons, lignes invalides, objectif", { skip }, async () => {
  const results = await run({ LEADS: BASE_LEADS, OUT_OF_STOCK: BASE_OOS });
  const leads = bySource(results, "LEADS");
  assert.equal(leads.status, "SUCCESS");
  assert.equal(leads.rowsRead, 6); // en-tête et ligne vide ignorés
  assert.equal(leads.imported, 3); // A, B, D
  assert.equal(leads.duplicates, 2); // A doublon exact + A chez un 2e fournisseur
  assert.equal(leads.errors, 1);

  const oosRun = bySource(results, "OUT_OF_STOCK");
  assert.equal(oosRun.imported, 2); // E, F
  assert.equal(oosRun.duplicates, 1); // A présent aussi dans OUT OF STOCK

  // Objectif : uniquement les nouveaux ASIN de LEADS, par semaine de découverte (Export Date)
  const thisWeek = await db.product.findMany({ where: { countsTowardGoal: true, goalWeek: "2026-10-12" }, orderBy: { asin: "asc" } });
  assert.deepEqual(thisWeek.map((p) => p.asin), ["B0AAAAAAAA", "B0DDDDDDDD"]);
  const lastWeek = await db.product.findMany({ where: { countsTowardGoal: true, goalWeek: "2026-10-05" } });
  assert.deepEqual(lastWeek.map((p) => p.asin), ["B0BBBBBBBB"]);
  assert.equal(await db.product.count({ where: { countsTowardGoal: false } }), 2); // E et F (OOS)

  // Produit A : 2 offres (Walmart, Best Buy) ; l'offre Walmart regroupe LEADS ×2 et OOS ×1
  const a = await db.product.findUniqueOrThrow({ where: { asin: "B0AAAAAAAA" }, include: { offers: { include: { occurrences: true } } } });
  assert.equal(a.offers.length, 2);
  const walmart = a.offers.find((o) => o.supplierKey === "walmart.ca/ip/a")!;
  assert.equal(walmart.occurrences.length, 3);
  assert.deepEqual(walmart.occurrences.map((o) => o.source).sort(), ["LEADS", "LEADS", "OUT_OF_STOCK"]);
  assert.equal(walmart.costPrice, 20); // valeurs LEADS prioritaires
  assert.equal(walmart.stockStatus, "OUT_OF_STOCK");
  assert.ok(a.lastDuplicateAt);

  const issues = await db.importIssue.findMany({ where: { severity: "ERROR" } });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].sheetRow, 6);
  assert.match(issues[0].message, /ASIN invalide/);
});

test("resynchronisation identique : aucun changement, aucune double comptabilisation", { skip }, async () => {
  await run({ LEADS: BASE_LEADS, OUT_OF_STOCK: BASE_OOS });
  const counts = { p: await db.product.count(), o: await db.occurrence.count(), s: await db.priceSnapshot.count(), c: await db.stockCheck.count() };
  const results = await run({ LEADS: BASE_LEADS, OUT_OF_STOCK: BASE_OOS }, new Date("2026-10-14T18:00:00Z"));
  for (const r of results) {
    assert.equal(r.imported, 0);
    assert.equal(r.duplicates, 0);
    assert.equal(r.updated, 0);
    assert.equal(r.missing, 0);
  }
  assert.equal(bySource(results, "LEADS").unchanged, 5);
  assert.deepEqual(counts, { p: await db.product.count(), o: await db.occurrence.count(), s: await db.priceSnapshot.count(), c: await db.stockCheck.count() });
});

test("trier la Sheet ou insérer une ligne ne réinitialise pas les revues", { skip }, async () => {
  await run({ LEADS: BASE_LEADS, OUT_OF_STOCK: BASE_OOS });
  await db.product.update({ where: { asin: "B0BBBBBBBB" }, data: { reviewStatus: "VALIDATED", reviewNotes: "OK" } });
  const shuffled = [HEADER_LEADS, lead("Nouveau G", "B0GGGGGGGG", "https://shop.ca/g"), ...BASE_LEADS.slice(1).reverse()];
  const r = bySource(await run({ LEADS: shuffled, OUT_OF_STOCK: BASE_OOS }, new Date("2026-10-15T16:00:00Z")), "LEADS");
  assert.equal(r.imported, 1);
  assert.equal(r.updated, 0);
  assert.equal(r.duplicates, 0);
  const b = await db.product.findUniqueOrThrow({ where: { asin: "B0BBBBBBBB" } });
  assert.equal(b.reviewStatus, "VALIDATED");
  assert.equal(b.reviewNotes, "OK");
  assert.equal(b.goalWeek, "2026-10-05");
});

test("changement de prix : historisé, sans nouvelle occurrence", { skip }, async () => {
  await run({ LEADS: BASE_LEADS, OUT_OF_STOCK: BASE_OOS });
  const changed = BASE_LEADS.map((row) => (row[1] === "B0BBBBBBBB" ? lead("Produit B", "B0BBBBBBBB", "https://www.costco.ca/b.html", "17.50", "2026-10-06") : row));
  const r = bySource(await run({ LEADS: changed, OUT_OF_STOCK: BASE_OOS }, new Date("2026-10-15T16:00:00Z")), "LEADS");
  assert.equal(r.updated, 1);
  assert.equal(r.imported, 0);
  const offer = await db.supplierOffer.findFirstOrThrow({ where: { product: { asin: "B0BBBBBBBB" } }, include: { priceSnapshots: { orderBy: { capturedAt: "asc" } } } });
  assert.equal(offer.costPrice, 17.5);
  assert.deepEqual(offer.priceSnapshots.map((s) => s.costPrice), [15, 17.5]);
});

test("ligne retirée de la Sheet : conservée et marquée absente ; Sheet vide : rien n'est marqué", { skip }, async () => {
  await run({ LEADS: BASE_LEADS, OUT_OF_STOCK: BASE_OOS });
  const withoutD = BASE_LEADS.filter((row) => row[1] !== "B0DDDDDDDD");
  const r = bySource(await run({ LEADS: withoutD, OUT_OF_STOCK: BASE_OOS }), "LEADS");
  assert.equal(r.missing, 1);
  const d = await db.product.findUniqueOrThrow({ where: { asin: "B0DDDDDDDD" }, include: { occurrences: true } });
  assert.equal(d.occurrences[0].present, false);
  assert.ok(d.occurrences[0].missingSince);
  assert.equal(d.countsTowardGoal, true); // reste compté dans sa semaine

  const empty = bySource(await run({ LEADS: [HEADER_LEADS], OUT_OF_STOCK: BASE_OOS }), "LEADS");
  assert.equal(empty.missing, 0);
  assert.equal(empty.warnings, 1);
  assert.equal(await db.occurrence.count({ where: { source: "LEADS", present: true } }), 4);
});

test("OUT OF STOCK : retour en stock vérifié, historique des contrôles", { skip }, async () => {
  await run({ LEADS: BASE_LEADS, OUT_OF_STOCK: BASE_OOS });
  // Sans date de vérification : jamais déclaré disponible
  const unverified = BASE_OOS.map((row) => (row[1] === "B0FFFFFFFF" ? oos("Produit F", "B0FFFFFFFF", "Staples", "En stock", "") : row));
  await run({ LEADS: BASE_LEADS, OUT_OF_STOCK: unverified }, new Date("2026-10-14T17:00:00Z"));
  const f = await db.supplierOffer.findFirstOrThrow({ where: { product: { asin: "B0FFFFFFFF" } } });
  assert.equal(f.stockStatus, "UNVERIFIED");
  assert.equal(f.backInStockAt, null);

  const back = BASE_OOS.map((row) => (row[1] === "B0FFFFFFFF" ? oos("Produit F", "B0FFFFFFFF", "Staples", "En stock", "2026-10-14") : row));
  await run({ LEADS: BASE_LEADS, OUT_OF_STOCK: back }, new Date("2026-10-14T18:00:00Z"));
  const g = await db.supplierOffer.findFirstOrThrow({ where: { product: { asin: "B0FFFFFFFF" } }, include: { stockChecks: { orderBy: { recordedAt: "asc" } } } });
  assert.equal(g.stockStatus, "IN_STOCK");
  assert.ok(g.backInStockAt);
  assert.deepEqual(g.stockChecks.map((c) => c.status), ["OUT_OF_STOCK", "UNVERIFIED", "IN_STOCK"]);
});

test("verrou : deux synchronisations simultanées", { skip }, async () => {
  const [a, b] = await Promise.all([run({ LEADS: BASE_LEADS, OUT_OF_STOCK: BASE_OOS }), run({ LEADS: BASE_LEADS, OUT_OF_STOCK: BASE_OOS })]);
  const skipped = [...a, ...b].filter((r) => r.status === "SKIPPED");
  assert.equal(skipped.length, 1);
  assert.equal(await db.product.count(), 5);
});

test("échec de lecture : run FAILED, aucune donnée perdue", { skip }, async () => {
  await run({ LEADS: BASE_LEADS, OUT_OF_STOCK: BASE_OOS });
  const results = await engine.syncAll({ db, now: NOW, trigger: "TEST", read: async () => { throw new Error("403 accès refusé"); } });
  assert.ok(results.every((r) => r.status === "FAILED"));
  assert.equal(await db.occurrence.count({ where: { present: false } }), 0);
  const failed = await db.importRun.findFirstOrThrow({ where: { status: "FAILED" } });
  assert.match(failed.details!, /403/);
});

test("migration de l'ancienne table Lead : statuts de revue et dates conservés", { skip }, async () => {
  await db.legacyLead.createMany({
    data: [
      { id: "l1", source: "LEADS", sourceRow: 2, key: "x", asin: "B0BBBBBBBB", supplierKey: "x", name: "Produit B", supplierUrl: "https://www.costco.ca/b.html", salePrice: 45, costPrice: 15, fbaFee: 7, exportDate: "", firstSeenAt: new Date("2026-09-03T14:00:00Z"), reviewStatus: "REVIEWED", reviewedAt: new Date("2026-09-06T14:00:00Z") },
      { id: "l2", source: "LEADS", sourceRow: 3, key: "y", asin: "B0ZZZZZZZZ", supplierKey: "y", name: "Ancien Z", supplierUrl: "https://z.ca/z", firstSeenAt: new Date("2026-09-10T14:00:00Z"), reviewStatus: "REJECTED" },
    ],
  });
  const results = await run({ LEADS: BASE_LEADS, OUT_OF_STOCK: BASE_OOS });
  assert.ok(results.some((r) => r.status === "SUCCESS" && r.source === "LEADS"));
  const b = await db.product.findUniqueOrThrow({ where: { asin: "B0BBBBBBBB" } });
  assert.equal(b.reviewStatus, "VALIDATED");
  assert.equal(b.goalWeek, "2026-08-31"); // semaine de la découverte d'origine, pas celle de la migration
  const z = await db.product.findUniqueOrThrow({ where: { asin: "B0ZZZZZZZZ" }, include: { occurrences: true } });
  assert.equal(z.reviewStatus, "REJECTED");
  assert.equal(z.occurrences[0].present, false); // absent de la Sheet actuelle, mais conservé
  assert.equal(await db.legacyLead.count(), 2); // table d'origine intacte
  // La migration ne s'exécute qu'une fois
  await run({ LEADS: BASE_LEADS, OUT_OF_STOCK: BASE_OOS });
  assert.equal(await db.importRun.count({ where: { trigger: "LEGACY_MIGRATION" } }), 1);
});
