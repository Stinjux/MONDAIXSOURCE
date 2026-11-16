// Aide à la décision d'achat (fonctions pures, testées).
// Les métriques viennent de la rentabilité préliminaire (Buy Box 90 j − Cost Price − Total Fees),
// avec les valeurs vérifiées en Weekly Review prioritaires sur les valeurs importées.

export type Thresholds = {
  /** ROI minimum (%) */
  minRoi: number;
  /** Profit unitaire minimum ($ CAD) */
  minProfit: number;
  /** Marge minimum (% du prix Amazon) */
  minMargin: number;
  /** Ventes estimées minimum par mois (colonne F) */
  minSales: number;
};

export const DEFAULT_THRESHOLDS: Thresholds = { minRoi: 30, minProfit: 3, minMargin: 15, minSales: 10 };

export type DecisionMetrics = {
  profit: number | null;
  roi: number | null;
  margin: number | null;
  monthlyProfit: number | null;
  estimatedSales: number | null;
};

export type Verdict = "BUY" | "CONSIDER" | "AVOID" | "INCOMPLETE";

export const VERDICT_LABELS: Record<Verdict, string> = {
  BUY: "Acheter",
  CONSIDER: "À considérer",
  AVOID: "Éviter",
  INCOMPLETE: "Incomplet",
};

const fmt = (n: number, d = 0) => n.toFixed(d).replace(".", ",");

/**
 * Verdict selon les seuils :
 *  - INCOMPLETE : rentabilité non calculable (donnée manquante ou devise étrangère) ;
 *  - AVOID      : profit nul ou négatif, ou plus de 2 critères non atteints ;
 *  - CONSIDER   : 1 ou 2 critères non atteints (ou ventes inconnues) ;
 *  - BUY        : tous les critères atteints.
 */
export function verdict(m: DecisionMetrics, t: Thresholds): { verdict: Verdict; reasons: string[] } {
  if (m.profit == null || m.roi == null) return { verdict: "INCOMPLETE", reasons: ["Rentabilité non calculable"] };
  if (m.profit <= 0) return { verdict: "AVOID", reasons: ["Profit nul ou négatif"] };
  const reasons: string[] = [];
  if (m.roi < t.minRoi) reasons.push(`ROI ${fmt(m.roi)} % < ${fmt(t.minRoi)} %`);
  if (m.profit < t.minProfit) reasons.push(`Profit ${fmt(m.profit, 2)} $ < ${fmt(t.minProfit, 2)} $`);
  if (m.margin != null && m.margin < t.minMargin) reasons.push(`Marge ${fmt(m.margin)} % < ${fmt(t.minMargin)} %`);
  if (m.estimatedSales == null) reasons.push("Ventes estimées inconnues");
  else if (m.estimatedSales < t.minSales) reasons.push(`Ventes ${fmt(m.estimatedSales)}/mois < ${fmt(t.minSales)}`);
  if (reasons.length === 0) return { verdict: "BUY", reasons: [] };
  return { verdict: reasons.length > 2 ? "AVOID" : "CONSIDER", reasons };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Score d'achat 0–100, absolu (ne dépend pas des autres leads affichés) :
 *   40 % ROI (plafonné à 100 %) + 35 % profit mensuel (échelle logarithmique, plafonné à 2 000 $)
 *   + 25 % marge (plafonnée à 40 %). Profit nul ou négatif = 0.
 */
export function buyScore(m: DecisionMetrics): number | null {
  if (m.profit == null || m.roi == null) return null;
  if (m.profit <= 0) return 0;
  const roi = clamp01(m.roi / 100);
  const monthly = m.monthlyProfit != null && m.monthlyProfit > 0 ? clamp01(Math.log10(1 + m.monthlyProfit) / Math.log10(1 + 2000)) : 0;
  const margin = m.margin != null ? clamp01(m.margin / 40) : 0;
  return Math.round(100 * (0.4 * roi + 0.35 * monthly + 0.25 * margin));
}

export type PlanLine = { cost: number | null; profit: number | null; qty: number };

/** Totaux du panier d'achat : investissement, profit attendu, ROI global. */
export function planTotals(lines: PlanLine[]) {
  let investment = 0, profit = 0, units = 0;
  for (const l of lines) {
    if (!(l.qty > 0) || l.cost == null) continue;
    investment += l.cost * l.qty;
    profit += (l.profit ?? 0) * l.qty;
    units += l.qty;
  }
  return { investment, profit, units, roi: investment > 0 ? (profit / investment) * 100 : null };
}
