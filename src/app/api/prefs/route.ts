// PUT /api/prefs — réglages de travail partagés entre appareils (critères, filtres, panier, budget).
// Accès : session administrateur. Le dernier enregistrement gagne.
import { requestUser } from "@/lib/auth";
import { setSharedPrefs } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const user = await requestUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as { data?: Record<string, unknown> };
    const data = { ...(body.data ?? {}) };
    const updatedAt = typeof data.updatedAt === "number" ? data.updatedAt : Date.now();
    delete data.updatedAt;
    const saved = await setSharedPrefs(data, updatedAt, user);
    return Response.json({ ok: true, saved });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Erreur" }, { status: 400 });
  }
}
