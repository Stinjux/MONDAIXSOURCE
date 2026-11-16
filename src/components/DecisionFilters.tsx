"use client";
// Panneau de filtres partagé par « Buy Decisions », le Pipeline et le Mode décision.
// Les réglages sont mémorisés dans ce navigateur, synchronisés entre les pages et les onglets ouverts,
// et enregistrés en base pour être retrouvés sur tous vos appareils.
import { useCallback, useEffect, useState } from "react";
import { Filter, RotateCcw, X } from "lucide-react";
import { DEFAULT_THRESHOLDS, VERDICT_LABELS, type Thresholds, type Verdict } from "@/lib/decision";
import { DEFAULT_FILTERS, PERIODS, STRATEGIES, hasRangeFilters, parseFilters, type DecisionFilters, type Period, type VerdictFilter } from "@/lib/decisionFilters";
import { amount } from "@/lib/normalize";
import { PREFS_STORAGE_KEY } from "@/lib/prefsBoot";
import { cn } from "./ui";

const STORAGE_KEY = PREFS_STORAGE_KEY;
const EVENT = "mondaix:decision-filters";

export function readSaved(): Record<string, unknown> {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Écrit seulement les champs fournis (n'efface pas budget / quantités / autres filtres), puis les envoie à la base. */
export function writeSaved(patch: Record<string, unknown>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readSaved(), ...patch, updatedAt: Date.now() }));
    window.dispatchEvent(new Event(EVENT));
    schedulePush();
  } catch {
    /* stockage indisponible : réglages non conservés */
  }
}

// Envoi à la base (réglages partagés entre appareils), regroupé après une courte pause
let pushTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(pushSaved, 800);
}
export function pushSaved() {
  pushTimer = null;
  fetch("/api/prefs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: readSaved() }), keepalive: true }).catch(() => {
    /* hors ligne : la version du navigateur sera envoyée à la prochaine ouverture */
  });
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
      next.weekOnly = next.period === "week"; // ancien réglage, gardé cohérent
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
      <div className="rounded-md border border-line bg-surface p-3">
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
                "rounded-sm border px-3 py-2 text-left transition",
                filters.strategy === s.key ? "border-accent/60 bg-accent/10" : "border-line bg-surface-2/50 hover:border-line-strong",
              )}
            >
              <div className={cn("text-sm font-medium", filters.strategy === s.key ? "text-ink" : "text-ink-2")}>{s.label}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-ink-3">{s.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-line bg-surface p-3">
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
            <input type="checkbox" className="accent-accent" checked={filters.period === "week"} onChange={(e) => update({ period: e.target.checked ? "week" : "all" })} /> Leads de cette semaine seulement
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="accent-accent" checked={filters.includeUnavailable} onChange={(e) => update({ includeUnavailable: e.target.checked })} /> Inclure les ruptures
          </label>
          {extraToggle && (
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" className="accent-accent" checked={extraToggle.checked} onChange={(e) => extraToggle.onChange(e.target.checked)} /> {extraToggle.label}
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

/** Champ numérique libre : appliqué dès qu'il est lisible, vide = sans limite. */
function NumField({ value, onChange, unit, label, placeholder = "—", width = "w-16" }: { value: number | null; onChange: (v: number | null) => void; unit: string; label: string; placeholder?: string; width?: string }) {
  const [text, setText] = useState(value == null ? "" : String(value).replace(".", ","));
  useEffect(() => {
    setText((t) => {
      const cur = t.trim() ? amount(t) : null;
      return cur === value ? t : value == null ? "" : String(value).replace(".", ",");
    });
  }, [value]);
  return (
    <span className="relative">
      <input
        className={cn("field py-1 pr-6 text-right text-sm tabular-nums", width, value != null && "border-accent/60 bg-accent/5")}
        inputMode="decimal"
        placeholder={placeholder}
        aria-label={label}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (!e.target.value.trim()) return onChange(null);
          const v = amount(e.target.value);
          if (v !== undefined && v >= 0) onChange(v);
        }}
      />
      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-ink-3">{unit}</span>
    </span>
  );
}

/**
 * Barre « Afficher seulement », toujours visible dans Buy Decisions (Un par un, Liste, Carte) :
 * période de découverte, ROI min / max, ventes minimum, coût maximum. Ces filtres réduisent la file
 * sans changer l'avis de chaque lead (vos critères d'achat restent dans « Classement et critères »).
 */
export function QuickFilters({ filters, update, count }: { filters: DecisionFilters; update: (patch: Partial<DecisionFilters>) => void; count?: number }) {
  const active = hasRangeFilters(filters);
  const label = "text-[11px] font-semibold tracking-[0.06em] text-ink-2 uppercase";
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border bg-surface px-3 py-2", active ? "border-accent/40" : "border-line")} role="group" aria-label="Afficher seulement">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
        <Filter size={14} className={active ? "text-accent" : "text-ink-3"} /> Afficher seulement
      </span>
      <label className="flex items-center gap-1.5">
        <span className={label}>Période</span>
        <select className={cn("field w-auto py-1 text-sm", filters.period !== "all" && "border-accent/60 bg-accent/5")} value={filters.period} onChange={(e) => update({ period: e.target.value as Period })}>
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <span className="flex items-center gap-1.5">
        <span className={label}>ROI</span>
        <NumField label="Afficher à partir de ce ROI" placeholder="min" unit="%" value={filters.roiMin} onChange={(v) => update({ roiMin: v })} />
        <span className="text-xs text-ink-3">à</span>
        <NumField label="Afficher jusqu'à ce ROI" placeholder="max" unit="%" value={filters.roiMax} onChange={(v) => update({ roiMax: v })} />
      </span>
      <span className="flex items-center gap-1.5">
        <span className={label}>Ventes / mois ≥</span>
        <NumField label="Afficher à partir de ces ventes par mois" unit="u." value={filters.salesMin} onChange={(v) => update({ salesMin: v })} />
      </span>
      <span className="flex items-center gap-1.5">
        <span className={label}>Coût / u. ≤</span>
        <NumField label="Afficher jusqu'à ce coût par unité" unit="$" value={filters.costMax} onChange={(v) => update({ costMax: v })} />
      </span>
      <span className="ml-auto flex items-center gap-3 text-xs">
        {count != null && (
          <span className="text-ink-3 tabular-nums">
            {count} lead{count > 1 ? "s" : ""}
          </span>
        )}
        {active && (
          <button type="button" className="flex items-center gap-1 text-accent hover:underline" onClick={() => update({ period: "all", roiMin: null, roiMax: null, salesMin: null, costMax: null })}>
            <X size={12} /> Tout afficher
          </button>
        )}
      </span>
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
