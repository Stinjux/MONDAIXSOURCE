// POST /api/sync — déclenché par une tâche planifiée (Authorization: Bearer <SYNC_SECRET>)
// ou par le bouton du dashboard (session administrateur).
import { bearerAuthorized, isAdmin } from "@/lib/auth";
import { syncAll } from "@/lib/sync/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const viaSecret = bearerAuthorized(request, "sync");
  if (!viaSecret && !(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const results = await syncAll({ trigger: viaSecret ? "CRON" : "MANUAL" });
    const failed = results.some((r) => r.status === "FAILED");
    return Response.json({ results }, { status: failed ? 502 : 200 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Sync failed" }, { status: 500 });
  }
}
