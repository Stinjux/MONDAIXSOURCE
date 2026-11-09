"use client";
// Modèles de notes : motifs « Pour », « Contre », « À vérifier » en un clic, plus une note libre.
import { Check, StickyNote } from "lucide-react";
import { TEMPLATE_GROUPS, tagGroup, type NoteTemplates } from "@/lib/noteTemplates";
import { cn } from "./ui";

const TONE = {
  good: { on: "border-good bg-good text-white", off: "border-good/30 text-good hover:bg-good/[0.07]" },
  critical: { on: "border-critical bg-critical text-white", off: "border-critical/30 text-critical hover:bg-critical/[0.07]" },
  warning: { on: "border-warning bg-warning text-white", off: "border-warning/35 text-warning hover:bg-warning/[0.08]" },
} as const;

export function NotePicker({
  templates, tags, onTags, notes, onNotes, compact,
}: {
  templates: NoteTemplates;
  tags: string[];
  onTags: (tags: string[]) => void;
  notes: string;
  onNotes: (notes: string) => void;
  compact?: boolean;
}) {
  const toggle = (t: string) => onTags(tags.some((x) => x.toLowerCase() === t.toLowerCase()) ? tags.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...tags, t]);
  // Motifs déjà enregistrés qui ne sont plus dans les modèles : gardés et affichés à part
  const others = tags.filter((t) => !tagGroup(t, templates));
  return (
    <div className="flex flex-col gap-2.5">
      {TEMPLATE_GROUPS.map((g) => (
        <div key={g.key} className={cn("flex flex-wrap items-center gap-1.5", compact && "gap-1")}>
          <span className={cn("w-20 shrink-0 text-[10px] font-semibold tracking-[0.1em] uppercase", g.tone === "good" ? "text-good" : g.tone === "critical" ? "text-critical" : "text-warning")}>{g.label}</span>
          {templates[g.key].map((t) => {
            const on = tags.some((x) => x.toLowerCase() === t.toLowerCase());
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(t)}
                className={cn("inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[11px] font-medium transition", on ? TONE[g.tone].on : TONE[g.tone].off)}
              >
                {on && <Check size={10} />}
                {t}
              </button>
            );
          })}
        </div>
      ))}
      {others.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-20 shrink-0 text-[10px] font-semibold tracking-[0.1em] text-ink-3 uppercase">Autres</span>
          {others.map((t) => (
            <button key={t} type="button" onClick={() => toggle(t)} className="inline-flex items-center gap-1 rounded-sm border border-line-strong bg-surface-2 px-2 py-0.5 text-[11px] text-ink-2" title="Retirer ce motif">
              <Check size={10} /> {t}
            </button>
          ))}
        </div>
      )}
      <label className="relative block">
        <StickyNote size={13} className="pointer-events-none absolute top-2.5 left-2.5 text-ink-3" />
        <textarea
          className={cn("field min-h-14 pl-8 text-[13px]", compact && "min-h-10")}
          placeholder="Note libre (ex. vérifier le lot de 3 chez Costco)"
          maxLength={5000}
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          aria-label="Note"
        />
      </label>
    </div>
  );
}

/** Motifs en lecture seule (aperçus dans les listes). */
export function TagChips({ tags, templates, max = 3 }: { tags: string[]; templates?: NoteTemplates; max?: number }) {
  if (!tags.length) return null;
  const tone = (t: string) => {
    const g = templates ? tagGroup(t, templates) : null;
    return g === "positive" ? "border-good/30 text-good" : g === "negative" ? "border-critical/30 text-critical" : g === "check" ? "border-warning/35 text-warning" : "border-line-strong text-ink-2";
  };
  return (
    <span className="inline-flex flex-wrap gap-1">
      {tags.slice(0, max).map((t) => (
        <span key={t} className={cn("rounded-sm border bg-surface px-1.5 text-[10px] leading-4 font-medium", tone(t))}>
          {t}
        </span>
      ))}
      {tags.length > max && <span className="text-[10px] text-ink-3">+{tags.length - max}</span>}
    </span>
  );
}
