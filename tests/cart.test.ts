import test from "node:test";
import assert from "node:assert/strict";
import { parsePastedAsins, toCsv } from "../src/lib/cart";

test("ASIN collés : quantités, séparateurs variés, liens Amazon", () => {
  const { lines, invalid } = parsePastedAsins(`
B0ABC12345 5
b0abc67890,3
B0XYZ11111\t2
B0QQQ22222 x4
https://www.amazon.ca/Some-Product/dp/B0LNK33333?th=1 2
B0ONE44444
pas un asin
`);
  assert.deepEqual(lines, [
    { asin: "B0ABC12345", quantity: 5 },
    { asin: "B0ABC67890", quantity: 3 },
    { asin: "B0XYZ11111", quantity: 2 },
    { asin: "B0QQQ22222", quantity: 4 },
    { asin: "B0LNK33333", quantity: 2 },
    { asin: "B0ONE44444", quantity: 1 },
  ]);
  assert.deepEqual(invalid, ["pas un asin"]);
});

test("ASIN répété : quantités additionnées", () => {
  assert.deepEqual(parsePastedAsins("B0ABC12345 2\nB0ABC12345 3").lines, [{ asin: "B0ABC12345", quantity: 5 }]);
});

test("un nombre de 10 chiffres n'est pas pris pour un ASIN", () => {
  assert.deepEqual(parsePastedAsins("1234567890 2").invalid, ["1234567890 2"]);
});

test("CSV : BOM, échappement, arrondi des montants", () => {
  const csv = toCsv(["Produit", "Prix"], [["Brosse, \"douce\"", 12.3456], [null, 3]]);
  assert.ok(csv.startsWith("﻿"));
  assert.equal(csv.slice(1), 'Produit,Prix\n"Brosse, ""douce""",12.35\n,3');
});
