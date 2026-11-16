// Carte des leads (Buy Decisions, vue « Carte ») : axes et taille des bulles au choix.
// Fonctions pures, testées.
import type { Thresholds, Verdict } from "./decision";
import { cad, num, pct } from "./format";

export type MapMetric = "roi" | "estimatedSales" | "margin" | "costPrice" | "profit" | "monthlyProfit" | "amazonPrice" | "score";

export type MapRow = {
  productId: string;
  asin: string;
  name: string;
  verdict: Verdict;
  roi: number | null;
  estimatedSales: number | null;
  margin: number | null;
  costPrice: number | null;
  profit: number | null;
  monthlyProfit: number | null;
  amazonPrice: number | null;
  score: number | null;
};

export const MAP_METRICS: Record<MapMetric, { label: string; short: string; format: (v: number | null) => string; threshold?: (t: Thresholds) => number; hint?: string }> = {
  roi: { label: "ROI", short: "ROI", format: (v) => pct(v, 0), threshold: (t) => t.minRoi },
  estimatedSales: { label: "Ventes mensuelles", short: "Ventes/mois", format: (v) => num(v), threshold: (t) => t.minSales },
  margin: { label: "Marge", short: "Marge", format: (v) => pct(v, 0), threshold: (t) => t.minMargin },
  costPrice: { label: "Coût unitaire", short: "Coût/u.", format: cad, hint: "plus bas = moins d'argent immobilisé" },
  profit: { label: "Profit unitaire", short: "Profit/u.", format: cad, threshold: (t) => t.minProfit },
  monthlyProfit: { label: "Profit mensuel", short: "Profit/mois", format: cad },
  amazonPrice: { label: "Prix Amazon", short: "Prix Amazon", format: cad },
  score: { label: "Score d'achat", short: "Score", format: (v) => (v == null ? "—" : `${Math.round(v)}/100`) },
};
export const MAP_METRIC_KEYS = Object.keys(MAP_METRICS) as MapMetric[];

export type MapConfig = { x: MapMetric; y: MapMetric; size: MapMetric | "none"; trim: boolean };
export const DEFAULT_MAP: MapConfig = { x: "estimatedSales", y: "roi", size: "monthlyProfit", trim: false };

export function parseMapConfig(v: unknown): MapConfig {
  const o = (v && typeof v === "object" ? v : {}) as Partial<MapConfig>;
  const ok = (m: unknown): m is MapMetric => typeof m === "string" && m in MAP_METRICS;
  return {
    x: ok(o.x) ? o.x : DEFAULT_MAP.x,
    y: ok(o.y) ? o.y : DEFAULT_MAP.y,
    size: o.size === "none" || ok(o.size) ? o.size : DEFAULT_MAP.size,
    trim: o.trim === true,
  };
}

export type MapPoint = { row: MapRow; x: number; y: number; z: number };

/** Valeur au rang `p` (0–1) d'une liste triée. */
const quantile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];

/**
 * Points de la carte. Un lead sans valeur sur l'axe X ou Y n'est pas placé (compté dans `missing`).
 * `trim` masque les valeurs extrêmes (au-delà de 3 % / 97 % sur chaque axe, dès 20 leads) pour lire le gros du nuage.
 */
export function mapPoints(rows: MapRow[], c: MapConfig): { points: MapPoint[]; missing: number; trimmed: number } {
  const placed = rows.filter((r) => r[c.x] != null && r[c.y] != null && Number.isFinite(r[c.x]) && Number.isFinite(r[c.y]));
  let kept = placed;
  if (c.trim && placed.length >= 20) {
    const xs = placed.map((r) => r[c.x] as number).sort((a, b) => a - b);
    const ys = placed.map((r) => r[c.y] as number).sort((a, b) => a - b);
    const [x0, x1, y0, y1] = [quantile(xs, 0.03), quantile(xs, 0.97), quantile(ys, 0.03), quantile(ys, 0.97)];
    kept = placed.filter((r) => (r[c.x] as number) >= x0 && (r[c.x] as number) <= x1 && (r[c.y] as number) >= y0 && (r[c.y] as number) <= y1);
  }
  return {
    points: kept.map((row) => ({ row, x: row[c.x] as number, y: row[c.y] as number, z: c.size === "none" ? 1 : Math.max(0, row[c.size] ?? 0) })),
    missing: rows.length - placed.length,
    trimmed: placed.length - kept.length,
  };
}
