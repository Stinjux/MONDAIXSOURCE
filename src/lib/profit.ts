// Rentabilité PRÉLIMINAIRE Amazon FBA (CAD) : prix Amazon (Buy Box 90 j) − Cost Price − Total Fees.
// Total Fees (colonne H, champ `fbaFee`) = frais Amazon totaux (commission + FBA).
// Ce n'est pas un profit net : transport, préparation, stockage et taxes non récupérables ne sont pas déduits.

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
  /** Raison pour laquelle le calcul est impossible, sinon null. */
  issue: string | null;
};

const num = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

export function preliminaryProfit(input: ProfitInput): ProfitResult {
  const empty = (issue: string): ProfitResult => ({ profit: null, roi: null, margin: null, monthlyProfit: null, issue });
  if (input.currency && input.currency.toUpperCase() !== "CAD") return empty(`Devise ${input.currency} — conversion requise`);
  const missing = [
    !num(input.salePrice) && "prix de vente",
    !num(input.costPrice) && "coût",
    !num(input.fbaFee) && "Total Fees",
  ].filter(Boolean);
  if (missing.length) return empty("Donnée manquante : " + missing.join(", "));
  const sale = input.salePrice!, cost = input.costPrice!, fee = input.fbaFee!;
  const profit = sale - cost - fee;
  return {
    profit,
    roi: cost > 0 ? (profit / cost) * 100 : null,
    margin: sale > 0 ? (profit / sale) * 100 : null,
    monthlyProfit: num(input.estimatedSales) ? profit * input.estimatedSales : null,
    issue: null,
  };
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
