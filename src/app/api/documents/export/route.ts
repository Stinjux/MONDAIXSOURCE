// GET /api/documents/export[?asin=…] — tous les documents (non archivés) en .zip, rangés par ASIN.
// Copie à garder hors de Railway : le contenu des documents n'est pas recopié dans chaque sauvegarde.
import { requestAuthorized } from "@/lib/auth";
import { documentsZip } from "@/lib/documentStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requestAuthorized(request, "admin"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const asin = new URL(request.url).searchParams.get("asin")?.toUpperCase() || null;
  const { zip } = await documentsZip(asin);
  const name = `mondaix-documents${asin ? `-${asin}` : ""}-${new Date().toISOString().slice(0, 10)}.zip`;
  return new Response(new Blob([zip as Uint8Array<ArrayBuffer>]), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
