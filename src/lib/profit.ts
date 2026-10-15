// Rentabilité PRÉLIMINAIRE Amazon FBA (CAD), même méthode que le calculateur SellerAmp.
// Total Fees (colonne H, champ `fbaFee`) = frais Amazon totaux (commission + FBA), hors taxes.
// Ce n'est pas un profit net : transport vers Amazon, préparation et stockage ne sont pas déduits.

/**
 * Traitement des taxes de vente (TPS/TVQ au Québec, « VAT » dans SellerAmp) :
 *  - NONE           : aucune taxe dans le calcul → profit = vente − coût − frais
 *  - REGISTERED     : inscrit aux taxes (taxes perçues sur la vente reversées, taxes payées sur le coût
 *                     et les frais récupérées) → profit = (vente − coût) ÷ (1 + taux) − frais
 *  - NOT_REGISTERED : non inscrit (taxes sur les frais Amazon non récupérables)
 *                     → profit = vente − coût − frais × (1 + taux)
 */
export type TaxMode = "NONE" | "REGISTERED" | "NOT_REGISTERED";
export type TaxConfig = { mode: TaxMode; rate: number };
export const NO_TAX: TaxConfig = { mode: "NONE", rate: 0 };
export const QUEBEC_TAX_RATE = 14.975;

export const TAX_MODE_LABELS: Record<TaxMode, string> = {
  NONE: "Aucune taxe dans le calcul",
  REGISTERED: "Inscrit aux taxes (TPS/TVQ récupérées)",
  NOT_REGISTERED: "Non inscrit (taxes sur les frais payées)",
};

/** Coefficients du modèle linéaire : profit(c) = a × (vente − c) − frais × b */
function taxFactors(tax: TaxConfig) {
  const r = Math.max(0, tax.rate) / 100;
  if (tax.mode === "REGISTERED") return { a: 1 / (1 + r), b: 1 };
  if (tax.mode === "NOT_REGISTERED") return { a: 1, b: 1 + r };
  return { a: 1, b: 1 };
}

/**
 * Prix Amazon retenu pour les calculs : Buy Box moyenne 90 jours (colonne D),
 * sinon Sale Price (colonne E) si la Buy Box est vide.
 */
export function amazonPrice(o: { buyBox90?: number | null; salePrice?: number | null }): number | null {
  return o.buyBox90 ?? o.salePrice ?? null;
}

export type ProfitInput = {
  salePrice?: number | null;
  costPrice?: number | null;
  fbaFee?: number | null;
  estimatedSales?: number | null;
  currency?: string | null;
};

export type ProfitResult = {
  profit: number | null;
  roi: number | null;
  margin: number | null;
  monthlyProfit: number | null;
  /** Montant des taxes retranché du profit (0 sans taxe) */
  taxes: number | null;
  /** Raison pour laquelle le calcul est impossible, sinon null. */
  issue: string | null;
};

const num = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

export function preliminaryProfit(input: ProfitInput, tax: TaxConfig = NO_TAX): ProfitResult {
  const empty = (issue: string): ProfitResult => ({ profit: null, roi: null, margin: null, monthlyProfit: null, taxes: null, issue });
  if (input.currency && input.currency.toUpperCase() !== "CAD") return empty(`Devise ${input.currency} — conversion requise`);
  const missing = [
    !num(input.salePrice) && "prix de vente",
    !num(input.costPrice) && "coût",
    !num(input.fbaFee) && "Total Fees",
  ].filter(Boolean);
  if (missing.length) return empty("Donnée manquante : " + missing.join(", "));
  const sale = input.salePrice!, cost = input.costPrice!, fee = input.fbaFee!;
  const { a, b } = taxFactors(tax);
  // Taxes arrondies au cent, comme sur une facture (et comme SellerAmp)
  const taxes = Math.round((sale - cost - fee - (a * (sale - cost) - b * fee)) * 100) / 100;
  const profit = sale - cost - fee - taxes;
  return {
    profit,
    taxes,
    roi: cost > 0 ? (profit / cost) * 100 : null,
    margin: sale > 0 ? (profit / sale) * 100 : null,
    monthlyProfit: num(input.estimatedSales) ? profit * input.estimatedSales : null,
    issue: null,
  };
}

/**
 * Coût d'achat maximum pour respecter un profit minimum ET un ROI minimum (« Maximum Cost » de SellerAmp).
 * Retourne null si une donnée manque ou si aucun coût positif ne convient.
 */
export function maxCost(
  input: { salePrice?: number | null; fbaFee?: number | null },
  targets: { minProfit: number; minRoi: number },
  tax: TaxConfig = NO_TAX,
): number | null {
  if (!num(input.salePrice) || !num(input.fbaFee)) return null;
  const { a, b } = taxFactors(tax);
  const S = input.salePrice, F = input.fbaFee * b;
  const byProfit = S - (F + Math.max(0, targets.minProfit)) / a;
  const byRoi = (a * S - F) / (Math.max(0, targets.minRoi) / 100 + a);
  // Arrondi au cent inférieur : le coût maximum doit garantir les seuils
  const max = Math.floor(Math.min(byProfit, byRoi) * 100 + 1e-9) / 100;
  return max > 0 ? max : null;
}

/**
 * Valeurs utilisées pour le recalcul en revue : la valeur vérifiée remplace la valeur importée
 * lorsqu'elle existe. Chaque champ indique son origine pour l'affichage.
 */
export type Sourced = { value: number | null; origin: "verified" | "imported" | "missing" };

export function pick(verified: number | null | undefined, imported: number | null | undefined): Sourced {
  if (num(verified)) return { value: verified, origin: "verified" };
  if (num(imported)) return { value: imported, origin: "imported" };
  return { value: null, origin: "missing" };
}
