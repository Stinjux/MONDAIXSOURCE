"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, readSecret, clearFailedLogins, createSessionValue, loginRateLimited, recordFailedLogin, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export async function login(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  if (!readSecret("ADMIN_PASSWORD"))
    return { error: "ADMIN_PASSWORD n'est pas configuré sur ce service Railway (ajoutez la variable au service web puis redéployez)." };
  if (loginRateLimited(ip)) return { error: "Trop de tentatives. Réessayez dans 15 minutes." };
  const password = String(form.get("password") ?? "");
  if (!checkPassword(password)) {
    recordFailedLogin(ip);
    await new Promise((r) => setTimeout(r, 400));
    return { error: "Mot de passe incorrect. Il doit être identique à la valeur de ADMIN_PASSWORD dans Railway (majuscules comprises)." };
  }
  clearFailedLogins(ip);
  const value = createSessionValue();
  if (!value) return { error: "Configuration invalide." };
  const https = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim() === "https";
  (await cookies()).set(SESSION_COOKIE, value, sessionCookieOptions(https));
  redirect("/");
}
