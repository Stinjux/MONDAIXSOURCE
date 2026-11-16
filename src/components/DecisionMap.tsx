"use client";
// Buy Decisions, vue « Carte » : chaque lead est une bulle. Axes X / Y et taille au choix
// (ROI, ventes mensuelles, marge, coût unitaire, profit…), couleur ET forme selon l'avis
// (la couleur ne porte jamais le sens seule), lignes de vos critères minimum, clic = fiche du lead.
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { ExternalLink, Maximize2, ShoppingCart, SquareStack, X } from "lucide-react";
import { VERDICT_LABELS, type Verdict } from "@/lib/decision";
import { evaluateRow, inScope, matchesVerdict, type DecisionFilters } from "@/lib/decisionFilters";
import { DEFAULT_MAP, MAP_METRICS, MAP_METRIC_KEYS, MAP_PERIODS, mapPoints, niceDomain, parseMapConfig, type MapConfig, type MapMetric, type MapPeriod, type MapPoint } from "@/lib/decisionMap";
import { weekKey } from "@/lib/dates";
import { amount } from "@/lib/normalize";
import type { DecisionRow } from "@/lib/decisionRows";
import { readSaved, writeSaved } from "./DecisionFilters";
import { ProductImage } from "./ProductImage";
import { Badge, Supplier, cn } from "./ui";

const VERDICTS: Verdict[] = ["BUY", "CONSIDER", "AVOID", "INCOMPLETE"];
// Couleurs de statut de l'app + une forme par avis (cercle, losange, triangle, anneau)
const STYLE: Record<Verdict, { color: string; tone: "good" | "warning" | "critical" | "neutral" }> = {
  BUY: { color: "#1b7a3d", tone: "good" },
  CONSIDER: { color: "#9a6700", tone: "warning" },
  AVOID: { color: "#b42318", tone: "critical" },
  INCOMPLETE: { color: "#66748a", tone: "neutral" },
};
/** « Ventes mensuelles » → « ventes mensuelles », mais « ROI » reste « ROI ». */
const lower = (s: string) => (/^[A-Z]{2,}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const GRID = "#e3e8ee";
const AXIS = "#66748a";
const ACCENT = "#0b3d91";

/** Marque d'un avis, centrée en (cx, cy), rayon r. */
function Mark({ verdict, cx, cy, r, selected }: { verdict: Verdict; cx: number; cy: number; r: number; selected?: boolean }) {
  const { color } = STYLE[verdict];
  const common = { fill: color, fillOpacity: 0.78, stroke: "#ffffff", strokeWidth: 2 };
  const ring = selected ? <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke={ACCENT} strokeWidth={2.5} /> : null;
  if (verdict === "CONSIDER") {
    const d = r * 1.25;
    return (
      <g>
        {ring}
        <polygon points={`${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`} {...common} />
      </g>
    );
  }
  if (verdict === "AVOID") {
    const d = r * 1.3;
    return (
      <g>
        {ring}
        <polygon points={`${cx - d},${cy - d * 0.75} ${cx + d},${cy - d * 0.75} ${cx},${cy + d}`} {...common} />
      </g>
    );
  }
  if (verdict === "INCOMPLETE") {
    return (
      <g>
        {ring}
        <circle cx={cx} cy={cy} r={r} fill="#ffffff" fillOpacity={0.9} stroke={color} strokeWidth={2.5} />
      </g>
    );
  }
  return (
    <g>
      {ring}
      <circle cx={cx} cy={cy} r={r} {...common} />
    </g>
  );
}

function LegendMark({ verdict }: { verdict: Verdict }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden>
      <Mark verdict={verdict} cx={8} cy={8} r={5} />
    </svg>
  );
}

const tick = (m: MapMetric) => (v: number) => {
  if (m === "roi" || m === "margin") return `${Math.round(v)} %`;
  if (m === "estimatedSales" || m === "score") return Math.round(v).toLocaleString("fr-CA");
  return `${Math.round(v).toLocaleString("fr-CA")} $`;
};

function MetricSelect({ label, value, onChange, allowNone }: { label: string; value: MapMetric | "none"; onChange: (v: MapMetric | "none") => void; allowNone?: boolean }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-ink-2">
      <span className="font-semibold tracking-[0.06em] uppercase">{label}</span>
      <select className="field w-auto py-1 text-sm" value={value} onChange={(e) => onChange(e.target.value as MapMetric | "none")}>
        {allowNone && <option value="none">Même taille</option>}
        {MAP_METRIC_KEYS.map((k) => (
          <option key={k} value={k}>
            {MAP_METRICS[k].label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DecisionMap({
  rows, filters, currentWeek, cart, onOpen, onAdd,
}: {
  rows: DecisionRow[];
  filters: DecisionFilters;
  currentWeek: string;
  cart: Record<string, { qty: number }>;
  onOpen: (asin: string) => void;
  onAdd: (productId: string) => void;
}) {
  const [config, setConfig] = useState<MapConfig>(DEFAULT_MAP);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<Verdict>>(new Set());
  useEffect(() => setConfig(parseMapConfig(readSaved().map)), []);
  const set = (patch: Partial<MapConfig>) =>
    setConfig((c) => {
      const next = { ...c, ...patch };
      writeSaved({ map: next });
      return next;
    });

  const t = filters.thresholds;
  const pool = useMemo(
    () =>
      rows
        .map((r) => ({ ...evaluateRow(r, t), week: r.goalWeek ?? weekKey(new Date(r.firstSeenAt)) }))
        .filter((r) => r.reviewStatus !== "REJECTED" && inScope(r, filters, currentWeek) && matchesVerdict(r.verdict, filters.verdict)),
    [rows, t, filters, currentWeek],
  );
  const { points, missing, trimmed, outOfPeriod, aboveRoiMax } = useMemo(() => mapPoints(pool, config, currentWeek), [pool, config, currentWeek]);
  // Champ ROI max saisi librement, appliqué dès qu'il est lisible (vide = pas de limite)
  const [roiMaxText, setRoiMaxText] = useState("");
  useEffect(() => setRoiMaxText(config.roiMax == null ? "" : String(config.roiMax)), [config.roiMax]);
  const visible = points.filter((p) => !hidden.has(p.row.verdict));
  const maxZ = Math.max(0, ...visible.map((p) => p.z));
  const radius = (p: MapPoint) => (config.size === "none" || maxZ <= 0 ? 7 : 5 + Math.sqrt(p.z / maxZ) * 17);
  const counts = Object.fromEntries(VERDICTS.map((v) => [v, points.filter((p) => p.row.verdict === v).length])) as Record<Verdict, number>;
  const selected = pool.find((r) => r.productId === selectedId) ?? null;

  const mx = MAP_METRICS[config.x];
  const my = MAP_METRICS[config.y];
  const tx = mx.threshold?.(t);
  const ty = my.threshold?.(t);
  const dx = niceDomain([...visible.map((p) => p.x), ...(tx != null ? [tx] : [])]);
  const dy = niceDomain([...visible.map((p) => p.y), ...(ty != null ? [ty] : [])]);
  const ticksOf = (d: { min: number; max: number; step: number }) => Array.from({ length: Math.round((d.max - d.min) / d.step) + 1 }, (_, i) => d.min + i * d.step);

  return (
    <div className="flex flex-col gap-3">
      {/* Paramètres */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-line bg-surface px-3 py-2.5">
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          <span className="font-semibold tracking-[0.06em] uppercase">Période</span>
          <select className="field w-auto py-1 text-sm" value={config.period} onChange={(e) => set({ period: e.target.value as MapPeriod })}>
            {MAP_PERIODS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-2" title="Les leads au ROI plus élevé ne sont pas placés : ils écrasent l'échelle de la carte">
          <span className="font-semibold tracking-[0.06em] uppercase">ROI max</span>
          <span className="relative">
            <input
              className="field w-20 py-1 pr-6 text-right text-sm tabular-nums"
              inputMode="decimal"
              placeholder="aucun"
              value={roiMaxText}
              onChange={(e) => {
                setRoiMaxText(e.target.value);
                const v = e.target.value.trim() ? amount(e.target.value) : null;
                if (v === null || (v !== undefined && v > 0)) set({ roiMax: v ?? null });
              }}
              aria-label="ROI maximum affiché"
            />
            <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-ink-3">%</span>
          </span>
        </label>
        <MetricSelect label="Axe vertical" value={config.y} onChange={(v) => set({ y: v as MapMetric })} />
        <MetricSelect label="Axe horizontal" value={config.x} onChange={(v) => set({ x: v as MapMetric })} />
        <MetricSelect label="Taille" value={config.size} onChange={(v) => set({ size: v })} allowNone />
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-2" title="Masque les 3 % de leads les plus hauts et les plus bas sur chaque axe, pour mieux lire le gros du nuage">
          <input type="checkbox" className="accent-accent" checked={config.trim} onChange={(e) => set({ trim: e.target.checked })} />
          <Maximize2 size={13} /> Ignorer les valeurs extrêmes
        </label>
        <button type="button" className="ml-auto text-xs text-ink-3 hover:text-ink hover:underline" onClick={() => set(DEFAULT_MAP)}>
          Réglages par défaut
        </button>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-md border border-line bg-surface p-3" aria-label="Carte des leads">
          {/* Légende : forme + couleur + nom, cliquable pour masquer un avis */}
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {VERDICTS.map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={!hidden.has(v)}
                onClick={() => setHidden((h) => (h.has(v) ? new Set([...h].filter((x) => x !== v)) : new Set([...h, v])))}
                className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition", hidden.has(v) ? "border-line text-ink-3 line-through opacity-60" : "border-line-strong text-ink")}
                title={hidden.has(v) ? "Afficher" : "Masquer"}
              >
                <LegendMark verdict={v} /> {VERDICT_LABELS[v]} <span className="text-ink-3 tabular-nums">{counts[v]}</span>
              </button>
            ))}
            <span className="ml-auto text-[11px] text-ink-3">
              {config.size !== "none" && <>Taille = {lower(MAP_METRICS[config.size].label)} · </>}
              Cliquez sur une bulle
            </span>
          </div>

          {visible.length === 0 ? (
            <p className="py-16 text-center text-sm text-ink-3">Aucun lead à placer avec ces filtres et ces axes.</p>
          ) : (
            <ResponsiveContainer width="100%" height={460}>
              <ScatterChart margin={{ top: 16, right: 16, bottom: 28, left: 8 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 4" />
                {/* Zone où les deux critères minimum sont atteints */}
                {tx != null && ty != null && <ReferenceArea x1={tx} x2={dx.max} y1={ty} y2={dy.max} fill="#1b7a3d" fillOpacity={0.06} stroke="none" />}
                <XAxis
                  type="number"
                  dataKey="x"
                  name={mx.label}
                  domain={[dx.min, dx.max]}
                  ticks={ticksOf(dx)}
                  tickFormatter={tick(config.x)}
                  stroke={AXIS}
                  tick={{ fill: AXIS, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                  label={{ value: mx.label, position: "insideBottom", offset: -16, fill: "#46566c", fontSize: 12 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name={my.label}
                  domain={[dy.min, dy.max]}
                  ticks={ticksOf(dy)}
                  tickFormatter={tick(config.y)}
                  stroke={AXIS}
                  tick={{ fill: AXIS, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                  width={64}
                  label={{ value: my.label, angle: -90, position: "insideLeft", offset: 10, fill: "#46566c", fontSize: 12, style: { textAnchor: "middle" } }}
                />
                {tx != null && (
                  <ReferenceLine x={tx} stroke={AXIS} strokeDasharray="5 4" label={{ value: `min ${mx.format(tx)}`, position: "top", fill: AXIS, fontSize: 11 }} />
                )}
                {ty != null && (
                  <ReferenceLine y={ty} stroke={AXIS} strokeDasharray="5 4" label={{ value: `min ${my.format(ty)}`, position: "insideTopRight", fill: AXIS, fontSize: 11 }} />
                )}
                <Tooltip
                  cursor={{ strokeDasharray: "3 3", stroke: AXIS }}
                  content={(p) => {
                    const pt = p.active ? (p.payload?.[0]?.payload as MapPoint | undefined) : undefined;
                    if (!pt) return null;
                    const r = pt.row;
                    return (
                      <div className="max-w-64 rounded-sm border border-line-strong bg-surface px-3 py-2 text-xs shadow-lg">
                        <div className="mb-1 flex items-center gap-1.5 font-medium text-ink">
                          <LegendMark verdict={r.verdict} /> <span className="truncate">{r.name}</span>
                        </div>
                        <div className="mb-1 text-ink-3">{VERDICT_LABELS[r.verdict]}</div>
                        {[config.y, config.x, ...(config.size !== "none" && config.size !== config.x && config.size !== config.y ? [config.size] : [])].map((m) => (
                          <div key={m} className="flex justify-between gap-4 text-ink-2">
                            {MAP_METRICS[m].label} <b className="text-ink tabular-nums">{MAP_METRICS[m].format(r[m])}</b>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                {VERDICTS.filter((v) => !hidden.has(v)).map((v) => (
                  <Scatter
                    key={v}
                    name={VERDICT_LABELS[v]}
                    data={visible.filter((p) => p.row.verdict === v)}
                    isAnimationActive={false}
                    cursor="pointer"
                    onClick={(d: unknown) => {
                      const pt = ((d as { payload?: MapPoint })?.payload ?? d) as MapPoint | undefined;
                      if (pt?.row) setSelectedId(pt.row.productId);
                    }}
                    shape={(props: unknown) => {
                      const { cx, cy, payload } = props as { cx: number; cy: number; payload: MapPoint };
                      return <Mark verdict={v} cx={cx} cy={cy} r={radius(payload)} selected={payload.row.productId === selectedId} />;
                    }}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          )}
          <p className="mt-1 text-[11px] text-ink-3">
            {visible.length} lead{visible.length > 1 ? "s" : ""} sur la carte
            {config.period !== "all" && ` (${MAP_PERIODS.find((p) => p.key === config.period)!.label.toLowerCase()}, ${outOfPeriod} plus ancien${outOfPeriod > 1 ? "s" : ""} non affiché${outOfPeriod > 1 ? "s" : ""})`}
            {aboveRoiMax > 0 && ` · ${aboveRoiMax} au-dessus de ${config.roiMax} % de ROI masqué${aboveRoiMax > 1 ? "s" : ""}`}
            {missing > 0 && ` · ${missing} sans ${[mx, my].map((m) => lower(m.label)).join(" ou ")}, non placé${missing > 1 ? "s" : ""}`}
            {trimmed > 0 && ` · ${trimmed} valeur${trimmed > 1 ? "s" : ""} extrême${trimmed > 1 ? "s" : ""} masquée${trimmed > 1 ? "s" : ""}`}
            {tx != null && ty != null && " · zone verte : vos deux critères minimum atteints"}. Filtres et critères : bouton « Classement et critères ».
          </p>
        </section>

        {/* Lead choisi */}
        <aside className="rounded-md border border-line bg-surface p-4 lg:sticky lg:top-4" aria-label="Lead choisi">
          {selected ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <ProductImage asin={selected.asin} size={56} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold text-ink" title={selected.name}>
                    {selected.name}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-3">{selected.asin}</p>
                </div>
                <button type="button" className="text-ink-3 hover:text-ink" aria-label="Fermer" onClick={() => setSelectedId(null)}>
                  <X size={16} />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={STYLE[selected.verdict].tone}>{VERDICT_LABELS[selected.verdict]}</Badge>
                {selected.supplierName && <Supplier name={selected.supplierName} url={selected.supplierUrl} product={selected.name} />}
              </div>
              {selected.reasons.length > 0 && <p className="text-[11px] text-ink-3">{selected.reasons.join(" · ")}</p>}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-3">
                {MAP_METRIC_KEYS.map((m) => (
                  <div key={m} className={cn(m === config.x || m === config.y ? "text-ink" : "text-ink-2")}>
                    <dt className="text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{MAP_METRICS[m].short}</dt>
                    <dd className={cn("text-sm tabular-nums", (m === config.x || m === config.y) && "font-semibold")}>{MAP_METRICS[m].format(selected[m])}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                <button type="button" className="btn-primary" onClick={() => onOpen(selected.asin)}>
                  <SquareStack size={15} /> Décider
                </button>
                <button type="button" className="btn-ghost" onClick={() => onAdd(selected.productId)}>
                  <ShoppingCart size={15} /> {cart[selected.productId] ? `Panier (${cart[selected.productId].qty}) +1` : "Ajouter au panier"}
                </button>
                <a href={`/leads/${selected.asin}`} className="btn-ghost px-2" title="Fiche du lead" aria-label="Fiche du lead">
                  <ExternalLink size={15} />
                </a>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-ink-3">
              <p className="font-medium text-ink-2">Cliquez sur une bulle</p>
              <p className="mt-1 text-xs">pour voir le lead, l&apos;ajouter au panier ou ouvrir sa décision.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
