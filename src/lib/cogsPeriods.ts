// Tableau de bord COGS : achats réels regroupés par semaine, mois ou année (heure du Québec).
// Fonctions pures, testées.
import type { CogsLine } from "./cogs";
import { addDaysToKey, formatWeekShort, localDateKey, weekKey } from "./dates";
import { storeName } from "./stores";

export type Granularity = "week" | "month" | "year";
export const GRANULARITY_LABELS: Record<Granularity, string> = { week: "Semaine", month: "Mois", year: "Année" };
/** Nombre de périodes affichées dans le graphique */
export const PERIOD_COUNT: Record<Granularity, number> = { week: 12, month: 12, year: 5 };

export type Period = {
  key: string;
  label: string;
  cost: number;
  units: number;
  orders: number;
  products: number;
  avgUnitCost: number | null;
};

const round = (n: number) => Math.round(n * 100) / 100;
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Clé de période d'une date : lundi de la semaine, « AAAA-MM » ou « AAAA ». */
export function periodKey(date: Date, g: Granularity): string {
  if (g === "week") return weekKey(date);
  const day = localDateKey(date);
  return g === "month" ? day.slice(0, 7) : day.slice(0, 4);
}

export function periodLabel(key: string, g: Granularity, long = false): string {
  if (g === "week") return long ? `Semaine du ${formatWeekShort(key)}` : formatWeekShort(key);
  if (g === "month") {
    const [y, m] = key.split("-").map(Number);
    return long ? `${MONTHS[m - 1]} ${y}`.replace(/^./, (c) => c.toUpperCase()) : `${MONTHS[m - 1]} ${String(y).slice(2)}`;
  }
  return key;
}

/** Période précédente (ou suivante avec step = 1). */
export function shiftPeriod(key: string, g: Granularity, step: number): string {
  if (g === "week") return addDaysToKey(key, 7 * step);
  if (g === "year") return String(Number(key) + step);
  const [y, m] = key.split("-").map(Number);
  const t = y * 12 + (m - 1) + step;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** Les `count` dernières périodes jusqu'à `end` (incluse), la plus ancienne en premier, vides comprises. */
export function periodKeys(end: string, g: Granularity, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftPeriod(end, g, i - (count - 1)));
}

const live = (lines: CogsLine[]) => lines.filter((l) => !l.cancelled);

/** Totaux par période (commandes annulées exclues). */
export function cogsByPeriod(lines: CogsLine[], g: Granularity, keys: string[]): Period[] {
  const buckets = new Map(keys.map((k) => [k, [] as CogsLine[]]));
  for (const l of live(lines)) buckets.get(periodKey(new Date(l.orderedAt), g))?.push(l);
  return keys.map((key) => {
    const ls = buckets.get(key)!;
    const cost = round(ls.reduce((n, l) => n + l.quantity * l.unitCost, 0));
    const units = ls.reduce((n, l) => n + l.quantity, 0);
    return { key, label: periodLabel(key, g), cost, units, orders: new Set(ls.map((l) => l.purchaseId)).size, products: new Set(ls.map((l) => l.asin)).size, avgUnitCost: units ? round(cost / units) : null };
  });
}

/** Détail d'une période : produits et fournisseurs, du plus gros montant au plus petit. */
export function periodBreakdown(lines: CogsLine[], g: Granularity, key: string) {
  const ls = live(lines).filter((l) => periodKey(new Date(l.orderedAt), g) === key);
  const group = <K extends string>(keyOf: (l: CogsLine) => K, nameOf: (l: CogsLine) => string) => {
    const m = new Map<K, { key: K; name: string; cost: number; units: number }>();
    for (const l of ls) {
      const k = keyOf(l);
      const v = m.get(k) ?? { key: k, name: nameOf(l), cost: 0, units: 0 };
      v.cost = round(v.cost + l.quantity * l.unitCost);
      v.units += l.quantity;
      m.set(k, v);
    }
    return [...m.values()].sort((a, b) => b.cost - a.cost);
  };
  return {
    products: group((l) => l.asin, (l) => l.name),
    suppliers: group(
      (l) => (l.supplierName || l.supplierUrl ? storeName({ supplierName: l.supplierName, supplierUrl: l.supplierUrl }).toLowerCase() : "—"),
      (l) => (l.supplierName || l.supplierUrl ? storeName({ supplierName: l.supplierName, supplierUrl: l.supplierUrl }) : "Fournisseur non indiqué"),
    ),
  };
}

/** Variation en % entre deux montants (null si la période de comparaison est vide). */
export const change = (current: number, previous: number) => (previous > 0 ? ((current - previous) / previous) * 100 : null);
