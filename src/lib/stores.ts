// Nom lisible d'un commerce (« Canadian Tire » plutôt que « canadiantire.ca/fr/pdp/… »)
// et son domaine, pour le logo. Fonctions pures, testées.
import { supplierBrand } from "./normalize";

// Commerces courants au Canada : marque (telle que tirée du domaine) → nom affiché
const KNOWN: Record<string, string> = {
  amazon: "Amazon",
  bestbuy: "Best Buy",
  bureauengros: "Bureau en Gros",
  cabelas: "Cabela's",
  canadiantire: "Canadian Tire",
  costco: "Costco",
  decathlon: "Decathlon",
  dollarama: "Dollarama",
  ebay: "eBay",
  familiprix: "Familiprix",
  gianttiger: "Giant Tiger",
  homedepot: "Home Depot",
  homesense: "HomeSense",
  hbc: "La Baie d'Hudson",
  thebay: "La Baie d'Hudson",
  labaie: "La Baie d'Hudson",
  ikea: "IKEA",
  indigo: "Indigo",
  chapters: "Chapters",
  jeancoutu: "Jean Coutu",
  lego: "LEGO",
  londondrugs: "London Drugs",
  lowes: "Lowe's",
  marshalls: "Marshalls",
  mastermindtoys: "Mastermind Toys",
  mec: "MEC",
  michaels: "Michaels",
  newegg: "Newegg",
  petsmart: "PetSmart",
  petvalu: "Pet Valu",
  pharmaprix: "Pharmaprix",
  princessauto: "Princess Auto",
  realcanadiansuperstore: "Real Canadian Superstore",
  renodepot: "Réno-Dépôt",
  rona: "RONA",
  sail: "SAIL",
  sephora: "Sephora",
  shoppersdrugmart: "Shoppers Drug Mart",
  simons: "Simons",
  sportchek: "Sport Chek",
  sportsexperts: "Sports Experts",
  staples: "Staples",
  structube: "Structube",
  thesource: "The Source",
  toysrus: "Toys R Us",
  uniprix: "Uniprix",
  visions: "Visions Electronics",
  walmart: "Walmart",
  wayfair: "Wayfair",
  winners: "Winners",
};

type StoreInput = { supplierName?: string | null; supplierUrl?: string | null; supplierKey?: string | null };

const looksLikeDomain = (s: string) => /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(s.trim());

/** Domaine du commerce (« costco.ca »), pour son logo ; null si inconnu. */
export function storeDomain({ supplierUrl, supplierKey, supplierName }: StoreInput): string | null {
  for (const v of [supplierUrl, supplierKey, supplierName]) {
    if (!v || v.startsWith("store:") || v === "unknown" || !looksLikeDomain(v)) continue;
    const host = v.trim().replace(/^https?:\/\//i, "").split("/")[0].toLowerCase().replace(/^www\./, "");
    if (host.includes(".")) return host;
  }
  return null;
}

/** Nom lisible du commerce : nom connu, sinon le nom de boutique de la Sheet, sinon la marque du domaine. */
export function storeName(input: StoreInput): string {
  const { supplierName, supplierUrl, supplierKey } = input;
  const brand = supplierKey?.startsWith("store:") ? supplierKey.slice(6) : supplierBrand(supplierUrl || supplierName || supplierKey || "");
  if (brand && KNOWN[brand]) return KNOWN[brand];
  if (supplierName?.trim() && !looksLikeDomain(supplierName)) return supplierName.trim();
  if (!brand || supplierKey === "unknown") return supplierName?.trim() || "Fournisseur";
  // Domaine inconnu : son nom, mots séparés (« petit-magasin.ca » → « Petit Magasin »)
  const labels = storeDomain(input)?.split(".") ?? [];
  const tld2 = labels.length >= 3 && ["co", "com", "net", "org", "qc"].includes(labels[labels.length - 2]);
  const label = labels.length >= 2 ? labels[labels.length - (tld2 ? 3 : 2)] : brand;
  return label.split(/[-_]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** Domaine probable d'un commerce connu saisi par son nom (« walmart » → walmart.ca), pour son logo. */
export function knownStoreDomain(brand: string): string | null {
  return KNOWN[brand] ? `${brand}.ca` : null;
}

/** Initiales pour le logo de remplacement (« CT » pour Canadian Tire). */
export function storeInitials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}
