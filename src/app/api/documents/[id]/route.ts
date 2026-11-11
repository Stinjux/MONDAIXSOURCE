// GET /api/documents/<id> — affiche un document (?download=1 pour le télécharger, ?preview=1 pour
// l'aperçu JPEG d'une photo HEIC). Accès : session administrateur.
import { requestAuthorized } from "@/lib/auth";
import { contentDisposition } from "@/lib/documents";
import { documentContent } from "@/lib/documentStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requestAuthorized(request, "admin"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const preview = url.searchParams.get("preview") === "1";
  const found = await documentContent((await params).id, preview);
  if (!found?.bytes) return Response.json({ error: "Document introuvable" }, { status: 404 });
  const name = preview ? found.doc.filename.replace(/\.[^.]+$/, ".jpg") : found.doc.filename;
  return new Response(new Blob([found.bytes as Uint8Array<ArrayBuffer>]), {
    headers: {
      "Content-Type": found.mime,
      "Content-Disposition": contentDisposition(name, url.searchParams.get("download") !== "1"),
      "Cache-Control": "private, max-age=3600",
      // Fichiers déposés par l'utilisateur : aucun script, aucune ressource externe
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; object-src 'self'",
    },
  });
}
