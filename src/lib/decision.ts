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
  /** Poids du Score d'achat (réglables par compte) ; absents = poids par défaut */
  weights?: ScoreWeights;
};

/** Poids relatifs du Score d'achat (ramenés à 100 %) */
export type ScoreWeights = { roi: number; monthlyProfit: number; margin: number; volume: number };
export const DEFAULT_WEIGHTS: ScoreWeights = { roi: 30, monthlyProfit: 25, margin: 20, volume: 25 };
export const WEIGHT_LABELS: Record<keyof ScoreWeights, string> = { roi: "ROI", monthlyProfit: "Profit mensuel", margin: "Marge", volume: "Volume (ventes / mois)" };
/** Ventes / mois pour la note maximale du volume */
export const VOLUME_FULL = 60;
/** Part de Buy Box d'Amazon (180 j) au-delà de laquelle un avertissement s'affiche */
export const AMAZON_BB_WARN = 70;

/** Amazon sur l'offre (Keepa) : vend-il le produit, et sa part de Buy Box sur 180 jours (%) */
export type AmazonRisk = { selling: boolean; share: number | null };

/** Pénalité du score quand Amazon vend lui-même : −25 s'il a plus de 70 % de la Buy Box, sinon −10. */
export function amazonPenalty(a: AmazonRisk | null | undefined): number {
  if (!a) return 0;
  if (a.share != null && a.share > AMAZON_BB_WARN) return 25;
  return a.selling || (a.share != null && a.share > 0) ? 10 : 0;
}

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

/** Poids valides (nombres positifs, au moins un non nul), sinon les poids par défaut. */
export function normalizeWeights(w: Partial<ScoreWeights> | null | undefined): ScoreWeights {
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(100, v) : d);
  const out = { roi: n(w?.roi, DEFAULT_WEIGHTS.roi), monthlyProfit: n(w?.monthlyProfit, DEFAULT_WEIGHTS.monthlyProfit), margin: n(w?.margin, DEFAULT_WEIGHTS.margin), volume: n(w?.volume, DEFAULT_WEIGHTS.volume) };
  return out.roi + out.monthlyProfit + out.margin + out.volume > 0 ? out : DEFAULT_WEIGHTS;
}

/** Note du volume 0–1 : échelle progressive (les premières ventes comptent plus), pleine à 60 ventes / mois. */
export const volumeNote = (sales: number | null | undefined) => (sales != null && sales > 0 ? clamp01(Math.log10(1 + sales) / Math.log10(1 + VOLUME_FULL)) : 0);

/**
 * Score d'achat 0–100, absolu (ne dépend pas des autres leads affichés), selon vos poids :
 *   ROI (plafonné à 100 %), profit mensuel (échelle logarithmique, plafonné à 2 000 $), marge (plafonnée
 *   à 40 %) et volume (ventes / mois, plein à 60). Moins une pénalité si Amazon vend lui-même.
 *   Profit nul ou négatif = 0.
 */
export function buyScore(m: DecisionMetrics, weights: ScoreWeights = DEFAULT_WEIGHTS, amazon?: AmazonRisk | null): number | null {
  if (m.profit == null || m.roi == null) return null;
  if (m.profit <= 0) return 0;
  const w = normalizeWeights(weights);
  const total = w.roi + w.monthlyProfit + w.margin + w.volume;
  const roi = clamp01(m.roi / 100);
  const monthly = m.monthlyProfit != null && m.monthlyProfit > 0 ? clamp01(Math.log10(1 + m.monthlyProfit) / Math.log10(1 + 2000)) : 0;
  const margin = m.margin != null ? clamp01(m.margin / 40) : 0;
  const raw = (100 * (w.roi * roi + w.monthlyProfit * monthly + w.margin * margin + w.volume * volumeNote(m.estimatedSales))) / total;
  return Math.max(0, Math.round(raw - amazonPenalty(amazon)));
}

/** Résumé des poids pour l'affichage : « ROI 30 % · Profit mensuel 25 % · … » */
export function weightsSummary(weights: ScoreWeights | undefined): string {
  const w = normalizeWeights(weights);
  const total = w.roi + w.monthlyProfit + w.margin + w.volume;
  return (Object.keys(WEIGHT_LABELS) as (keyof ScoreWeights)[])
    .filter((k) => w[k] > 0)
    .map((k) => `${WEIGHT_LABELS[k].replace(" (ventes / mois)", "")} ${Math.round((w[k] / total) * 100)} %`)
    .join(" · ");
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
