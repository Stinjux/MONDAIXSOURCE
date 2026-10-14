// Rapprochement des offres et classification des doublons (fonctions pures).
//
//  * Doublon exact          : même ASIN + même fournisseur, plusieurs lignes dans la même Sheet.
//  * Doublon inter-Sheets   : même ASIN présent dans LEADS et dans OUT OF STOCK.
//  * Doublon potentiel      : même ASIN chez plusieurs fournisseurs différents.

import { supplierBrand } from "./normalize";

export type OfferRef = { id: string; supplierKey: string; supplierUrl?: string | null; supplierName?: string | null };
export type Candidate = { supplierKey: string; supplierUrl?: string; supplierName?: string };

const brandOf = (o: { supplierKey: string; supplierUrl?: string | null; supplierName?: string | null }) =>
  o.supplierKey.startsWith("store:") ? o.supplierKey.slice(6) : supplierBrand(o.supplierUrl || o.supplierKey);

/**
 * Trouve l'offre existante correspondant à une ligne importée.
 * 1. Même clé fournisseur.
 * 2. La Sheet OUT OF STOCK ne donne souvent qu'un nom de boutique : on le rattache à l'offre
 *    (unique) du même ASIN dont l'URL correspond à cette marque — et inversement.
 * `upgrade` = true quand l'offre trouvée n'a qu'un nom de boutique et que la ligne apporte une URL.
 */
export function matchOffer<T extends OfferRef>(offers: T[], cand: Candidate): { offer: T; upgrade: boolean } | null {
  const exact = offers.find((o) => o.supplierKey === cand.supplierKey);
  if (exact) return { offer: exact, upgrade: false };
  if (cand.supplierKey === "unknown") return null;
  const brand = brandOf(cand);
  if (!brand) return null;
  const candIsStoreOnly = cand.supplierKey.startsWith("store:");
  const sameBrand = offers.filter((o) => o.supplierKey !== "unknown" && brandOf(o) === brand);
  if (candIsStoreOnly) {
    return sameBrand.length === 1 ? { offer: sameBrand[0], upgrade: false } : null;
  }
  const storeOnly = sameBrand.filter((o) => o.supplierKey.startsWith("store:"));
  return storeOnly.length === 1 ? { offer: storeOnly[0], upgrade: true } : null;
}

export type OccurrenceLite = { offerId: string; source: string };

export type DuplicateFlags = {
  /** Offres ayant plusieurs lignes dans une même Sheet */
  exactOfferIds: string[];
  /** Produit présent dans LEADS et OUT OF STOCK */
  crossSheet: boolean;
  /** Offres présentes dans les deux Sheets */
  crossSheetOfferIds: string[];
  /** Plusieurs fournisseurs différents pour le même ASIN */
  multiSupplier: boolean;
  any: boolean;
};

export function duplicateFlags(offerIds: string[], occurrences: OccurrenceLite[]): DuplicateFlags {
  const perOfferSource = new Map<string, number>();
  const sourcesByOffer = new Map<string, Set<string>>();
  for (const o of occurrences) {
    const k = o.offerId + "|" + o.source;
    perOfferSource.set(k, (perOfferSource.get(k) ?? 0) + 1);
    if (!sourcesByOffer.has(o.offerId)) sourcesByOffer.set(o.offerId, new Set());
    sourcesByOffer.get(o.offerId)!.add(o.source);
  }
  const exactOfferIds = [...new Set([...perOfferSource].filter(([, n]) => n > 1).map(([k]) => k.split("|")[0]))];
  const sources = new Set(occurrences.map((o) => o.source));
  const crossSheet = sources.has("LEADS") && sources.has("OUT_OF_STOCK");
  const crossSheetOfferIds = [...sourcesByOffer].filter(([, s]) => s.size > 1).map(([id]) => id);
  const multiSupplier = new Set(offerIds).size > 1;
  return { exactOfferIds, crossSheet, crossSheetOfferIds, multiSupplier, any: exactOfferIds.length > 0 || crossSheet || multiSupplier };
}

/** Une alerte reste active tant qu'un nouveau doublon est apparu après le dernier « examiné ». */
export function duplicateAlertActive(lastDuplicateAt: Date | string | null | undefined, ackAt: Date | string | null | undefined): boolean {
  if (!lastDuplicateAt) return false;
  if (!ackAt) return true;
  return new Date(lastDuplicateAt).getTime() > new Date(ackAt).getTime();
}
