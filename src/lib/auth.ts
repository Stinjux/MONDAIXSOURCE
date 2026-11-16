// Authentification : un mot de passe administrateur (ADMIN_PASSWORD) ouvre une session signée
// stockée dans un cookie HttpOnly. Les tâches planifiées utilisent un jeton distinct (SYNC_SECRET).
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const SESSION_COOKIE = "mx_session";
const SESSION_DAYS = 30;

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Lit un secret en tolérant les erreurs de saisie courantes dans Railway :
 * espaces ou retour à la ligne en trop, guillemets autour de la valeur.
 */
export function readSecret(name: "ADMIN_PASSWORD" | "SYNC_SECRET"): string | undefined {
  let v = process.env[name]?.trim();
  if (v && v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) v = v.slice(1, -1).trim();
  return v || undefined;
}

function sign(payload: string): string | null {
  const secret = readSecret("ADMIN_PASSWORD");
  if (!secret) return null;
  // Changer ADMIN_PASSWORD invalide toutes les sessions existantes.
  return createHmac("sha256", "mondaix-session:" + secret).update(payload).digest("base64url");
}

export function createSessionValue(now = Date.now()): string | null {
  const exp = String(now + SESSION_DAYS * 86_400_000);
  const sig = sign(exp);
  return sig ? `${exp}.${sig}` : null;
}

export function verifySessionValue(value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const [exp, sig] = value.split(".");
  const expected = exp ? sign(exp) : null;
  if (!expected || !sig || !safeEqual(sig, expected)) return false;
  return Number(exp) > now;
}

/** `secure` seulement en HTTPS : sinon le navigateur refuserait le cookie (ex. accès local en http). */
export function sessionCookieOptions(https: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, secure: https, path: "/", maxAge: SESSION_DAYS * 86_400 };
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return verifySessionValue(store.get(SESSION_COOKIE)?.value);
}

export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/login");
}

export function checkPassword(password: string): boolean {
  const secret = readSecret("ADMIN_PASSWORD");
  return !!secret && safeEqual(password.trim(), secret);
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
