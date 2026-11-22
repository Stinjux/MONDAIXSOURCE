import test from "node:test";
import assert from "node:assert/strict";
import { KeepaError, keepaProducts, keepaSalePrice, keepaTokenStatus, keepaTotalFees, parseKeepaResponse, priceDrop } from "../src/lib/keepa";

// Réponse au format Keepa (stats.current / stats.avg90 indexés par type de prix, prix en centimes)
const arr = (vals: Record<number, number>) => Array.from({ length: 36 }, (_, i) => vals[i] ?? -1);
export const SAMPLE = {
  tokensLeft: 42, refillIn: 31000, refillRate: 1, tokensConsumed: 6,
  products: [
    {
      asin: "B0AAAAAAA1", title: "Lego Classic Box", availabilityAmazon: -1, monthlySold: 200, referralFeePercentage: 15,
      fbaFees: { pickAndPackFee: 612 },
      stats: { current: arr({ 0: -1, 3: 1530, 11: 7, 18: 3499, 34: 5 }), avg90: arr({ 3: 1810, 18: 3999 }) },
    },
    { asin: "b0aaaaaaa2", availabilityAmazon: 0, monthlySold: 0, stats: { current: arr({ 0: 2499, 18: 2499 }), avg90: arr({ 18: -2 }) } },
    { title: "sans ASIN" },
  ],
};

test("Keepa : lecture d'une réponse (centimes, valeurs absentes, Amazon vendeur)", () => {
  const { products, tokens } = parseKeepaResponse(SAMPLE);
  assert.deepEqual(tokens, { tokensLeft: 42, refillIn: 31000, refillRate: 1, tokensConsumed: 6 });
  assert.equal(products.length, 2);
  assert.deepEqual(products[0], {
    asin: "B0AAAAAAA1", title: "Lego Classic Box", buyBox: 34.99, buyBoxAvg90: 39.99, amazonPrice: null, amazonSelling: false,
    newOffers: 7, fbaOffers: 5, salesRank: 1530, salesRankAvg90: 1810, monthlySold: 200, fbaFee: 6.12, referralPct: 15,
  });
  const b = products[1];
  assert.deepEqual([b.asin, b.buyBoxAvg90, b.buyBox, b.amazonPrice, b.amazonSelling, b.monthlySold, b.fbaFee], ["B0AAAAAAA2", null, 24.99, 24.99, true, null, null]);
});

test("Keepa : prix retenu, frais totaux, alerte prix en baisse", () => {
  const [a, b] = parseKeepaResponse(SAMPLE).products;
  assert.equal(keepaSalePrice(a), 39.99); // moyenne 90 j
  assert.equal(keepaSalePrice(b), 24.99); // à défaut, Buy Box actuelle
  assert.equal(keepaTotalFees(a, 39.99), 12.12); // 15 % × 39,99 + 6,12
  assert.equal(keepaTotalFees(b, 24.99), null); // frais inconnus
  assert.equal(priceDrop(a), 13); // 34,99 vs 39,99 : −13 %
  assert.equal(priceDrop({ buyBox: 38, buyBoxAvg90: 39.99 }), null); // −5 % : sous le seuil de 10 %
  assert.equal(priceDrop(b), null);
});

test("Keepa : requête Amazon.ca, clé jamais affichée, erreurs lisibles", async () => {
  const saved = process.env.KEEPA_API_KEY;
  try {
    delete process.env.KEEPA_API_KEY;
    await assert.rejects(keepaTokenStatus(async () => new Response("{}")), /KEEPA_API_KEY n'est pas configurée/);
    process.env.KEEPA_API_KEY = "cle-secrete-123";
    let url = "";
    const ok = (async (u: string) => {
      url = String(u);
      return new Response(JSON.stringify(SAMPLE));
    }) as unknown as typeof fetch;
    const res = await keepaProducts(["B0AAAAAAA1", "B0AAAAAAA2"], ok);
    assert.equal(res.products.length, 2);
    assert.match(url, /^https:\/\/api\.keepa\.com\/product\?domain=6&asin=B0AAAAAAA1,B0AAAAAAA2&stats=90&buybox=1&history=0&key=cle-secrete-123$/);
    const throttled = (async () => new Response(JSON.stringify({ tokensLeft: -3, refillIn: 20000, refillRate: 1 }), { status: 429 })) as unknown as typeof fetch;
    const err = await keepaProducts(["B0AAAAAAA1"], throttled).catch((e) => e);
    assert.ok(err instanceof KeepaError);
    assert.equal(err.status, 429);
    assert.equal(err.tokens?.refillIn, 20000);
    assert.doesNotMatch(err.message, /cle-secrete/);
    await assert.rejects(keepaProducts([]), /De 1 à 100 ASIN/);
    // Réponse réelle de Keepa à une clé invalide
    const badKey = (async () =>
      new Response(JSON.stringify({ error: { details: '[{"type":"key"}]', message: "You used an invalid parameter", type: "invalidParameter" }, tokensLeft: 0, refillIn: 0, refillRate: 0 }), { status: 400 })) as unknown as typeof fetch;
    await assert.rejects(keepaTokenStatus(badKey), /clé invalide, vérifiez KEEPA_API_KEY/);
  } finally {
    if (saved === undefined) delete process.env.KEEPA_API_KEY;
    else process.env.KEEPA_API_KEY = saved;
  }
});
