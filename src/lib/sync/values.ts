// Fonctions pures utilisées par le moteur de synchronisation.
import { createHash } from "node:crypto";
import type { ParsedRow } from "../normalize";

export const PRICE_FIELDS = ["salePrice", "buyBox90", "fbaFee", "costPrice", "estimatedSales"] as const;
export type PriceField = (typeof PRICE_FIELDS)[number];

/** Empreinte des valeurs d'une ligne (hors numéro de ligne : un simple tri n'est pas une modification). */
export function rowHash(row: ParsedRow): string {
  const { sheetRow: _row, ...rest } = row;
  const sorted = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)));
  return createHash("sha1").update(JSON.stringify(sorted)).digest("hex");
}

export function pricesChanged(a: Partial<Record<PriceField, number | null | undefined>>, b: Partial<Record<PriceField, number | null | undefined>>): boolean {
  return PRICE_FIELDS.some((f) => (a[f] ?? null) !== (b[f] ?? null));
}

export type OccurrenceValues = {
  source: string;
  present: boolean;
  lastImportedAt: Date;
  name?: string | null;
  amazonUrl?: string | null;
  currency?: string | null;
} & Partial<Record<PriceField, number | null>>;

/** Ordre de priorité : lignes présentes, puis LEADS avant OUT OF STOCK, puis la plus récente. */
export function prioritize<T extends OccurrenceValues>(occs: T[]): T[] {
  return [...occs].sort(
    (a, b) =>
      Number(b.present) - Number(a.present) ||
      Number(b.source === "LEADS") - Number(a.source === "LEADS") ||
      b.lastImportedAt.getTime() - a.lastImportedAt.getTime(),
  );
}

/** Valeurs courantes d'une offre à partir de ses occurrences (première valeur non vide par priorité). */
export function pickOfferValues(occs: OccurrenceValues[]) {
  const ordered = prioritize(occs);
  const first = <K extends PriceField>(f: K) => ordered.find((o) => o[f] != null);
  const values: Record<PriceField, number | null> = { salePrice: null, buyBox90: null, fbaFee: null, costPrice: null, estimatedSales: null };
  for (const f of PRICE_FIELDS) values[f] = first(f)?.[f] ?? null;
  const costFrom = first("costPrice");
  return {
    ...values,
    currency: (costFrom?.source === "LEADS" ? "CAD" : costFrom?.currency) || "CAD",
    valuesSource: ordered[0]?.source ?? null,
  };
}
