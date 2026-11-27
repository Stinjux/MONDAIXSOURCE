// POST /api/keepa — mise à jour Keepa déclenchée par un ordonnanceur externe (Authorization: Bearer <SYNC_SECRET>)
// ou par le dashboard (session). Même travail que `npm run keepa:cron`.
import { bearerAuthorized, isAdmin } from "@/lib/auth";
import { runKeepa } from "@/lib/keepaSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const viaSecret = bearerAuthorized(request, "sync");
  if (!viaSecret && !(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runKeepa({ trigger: viaSecret ? "CRON" : "MANUAL" });
  return Response.json(result, { status: result.status === "FAILED" ? 502 : 200 });
}
