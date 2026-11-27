// Keepa (Amazon.ca) : requêtes et lecture des réponses. Fonctions pures (testées) + appels HTTP.
// La clé vient uniquement de la variable KEEPA_API_KEY (Railway) ; elle n'est jamais affichée,
// journalisée ni envoyée au navigateur.
//
// Requête utilisée : /product?domain=6&asin=…&stats=180&buybox=1&history=0
//  - domain 6 = Amazon.ca ; jusqu'à 100 ASIN par requête ;
//  - stats=180 : statistiques (moyennes 30 / 90 / 180 j ; buyBoxStats, la part de
//    Buy Box de chaque vendeur, porte sur ces 180 jours), sans coût supplémentaire ;
//  - buybox=1 : données de Buy Box (environ 2 jetons de plus par produit) ;
//  - history=0 : pas d'historique complet (réponse plus légère).
// Les prix sont en centimes ; -1 / -2 = pas d'offre ou valeur inconnue.

export const KEEPA_DOMAIN_CA = 6;
export const KEEPA_MAX_ASINS = 100;
/** Coût estimé d'un produit (requête + Buy Box), affiné avec `tokensConsumed` des réponses */
export const KEEPA_DEFAULT_COST = 3;

// Index des types de prix Keepa (csv / stats.current / stats.avg90)
const AMAZON = 0;
const SALES_RANK = 3;
const COUNT_NEW = 11;
const BUY_BOX = 18;
const COUNT_NEW_FBA = 34;

export type KeepaFacts = {
  asin: string;
  title: string | null;
  /** Buy Box actuelle et moyenne 90 jours ($ CA) */
  buyBox: number | null;
  buyBoxAvg90: number | null;
  /** Prix d'Amazon (vendeur) actuel ; Amazon vend-il le produit ? */
  amazonPrice: number | null;
  amazonSelling: boolean;
  newOffers: number | null;
  fbaOffers: number | null;
  salesRank: number | null;
  salesRankAvg90: number | null;
  /** Achats du mois dernier selon Amazon (« X achetés le mois dernier ») ; null si non publié */
  monthlySold: number | null;
  /** Frais FBA d'expédition ($) et commission Amazon (%) */
  fbaFee: number | null;
  referralPct: number | null;
  /** Part de la Buy Box gagnée par Amazon sur 180 jours (%) ; null si Keepa ne la donne pas */
  amazonBuyBoxPct: number | null;
};

/** Identifiants vendeur d'Amazon lui-même (Amazon.ca, et Amazon.com au cas où il apparaîtrait) */
export const AMAZON_SELLER_IDS = new Set(["A3DWYXPMJIMRNM", "ATVPDKIKX0DER"]);

/** Part de Buy Box d'Amazon dans stats.buyBoxStats (clé = vendeur, percentageWon en %). */
export function amazonBuyBoxShare(stats: Record<string, unknown>): number | null {
  const bb = stats.buyBoxStats;
  if (!bb || typeof bb !== "object") return null;
  let share = 0;
  for (const [seller, v] of Object.entries(bb as Record<string, unknown>)) {
    const pct = v && typeof v === "object" ? (v as Record<string, unknown>).percentageWon : null;
    if (AMAZON_SELLER_IDS.has(seller) && typeof pct === "number" && pct > 0) share += pct;
  }
  return Math.round(Math.min(100, share));
}

export type KeepaTokens = { tokensLeft: number; refillIn: number; refillRate: number; tokensConsumed?: number };

type Num = number | null | undefined;
const price = (v: Num) => (typeof v === "number" && v >= 0 ? Math.round(v) / 100 : null);
const count = (v: Num) => (typeof v === "number" && v >= 0 ? v : null);
const at = (arr: unknown, i: number): Num => (Array.isArray(arr) && typeof arr[i] === "number" ? (arr[i] as number) : null);

/** Lit un produit de la réponse Keepa. */
export function parseKeepaProduct(p: Record<string, unknown>): KeepaFacts | null {
  const asin = typeof p.asin === "string" ? p.asin.toUpperCase() : null;
  if (!asin) return null;
  const stats = (p.stats && typeof p.stats === "object" ? p.stats : {}) as Record<string, unknown>;
  const fees = (p.fbaFees && typeof p.fbaFees === "object" ? p.fbaFees : {}) as Record<string, unknown>;
  const amazonPrice = price(at(stats.current, AMAZON));
  const monthly = typeof p.monthlySold === "number" && p.monthlySold > 0 ? p.monthlySold : null;
  const referral = typeof p.referralFeePercentage === "number" ? p.referralFeePercentage : typeof p.referralFeePercent === "number" ? p.referralFeePercent : null;
  const pickPack = typeof fees.pickAndPackFee === "number" && fees.pickAndPackFee > 0 ? fees.pickAndPackFee / 100 : null;
  return {
    asin,
    title: typeof p.title === "string" ? p.title : null,
    buyBox: price(at(stats.current, BUY_BOX)),
    buyBoxAvg90: price(at(stats.avg90, BUY_BOX)),
    amazonPrice,
    // availabilityAmazon : 0 = en stock et expédiable ; à défaut, une offre Amazon actuelle
    amazonSelling: p.availabilityAmazon === 0 || amazonPrice != null,
    newOffers: count(at(stats.current, COUNT_NEW)),
    fbaOffers: count(at(stats.current, COUNT_NEW_FBA)),
    salesRank: count(at(stats.current, SALES_RANK)),
    salesRankAvg90: count(at(stats.avg90, SALES_RANK)),
    monthlySold: monthly,
    fbaFee: pickPack,
    referralPct: referral != null && referral > 0 && referral < 50 ? referral : null,
    amazonBuyBoxPct: amazonBuyBoxShare(stats),
  };
}

/** Lit une réponse /product : produits et état des jetons. */
export function parseKeepaResponse(json: unknown): { products: KeepaFacts[]; tokens: KeepaTokens | null } {
  const j = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const products = (Array.isArray(j.products) ? j.products : [])
    .map((p) => (p && typeof p === "object" ? parseKeepaProduct(p as Record<string, unknown>) : null))
    .filter((p): p is KeepaFacts => !!p);
  return { products, tokens: parseTokens(j) };
}

export function parseTokens(j: Record<string, unknown>): KeepaTokens | null {
  if (typeof j.tokensLeft !== "number") return null;
  return {
    tokensLeft: j.tokensLeft,
    refillIn: typeof j.refillIn === "number" ? j.refillIn : 0,
    refillRate: typeof j.refillRate === "number" ? j.refillRate : 0,
    tokensConsumed: typeof j.tokensConsumed === "number" ? j.tokensConsumed : undefined,
  };
}

/** Prix Amazon retenu pour les calculs : Buy Box moyenne 90 jours, sinon Buy Box actuelle. */
export const keepaSalePrice = (k: Pick<KeepaFacts, "buyBox" | "buyBoxAvg90">) => k.buyBoxAvg90 ?? k.buyBox;

/** Frais Amazon totaux (comme la colonne H) : commission sur le prix + frais FBA ; null si incomplet. */
export function keepaTotalFees(k: Pick<KeepaFacts, "fbaFee" | "referralPct">, salePrice: number | null): number | null {
  if (k.fbaFee == null || k.referralPct == null || salePrice == null) return null;
  return Math.round((salePrice * (k.referralPct / 100) + k.fbaFee) * 100) / 100;
}

/** Alerte « Prix en baisse » : Buy Box actuelle au moins `pct` % sous sa moyenne 90 jours. */
export function priceDrop(k: Pick<KeepaFacts, "buyBox" | "buyBoxAvg90">, pct = 10): number | null {
  if (k.buyBox == null || k.buyBoxAvg90 == null || k.buyBoxAvg90 <= 0) return null;
  const drop = ((k.buyBoxAvg90 - k.buyBox) / k.buyBoxAvg90) * 100;
  return drop >= pct ? Math.round(drop) : null;
}

/** Avertissement « Buy Box en chute » : Buy Box actuelle au moins `pct` % sous la plus haute des analyses
 *  des 14 derniers jours. */
export function buyBoxDrop(current: number | null, peak14: number | null, pct = 20): number | null {
  if (current == null || peak14 == null || peak14 <= 0) return null;
  const drop = ((peak14 - current) / peak14) * 100;
  return drop >= pct ? Math.round(drop) : null;
}

// --- Appels HTTP (serveur) ---

const BASE = "https://api.keepa.com";
export const keepaKey = () => process.env.KEEPA_API_KEY?.trim().replace(/^(["'])(.*)\1$/, "$2") || undefined;

export class KeepaError extends Error {
  constructor(message: string, readonly status: number, readonly tokens: KeepaTokens | null = null) {
    super(message);
  }
}

const STATUS_TEXT: Record<number, string> = {
  400: "requête refusée par Keepa",
  401: "clé Keepa refusée : vérifiez KEEPA_API_KEY",
  402: "abonnement Keepa API inactif ou impayé",
  429: "plus de jetons Keepa pour l'instant",
  503: "plus de jetons Keepa pour l'instant",
};

async function call(path: string, fetchImpl: typeof fetch): Promise<Record<string, unknown>> {
  const key = keepaKey();
  if (!key) throw new KeepaError("KEEPA_API_KEY n'est pas configurée sur ce service Railway", 0);
  const res = await fetchImpl(`${BASE}${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(60_000) });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* réponse vide */
  }
  // Erreur décrite par Keepa (ex. clé invalide : 400, error.details = [{"type":"key"}])
  const err = json.error && typeof json.error === "object" ? (json.error as Record<string, unknown>) : null;
  if (err && /"type"\s*:\s*"key"/.test(String(err.details ?? ""))) throw new KeepaError("Keepa : clé invalide, vérifiez KEEPA_API_KEY", res.status || 400, parseTokens(json));
  if (!res.ok || err) throw new KeepaError(`Keepa : ${STATUS_TEXT[res.status] ?? (typeof err?.type === "string" ? err.type : `erreur ${res.status}`)}`, res.status, parseTokens(json));
  return json;
}

/** Jetons disponibles (vérification gratuite chez Keepa). */
export async function keepaTokenStatus(fetchImpl: typeof fetch = fetch): Promise<KeepaTokens> {
  const t = parseTokens(await call("/token", fetchImpl));
  if (!t) throw new KeepaError("Keepa : réponse inattendue", 0);
  return t;
}

/** Données Amazon.ca de 1 à 100 ASIN. */
export async function keepaProducts(asins: string[], fetchImpl: typeof fetch = fetch) {
  if (!asins.length || asins.length > KEEPA_MAX_ASINS) throw new Error(`De 1 à ${KEEPA_MAX_ASINS} ASIN par requête`);
  const q = `/product?domain=${KEEPA_DOMAIN_CA}&asin=${asins.map(encodeURIComponent).join(",")}&stats=180&buybox=1&history=0`;
  return parseKeepaResponse(await call(q, fetchImpl));
}
