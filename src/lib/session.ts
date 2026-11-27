// Sessions et mots de passe (fonctions pures, testées ; aucune dépendance à Next).
// Deux comptes : le propriétaire (ADMIN_PASSWORD) et le partenaire (PARTNER_PASSWORD, facultatif).
import { createHmac, timingSafeEqual } from "node:crypto";
import type { UserKey } from "./users";

export const SESSION_DAYS = 30;

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Lit un secret en tolérant les erreurs de saisie courantes dans Railway :
 * espaces ou retour à la ligne en trop, guillemets autour de la valeur.
 */
export function readSecret(name: "ADMIN_PASSWORD" | "SYNC_SECRET" | "PARTNER_PASSWORD"): string | undefined {
  let v = process.env[name]?.trim();
  if (v && v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) v = v.slice(1, -1).trim();
  return v || undefined;
}

/** Le compte partenaire existe-t-il (PARTNER_PASSWORD configurée et différente de ADMIN_PASSWORD) ? */
export function partnerEnabled(): boolean {
  const p = readSecret("PARTNER_PASSWORD");
  return !!p && p !== readSecret("ADMIN_PASSWORD");
}

function sign(payload: string, user: UserKey = "owner"): string | null {
  const secret = readSecret("ADMIN_PASSWORD");
  if (!secret) return null;
  // Changer ADMIN_PASSWORD invalide toutes les sessions ; changer PARTNER_PASSWORD, celles du partenaire.
  let key = "mondaix-session:" + secret;
  if (user === "partner") {
    if (!partnerEnabled()) return null;
    key += ":partner:" + readSecret("PARTNER_PASSWORD");
  }
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function createSessionValue(user: UserKey = "owner", now = Date.now()): string | null {
  const exp = String(now + SESSION_DAYS * 86_400_000);
  const payload = `${exp}.${user}`;
  const sig = sign(payload, user);
  return sig ? `${payload}.${sig}` : null;
}

/** Compte de la session, ou null si elle est absente, expirée ou falsifiée. */
export function sessionUser(value: string | undefined, now = Date.now()): UserKey | null {
  if (!value) return null;
  const parts = value.split(".");
  // Ancien format « exp.signature » (avant les comptes) : session du propriétaire
  const [exp, user, sig] = parts.length === 2 ? [parts[0], "owner", parts[1]] : parts;
  if (parts.length > 3 || (user !== "owner" && user !== "partner") || !exp || !sig) return null;
  const expected = sign(parts.length === 2 ? exp : `${exp}.${user}`, user);
  if (!expected || !safeEqual(sig, expected)) return null;
  return Number(exp) > now ? user : null;
}

export function verifySessionValue(value: string | undefined, now = Date.now()): boolean {
  return sessionUser(value, now) !== null;
}

/** Compte correspondant au mot de passe saisi, ou null. */
export function checkPassword(password: string): UserKey | null {
  const p = password.trim();
  const admin = readSecret("ADMIN_PASSWORD");
  if (admin && safeEqual(p, admin)) return "owner";
  const partner = readSecret("PARTNER_PASSWORD");
  if (partner && partnerEnabled() && safeEqual(p, partner)) return "partner";
  return null;
}

