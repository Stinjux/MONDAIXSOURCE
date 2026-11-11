// Documents de la section COGS (factures, reçus…) : formats acceptés reconnus par leur contenu,
// jamais par le seul nom du fichier. Fonctions pures, testées.

export const MAX_DOC_BYTES = 20 * 1024 * 1024;

export const DOC_KINDS = ["INVOICE", "RECEIPT", "OTHER"] as const;
export type DocKind = (typeof DOC_KINDS)[number];
export const DOC_KIND_LABELS: Record<DocKind, string> = { INVOICE: "Facture", RECEIPT: "Reçu", OTHER: "Autre document" };

export type DocType = { mime: string; ext: string; family: "pdf" | "image" | "heic" };

const ascii = (b: Uint8Array, start: number, len: number) => String.fromCharCode(...b.subarray(start, start + len));

/** Type réel d'un fichier d'après ses premiers octets : PDF, JPEG, PNG, WebP, GIF ou HEIC/HEIF. */
export function sniffType(b: Uint8Array): DocType | null {
  if (b.length < 12) return null;
  if (ascii(b, 0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf", family: "pdf" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg", family: "image" };
  if (b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return { mime: "image/png", ext: "png", family: "image" };
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return { mime: "image/webp", ext: "webp", family: "image" };
  if (ascii(b, 0, 4) === "GIF8") return { mime: "image/gif", ext: "gif", family: "image" };
  if (ascii(b, 4, 4) === "ftyp") {
    const brand = ascii(b, 8, 4);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis"].includes(brand)) return { mime: "image/heic", ext: "heic", family: "heic" };
    if (["mif1", "msf1"].includes(brand)) return { mime: "image/heif", ext: "heif", family: "heic" };
  }
  return null;
}

/** Nom de fichier sûr pour l'affichage et le téléchargement (sans chemin ni caractères de contrôle). */
export function safeFilename(name: string, ext: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "").replace(/[\u0000-\u001f\u007f"<>|*?:]/g, "").trim().slice(0, 120);
  if (!base) return `document.${ext}`;
  return /\.[a-z0-9]{2,5}$/i.test(base) ? base : `${base}.${ext}`;
}

/** En-tête Content-Disposition compatible avec les accents (RFC 5987). */
export function contentDisposition(filename: string, inline: boolean): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export const formatBytes = (n: number) => (n < 1024 ? `${n} o` : n < 1024 * 1024 ? `${Math.round(n / 1024)} Ko` : `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`);
