// Authentification : deux comptes, chacun avec son mot de passe (variables Railway) :
//  - le propriétaire : ADMIN_PASSWORD ;
//  - le partenaire : PARTNER_PASSWORD (facultatif ; sans lui, l'app reste à un seul compte).
// Le mot de passe saisi désigne le compte. La session, signée, nomme le compte connecté : chaque action
// est enregistrée à son nom. Les tâches planifiées utilisent un jeton distinct (SYNC_SECRET).
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { UserKey } from "./users";
import { SESSION_DAYS, checkPassword, createSessionValue, partnerEnabled, readSecret, safeEqual, sessionUser, verifySessionValue } from "./session";

export { checkPassword, createSessionValue, partnerEnabled, readSecret, safeEqual, sessionUser, verifySessionValue };

export const SESSION_COOKIE = "mx_session";

/** `secure` seulement en HTTPS : sinon le navigateur refuserait le cookie (ex. accès local en http). */
export function sessionCookieOptions(https: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, secure: https, path: "/", maxAge: SESSION_DAYS * 86_400 };
}

/** Compte connecté (null = pas de session valide). */
export async function currentUser(): Promise<UserKey | null> {
  const store = await cookies();
  return sessionUser(store.get(SESSION_COOKIE)?.value);
}

/** Une personne autorisée est connectée (les deux comptes ont exactement les mêmes accès). */
export async function isAdmin(): Promise<boolean> {
  return (await currentUser()) !== null;
}

export async function requireAdmin(): Promise<UserKey> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Jeton Bearer : "sync" accepte SYNC_SECRET, "admin" accepte ADMIN_PASSWORD. */
export function bearerAuthorized(request: Request, kind: "admin" | "sync"): boolean {
  const secret = readSecret(kind === "admin" ? "ADMIN_PASSWORD" : "SYNC_SECRET");
  if (!secret) return false;
  return safeEqual((request.headers.get("authorization") ?? "").trim(), "Bearer " + secret);
}

/** Pour les routes API : jeton Bearer ou session administrateur. */
export async function requestAuthorized(request: Request, kind: "admin" | "sync"): Promise<boolean> {
  return bearerAuthorized(request, kind) || (await isAdmin());
}

/** Auteur d'une requête API : compte de la session, sinon le propriétaire (jeton Bearer ADMIN_PASSWORD). */
export async function requestUser(request: Request): Promise<UserKey | null> {
  return (await currentUser()) ?? (bearerAuthorized(request, "admin") ? "owner" : null);
}

// Limitation simple des tentatives de connexion (mémoire du processus).
const attempts = new Map<string, { count: number; resetAt: number }>();
export function loginRateLimited(key: string, now = Date.now()): boolean {
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) return false;
  return entry.count >= 10;
}
export function recordFailedLogin(key: string, now = Date.now()) {
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) attempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
  else entry.count++;
}
export function clearFailedLogins(key: string) {
  attempts.delete(key);
}
