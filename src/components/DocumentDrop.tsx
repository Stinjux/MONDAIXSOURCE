"use client";
// Documents d'un produit (section COGS) : zone de glisser-déposer (PDF, images, HEIC), galerie
// avec aperçus, type de document, commande associée, archivage (jamais de suppression).
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Archive, ArchiveRestore, Download, ExternalLink, FileText, Loader2, UploadCloud, X } from "lucide-react";
import { archiveDocument, updateDocument } from "@/app/(app)/actions";
import { formatDate } from "@/lib/dates";
import { DOC_KINDS, DOC_KIND_LABELS, MAX_DOC_BYTES, formatBytes, type DocKind } from "@/lib/documents";
import { cn } from "./ui";

export type DocView = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  kind: string;
  purchaseId: string | null;
  hasPreview: boolean;
  uploadedAt: string;
  archivedAt: string | null;
};
export type OrderOption = { id: string; label: string };

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,application/pdf,image/*";

export function DocumentDrop({ asin, documents, orders }: { asin: string; documents: DocView[]; orders: OrderOption[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [kind, setKind] = useState<DocKind>("INVOICE");
  const [orderId, setOrderId] = useState(orders[0]?.id ?? "");
  const [uploading, setUploading] = useState<string[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [viewer, setViewer] = useState<DocView | null>(null);
  const [, start] = useTransition();

  const upload = async (files: File[]) => {
    if (!files.length) return;
    const tooBig = files.filter((f) => f.size > MAX_DOC_BYTES);
    const ok = files.filter((f) => f.size <= MAX_DOC_BYTES);
    setMsg(null);
    if (!ok.length) return setMsg({ ok: false, text: `${tooBig.map((f) => f.name).join(", ")} : plus de 20 Mo` });
    setUploading(ok.map((f) => f.name));
    const body = new FormData();
    body.set("asin", asin);
    body.set("kind", kind);
    if (orderId) body.set("purchaseId", orderId);
    for (const f of ok) body.append("files", f);
    try {
      const res = await fetch("/api/documents", { method: "POST", body });
      const data = (await res.json()) as { saved?: { filename: string }[]; errors?: string[]; error?: string };
      const errors = [...(data.errors ?? []), ...(data.error ? [data.error] : []), ...tooBig.map((f) => `${f.name} : plus de 20 Mo`)];
      const saved = data.saved?.length ?? 0;
      setMsg({ ok: !errors.length, text: [saved ? `${saved} document${saved > 1 ? "s" : ""} ajouté${saved > 1 ? "s" : ""}` : "", ...errors].filter(Boolean).join(" · ") });
      if (saved) router.refresh();
    } catch {
      setMsg({ ok: false, text: "Envoi impossible : vérifiez votre connexion et réessayez." });
    } finally {
      setUploading(null);
    }
  };

  const visible = documents.filter((d) => (showArchived ? true : !d.archivedAt));
  const archivedCount = documents.filter((d) => d.archivedAt).length;
  const thumb = (d: DocView) => (d.mimeType.startsWith("image/") && d.mimeType !== "image/heic" && d.mimeType !== "image/heif" ? `/api/documents/${d.id}` : d.hasPreview ? `/api/documents/${d.id}?preview=1` : null);

  return (
    <div className="flex flex-col gap-4">
      {/* Zone de dépôt */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Déposer des factures ou documents"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          upload([...e.dataTransfer.files]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-6 py-8 text-center transition",
          over ? "border-accent bg-accent-soft" : "border-line-strong bg-surface-2 hover:border-accent/60 hover:bg-accent-soft/50",
        )}
      >
        {uploading ? <Loader2 size={28} className="animate-spin text-accent" /> : <UploadCloud size={28} className={over ? "text-accent" : "text-ink-3"} />}
        <p className="text-sm font-medium text-ink">{uploading ? `Envoi de ${uploading.length} fichier${uploading.length > 1 ? "s" : ""}…` : "Glissez vos factures ici, ou cliquez pour choisir"}</p>
        <p className="text-xs text-ink-3">PDF, images (JPG, PNG, WebP) et photos iPhone (HEIC) · 20 Mo maximum par fichier</p>
        <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => upload([...(e.target.files ?? [])]).then(() => (e.target.value = ""))} />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-ink-2">
        <label className="flex items-center gap-1.5">
          Type
          <select className="field w-auto py-1 text-xs" value={kind} onChange={(e) => setKind(e.target.value as DocKind)}>
            {DOC_KINDS.map((k) => (
              <option key={k} value={k}>
                {DOC_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        {orders.length > 0 && (
          <label className="flex items-center gap-1.5">
            Commande
            <select className="field w-auto max-w-72 py-1 text-xs" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">Aucune en particulier</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {msg && <span className={msg.ok ? "text-good" : "text-critical"}>{msg.text}</span>}
      </div>

      {/* Galerie */}
      {visible.length === 0 ? (
        <p className="rounded-md border border-line bg-surface px-4 py-6 text-center text-sm text-ink-3">Aucun document pour ce produit.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((d) => {
            const src = thumb(d);
            return (
              <li key={d.id} className={cn("flex flex-col overflow-hidden rounded-md border border-line bg-surface", d.archivedAt && "opacity-60")}>
                <button
                  type="button"
                  onClick={() => (src ? setViewer(d) : window.open(`/api/documents/${d.id}`, "_blank", "noopener"))}
                  className="grid h-40 place-items-center overflow-hidden border-b border-line bg-surface-2"
                  title="Afficher"
                >
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element -- document de l'utilisateur
                    <img src={src} alt={d.filename} className="h-full w-full object-contain" loading="lazy" />
                  ) : (
                    <span className="flex flex-col items-center gap-1 text-ink-3">
                      <FileText size={36} className="text-critical/80" />
                      <span className="text-[11px] font-semibold tracking-wide">{d.mimeType === "application/pdf" ? "PDF" : d.filename.split(".").pop()?.toUpperCase()}</span>
                    </span>
                  )}
                </button>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink" title={d.filename}>
                      {d.filename}
                    </p>
                    <p className="text-[11px] text-ink-3">
                      {formatBytes(d.size)} · ajouté le {formatDate(d.uploadedAt)}
                      {d.archivedAt && " · archivé"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <select
                      className="field w-auto py-0.5 text-[11px]"
                      value={d.kind}
                      aria-label="Type de document"
                      onChange={(e) => start(async () => void (await updateDocument(d.id, { kind: e.target.value as DocKind })))}
                    >
                      {DOC_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {DOC_KIND_LABELS[k]}
                        </option>
                      ))}
                    </select>
                    {orders.length > 0 && (
                      <select
                        className="field w-auto max-w-44 py-0.5 text-[11px]"
                        value={d.purchaseId ?? ""}
                        aria-label="Commande associée"
                        onChange={(e) => start(async () => void (await updateDocument(d.id, { purchaseId: e.target.value || null })))}
                      >
                        <option value="">Sans commande</option>
                        {orders.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="mt-auto flex gap-1.5 pt-1">
                    <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener" className="btn-ghost px-2 py-1 text-xs">
                      <ExternalLink size={12} /> Ouvrir
                    </a>
                    <a href={`/api/documents/${d.id}?download=1`} className="btn-ghost px-2 py-1 text-xs" title="Télécharger" aria-label={`Télécharger ${d.filename}`}>
                      <Download size={12} />
                    </a>
                    <button
                      type="button"
                      className="btn-ghost ml-auto px-2 py-1 text-xs"
                      title={d.archivedAt ? "Rétablir ce document" : "Archiver (le document reste conservé)"}
                      onClick={() => start(async () => void (await archiveDocument(d.id, !d.archivedAt)))}
                    >
                      {d.archivedAt ? <ArchiveRestore size={12} /> : <Archive size={12} />}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {archivedCount > 0 && (
        <button type="button" className="self-start text-xs text-ink-2 hover:text-ink hover:underline" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? "Masquer les documents archivés" : `Afficher les documents archivés (${archivedCount})`}
        </button>
      )}

      {/* Visionneuse d'images */}
      {viewer && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-ink/85 p-4" role="dialog" aria-modal="true" aria-label={viewer.filename} onClick={() => setViewer(null)}>
          <div className="flex items-center justify-between gap-3 text-sm text-white">
            <span className="truncate">{viewer.filename}</span>
            <span className="flex gap-2">
              <a href={`/api/documents/${viewer.id}?download=1`} className="btn px-2.5 text-white hover:bg-white/10" onClick={(e) => e.stopPropagation()}>
                <Download size={16} /> Télécharger
              </a>
              <button type="button" className="btn px-2.5 text-white hover:bg-white/10" aria-label="Fermer" onClick={() => setViewer(null)}>
                <X size={18} />
              </button>
            </span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- document de l'utilisateur */}
          <img src={thumb(viewer) ?? ""} alt={viewer.filename} className="m-auto max-h-[85vh] max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
