// Filtres de décision partagés par « Buy Decisions », le Pipeline et le Mode décision
// (fonctions pures, testées). Les deux pages appliquent exactement les mêmes règles.
import { weekKey } from "./dates";
import { DEFAULT_THRESHOLDS, verdict, type DecisionMetrics, type Thresholds, type Verdict } from "./decision";

/** Période de découverte des leads (semaines du lundi, la semaine en cours comprise). */
export type Period = "week" | "4w" | "12w" | "all";
export const PERIODS: { key: Period; label: string }[] = [
  { key: "week", label: "Cette semaine" },
  { key: "4w", label: "4 dernières semaines" },
  { key: "12w", label: "12 dernières semaines" },
  { key: "all", label: "Tous les leads" },
];

export function inPeriod(week: string, period: Period, currentWeek: string): boolean {
  if (period === "all") return true;
  const weeks = period === "week" ? 1 : period === "4w" ? 4 : 12;
  const start = new Date(`${currentWeek}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 7 * (weeks - 1));
  return week >= start.toISOString().slice(0, 10) && week <= currentWeek;
}

/** Semaine de découverte d'un lead : sa semaine d'objectif, sinon celle de sa première apparition. */
export const rowWeek = (r: { goalWeek: string | null; firstSeenAt?: string | null }) =>
  r.goalWeek ?? (r.firstSeenAt ? weekKey(new Date(r.firstSeenAt)) : null);

export type Strategy = "score" | "roi" | "monthlyProfit" | "margin" | "profit";

export const STRATEGIES: { key: Strategy; label: string; hint: string }[] = [
  { key: "score", label: "Score d'achat", hint: "Équilibre ROI (40 %), profit mensuel (35 %) et marge (25 %)" },
  { key: "roi", label: "ROI %", hint: "Rendement du capital : idéal avec un budget limité" },
  { key: "monthlyProfit", label: "Profit mensuel", hint: "Potentiel total : idéal pour maximiser les gains" },
  { key: "margin", label: "Marge (profit %)", hint: "Sécurité face aux baisses de prix Amazon" },
  { key: "profit", label: "Profit unitaire", hint: "Gain par unité vendue" },
];

/** ACTIONABLE = Acheter + À considérer */
export type VerdictFilter = "ALL" | "ACTIONABLE" | Verdict;

export type DecisionFilters = {
  strategy: Strategy;
  thresholds: Thresholds;
  verdict: VerdictFilter;
  /** Ancien réglage « cette semaine seulement », gardé égal à period === "week" */
  weekOnly: boolean;
  includeUnavailable: boolean;
  /** Afficher seulement (n'influe pas sur l'avis) : période et plages de valeurs, null = sans limite */
  period: Period;
  roiMin: number | null;
  roiMax: number | null;
  salesMin: number | null;
  costMax: number | null;
};

export const DEFAULT_FILTERS: DecisionFilters = {
  strategy: "score",
  thresholds: DEFAULT_THRESHOLDS,
  verdict: "ACTIONABLE",
  weekOnly: false,
  includeUnavailable: false,
  period: "all",
  roiMin: null,
  roiMax: null,
  salesMin: null,
  costMax: null,
};

/** Un filtre « afficher seulement » est-il actif ? */
export const hasRangeFilters = (f: Pick<DecisionFilters, "period" | "roiMin" | "roiMax" | "salesMin" | "costMax">) =>
  f.period !== "all" || f.roiMin != null || f.roiMax != null || f.salesMin != null || f.costMax != null;

export type FilterableRow = DecisionMetrics & {
  score: number | null;
  unavailable: boolean;
  restricted: boolean;
  countsTowardGoal: boolean;
  goalWeek: string | null;
  firstSeenAt?: string | null;
  costPrice?: number | null;
};

/** Verdict final : un lead en rupture ou restreint n'est jamais « Acheter » tel quel. */
export function evaluateRow<T extends FilterableRow>(r: T, t: Thresholds): T & { verdict: Verdict; reasons: string[] } {
  const v = verdict(r, t);
  const blocked = r.unavailable || r.restricted;
  return {
    ...r,
    verdict: v.verdict === "BUY" && blocked ? "CONSIDER" : v.verdict,
    reasons: [...(r.unavailable ? ["Fournisseur en rupture"] : []), ...(r.restricted ? ["ASIN restreint sur Amazon"] : []), ...v.reasons],
  };
}

export function matchesVerdict(v: Verdict, filter: VerdictFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "ACTIONABLE") return v === "BUY" || v === "CONSIDER";
  return v === filter;
}

/**
 * Filtres de périmètre, appliqués avant le comptage par avis : ruptures, période de découverte et plages
 * « afficher seulement » (ROI min / max, ventes minimum, coût maximum). Un lead sans ROI ou sans ventes
 * est écarté par un minimum ; une valeur inconnue ne l'écarte pas d'un maximum.
 */
export function inScope(
  r: FilterableRow,
  f: Pick<DecisionFilters, "includeUnavailable"> & Partial<Pick<DecisionFilters, "period" | "roiMin" | "roiMax" | "salesMin" | "costMax">>,
  currentWeek: string,
): boolean {
  if (!f.includeUnavailable && r.unavailable) return false;
  if (f.period && f.period !== "all") {
    const week = rowWeek(r);
    if (!week || !inPeriod(week, f.period, currentWeek)) return false;
  }
  if (f.roiMin != null && (r.roi == null || r.roi < f.roiMin)) return false;
  if (f.roiMax != null && r.roi != null && r.roi > f.roiMax) return false;
  if (f.salesMin != null && (r.estimatedSales == null || r.estimatedSales < f.salesMin)) return false;
  if (f.costMax != null && r.costPrice != null && r.costPrice > f.costMax) return false;
  return true;
}

const VERDICT_ORDER: Record<Verdict, number> = { BUY: 0, CONSIDER: 1, AVOID: 2, INCOMPLETE: 3 };

/** Tri décroissant selon la stratégie ; départage par score, profit mensuel, ROI puis verdict. */
export function compareRows(strategy: Strategy) {
  return <T extends FilterableRow & { verdict: Verdict }>(a: T, b: T): number => {
    const x = a[strategy], y = b[strategy];
    if (x == null && y != null) return 1;
    if (y == null && x != null) return -1;
    return (
      (x != null && y != null ? (y as number) - (x as number) : 0) ||
      (b.score ?? -1) - (a.score ?? -1) ||
      (b.monthlyProfit ?? -Infinity) - (a.monthlyProfit ?? -Infinity) ||
      (b.roi ?? -Infinity) - (a.roi ?? -Infinity) ||
      VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict]
    );
  };
}

/** Relit des préférences sauvegardées en ignorant toute valeur invalide. */
export function parseFilters(saved: unknown): DecisionFilters {
  const s = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>;
  const t = (s.thresholds && typeof s.thresholds === "object" ? s.thresholds : {}) as Record<string, unknown>;
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const verdicts: VerdictFilter[] = ["ALL", "ACTIONABLE", "BUY", "CONSIDER", "AVOID", "INCOMPLETE"];
  const opt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const period: Period = PERIODS.some((p) => p.key === s.period) ? (s.period as Period) : s.weekOnly === true ? "week" : "all";
  return {
    strategy: STRATEGIES.some((x) => x.key === s.strategy) ? (s.strategy as Strategy) : DEFAULT_FILTERS.strategy,
    thresholds: {
      minRoi: n(t.minRoi, DEFAULT_THRESHOLDS.minRoi),
      minProfit: n(t.minProfit, DEFAULT_THRESHOLDS.minProfit),
      minMargin: n(t.minMargin, DEFAULT_THRESHOLDS.minMargin),
      minSales: n(t.minSales, DEFAULT_THRESHOLDS.minSales),
    },
    verdict: verdicts.includes(s.verdict as VerdictFilter) ? (s.verdict as VerdictFilter) : DEFAULT_FILTERS.verdict,
    // Ancien réglage « cette semaine seulement » repris comme période
    weekOnly: period === "week",
    includeUnavailable: typeof s.includeUnavailable === "boolean" ? s.includeUnavailable : DEFAULT_FILTERS.includeUnavailable,
    period,
    roiMin: opt(s.roiMin),
    roiMax: opt(s.roiMax),
    salesMin: opt(s.salesMin),
    costMax: opt(s.costMax),
  };
}
