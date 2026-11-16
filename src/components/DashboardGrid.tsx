"use client";
// Tableau de bord modulaire : chaque module peut être déplacé (glisser-déposer), redimensionné
// ou masqué. La disposition est gardée dans ce navigateur.
import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, GripVertical, LayoutGrid, Plus, RotateCcw } from "lucide-react";
import { cn } from "./ui";

export type WidgetSize = "s" | "m" | "l" | "f";
export type Widget = { id: string; title: string; size: WidgetSize; node: React.ReactNode };
type Layout = { order: string[]; hidden: string[]; sizes: Record<string, WidgetSize> };

const KEY = "mondaix.dashboard.v1";
const SPAN: Record<WidgetSize, string> = {
  s: "md:col-span-1 lg:col-span-4",
  m: "md:col-span-1 lg:col-span-6",
  l: "md:col-span-2 lg:col-span-8",
  f: "md:col-span-2 lg:col-span-12",
};
const SIZE_LABEL: Record<WidgetSize, string> = { s: "⅓", m: "½", l: "⅔", f: "Plein" };

function readLayout(): Layout | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!s || !Array.isArray(s.order)) return null;
    return { order: s.order.filter((x: unknown) => typeof x === "string"), hidden: Array.isArray(s.hidden) ? s.hidden : [], sizes: s.sizes && typeof s.sizes === "object" ? s.sizes : {} };
  } catch {
    return null;
  }
}

export function DashboardGrid({ widgets }: { widgets: Widget[] }) {
  const defaults = useMemo<Layout>(() => ({ order: widgets.map((w) => w.id), hidden: [], sizes: {} }), [widgets]);
  const [layout, setLayout] = useState<Layout>(defaults);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  useEffect(() => {
    const saved = readLayout();
    if (saved) setLayout(saved);
  }, []);
  const save = (next: Layout) => {
    setLayout(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* stockage indisponible : disposition valable pour cette visite */
    }
  };

  // Modules connus, dans l'ordre choisi ; un module ajouté plus tard apparaît à la fin
  const byId = new Map(widgets.map((w) => [w.id, w]));
  const ordered = [...layout.order.filter((id) => byId.has(id)), ...widgets.map((w) => w.id).filter((id) => !layout.order.includes(id))].map((id) => byId.get(id)!);
  const visible = ordered.filter((w) => !layout.hidden.includes(w.id));
  const hidden = ordered.filter((w) => layout.hidden.includes(w.id));
  const sizeOf = (w: Widget) => layout.sizes[w.id] ?? w.size;

  const move = (from: string, to: string) => {
    if (from === to) return;
    const ids = ordered.map((w) => w.id).filter((id) => id !== from);
    ids.splice(ids.indexOf(to), 0, from);
    save({ ...layout, order: ids });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {editing && (
          <>
            {hidden.map((w) => (
              <button key={w.id} type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => save({ ...layout, hidden: layout.hidden.filter((h) => h !== w.id) })}>
                <Plus size={12} /> {w.title}
              </button>
            ))}
            <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => save(defaults)}>
              <RotateCcw size={12} /> Disposition par défaut
            </button>
          </>
        )}
        <button type="button" className={cn(editing ? "btn-primary" : "btn-ghost", "px-3 py-1.5 text-xs")} onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
          <LayoutGrid size={13} /> {editing ? "Terminer" : "Personnaliser"}
        </button>
      </div>
      {editing && (
        <p className="rounded-sm border border-dashed border-accent/40 bg-accent-soft px-3 py-2 text-xs text-ink-2">
          Glissez un module par sa poignée pour le déplacer, choisissez sa largeur ou masquez-le. Les modules masqués se rajoutent avec les boutons « + ». La disposition est gardée dans ce navigateur.
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:grid-cols-12">
        {visible.map((w) => (
          <div
            key={w.id}
            className={cn(
              "relative min-w-0",
              SPAN[sizeOf(w)],
              editing && "rounded-md outline-2 outline-offset-2 outline-dashed outline-line-strong",
              editing && over === w.id && dragging !== w.id && "outline-accent",
              dragging === w.id && "opacity-50",
            )}
            draggable={editing}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", w.id);
              setDragging(w.id);
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            onDragOver={(e) => {
              if (!editing || !dragging) return;
              e.preventDefault();
              setOver(w.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = e.dataTransfer.getData("text/plain");
              if (from) move(from, w.id);
              setOver(null);
            }}
          >
            {editing && (
              <div className="absolute -top-3 right-3 left-3 z-10 flex items-center justify-between gap-2">
                <span className="flex cursor-grab items-center gap-1 rounded-sm bg-accent px-2 py-0.5 text-[11px] font-medium text-white shadow-sm active:cursor-grabbing">
                  <GripVertical size={12} /> {w.title}
                </span>
                <span className="flex items-center gap-0.5 rounded-sm border border-line bg-surface p-0.5 shadow-sm">
                  {(Object.keys(SIZE_LABEL) as WidgetSize[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      title={`Largeur ${SIZE_LABEL[s]}`}
                      onClick={() => save({ ...layout, sizes: { ...layout.sizes, [w.id]: s } })}
                      className={cn("rounded-sm px-1.5 text-[11px] leading-5", sizeOf(w) === s ? "bg-accent text-white" : "text-ink-2 hover:bg-surface-2")}
                    >
                      {SIZE_LABEL[s]}
                    </button>
                  ))}
                  <button type="button" title="Masquer ce module" className="rounded-sm px-1.5 text-ink-3 hover:bg-surface-2 hover:text-critical" onClick={() => save({ ...layout, hidden: [...layout.hidden, w.id] })}>
                    <EyeOff size={13} />
                  </button>
                </span>
              </div>
            )}
            <div className={cn("h-full", editing && "pointer-events-none select-none")}>{w.node}</div>
          </div>
        ))}
        {visible.length === 0 && (
          <div className="col-span-full rounded-md border border-dashed border-line-strong p-8 text-center text-sm text-ink-3">
            <Eye size={18} className="mx-auto mb-2" /> Tous les modules sont masqués : cliquez sur « Personnaliser » pour en rajouter.
          </div>
        )}
      </div>
    </div>
  );
}
