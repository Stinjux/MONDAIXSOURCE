import test from "node:test";
import assert from "node:assert/strict";
import { batchSize, dueOrder } from "../src/lib/keepaSync";

test("Keepa : taille des paquets selon les jetons", () => {
  assert.equal(batchSize(7, 3, 50), 2);
  assert.equal(batchSize(1000, 3, 50), 50);
  assert.equal(batchSize(1000, 1, 500), 100); // 100 ASIN au plus par requête
  assert.equal(batchSize(2, 3, 10), 0);
  assert.equal(batchSize(-5, 3, 10), 0);
});

test("Keepa : jamais interrogés d'abord (les plus récents), puis les plus anciens, jamais deux fois le même jour", () => {
  const now = new Date("2026-11-22T22:00:00Z"); // 17 h au Québec
  const h = (n: number) => new Date(now.getTime() - n * 3600_000);
  const items = [
    { id: "vieux", keepaCheckedAt: h(48), firstSeenAt: h(500) },
    { id: "recent", keepaCheckedAt: h(5), firstSeenAt: h(500) },
    { id: "ce-matin", keepaCheckedAt: new Date("2026-11-22T06:00:00Z"), firstSeenAt: h(500) }, // 1 h du matin au Québec : même jour
    { id: "jamais-ancien", keepaCheckedAt: null, firstSeenAt: h(300) },
    { id: "jamais-nouveau", keepaCheckedAt: null, firstSeenAt: h(2) },
    { id: "hier", keepaCheckedAt: h(21), firstSeenAt: h(500) },
  ];
  assert.deepEqual(dueOrder(items, now).map((i) => i.id), ["jamais-nouveau", "jamais-ancien", "vieux", "hier"]);
  // Une fois par semaine (rejetés) : seulement ceux analysés il y a au moins 7 jours
  assert.deepEqual(dueOrder(items, now, 7).map((i) => i.id), ["jamais-nouveau", "jamais-ancien"]);
  assert.deepEqual(dueOrder([{ id: "8j", keepaCheckedAt: h(8 * 24), firstSeenAt: h(900) }], now, 7).map((i) => i.id), ["8j"]);
});
