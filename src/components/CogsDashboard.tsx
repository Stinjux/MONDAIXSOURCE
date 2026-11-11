"use client";
// Tableau de bord COGS : achats réels par semaine, mois ou année, comparés à la période précédente,
// avec le détail par produit et par fournisseur de la période choisie.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import type { CogsLine } from "@/lib/cogs";
import { GRANULARITY_LABELS, PERIOD_COUNT, change, cogsByPeriod, periodBreakdown, periodKey, periodKeys, periodLabel, shiftPeriod, type Granularity } from "@/lib/cogsPeriods";
import { cad, pct } from "@/lib/format";
import { CogsBarChart } from "./charts";
import { ProductImage } from "./ProductImage";
import { Card, cn } from "./ui";

const KEY = "mondaix.cogs.granularity";

export function CogsDashboard({ lines, now }: { lines: CogsLine[]; now: string }) {
  const [g, setG] = useState<Granularity>("month");
  const current = periodKey(new Date(now), g);
  // La période choisie est liée à sa vue : en changeant de vue, on revient à la période courante
  const [picked, setPicked] = useState<{ g: Granularity; key: string } | null>(null);
  const selected = picked?.g === g ? picked.key : current;
  const setSelected = (next: string | ((s: string) => string)) => setPicked({ g, key: typeof next === "function" ? next(selected) : next });
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "week" || v === "month" || v === "year") setG(v);
    } catch {
      /* préférence non disponible */
    }
  }, []);
  const choose = (v: Granularity) => {
    setG(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* préférence non conservée */
    }
  };

  // Le graphique se termine par la période courante ; il suit la période choisie si elle est plus ancienne
  const recent = periodKeys(current, g, PERIOD_COUNT[g]);
  const later = shiftPeriod(selected, g, Math.floor(PERIOD_COUNT[g] / 2));
  const end = recent.includes(selected) ? current : later < current ? later : current;
  const periods = useMemo(() => cogsByPeriod(lines, g, periodKeys(end, g, PERIOD_COUNT[g])), [lines, g, end]);
  const [cur, prev] = useMemo(() => cogsByPeriod(lines, g, [selected, shiftPeriod(selected, g, -1)]), [lines, g, selected]);
  const detail = useMemo(() => periodBreakdown(lines, g, selected), [lines, g, selected]);
  // Cumul de l'année civile en cours (repère fixe, quelle que soit la vue)
  const year = periodKey(new Date(now), "year");
  const [ytd] = useMemo(() => cogsByPeriod(lines, "year", [year]), [lines, year]);
  const delta = change(cur.cost, prev.cost);
  const prevPhrase = g === "week" ? "la semaine précédente" : g === "month" ? "le mois précédent" : "l'année précédente";
  const maxProduct = Math.max(1, ...detail.products.map((p) => p.cost));
  const maxSupplier = Math.max(1, ...detail.suppliers.map((s) => s.cost));

  return (
    <section className="flex flex-col gap-4" aria-label="Tableau de bord COGS">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-line bg-surface p-1" role="radiogroup" aria-label="Période">
          {(["week", "month", "year"] as Granularity[]).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={g === v}
              onClick={() => choose(v)}
              className={cn("rounded-sm px-3 py-1.5 text-sm font-medium transition", g === v ? "bg-accent text-white" : "text-ink-2 hover:text-ink")}
            >
              {v === "week" ? "Hebdomadaire" : v === "month" ? "Mensuel" : "Annuel"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className="btn-ghost px-2" aria-label={`${GRANULARITY_LABELS[g]} précédente`} onClick={() => setSelected((s) => shiftPeriod(s, g, -1))}>
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-36 text-center text-sm font-semibold text-ink">{periodLabel(selected, g, true)}</span>
          <button type="button" className="btn-ghost px-2" aria-label={`${GRANULARITY_LABELS[g]} suivante`} disabled={selected >= current} onClick={() => setSelected((s) => shiftPeriod(s, g, 1))}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          label={`COGS · ${periodLabel(selected, g, true)}`}
          value={cad(cur.cost)}
          hint={
            delta == null ? (
              `aucun achat ${prevPhrase}`
            ) : (
              <span className="inline-flex items-center gap-1 text-ink-2">
                {delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {delta > 0 ? "+" : ""}
                {pct(delta, 0)} vs {prevPhrase.replace(/^(la|le|l') ?/, "")} ({cad(prev.cost)})
              </span>
            )
          }
          strong
        />
        <Tile label="Unités achetées" value={cur.units.toLocaleString("fr-CA")} hint={`${cur.products} produit${cur.products > 1 ? "s" : ""} · ${cur.orders} commande${cur.orders > 1 ? "s" : ""}`} />
        <Tile label="Coût moyen par unité" value={cad(cur.avgUnitCost)} hint={prev.avgUnitCost != null ? `${cad(prev.avgUnitCost)} ${prevPhrase}` : "—"} />
        <Tile label={`Cumul ${year}`} value={cad(ytd.cost)} hint={`${ytd.units.toLocaleString("fr-CA")} unités depuis le 1er janvier`} />
      </div>

      <Card title={`COGS par ${g === "week" ? "semaine" : g === "month" ? "mois" : "année"}`} action={<span className="text-[11px] text-ink-3">Cliquez sur une barre pour voir sa période</span>}>
        <CogsBarChart data={periods.map((p) => ({ key: p.key, label: p.label, value: p.cost }))} selected={selected} onSelect={setSelected} />
        <div className="mt-2 overflow-x-auto">
          <table className="table-base text-xs">
            <thead>
              <tr>
                <th>Période</th>
                {periods.map((p) => (
                  <th key={p.key} className={cn("text-right", p.key === selected && "text-accent")}>
                    <button type="button" onClick={() => setSelected(p.key)} className="uppercase hover:text-ink">
                      {p.label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-medium text-ink-2">COGS</td>
                {periods.map((p) => (
                  <td key={p.key} className={cn("text-right tabular-nums", p.key === selected && "bg-accent-soft font-semibold")}>
                    {p.cost ? cad(p.cost) : "—"}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="font-medium text-ink-2">Unités</td>
                {periods.map((p) => (
                  <td key={p.key} className={cn("text-right tabular-nums", p.key === selected && "bg-accent-soft font-semibold")}>
                    {p.units || "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Produits · ${periodLabel(selected, g, true)}`} padded={false}>
          {detail.products.length ? (
            <ul className="py-1.5">
              {detail.products.slice(0, 8).map((p) => (
                <li key={p.key}>
                  <Link href={`/cogs/${p.key}`} className="flex items-center gap-3 px-4 py-2 transition hover:bg-surface-2">
                    <ProductImage asin={p.key} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{p.name}</span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-[2px] bg-surface-3">
                        <span className="block h-full rounded-[2px] bg-[#1c5cab]" style={{ width: `${(p.cost / maxProduct) * 100}%` }} />
                      </span>
                    </span>
                    <span className="w-24 shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums text-ink">{cad(p.cost)}</span>
                      <span className="block text-[11px] text-ink-3 tabular-nums">{p.units} u.</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-ink-3">Aucun achat sur cette période.</p>
          )}
        </Card>
        <Card title={`Fournisseurs · ${periodLabel(selected, g, true)}`} padded={false}>
          {detail.suppliers.length ? (
            <ul className="py-1.5">
              {detail.suppliers.slice(0, 8).map((s) => (
                <li key={s.key} className="flex items-center gap-3 px-4 py-2">
                  <span className="w-36 shrink-0 truncate text-sm text-ink" title={s.name}>
                    {s.name}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-[2px] bg-surface-3" aria-hidden>
                    <span className="block h-full rounded-[2px] bg-[#1c5cab]" style={{ width: `${(s.cost / maxSupplier) * 100}%` }} />
                  </span>
                  <span className="w-28 shrink-0 text-right text-sm tabular-nums">
                    <b className="text-ink">{cad(s.cost)}</b>
                    <span className="block text-[11px] text-ink-3">{cur.cost ? pct((s.cost / cur.cost) * 100, 0) : "—"} du total</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-ink-3">Aucun achat sur cette période.</p>
          )}
        </Card>
      </div>
    </section>
  );
}

function Tile({ label, value, hint, strong }: { label: string; value: React.ReactNode; hint?: React.ReactNode; strong?: boolean }) {
  return (
    <div className={cn("rounded-md border border-line border-t-2 bg-surface p-4", strong ? "border-t-accent" : "border-t-line-strong")}>
      <div className="text-[11px] font-semibold tracking-[0.08em] text-ink-2 uppercase">{label}</div>
      <div className="mt-2 font-serif text-[26px] leading-tight font-semibold text-ink tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}
