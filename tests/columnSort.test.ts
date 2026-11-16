import test from "node:test";
import assert from "node:assert/strict";
import { compareValues, nextSort, parseSort, sortByColumn } from "../src/lib/columnSort";

const rows = [
  { id: "a", n: 30, t: "Écharpe" },
  { id: "b", n: null, t: "" },
  { id: "c", n: 5, t: "ballon" },
  { id: "d", n: 30, t: "Appareil" },
  { id: "e", n: 120, t: "Zèbre" },
];

test("nombres : croissant et décroissant, valeurs manquantes toujours en dernier", () => {
  assert.deepEqual(sortByColumn(rows, (r) => r.n, "asc").map((r) => r.id), ["c", "a", "d", "e", "b"]);
  assert.deepEqual(sortByColumn(rows, (r) => r.n, "desc").map((r) => r.id), ["e", "a", "d", "c", "b"]);
});

test("à égalité, l'ordre d'entrée (classement de la stratégie) est conservé", () => {
  assert.deepEqual(sortByColumn(rows, (r) => r.n, "desc").filter((r) => r.n === 30).map((r) => r.id), ["a", "d"]);
});

test("textes : ordre alphabétique français, sans tenir compte des accents ni de la casse", () => {
  assert.deepEqual(sortByColumn(rows, (r) => r.t, "asc").map((r) => r.id), ["d", "c", "a", "e", "b"]);
  assert.deepEqual(sortByColumn(rows, (r) => r.t, "desc").map((r) => r.id), ["e", "a", "c", "d", "b"]);
  assert.ok(compareValues("Produit 2", "Produit 10", "asc") < 0);
});

test("clic sur un en-tête : sens par défaut, puis inversion", () => {
  const s1 = nextSort(null, "roi", "desc");
  assert.deepEqual(s1, { key: "roi", dir: "desc" });
  const s2 = nextSort(s1, "roi", "desc");
  assert.deepEqual(s2, { key: "roi", dir: "asc" });
  assert.deepEqual(nextSort(s2, "roi", "desc"), { key: "roi", dir: "desc" });
  assert.deepEqual(nextSort(s2, "name", "asc"), { key: "name", dir: "asc" });
});

test("tri sauvegardé : les valeurs invalides sont ignorées", () => {
  const keys = ["roi", "name"] as const;
  assert.deepEqual(parseSort({ key: "roi", dir: "asc" }, keys), { key: "roi", dir: "asc" });
  assert.equal(parseSort({ key: "inconnu", dir: "asc" }, keys), null);
  assert.equal(parseSort({ key: "roi", dir: "haut" }, keys), null);
  assert.equal(parseSort("roi", keys), null);
  assert.equal(parseSort(null, keys), null);
});
