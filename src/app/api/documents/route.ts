// POST /api/documents — envoi de documents COGS (glisser-déposer) : champs « files » (un ou plusieurs),
// « asin », « kind » (INVOICE | RECEIPT | OTHER) et « purchaseId » facultatif. Accès : session administrateur.
import { revalidatePath } from "next/cache";
import { requestAuthorized } from "@/lib/auth";
import { saveDocument } from "@/lib/documentStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await requestAuthorized(request, "admin"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Envoi invalide" }, { status: 400 });
  }
  const asin = String(form.get("asin") ?? "");
  const kind = String(form.get("kind") ?? "INVOICE");
  const purchaseId = form.get("purchaseId") ? String(form.get("purchaseId")) : null;
  const files = form.getAll("files").filter((f): f is File => typeof f === "object" && "arrayBuffer" in f).slice(0, 20);
  if (!files.length) return Response.json({ error: "Aucun fichier" }, { status: 400 });
  const saved = [];
  const errors: string[] = [];
  for (const f of files) {
    try {
      saved.push(await saveDocument({ asin, filename: f.name, bytes: new Uint8Array(await f.arrayBuffer()), kind, purchaseId }));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : `${f.name} : erreur`);
    }
  }
  if (saved.length) revalidatePath("/cogs", "layout");
  return Response.json({ saved, errors }, { status: saved.length ? 200 : 400 });
}
