// GET /api/backup          — téléchargement de l'état actuel de la base (toutes les tables, .json.gz)
// GET /api/backup?id=<id>  — téléchargement d'une sauvegarde enregistrée
// Accès : session administrateur ou Bearer ADMIN_PASSWORD.
import { requestAuthorized } from "@/lib/auth";
import { dumpDatabase, encodeDump } from "@/lib/backup";
import { localDateKey, zonedParts } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Heure du Québec dans le nom du fichier : mondaix-sauvegarde-2026-11-02-15h03.json.gz
const stamp = (d: Date) => {
  const p = zonedParts(d);
  return `${localDateKey(d)}-${String(p.hour).padStart(2, "0")}h${String(p.minute).padStart(2, "0")}`;
};

export async function GET(request: Request) {
  if (!(await requestAuthorized(request, "admin"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  let data: Uint8Array;
  let at: Date;
  if (id) {
    const backup = await prisma.dataBackup.findUnique({ where: { id }, select: { data: true, createdAt: true } });
    if (!backup) return Response.json({ error: "Sauvegarde introuvable" }, { status: 404 });
    data = backup.data;
    at = backup.createdAt;
  } else {
    at = new Date();
    data = new Uint8Array(encodeDump(await dumpDatabase(prisma, at)));
  }
  return new Response(new Blob([data as Uint8Array<ArrayBuffer>]), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="mondaix-sauvegarde-${stamp(at)}.json.gz"`,
      "Cache-Control": "no-store",
    },
  });
}
