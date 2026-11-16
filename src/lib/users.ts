// Les deux comptes de l'app : le propriétaire (mot de passe ADMIN_PASSWORD) et le partenaire
// (PARTNER_PASSWORD, facultatif). Fonctions pures, utilisables côté serveur et navigateur.

export type UserKey = "owner" | "partner";
export const USER_KEYS: UserKey[] = ["owner", "partner"];

export type UserProfile = { key: UserKey; name: string; initials: string; color: string };
export type Profiles = Record<UserKey, UserProfile>;

/** Couleurs d'avatar (palette de l'app), toujours accompagnées du nom ou des initiales. */
const COLORS: Record<UserKey, string> = { owner: "#0b3d91", partner: "#b4531a" };
const DEFAULT_NAMES: Record<UserKey, string> = { owner: "Propriétaire", partner: "Partenaire" };

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} '-]/gu, " ").split(/[\s'-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}

/** Profils à partir des noms enregistrés (Settings) ; noms vides ou invalides remplacés par défaut. */
export function buildProfiles(names?: Partial<Record<UserKey, unknown>> | null): Profiles {
  const out = {} as Profiles;
  for (const key of USER_KEYS) {
    const raw = typeof names?.[key] === "string" ? (names[key] as string).trim().slice(0, 40) : "";
    const name = raw || DEFAULT_NAMES[key];
    out[key] = { key, name, initials: initials(name), color: COLORS[key] };
  }
  return out;
}

/**
 * Auteur enregistré dans l'historique → compte. Les actions faites avant les comptes (« admin »,
 * « cli », vides) sont attribuées au propriétaire, sans réécrire l'historique.
 */
export function actorKey(actor: string | null | undefined): UserKey | null {
  if (actor === "partner") return "partner";
  if (actor === "owner" || actor === "admin") return "owner";
  return null;
}

export const otherUser = (u: UserKey): UserKey => (u === "owner" ? "partner" : "owner");
