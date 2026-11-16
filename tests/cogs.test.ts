import test from "node:test";
import assert from "node:assert/strict";
import { cogsByProduct, type CogsLine } from "../src/lib/cogs";
import { contentDisposition, safeFilename, sniffType } from "../src/lib/documents";

const line = (o: Partial<CogsLine>): CogsLine => ({
  purchaseId: "p1", asin: "B0AAAAAAAA", name: "Produit A", quantity: 1, unitCost: 10, supplierName: "Costco", supplierUrl: null,
  orderedAt: "2026-11-01T12:00:00.000Z", cancelled: false, source: "CART", note: null, ...o,
});

test("COGS : unités, total et coût moyen pondéré ; commandes annulées exclues", () => {
  const [p] = cogsByProduct([
    line({ purchaseId: "p1", quantity: 4, unitCost: 10 }),
    line({ purchaseId: "p2", quantity: 2, unitCost: 13, orderedAt: "2026-11-05T12:00:00.000Z", supplierName: "Walmart" }),
    line({ purchaseId: "p3", quantity: 10, unitCost: 1, cancelled: true }),
  ]);
  assert.equal(p.units, 6);
  assert.equal(p.totalCost, 66);
  assert.equal(p.avgUnitCost, 11);
  assert.deepEqual([p.minUnitCost, p.maxUnitCost, p.orders], [10, 13, 2]);
  assert.equal(p.lastAt, "2026-11-05T12:00:00.000Z");
  assert.deepEqual(p.suppliers.map((s) => s.name), ["Costco", "Walmart"]);
  // Le même commerce saisi à la main et venant d'une URL ne compte qu'une fois, avec son lien
  const [q] = cogsByProduct([line({ supplierName: "Walmart", supplierUrl: null }), line({ purchaseId: "p2", supplierName: "walmart.ca", supplierUrl: "https://www.walmart.ca/ip/1" })]);
  assert.deepEqual(q.suppliers, [{ name: "Walmart", url: "https://www.walmart.ca/ip/1" }]);
});

test("documents : format reconnu par le contenu, pas par le nom", () => {
  const bytes = (s: string, pad = 16) => new Uint8Array([...Buffer.from(s, "latin1"), ...new Array(pad).fill(0)]);
  assert.equal(sniffType(bytes("%PDF-1.7"))?.mime, "application/pdf");
  assert.equal(sniffType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(12).fill(0)]))?.family, "image");
  assert.equal(sniffType(bytes("\u0089PNG\r\n\u001a\n"))?.mime, "image/png");
  assert.equal(sniffType(bytes("\u0000\u0000\u0000\u0018ftypheic"))?.family, "heic");
  assert.equal(sniffType(bytes("\u0000\u0000\u0000\u0018ftypmif1"))?.mime, "image/heif");
  assert.equal(sniffType(bytes("MZ executable")), null);
  assert.equal(sniffType(bytes("<html><script>")), null);
});

test("documents : noms de fichiers sûrs", () => {
  assert.equal(safeFilename("../../etc/facture costco.pdf", "pdf"), "facture costco.pdf");
  assert.equal(safeFilename("IMG_0042", "heic"), "IMG_0042.heic");
  assert.equal(safeFilename("", "pdf"), "document.pdf");
  assert.match(contentDisposition("Reçu été.pdf", true), /^inline; filename="Re_u _t_.pdf"; filename\*=UTF-8''Re%C3%A7u%20%C3%A9t%C3%A9\.pdf$/);
});
