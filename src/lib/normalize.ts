// Lecture et normalisation des lignes Google Sheets (fonctions pures, testées).

export type SheetSource = "LEADS" | "OUT_OF_STOCK";
export const SOURCES: SheetSource[] = ["LEADS", "OUT_OF_STOCK"];

export type ParsedRow = {
  source: SheetSource;
  sheetRow: number;
  asin: string;
  name: string;
  amazonUrl?: string;
  supplierKey: string;
  supplierName?: string;
  supplierUrl?: string;
  salePrice?: number;
  buyBox90?: number;
  fbaFee?: number;
  costPrice?: number;
  estimatedSales?: number;
  currency?: string;
  exportDate?: string;
  sheetRoi?: number;
  sheetMargin?: number;
  sheetProfit?: number;
  notes?: string;
  availability?: string;
  lastChecked?: string;
  checkDetail?: string;
};

export type ParseResult =
  | { ok: true; row: ParsedRow; warnings: string[] }
  | { ok: false; error: string };

/**
 * Convertit un montant saisi ("$1,234.50", "1 234,56 $", "12,5 %", "(4.20)") en nombre.
 * Une virgule seule suivie de 3 chiffres est un séparateur de milliers ("1,234" = 1234).
 */
export function amount(value: string | number | undefined | null): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (!value?.trim()) return undefined;
  const raw = value.trim();
  const negative = /^\(.*\)$/.test(raw) || /^-|^[^\d]*-/.test(raw);
  const v = raw.replace(/[^\d,.]/g, "");
  if (!/\d/.test(v)) return undefined;
  let normalized: string;
  if (v.includes(",") && v.includes(".")) {
    normalized = v.lastIndexOf(",") > v.lastIndexOf(".") ? v.replace(/\./g, "").replace(",", ".") : v.replace(/,/g, "");
  } else if (v.includes(",")) {
    normalized = /^\d{1,3}(,\d{3})+$/.test(v) ? v.replace(/,/g, "") : v.replace(/,(?=[^,]*$)/, ".").replace(/,/g, "");
  } else {
    normalized = /^\d{1,3}(\.\d{3}){2,}$/.test(v) ? v.replace(/\./g, "") : v;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return undefined;
  return negative ? -n : n;
}

const KEEP_PARAMS = ["sku", "variant", "id", "pid", "productid", "product_id", "itemid", "item", "skuid", "upc"];

/** URL fournisseur normalisée : hôte sans www + chemin, en minuscules, sans paramètres de suivi. */
export function normalizeUrl(value: string | undefined): string {
  if (!value?.trim()) return "";
  try {
    const u = new URL(value.trim());
    if (!/^https?:$/.test(u.protocol)) return value.trim().toLowerCase();
    const keep = new URLSearchParams();
    for (const [k, v] of u.searchParams) if (KEEP_PARAMS.includes(k.toLowerCase())) keep.set(k.toLowerCase(), v);
    keep.sort();
    const path = u.pathname.replace(/\/+$/, "").toLowerCase();
    return u.hostname.toLowerCase().replace(/^www\./, "") + path + (keep.size ? "?" + keep.toString() : "");
  } catch {
    return value.trim().toLowerCase();
  }
}

const isUrl = (v: string | undefined) => !!v && /^https?:\/\//i.test(v.trim());

const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Nom de marque d'un fournisseur, pour rapprocher un nom de boutique ("Canadian Tire")
 * d'une URL ("canadiantire.ca/…"). Retourne "" si rien d'exploitable.
 */
export function supplierBrand(value: string | undefined | null): string {
  if (!value?.trim()) return "";
  const v = value.trim();
  if (isUrl(v) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(v)) {
    const host = (isUrl(v) ? safeHost(v) : v.split("/")[0]).toLowerCase().replace(/^www\./, "");
    const labels = host.split(".").filter(Boolean);
    if (labels.length < 2) return labels[0] ?? "";
    // shop.lego.com -> lego ; walmart.ca -> walmart ; amazon.co.uk -> amazon
    const tld2 = labels.length >= 3 && ["co", "com", "net", "org", "qc"].includes(labels[labels.length - 2]);
    return labels[labels.length - (tld2 ? 3 : 2)].replace(/[^a-z0-9]/g, "");
  }
  let s = stripAccents(v.toLowerCase()).replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
  s = s.replace(/^the /, "").replace(/ (canada|ca|inc|ltd|ltee|store|stores|online|shop|magasin)$/g, "");
  return s.replace(/\s+/g, "");
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Identité d'un fournisseur : URL normalisée, sinon "store:<marque>", sinon "unknown". */
export function supplierIdentity(url?: string, store?: string): { key: string; name?: string; url?: string } {
  if (isUrl(url)) {
    const u = url!.trim();
    return { key: normalizeUrl(u), url: u, name: store?.trim() || safeHost(u).replace(/^www\./, "") };
  }
  if (isUrl(store)) return supplierIdentity(store, undefined);
  const brand = supplierBrand(store);
  if (brand) return { key: "store:" + brand, name: store!.trim() };
  return { key: "unknown" };
}

const ASIN_RE = /^[A-Z0-9]{10}$/;

/** Extrait un ASIN d'une valeur brute ou d'une URL Amazon. */
export function extractAsin(value: string | undefined, amazonUrl?: string): string | null {
  const v = (value ?? "").trim().toUpperCase();
  if (ASIN_RE.test(v)) return v;
  const fromUrl = (amazonUrl ?? "").match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})(?:[/?#]|$)/i);
  return fromUrl ? fromUrl[1].toUpperCase() : null;
}

const cell = (r: (string | undefined)[], i: number) => (r[i] ?? "").toString().trim();
const opt = (s: string) => (s ? s : undefined);

/** Une ligne d'en-tête contient "ASIN" en colonne B. */
export const isHeaderRow = (r: string[]) => /^asin$/i.test(cell(r, 1));
export const isBlankRow = (r: string[]) => !r.some((c) => (c ?? "").toString().trim());

const isCad = (currency?: string) => !currency || /^(cad|ca\$|c\$|\$|\$ ?ca|can|dollars? canadiens?)$/i.test(currency.trim());

export function parseRow(source: SheetSource, r: string[], sheetRow: number): ParseResult {
  const amazonUrl = opt(cell(r, 2));
  const rawAsin = cell(r, 1);
  const asin = extractAsin(rawAsin, amazonUrl);
  if (!asin) return { ok: false, error: rawAsin ? `ASIN invalide « ${rawAsin} » (10 caractères attendus)` : "ASIN manquant (colonne B)" };
  const warnings: string[] = [];
  const name = cell(r, 0);
  if (!name) warnings.push("Nom du produit manquant");

  if (source === "LEADS") {
    const supplier = supplierIdentity(opt(cell(r, 9)));
    const row: ParsedRow = {
      source, sheetRow, asin, name: name || asin, amazonUrl,
      buyBox90: amount(r[3]), salePrice: amount(r[4]), estimatedSales: amount(r[5]),
      exportDate: opt(cell(r, 6)), fbaFee: amount(r[7]), costPrice: amount(r[8]),
      supplierKey: supplier.key, supplierName: supplier.name, supplierUrl: supplier.url, currency: "CAD",
    };
    if (supplier.key === "unknown") warnings.push("URL fournisseur manquante (colonne J)");
    if (row.costPrice === undefined) warnings.push("Cost Price manquant (colonne I)");
    if (row.salePrice === undefined) warnings.push("Sale Price manquant (colonne E)");
    return { ok: true, row, warnings };
  }

  const store = cell(r, 9);
  const supplier = supplierIdentity(isUrl(store) ? store : undefined, store);
  const currency = opt(cell(r, 12));
  const row: ParsedRow = {
    source, sheetRow, asin, name: name || asin, amazonUrl,
    buyBox90: amount(r[3]), salePrice: amount(r[4]), sheetRoi: amount(r[5]), sheetMargin: amount(r[6]),
    sheetProfit: amount(r[7]), estimatedSales: amount(r[8]), notes: opt(cell(r, 10)), costPrice: amount(r[11]),
    currency: currency && isCad(currency) ? "CAD" : currency?.toUpperCase(), availability: opt(cell(r, 13)),
    lastChecked: opt(cell(r, 14)), checkDetail: opt(cell(r, 15)),
    supplierKey: supplier.key, supplierName: supplier.name, supplierUrl: supplier.url,
  };
  if (supplier.key === "unknown") warnings.push("Fournisseur manquant (colonne J – STORE)");
  if (row.currency && row.currency !== "CAD") warnings.push(`Devise ${row.currency} : rentabilité non calculée (aucune conversion automatique)`);
  return { ok: true, row, warnings };
}

export { isCad };
