// Tri par colonne des tableaux (fonctions pures, testées).
// Un clic sur un en-tête trie la colonne ; un second clic inverse le sens.
// Les valeurs manquantes restent toujours en fin de liste, quel que soit le sens.

export type SortDir = "asc" | "desc";
export type SortValue = number | string | null | undefined;
export type ColumnSort<K extends string = string> = { key: K; dir: SortDir } | null;

const missing = (v: SortValue) => v == null || v === "" || (typeof v === "number" && Number.isNaN(v));

/** Compare deux valeurs (nombres ou textes, ordre alphabétique français). */
export function compareValues(a: SortValue, b: SortValue, dir: SortDir): number {
  const ma = missing(a), mb = missing(b);
  if (ma || mb) return ma === mb ? 0 : ma ? 1 : -1;
  const c =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "fr", { sensitivity: "base", numeric: true });
  return dir === "asc" ? c : -c;
}

/** Copie triée ; à égalité, l'ordre d'entrée est conservé (le tri de JavaScript est stable). */
export function sortByColumn<T>(rows: readonly T[], value: (row: T) => SortValue, dir: SortDir): T[] {
  return [...rows].sort((a, b) => compareValues(value(a), value(b), dir));
}

/** Clic sur un en-tête : nouvelle colonne → son sens par défaut ; même colonne → sens inversé. */
export function nextSort<K extends string>(current: ColumnSort<K>, key: K, firstDir: SortDir): ColumnSort<K> {
  if (current?.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: firstDir };
}

/** Relit un tri sauvegardé en ignorant toute valeur invalide. */
export function parseSort<K extends string>(saved: unknown, keys: readonly K[]): ColumnSort<K> {
  if (!saved || typeof saved !== "object") return null;
  const s = saved as Record<string, unknown>;
  if (!keys.includes(s.key as K) || (s.dir !== "asc" && s.dir !== "desc")) return null;
  return { key: s.key as K, dir: s.dir };
}
