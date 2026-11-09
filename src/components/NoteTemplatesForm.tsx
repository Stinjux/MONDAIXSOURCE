"use client";
// Settings : modifier les modèles de notes (motifs « Pour », « Contre », « À vérifier »).
import { useState, useTransition } from "react";
import { Plus, RotateCcw, X } from "lucide-react";
import { saveNoteTemplates } from "@/app/(app)/actions";
import { DEFAULT_TEMPLATES, TEMPLATE_GROUPS, type NoteTemplates } from "@/lib/noteTemplates";
import { cn } from "./ui";

export function NoteTemplatesForm({ initial }: { initial: NoteTemplates }) {
  const [t, setT] = useState<NoteTemplates>(initial);
  const [draft, setDraft] = useState<Record<keyof NoteTemplates, string>>({ positive: "", negative: "", check: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(t) !== JSON.stringify(initial);

  const add = (k: keyof NoteTemplates) => {
    const v = draft[k].trim().slice(0, 40);
    if (!v || t[k].some((x) => x.toLowerCase() === v.toLowerCase())) return;
    setT({ ...t, [k]: [...t[k], v] });
    setDraft({ ...draft, [k]: "" });
    setMsg(null);
  };
  const remove = (k: keyof NoteTemplates, v: string) => {
    setT({ ...t, [k]: t[k].filter((x) => x !== v) });
    setMsg(null);
  };

  return (
    <div className="flex flex-col gap-4">
      {TEMPLATE_GROUPS.map((g) => (
        <div key={g.key}>
          <div className={cn("mb-1.5 text-[11px] font-semibold tracking-[0.1em] uppercase", g.tone === "good" ? "text-good" : g.tone === "critical" ? "text-critical" : "text-warning")}>{g.label}</div>
          <div className="flex flex-wrap gap-1.5">
            {t[g.key].map((v) => (
              <span key={v} className="inline-flex items-center gap-1 rounded-sm border border-line-strong bg-surface-2 py-0.5 pr-1 pl-2 text-xs text-ink">
                {v}
                <button type="button" className="rounded-sm p-0.5 text-ink-3 hover:bg-surface-3 hover:text-critical" onClick={() => remove(g.key, v)} aria-label={`Retirer ${v}`}>
                  <X size={11} />
                </button>
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <input
                className="field w-44 py-1 text-xs"
                placeholder="Nouveau motif"
                maxLength={40}
                value={draft[g.key]}
                onChange={(e) => setDraft({ ...draft, [g.key]: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add(g.key);
                  }
                }}
                aria-label={`Nouveau motif ${g.label}`}
              />
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => add(g.key)} disabled={!draft[g.key].trim()}>
                <Plus size={12} />
              </button>
            </span>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <button
          type="button"
          className="btn-primary"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const res = await saveNoteTemplates(t);
              setMsg(res.ok ? { ok: true, text: "Modèles enregistrés" } : { ok: false, text: res.error });
            })
          }
        >
          {pending ? "Enregistrement…" : "Enregistrer les modèles"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setT(DEFAULT_TEMPLATES)}>
          <RotateCcw size={14} /> Modèles par défaut
        </button>
        {msg && <span className={cn("text-xs", msg.ok ? "text-good" : "text-critical")}>{msg.text}</span>}
      </div>
      <p className="text-xs text-ink-3">Retirer un modèle ne modifie pas les leads qui l&apos;utilisent déjà : leurs motifs restent enregistrés et affichés.</p>
    </div>
  );
}
