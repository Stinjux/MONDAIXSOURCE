"use client";
// Section Fournisseurs : liste des fournisseurs à gauche, leurs produits à droite.
import Link from "next/link";
import { useMemo, useState } from "react";
import { ExternalLink, PackageX, Search, Star, Store } from "lucide-react";
import { cad, pct } from "@/lib/format";
import { STAGE_INFO, type Stage } from "@/lib/pipeline";
import type { SupplierGroup } from "@/lib/suppliers";
import { ProductImage } from "./ProductImage";
import { Badge, EmptyState, Supplier, cn } from "./ui";

const STAGE_TONE: Record<Stage, "neutral" | "accent" | "good" | "warning" | "critical"> = {
  NEW: "neutral",
  ANALYSIS: "accent",
  RECONFIRM: "critical",
  READY: "good",
  BOUGHT: "good",
  WATCH: "warning",
  REJECTED: "neutral",
};

export function SupplierBrowser({ groups, initial }: { groups: SupplierGroup[]; initial: string | null }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(initial ?? groups[0]?.key ?? null);
  const [hideRejected, setHideRejected] = useState(true);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? groups.filter((g) => `${g.name} ${g.domain ?? ""} ${g.key}`.toLowerCase().includes(q)) : groups;
  }, [groups, query]);
  const group = groups.find((g) => g.key === selected) ?? null;
  const products = group ? group.products.filter((p) => !hideRejected || p.stage !== "REJECTED") : [];

  const select = (key: string) => {
    setSelected(key);
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
    <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Fournisseurs */}
      <aside className="flex flex-col rounded-md border border-line bg-surface lg:sticky lg:top-4">
        <div className="border-b border-line p-3">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
            <input className="field pl-9" placeholder="Rechercher un fournisseur" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher un fournisseur" />
          </div>
          <p className="mt-2 text-[11px] text-ink-3">{groups.length} fournisseurs</p>
        </div>
        <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto" role="listbox" aria-label="Fournisseurs">
          {visible.map((g) => {
            const active = g.stats.products - g.stats.rejected;
            return (
              <li key={g.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected === g.key}
                  onClick={() => select(g.key)}
                  className={cn("block w-full border-l-[3px] px-3 py-2.5 text-left transition", selected === g.key ? "border-accent bg-accent-soft" : "border-transparent hover:bg-surface-2")}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-ink">{g.name}</span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-2">{active}</span>
                  </span>
                  <span className="mt-0.5 flex gap-2 text-[11px] text-ink-3">
                    {g.domain && g.domain !== g.name && <span className="truncate">{g.domain}</span>}
                    {g.stats.ready > 0 && <span className="text-good">{g.stats.ready} prêt{g.stats.ready > 1 ? "s" : ""}</span>}
                    {g.stats.toReview > 0 && <span>{g.stats.toReview} à revoir</span>}
                  </span>
                </button>
              </li>
            );
          })}
          {visible.length === 0 && <li className="px-3 py-4 text-center text-xs text-ink-3">Aucun fournisseur ne correspond.</li>}
        </ul>
      </aside>

      {/* Produits du fournisseur */}
      {group ? (
        <section className="flex min-w-0 flex-col gap-4">
          <div className="rounded-md border border-line bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-serif text-2xl font-semibold text-ink">{group.name}</h2>
                {group.domain && (
                  <a href={`https://${group.domain}`} target="_blank" rel="noopener noreferrer" className="link mt-0.5 inline-flex items-center gap-1 text-sm">
                    {group.domain} <ExternalLink size={12} />
                  </a>
                )}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-2">
                <input type="checkbox" className="accent-accent" checked={hideRejected} onChange={(e) => setHideRejected(e.target.checked)} /> Masquer les rejetés
              </label>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <Stat label="Produits actifs" value={group.stats.products - group.stats.rejected} />
              <Stat label="À revoir" value={group.stats.toReview} />
              <Stat label="Prêts à acheter" value={group.stats.ready} tone={group.stats.ready ? "text-good" : undefined} />
              <Stat label="En rupture" value={group.stats.unavailable} tone={group.stats.unavailable ? "text-critical" : undefined} />
              <Stat label="ROI moyen" value={pct(group.stats.avgRoi, 0)} />
              <Stat label="Acheté ici" value={group.stats.bought.units ? `${group.stats.bought.units} u. · ${cad(group.stats.bought.spend)}` : "—"} />
            </dl>
          </div>

          <div className="overflow-hidden rounded-md border border-line bg-surface">
            {products.length === 0 ? (
              <EmptyState title="Aucun produit à afficher" icon={<PackageX size={20} />}>{hideRejected && group.stats.rejected > 0 ? "Tous les produits de ce fournisseur sont rejetés." : null}</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Étape</th>
                      <th className="text-right">Coût ici</th>
                      <th className="text-right">ROI</th>
                      <th className="text-right">Profit/u.</th>
                      <th className="text-right">Profit mensuel</th>
                      <th>Lien</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={`${p.productId}-${p.supplierUrl ?? ""}`} className={cn(p.stage === "REJECTED" && "opacity-60")}>
                        <td className="max-w-96">
                          <div className="flex items-center gap-2.5">
                            <ProductImage asin={p.asin} size={36} />
                            <div className="min-w-0">
                              <Link href={`/leads/${p.asin}`} className="block truncate font-medium text-ink hover:text-accent hover:underline" title={p.name}>
                                {p.name}
                              </Link>
                              <span className="flex items-center gap-1.5 text-xs text-ink-3">
                                <span className="font-mono">{p.asin}</span>
                                {p.best && (
                                  <span className="inline-flex items-center gap-0.5 text-accent" title="Meilleure offre de ce lead">
                                    <Star size={10} className="fill-accent" /> meilleure offre
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="flex flex-wrap gap-1">
                            <Badge tone={STAGE_TONE[p.stage]}>{STAGE_INFO[p.stage].title}</Badge>
                            {p.unavailable && p.stage !== "WATCH" && <Badge tone="critical">Rupture</Badge>}
                          </span>
                        </td>
                        <td className="text-right tabular-nums">{cad(p.cost)}</td>
                        <td className="text-right font-medium tabular-nums">{pct(p.roi, 0)}</td>
                        <td className={cn("text-right tabular-nums", p.profit != null && p.profit < 0 && "text-critical")}>{cad(p.profit)}</td>
                        <td className="text-right tabular-nums">{cad(p.monthlyProfit)}</td>
                        <td>
                          {p.supplierUrl ? <Supplier name="Ouvrir" url={p.supplierUrl} /> : <Supplier name="Rechercher" product={`${group.name} ${p.name}`} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-xs text-ink-3">
            Un produit vendu par plusieurs fournisseurs apparaît chez chacun, avec le coût et le ROI de ce fournisseur ; « meilleure offre » marque celui retenu dans Buy Decisions.
            Les fournisseurs sont regroupés par magasin : une URL walmart.ca et la boutique « Walmart » de la Sheet OUT OF STOCK forment un seul fournisseur.
          </p>
        </section>
      ) : (
        <div className="rounded-md border border-line bg-surface">
          <EmptyState title="Choisissez un fournisseur" icon={<Store size={22} />} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-sm border border-line bg-surface-2 px-3 py-2">
      <dt className="text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{label}</dt>
      <dd className={cn("mt-0.5 text-base font-semibold tabular-nums text-ink", tone)}>{value}</dd>
    </div>
  );
}
