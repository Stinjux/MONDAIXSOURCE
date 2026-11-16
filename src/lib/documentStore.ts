// Stockage des documents COGS en base : contenu une seule fois par empreinte (DocumentBlob),
// fiche par document (ProductDocument). Rien n'est jamais supprimé ; un document retiré est archivé.
import "server-only";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";
import { prisma } from "./prisma";
import { DOC_KINDS, MAX_DOC_BYTES, safeFilename, sniffType, type DocKind } from "./documents";

export type SavedDocument = { id: string; filename: string; mimeType: string; size: number };

/** Aperçu JPEG d'une photo HEIC (les navigateurs autres que Safari ne savent pas l'afficher). */
async function heicPreview(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const { default: convert } = await import("heic-convert");
    return new Uint8Array(await convert({ buffer: bytes, format: "JPEG", quality: 0.82 }));
  } catch {
    return null; // fichier conservé tel quel, sans aperçu
  }
}

export async function saveDocument(input: { asin: string; filename: string; bytes: Uint8Array; kind?: string; purchaseId?: string | null }): Promise<SavedDocument> {
  const asin = input.asin.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) throw new Error("ASIN invalide");
  if (input.bytes.length === 0) throw new Error(`${input.filename} : fichier vide`);
  if (input.bytes.length > MAX_DOC_BYTES) throw new Error(`${input.filename} : plus de 20 Mo`);
  const type = sniffType(input.bytes);
  if (!type) throw new Error(`${input.filename} : format non accepté (PDF, image ou HEIC seulement)`);
  const kind: DocKind = DOC_KINDS.includes(input.kind as DocKind) ? (input.kind as DocKind) : "INVOICE";
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");

  // Contenu identique déjà stocké : réutilisé tel quel
  const existing = await prisma.documentBlob.findUnique({ where: { sha256 }, select: { sha256: true, preview: true } });
  let hasPreview = !!existing?.preview;
  if (!existing) {
    const preview = type.family === "heic" ? await heicPreview(input.bytes) : null;
    hasPreview = !!preview;
    await prisma.documentBlob.create({ data: { sha256, data: new Uint8Array(input.bytes), preview: preview ? new Uint8Array(preview) : null } });
  }
  const product = await prisma.product.findUnique({ where: { asin }, select: { id: true } });
  const purchaseId = input.purchaseId ? ((await prisma.purchase.findUnique({ where: { id: input.purchaseId }, select: { id: true } }))?.id ?? null) : null;
  const doc = await prisma.productDocument.create({
    data: { asin, productId: product?.id ?? null, purchaseId, kind, filename: safeFilename(input.filename, type.ext), mimeType: type.mime, size: input.bytes.length, sha256, hasPreview },
    select: { id: true, filename: true, mimeType: true, size: true },
  });
  await prisma.changeLog.create({ data: { entity: "ProductDocument", entityId: doc.id, action: "CREATE", after: { asin, kind, filename: doc.filename, size: doc.size } } });
  return doc;
}

export async function documentContent(id: string, preview: boolean) {
  const doc = await prisma.productDocument.findUnique({ where: { id } });
  if (!doc) return null;
  const blob = await prisma.documentBlob.findUnique({ where: { sha256: doc.sha256 }, select: preview ? { preview: true } : { data: true } });
  if (!blob) return { doc, bytes: null, mime: doc.mimeType };
  if (preview) return { doc, bytes: (blob as { preview: Uint8Array | null }).preview, mime: "image/jpeg" };
  return { doc, bytes: (blob as { data: Uint8Array }).data, mime: doc.mimeType };
}

/** Archive zip des documents (non archivés), rangés par ASIN. */
export async function documentsZip(asin?: string | null) {
  const docs = await prisma.productDocument.findMany({ where: { archivedAt: null, ...(asin ? { asin } : {}) }, orderBy: [{ asin: "asc" }, { uploadedAt: "asc" }] });
  const blobs = new Map(
    (await prisma.documentBlob.findMany({ where: { sha256: { in: [...new Set(docs.map((d) => d.sha256))] } }, select: { sha256: true, data: true } })).map((b) => [b.sha256, b.data]),
  );
  const files: Record<string, Uint8Array> = {};
  for (const d of docs) {
    const data = blobs.get(d.sha256);
    if (!data) continue;
    const base = `${d.asin}/${d.uploadedAt.toISOString().slice(0, 10)}_${d.filename}`;
    let name = base;
    for (let i = 2; files[name]; i++) name = base.replace(/(\.[^.]+)?$/, `-${i}$1`);
    files[name] = new Uint8Array(data);
  }
  return { zip: zipSync(files, { level: 0 }), count: Object.keys(files).length };
}
