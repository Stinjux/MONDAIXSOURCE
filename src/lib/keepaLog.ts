// Journal Keepa : où en est chaque lead (analysé aujourd'hui, en attente, jamais, hors rotation) et
// ce que Keepa a renvoyé à sa dernière analyse. Fonctions pures, testées.
import { localDateKey } from "./dates";

/** TODAY : analysé aujourd'hui · PENDING : actif, pas encore analysé aujourd'hui · NEVER : jamais analysé · OUT : rejeté ou acheté (plus analysé automatiquement) */
export type KeepaLeadState = "TODAY" | "PENDING" | "NEVER" | "OUT";
/** DATA : Keepa a renvoyé des données · NO_DATA : interrogé, mais Keepa n'avait rien pour cet ASIN */
export type KeepaResult = "DATA" | "NO_DATA" | null;

export const KEEPA_STATE_LABELS: Record<KeepaLeadState, string> = {
  TODAY: "Analysé aujourd'hui",
  PENDING: "En attente aujourd'hui",
  NEVER: "Jamais analysé",
  OUT: "Hors rotation",
};

export function keepaLeadState(
  l: { keepaCheckedAt: string | null; lastSnapshotAt: string | null; active: boolean },
  now: Date,
): { state: KeepaLeadState; result: KeepaResult } {
  // Une analyse enregistre la même heure sur le lead et sur ses données : même heure = données reçues
  const result: KeepaResult = !l.keepaCheckedAt ? null : l.lastSnapshotAt && l.lastSnapshotAt >= l.keepaCheckedAt ? "DATA" : "NO_DATA";
  if (!l.active) return { state: "OUT", result };
  if (!l.keepaCheckedAt) return { state: "NEVER", result };
  return { state: localDateKey(new Date(l.keepaCheckedAt)) === localDateKey(now) ? "TODAY" : "PENDING", result };
}
