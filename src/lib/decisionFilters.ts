// Filtres de décision partagés par « Buy Decisions » et « Achat · Rejeté · À définir »
// (fonctions pures, testées). Les deux pages appliquent exactement les mêmes règles.
import { DEFAULT_THRESHOLDS, verdict, type DecisionMetrics, type Thresholds, type Verdict } from "./decision";

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
  weekOnly: boolean;
  includeUnavailable: boolean;
};

export const DEFAULT_FILTERS: DecisionFilters = {
  strategy: "score",
  thresholds: DEFAULT_THRESHOLDS,
  verdict: "ACTIONABLE",
  weekOnly: false,
  includeUnavailable: false,
};

export type FilterableRow = DecisionMetrics & {
  score: number | null;
  unavailable: boolean;
  restricted: boolean;
  countsTowardGoal: boolean;
  goalWeek: string | null;
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

/** Filtres de périmètre (semaine, ruptures) : appliqués avant le comptage par verdict. */
export function inScope(r: FilterableRow, f: Pick<DecisionFilters, "weekOnly" | "includeUnavailable">, currentWeek: string): boolean {
  if (!f.includeUnavailable && r.unavailable) return false;
  if (f.weekOnly && !(r.countsTowardGoal && r.goalWeek === currentWeek)) return false;
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
  return {
    strategy: STRATEGIES.some((x) => x.key === s.strategy) ? (s.strategy as Strategy) : DEFAULT_FILTERS.strategy,
    thresholds: {
      minRoi: n(t.minRoi, DEFAULT_THRESHOLDS.minRoi),
      minProfit: n(t.minProfit, DEFAULT_THRESHOLDS.minProfit),
      minMargin: n(t.minMargin, DEFAULT_THRESHOLDS.minMargin),
      minSales: n(t.minSales, DEFAULT_THRESHOLDS.minSales),
    },
    verdict: verdicts.includes(s.verdict as VerdictFilter) ? (s.verdict as VerdictFilter) : DEFAULT_FILTERS.verdict,
    weekOnly: typeof s.weekOnly === "boolean" ? s.weekOnly : DEFAULT_FILTERS.weekOnly,
    includeUnavailable: typeof s.includeUnavailable === "boolean" ? s.includeUnavailable : DEFAULT_FILTERS.includeUnavailable,
  };
}
