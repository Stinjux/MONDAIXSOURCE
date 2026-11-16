// POST /api/reminder — envoie le rappel de revue hebdomadaire (Bearer SYNC_SECRET).
// GET renvoie le contenu du rappel sans l'envoyer.
import { bearerAuthorized, isAdmin } from "@/lib/auth";
import { buildReminder, sendReminder } from "@/lib/reminder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!bearerAuthorized(request, "sync") && !(await isAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await buildReminder());
}

export async function POST(request: Request) {
  if (!bearerAuthorized(request, "sync")) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await sendReminder());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Envoi impossible" }, { status: 502 });
  }
}
