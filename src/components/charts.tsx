"use client";
// Graphiques interactifs (Recharts). Couleurs validées pour la surface sombre (CVD) ;
// les valeurs et libellés utilisent les couleurs de texte, jamais celles des séries.
import { Bar, BarChart, CartesianGrid, Cell, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const C = {
  s1: "#3987e5",
  s2: "#d95926",
  s3: "#199e70",
  neutral: "#4b5563",
  grid: "#243046",
  axis: "#74819a",
  ink: "#e8edf5",
  ink2: "#a3afc2",
  surface: "#111827",
};

const axisProps = { stroke: C.axis, tick: { fill: C.axis, fontSize: 11 }, tickLine: false, axisLine: { stroke: C.grid } } as const;

type TipProps = { active?: boolean; label?: string | number; payload?: readonly { dataKey?: unknown; name?: unknown; value?: unknown; color?: string }[]; unit?: string };

function TooltipBox({ active, payload, label, unit }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line-strong bg-[#0c1220] px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-medium text-ink">{label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 text-ink-2">
          <span className="size-2 rounded-sm" style={{ background: p.color }} />
          <span className="flex-1">{String(p.name)}</span>
          <span className="font-medium text-ink tabular-nums">
            {String(p.value)}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

export type WeeklyPoint = { label: string; found: number; validated: number; rejected: number; followUp: number; pending: number };

/** Leads uniques par semaine vs objectif (une série + ligne de référence). */
export function WeeklyLeadsChart({ data, goal, height = 260 }: { data: WeeklyPoint[]; goal: number; height?: number }) {
  const max = Math.max(goal, ...data.map((d) => d.found));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 16, right: 8, left: -18, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 4" />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} allowDecimals={false} domain={[0, Math.ceil(max * 1.1)]} />
        <Tooltip cursor={{ fill: "#ffffff0a" }} content={(p) => <TooltipBox active={p.active} label={p.label} payload={p.payload} />} />
        <ReferenceLine y={goal} stroke={C.ink2} strokeDasharray="5 4" label={{ value: `Objectif ${goal}`, position: "insideTopRight", fill: C.ink2, fontSize: 11 }} />
        <Bar dataKey="found" name="Leads uniques" radius={[4, 4, 0, 0]} maxBarSize={40}>
          {data.map((d, i) => (
            <Cell key={i} fill={C.s1} fillOpacity={d.found >= goal ? 1 : 0.75} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Décisions de revue par semaine (barres empilées, séparées par la surface). */
export function ReviewOutcomeChart({ data, height = 260 }: { data: WeeklyPoint[]; height?: number }) {
  const series = [
    { key: "validated", name: "Validés", color: C.s3 },
    { key: "followUp", name: "À suivre", color: C.s1 },
    { key: "rejected", name: "Rejetés", color: C.s2 },
    { key: "pending", name: "Non revus", color: C.neutral },
  ];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 4" />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} allowDecimals={false} />
        <Tooltip cursor={{ fill: "#ffffff0a" }} content={(p) => <TooltipBox active={p.active} label={p.label} payload={p.payload} />} />
        <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 12, color: C.ink2, paddingTop: 8 }} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} stackId="r" fill={s.color} stroke={C.surface} strokeWidth={1} radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={40} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Barres simples (jour de la semaine, distribution du ROI…). */
export function SimpleBarChart({ data, name, unit, height = 220 }: { data: { label: string; value: number }[]; name: string; unit?: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 4" />
        <XAxis dataKey="label" {...axisProps} interval={0} />
        <YAxis {...axisProps} allowDecimals={false} />
        <Tooltip cursor={{ fill: "#ffffff0a" }} content={(p) => <TooltipBox active={p.active} label={p.label} payload={p.payload} unit={unit} />} />
        <Bar dataKey="value" name={name} fill={C.s1} radius={[4, 4, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}
