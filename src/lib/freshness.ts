// Fraîcheur d'un lead : ses données (prix Amazon, frais, coût, stock) sont à reconfirmer
// 30 jours après le dernier export dans la Sheet LEADS ou la dernière reconfirmation.
// Fonctions pures, testées.

export const FRESH_DAYS = 30;
/** « Bientôt à reconfirmer » pendant les derniers jours */
export const SOON_DAYS = 7;
const DAY_MS = 24 * 3600 * 1000;

export type FreshnessState = "FRESH" | "SOON" | "STALE";
export type Freshness = { state: FreshnessState; ageDays: number | null; daysLeft: number; since: string | null };

export const FRESHNESS_LABELS: Record<FreshnessState, string> = { FRESH: "À jour", SOON: "Bientôt à reconfirmer", STALE: "À reconfirmer" };

const latest = (dates: (Date | string | null | undefined)[]): Date | null => {
  let best: Date | null = null;
  for (const d of dates) {
    if (!d) continue;
    const t = d instanceof Date ? d : new Date(d);
    if (!Number.isNaN(t.getTime()) && (!best || t > best)) best = t;
  }
  return best;
};

/**
 * Date du dernier export : lignes LEADS d'abord, sinon toute ligne importée. Pour une ligne déjà connue,
 * `exportedAt` est son Export Date actuelle (colonne G, lue à chaque synchronisation) : une ligne
 * ré-exportée redevient donc à jour, même si elle a été découverte il y a plus de 30 jours.
 */
export function lastExportDate(
  occurrences: { source: string; discoveredAt: Date | string; exportedAt?: Date | string | null }[],
  fallback?: Date | string | null,
): Date | null {
  const dates = (os: typeof occurrences) => os.flatMap((o) => [o.discoveredAt, o.exportedAt]);
  return latest(dates(occurrences.filter((o) => o.source === "LEADS"))) ?? latest(dates(occurrences)) ?? latest([fallback]);
}

/** Date de référence : la plus récente entre le dernier export, la dernière reconfirmation et la dernière mise à jour Keepa (côté Amazon). */
export const freshSince = (exportedAt: Date | string | null | undefined, confirmedAt: Date | string | null | undefined, keepaAt?: Date | string | null) =>
  latest([exportedAt, confirmedAt, keepaAt]);

export function freshness(since: Date | string | null | undefined, now: Date): Freshness {
  const ref = latest([since]);
  if (!ref) return { state: "STALE", ageDays: null, daysLeft: 0, since: null };
  const ageDays = Math.max(0, Math.floor((now.getTime() - ref.getTime()) / DAY_MS));
  const daysLeft = FRESH_DAYS - ageDays;
  return { state: daysLeft <= 0 ? "STALE" : daysLeft <= SOON_DAYS ? "SOON" : "FRESH", ageDays, daysLeft, since: ref.toISOString() };
}

/** Texte court : « Mis à jour il y a 12 j · reste 18 j » */
export function freshnessText(f: Freshness): string {
  if (f.ageDays == null) return "Date d'export inconnue — à reconfirmer";
  const age = f.ageDays === 0 ? "Mis à jour aujourd'hui" : `Mis à jour il y a ${f.ageDays} j`;
  return f.state === "STALE" ? `${age} — à reconfirmer` : `${age} · reste ${f.daysLeft} j`;
}
