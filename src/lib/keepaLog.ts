// Journal Keepa : où en est chaque lead (analysé aujourd'hui, en attente, jamais, hors rotation) et
// ce que Keepa a renvoyé à sa dernière analyse. Fonctions pures, testées.
import { localDateKey } from "./dates";

/**
 * TODAY : analysé aujourd'hui · PENDING : à analyser aujourd'hui (actif pas encore fait, ou rejeté dont la
 * semaine est passée) · NEVER : jamais analysé · WEEKLY : rejeté, analysé une fois par semaine, pas encore dû ·
 * OUT : acheté (plus analysé automatiquement)
 */
export type KeepaLeadState = "TODAY" | "PENDING" | "NEVER" | "WEEKLY" | "OUT";
/** DATA : Keepa a renvoyé des données · NO_DATA : interrogé, mais Keepa n'avait rien pour cet ASIN */
export type KeepaResult = "DATA" | "NO_DATA" | null;

export const KEEPA_STATE_LABELS: Record<KeepaLeadState, string> = {
  TODAY: "Analysé aujourd'hui",
  PENDING: "En attente aujourd'hui",
  NEVER: "Jamais analysé",
  WEEKLY: "Rejeté · chaque semaine",
  OUT: "Hors rotation",
};

export function keepaLeadState(
  l: { keepaCheckedAt: string | null; lastSnapshotAt: string | null; active: boolean; rejected?: boolean },
  now: Date,
): { state: KeepaLeadState; result: KeepaResult } {
  // Une analyse enregistre la même heure sur le lead et sur ses données : même heure = données reçues
  const result: KeepaResult = !l.keepaCheckedAt ? null : l.lastSnapshotAt && l.lastSnapshotAt >= l.keepaCheckedAt ? "DATA" : "NO_DATA";
  if (!l.active) return { state: "OUT", result };
  if (!l.keepaCheckedAt) return { state: "NEVER", result };
  const checked = localDateKey(new Date(l.keepaCheckedAt));
  if (checked === localDateKey(now)) return { state: "TODAY", result };
  // Rejeté : une analyse par semaine
  if (l.rejected && checked > localDateKey(new Date(now.getTime() - 7 * 86_400_000))) return { state: "WEEKLY", result };
  return { state: "PENDING", result };
}
