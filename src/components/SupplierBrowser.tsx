"use client";
// Section Fournisseurs : liste des commerces à gauche (logo, volume, répartition par étape),
// fiche du commerce à droite (indicateurs, répartition filtrable, produits).
import Link from "next/link";
import { useMemo, useState } from "react";
import { ExternalLink, PackageX, Search, Star, Store } from "lucide-react";
import { DEFAULT_THRESHOLDS } from "@/lib/decision";
import { cad, pct } from "@/lib/format";
import type { Stage } from "@/lib/pipeline";
import type { SupplierGroup, SupplierProduct } from "@/lib/suppliers";
import { ProductImage } from "./ProductImage";
import { StoreLogo } from "./StoreLogo";
import { EmptyState, Supplier, cn } from "./ui";

// Répartition par étape : 5 catégories (palette validée CVD sur fond blanc, toujours avec libellé et nombre)
type Bucket = "todo" | "reconfirm" | "ready" | "bought" | "watch";
const BUCKETS: { key: Bucket; label: string; color: string; stages: Stage[] }[] = [
  { key: "todo", label: "À traiter", color: "#aab3c0", stages: ["NEW", "ANALYSIS"] },
  { key: "reconfirm", label: "À reconfirmer", color: "#eb6834", stages: ["RECONFIRM"] },
  { key: "ready", label: "Prêts à acheter", color: "#1baf7a", stages: ["READY"] },
  { key: "bought", label: "Achetés", color: "#1c5cab", stages: ["BOUGHT"] },
  { key: "watch", label: "En veille", color: "#dde2e9", stages: ["WATCH"] },
];
const bucketOf = (s: Stage): Bucket | "rejected" => BUCKETS.find((b) => b.stages.includes(s))?.key ?? "rejected";
const countBucket = (g: SupplierGroup, b: (typeof BUCKETS)[number]) => b.stages.reduce((n, s) => n + g.stats.stages[s], 0);
const STAGE_LABEL: Record<Stage, string> = {
  NEW: "Nouveau",
  ANALYSIS: "En analyse",
  RECONFIRM: "À reconfirmer",
  READY: "Prêt à acheter",
  BOUGHT: "Acheté",
  WATCH: "En veille",
  REJECTED: "Rejeté",
};

/** Barre horizontale segmentée (2 px d'espace entre segments) ; largeur relative à `max`. */
function StageBar({ g, max, height = 6 }: { g: SupplierGroup; max: number; height?: number }) {
  const active = g.stats.products - g.stats.rejected;
  return (
    <div className="flex w-full overflow-hidden rounded-[2px] bg-surface-3/60" style={{ height }} aria-hidden>
      <div className="flex gap-[2px]" style={{ width: `${max ? (active / max) * 100 : 0}%` }}>
        {BUCKETS.map((b) => {
          const n = countBucket(g, b);
          return n ? <span key={b.key} className="h-full first:rounded-l-[2px] last:rounded-r-[2px]" style={{ flexGrow: n, flexBasis: 0, background: b.color }} /> : null;
        })}
      </div>
    </div>
  );
}

export function SupplierBrowser({ groups, initial }: { groups: SupplierGroup[]; initial: string | null }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(initial ?? groups[0]?.key ?? null);
  const [bucket, setBucket] = useState<Bucket | "all" | "rejected">("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? groups.filter((g) => `${g.name} ${g.key}`.toLowerCase().includes(q)) : groups;
  }, [groups, query]);
  const maxActive = Math.max(1, ...groups.map((g) => g.stats.products - g.stats.rejected));
  const group = groups.find((g) => g.key === selected) ?? null;
  const products = group
    ? group.products.filter((p) => (bucket === "all" ? p.stage !== "REJECTED" : bucketOf(p.stage) === bucket))
    : [];

  const select = (key: string) => {
    setSelected(key);
    setBucket("all");
    const url = new URL(window.location.href);
    url.searchParams.set("f", key);
    window.history.replaceState(null, "", url);
  };

  if (groups.length === 0) {
    return (
      <div className="rounded-md border border-line bg-surface">
        <EmptyState title="Aucun fournisseur" icon={<Store size={22} />}>Synchronisez vos Sheets pour voir vos fournisseurs.</EmptyState>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      {/* Commerces */}
      <aside className="flex flex-col overflow-hidden rounded-md border border-line bg-surface lg:sticky lg:top-4">
        <div className="border-b border-line p-3">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
            <input className="field pl-9" placeholder="Rechercher un commerce" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher un commerce" />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
            {BUCKETS.map((b) => (
              <span key={b.key} className="flex items-center gap-1 text-[10px] text-ink-3">
                <span className="size-2 rounded-[2px]" style={{ background: b.color }} /> {b.label}
              </span>
            ))}
          </div>
        </div>
        <ul className="max-h-[72vh] overflow-y-auto" role="listbox" aria-label="Commerces">
          {visible.map((g) => {
            const active = g.stats.products - g.stats.rejected;
            const on = selected === g.key;
            return (
              <li key={g.key} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => select(g.key)}
                  className={cn("flex w-full items-center gap-3 border-l-[3px] px-3 py-3 text-left transition", on ? "border-accent bg-accent-soft" : "border-transparent hover:bg-surface-2")}
                >
                  <StoreLogo name={g.name} domain={g.domain} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate text-sm font-semibold", on ? "text-accent" : "text-ink")}>{g.name}</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{active}</span>
                    </span>
                    <span className="mt-1.5 block">
                      <StageBar g={g} max={maxActive} />
                    </span>
                    <span className="mt-1 flex gap-2 text-[11px] text-ink-3">
                      {g.stats.ready > 0 && <span className="font-medium text-good">{g.stats.ready} prêt{g.stats.ready > 1 ? "s" : ""}</span>}
                      {g.stats.toReview > 0 && <span>{g.stats.toReview} à traiter</span>}
                      {g.stats.avgRoi != null && <span className="ml-auto tabular-nums">ROI moy. {pct(g.stats.avgRoi, 0)}</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {visible.length === 0 && <li className="px-3 py-4 text-center text-xs text-ink-3">Aucun commerce ne correspond.</li>}
        </ul>
      </aside>

      {/* Fiche du commerce */}
      {group ? (
        <section className="flex min-w-0 flex-col gap-4">
          <div className="overflow-hidden rounded-md border border-line bg-surface">
            <div className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-4">
              <StoreLogo name={group.name} domain={group.domain} size={56} />
              <div className="min-w-0 flex-1">
                <h2 className="font-serif text-[26px] leading-tight font-semibold text-ink">{group.name}</h2>
                <p className="mt-0.5 text-sm text-ink-2">
                  {group.stats.products - group.stats.rejected} produit{group.stats.products - group.stats.rejected > 1 ? "s" : ""} actif{group.stats.products - group.stats.rejected > 1 ? "s" : ""}
                  {group.stats.rejected > 0 && <span className="text-ink-3"> · {group.stats.rejected} rejeté{group.stats.rejected > 1 ? "s" : ""}</span>}
                </p>
              </div>
              {group.domain && (
                <a href={`https://${group.domain}`} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                  Site du commerce <ExternalLink size={14} />
                </a>
              )}
            </div>
            <dl className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
              <Kpi label="Prêts à acheter" value={group.stats.ready} tone={group.stats.ready ? "text-good" : undefined} />
              <Kpi label="ROI moyen" value={pct(group.stats.avgRoi, 0)} />
              <Kpi label="En rupture" value={group.stats.unavailable} tone={group.stats.unavailable ? "text-critical" : undefined} />
              <Kpi label="Acheté ici" value={group.stats.bought.units ? cad(group.stats.bought.spend) : "—"} hint={group.stats.bought.units ? `${group.stats.bought.units} unités` : "aucun achat"} />
            </dl>
            {/* Répartition par étape, cliquable pour filtrer */}
            <div className="border-t border-line px-5 py-4">
              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold tracking-[0.08em] text-ink-2 uppercase">
                <span>Répartition dans le pipeline</span>
                {bucket !== "all" && (
                  <button type="button" className="font-medium tracking-normal text-accent normal-case hover:underline" onClick={() => setBucket("all")}>
                    Tout afficher
                  </button>
                )}
              </div>
              <StageBar g={group} max={group.stats.products - group.stats.rejected} height={12} />
              <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filtrer par étape">
                {[...BUCKETS.map((b) => ({ key: b.key as Bucket | "rejected", label: b.label, color: b.color, n: countBucket(group, b) })), { key: "rejected" as const, label: "Rejetés", color: "transparent", n: group.stats.rejected }].map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    role="radio"
                    aria-checked={bucket === b.key}
                    disabled={b.n === 0}
                    onClick={() => setBucket(bucket === b.key ? "all" : b.key)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs transition disabled:opacity-40",
                      bucket === b.key ? "border-accent bg-accent-soft text-ink" : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
                    )}
                  >
                    <span className="size-2.5 rounded-[2px] border border-line-strong/50" style={{ background: b.color }} />
                    {b.label} <b className="tabular-nums text-ink">{b.n}</b>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-line bg-surface">
            {products.length === 0 ? (
              <EmptyState title="Aucun produit dans cette sélection" icon={<PackageX size={20} />} />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Étape</th>
                      <th className="text-right">Coût</th>
                      <th>ROI</th>
                      <th className="text-right">Profit/u.</th>
                      <th className="text-right">Profit mensuel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <ProductRow key={`${p.productId}-${p.supplierUrl ?? ""}`} p={p} store={group.name} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-xs text-ink-3">
            Un produit vendu par plusieurs commerces apparaît chez chacun, avec le coût et le ROI de ce commerce ; l&apos;étoile marque l&apos;offre retenue dans Buy Decisions.
            Une URL walmart.ca et la boutique « Walmart » de la Sheet OUT OF STOCK forment un seul commerce.
          </p>
        </section>
      ) : (
        <div className="rounded-md border border-line bg-surface">
          <EmptyState title="Choisissez un commerce" icon={<Store size={22} />} />
        </div>
      )}
    </div>
  );
}

function ProductRow({ p, store }: { p: SupplierProduct; store: string }) {
  const b = bucketOf(p.stage);
  const color = BUCKETS.find((x) => x.key === b)?.color ?? "transparent";
  const roiScale = Math.max(0, Math.min(1, (p.roi ?? 0) / (DEFAULT_THRESHOLDS.minRoi * 3)));
  return (
    <tr className={cn(p.stage === "REJECTED" && "opacity-55")}>
      <td className="max-w-96">
        <div className="flex items-center gap-2.5">
          <ProductImage asin={p.asin} size={40} />
          <div className="min-w-0">
            <Link href={`/leads/${p.asin}`} className="block truncate font-medium text-ink hover:text-accent hover:underline" title={p.name}>
              {p.name}
            </Link>
            <span className="flex items-center gap-1.5 text-xs text-ink-3">
              <span className="font-mono">{p.asin}</span>
              {p.supplierUrl ? <Supplier name={store} url={p.supplierUrl} /> : <Supplier name={store} product={p.name} />}
              {p.best && <Star size={11} className="fill-accent text-accent" aria-label="Offre retenue dans Buy Decisions" />}
              {p.unavailable && <span className="font-medium text-critical">Rupture</span>}
            </span>
          </div>
        </div>
      </td>
      <td>
        <span className="flex items-center gap-1.5 text-xs text-ink-2">
          <span className="size-2.5 shrink-0 rounded-[2px] border border-line-strong/50" style={{ background: color }} aria-hidden />
          {STAGE_LABEL[p.stage]}
        </span>
      </td>
      <td className="text-right tabular-nums">{cad(p.cost)}</td>
      <td className="w-36">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <span className={cn("block h-full rounded-full", (p.roi ?? 0) >= DEFAULT_THRESHOLDS.minRoi ? "bg-good" : (p.roi ?? 0) > 0 ? "bg-warning" : "bg-critical")} style={{ width: `${roiScale * 100}%` }} />
          </span>
          <span className={cn("font-semibold tabular-nums", p.roi != null && p.roi < 0 ? "text-critical" : "text-ink")}>{pct(p.roi, 0)}</span>
        </span>
      </td>
      <td className={cn("text-right tabular-nums", p.profit != null && p.profit < 0 && "text-critical")}>{cad(p.profit)}</td>
      <td className="text-right tabular-nums">{cad(p.monthlyProfit)}</td>
    </tr>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: string }) {
  return (
    <div className="px-5 py-3.5">
      <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink-3 uppercase">{label}</dt>
      <dd className={cn("mt-1 font-serif text-[22px] leading-tight font-semibold tabular-nums text-ink", tone)}>{value}</dd>
      {hint && <dd className="text-[11px] text-ink-3">{hint}</dd>}
    </div>
  );
}
