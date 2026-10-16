"use client";
// Panneau de filtres partagé par « Buy Decisions » et « Achat · Rejeté · À définir ».
// Les réglages sont mémorisés dans ce navigateur et synchronisés entre les deux pages (et les onglets ouverts).
import { useCallback, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { DEFAULT_THRESHOLDS, VERDICT_LABELS, type Thresholds, type Verdict } from "@/lib/decision";
import { DEFAULT_FILTERS, STRATEGIES, parseFilters, type DecisionFilters, type VerdictFilter } from "@/lib/decisionFilters";
import { cn } from "./ui";

const STORAGE_KEY = "mondaix.buyDecisions.v1";
const EVENT = "mondaix:decision-filters";

export function readSaved(): Record<string, unknown> {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Écrit seulement les champs fournis (n'efface pas budget / quantités / autres filtres). */
export function writeSaved(patch: Record<string, unknown>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readSaved(), ...patch }));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* stockage indisponible : réglages non conservés */
  }
}

export function useDecisionFilters() {
  const [filters, setFilters] = useState<DecisionFilters>(DEFAULT_FILTERS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const sync = () => setFilters(parseFilters(readSaved()));
    sync();
    setLoaded(true);
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT, sync);
    };
  }, []);

  const update = useCallback((patch: Partial<DecisionFilters>) => {
    setFilters((f) => {
      const next = { ...f, ...patch };
      writeSaved({ ...next });
      return next;
    });
  }, []);

  const reset = useCallback(() => update(DEFAULT_FILTERS), [update]);
  return { filters, update, reset, loaded };
}

export function FilterPanel({
  filters,
  update,
  extraToggle,
}: {
  filters: DecisionFilters;
  update: (patch: Partial<DecisionFilters>) => void;
  /** Case à cocher propre à une page (ex. « Inclure les leads rejetés ») */
  extraToggle?: { label: string; checked: boolean; onChange: (v: boolean) => void };
}) {
  const thresholdInput = (key: keyof Thresholds, label: string, unit: string) => (
    <label className="text-xs text-ink-2">
      {label}
      <span className="mt-1 flex items-center gap-1.5">
        <input
          className="field w-20 py-1.5 text-right tabular-nums"
          inputMode="decimal"
          value={String(filters.thresholds[key]).replace(".", ",")}
          onChange={(e) => {
            const v = Number(e.target.value.replace(",", "."));
            if (Number.isFinite(v)) update({ thresholds: { ...filters.thresholds, [key]: v } });
          }}
        />
        <span className="text-ink-3">{unit}</span>
      </span>
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="mb-2 text-xs font-semibold tracking-wide text-ink-2 uppercase">Classer par</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" role="radiogroup" aria-label="Classement">
          {STRATEGIES.map((s) => (
            <button
              key={s.key}
              type="button"
              role="radio"
              aria-checked={filters.strategy === s.key}
              onClick={() => update({ strategy: s.key })}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition",
                filters.strategy === s.key ? "border-accent/60 bg-accent/10" : "border-line bg-surface-2/50 hover:border-line-strong",
              )}
            >
              <div className={cn("text-sm font-medium", filters.strategy === s.key ? "text-ink" : "text-ink-2")}>{s.label}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-ink-3">{s.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wide text-ink-2 uppercase">Mes critères d&apos;achat</span>
          <button type="button" className="flex items-center gap-1 text-xs text-ink-3 hover:text-ink" onClick={() => update({ thresholds: DEFAULT_THRESHOLDS })}>
            <RotateCcw size={12} /> Par défaut
          </button>
        </div>
        <div className="flex flex-wrap gap-4">
          {thresholdInput("minRoi", "ROI minimum", "%")}
          {thresholdInput("minProfit", "Profit unitaire min.", "$")}
          {thresholdInput("minMargin", "Marge minimum", "%")}
          {thresholdInput("minSales", "Ventes min. / mois", "u.")}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-3 text-xs text-ink-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="accent-[#3987e5]" checked={filters.weekOnly} onChange={(e) => update({ weekOnly: e.target.checked })} /> Leads de cette semaine seulement
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="accent-[#3987e5]" checked={filters.includeUnavailable} onChange={(e) => update({ includeUnavailable: e.target.checked })} /> Inclure les ruptures
          </label>
          {extraToggle && (
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" className="accent-[#3987e5]" checked={extraToggle.checked} onChange={(e) => extraToggle.onChange(e.target.checked)} /> {extraToggle.label}
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

export function VerdictChips({ value, onChange, counts, total }: { value: VerdictFilter; onChange: (v: VerdictFilter) => void; counts: Record<Verdict, number>; total: number }) {
  const chip = (key: VerdictFilter, label: string, n: number) => (
    <button
      key={key}
      type="button"
      onClick={() => onChange(key)}
      aria-pressed={value === key}
      className={cn("rounded-full px-3 py-1 text-xs transition", value === key ? "bg-accent-soft text-ink ring-1 ring-accent/40" : "text-ink-2 hover:bg-surface-2")}
    >
      {label} <span className="ml-0.5 text-ink-3 tabular-nums">{n}</span>
    </button>
  );
  return (
    <>
      {chip("ACTIONABLE", "À acheter ou considérer", counts.BUY + counts.CONSIDER)}
      {chip("BUY", VERDICT_LABELS.BUY, counts.BUY)}
      {chip("CONSIDER", VERDICT_LABELS.CONSIDER, counts.CONSIDER)}
      {chip("AVOID", VERDICT_LABELS.AVOID, counts.AVOID)}
      {chip("INCOMPLETE", VERDICT_LABELS.INCOMPLETE, counts.INCOMPLETE)}
      {chip("ALL", "Tous", total)}
    </>
  );
}

export function countVerdicts(rows: { verdict: Verdict }[]): Record<Verdict, number> {
  const c: Record<Verdict, number> = { BUY: 0, CONSIDER: 0, AVOID: 0, INCOMPLETE: 0 };
  for (const r of rows) c[r.verdict]++;
  return c;
}
