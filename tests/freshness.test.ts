import test from "node:test";
import assert from "node:assert/strict";
import { freshSince, freshness, freshnessText, lastExportDate } from "../src/lib/freshness";

const NOW = new Date("2026-11-02T16:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 3600 * 1000);

test("fraîcheur : à jour, bientôt, à reconfirmer après 30 jours", () => {
  assert.deepEqual([0, 22, 23, 29, 30, 45].map((n) => freshness(daysAgo(n), NOW).state), ["FRESH", "FRESH", "SOON", "SOON", "STALE", "STALE"]);
  assert.equal(freshness(daysAgo(12), NOW).daysLeft, 18);
  assert.equal(freshnessText(freshness(daysAgo(12), NOW)), "Mis à jour il y a 12 j · reste 18 j");
  assert.equal(freshnessText(freshness(daysAgo(34), NOW)), "Mis à jour il y a 34 j — à reconfirmer");
  assert.equal(freshness(null, NOW).state, "STALE");
});

test("fraîcheur : dernier export LEADS, puis reconfirmation", () => {
  const occs = [
    { source: "LEADS", discoveredAt: daysAgo(40) },
    { source: "LEADS", discoveredAt: daysAgo(35) },
    { source: "OUT_OF_STOCK", discoveredAt: daysAgo(2) }, // date de contrôle de stock : pas un export LEADS
  ];
  const exported = lastExportDate(occs);
  assert.equal(exported?.toISOString(), daysAgo(35).toISOString());
  assert.equal(freshness(freshSince(exported, null), NOW).state, "STALE");
  assert.equal(freshness(freshSince(exported, daysAgo(1)), NOW).state, "FRESH");
  // Produit vu seulement dans OUT OF STOCK : sa date d'import sert de repère
  assert.equal(lastExportDate([{ source: "OUT_OF_STOCK", discoveredAt: daysAgo(5) }])?.toISOString(), daysAgo(5).toISOString());
});
