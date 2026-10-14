"use client";
import { Fragment, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/dates";
import { cad, num, pct } from "@/lib/format";
import { STOCK_LABELS } from "@/lib/stock";
import { Asin, Badge, EmptyState, StockBadge, Supplier, cn } from "./ui";

export type OosRow = {
  offerId: string;
  asin: string;
  name: string;
  amazonUrl: string | null;
  supplierName: string | null;
  supplierUrl: string | null;
  supplierKey: string;
  costPrice: number | null;
  currency: string;
  salePrice: number | null;
  sheetRoi: number | null;
  sheetProfit: number | null;
  estimatedSales: number | null;
  availability: string | null;
  notes: string | null;
  stockStatus: string;
  stockCheckedAt: string | null;
  stockDetail: string | null;
  needsRecheck: boolean;
  backInStockAt: string | null;
  present: boolean;
  inLeads: boolean;
  checks: { id: string; origin: string; status: string; availability: string | null; checkedAt: string | null; checkedText: string | null; detail: string | null; recordedAt: string }[];
};

const FILTERS = [
  ["ALL", "Tous"],
  ["OUT_OF_STOCK", "Encore indisponibles"],
  ["IN_STOCK", "Revenus en stock"],
  ["CHECK_FAILED", "Vérification échouée"],
  ["RECHECK", "À revérifier"],
] as const;

export function OosTable({ rows }: { rows: OosRow[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("ALL");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !`${r.asin} ${r.name} ${r.supplierName ?? ""} ${r.supplierKey}`.toLowerCase().includes(q)) return false;
      if (filter === "RECHECK") return r.needsRecheck;
      if (filter !== "ALL") return r.stockStatus === filter;
      return true;
    });
  }, [rows, filter, query]);

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex flex-col gap-3 border-b border-line p-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input className="field pl-9" placeholder="Rechercher par ASIN, produit ou fournisseur" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={cn("rounded-full px-3 py-1 text-xs transition", filter === k ? "bg-accent-soft text-ink ring-1 ring-accent/40" : "text-ink-2 hover:bg-surface-2")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="Aucun produit">Aucun produit OUT OF STOCK ne correspond à ce filtre.</EmptyState>
      ) : (
        <div className="max-h-[70vh] overflow-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Fournisseur</th>
                <th>Statut</th>
                <th>Disponibilité (Sheet)</th>
                <th>Dernière vérification</th>
                <th className="text-right">Prix fournisseur</th>
                <th className="text-right">Prix Amazon</th>
                <th className="text-right">ROI (Sheet)</th>
                <th className="text-right">Profit (Sheet)</th>
                <th className="text-right">Ventes/mois</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <Fragment key={r.offerId}>
                  <tr className={cn(!r.present && "opacity-60")}>
                    <td className="max-w-64">
                      <div className="truncate font-medium text-ink" title={r.name}>{r.name}</div>
                      <div className="flex items-center gap-1.5">
                        <Asin asin={r.asin} url={r.amazonUrl} />
                        {r.inLeads && <Badge tone="serious">Aussi dans LEADS</Badge>}
                        {!r.present && <Badge>Retiré de la Sheet</Badge>}
                      </div>
                    </td>
                    <td className="max-w-40 truncate"><Supplier name={r.supplierName} url={r.supplierUrl} fallback={r.supplierKey} /></td>
                    <td>
                      <span className="flex flex-wrap gap-1">
                        <StockBadge status={r.stockStatus} />
                        {r.needsRecheck && <Badge tone="warning">À revérifier</Badge>}
                      </span>
                    </td>
                    <td className="max-w-40 truncate text-ink-2" title={r.availability ?? undefined}>{r.availability ?? "—"}</td>
                    <td className="text-ink-2">{r.stockCheckedAt ? formatDate(r.stockCheckedAt) : "—"}</td>
                    <td className="text-right tabular-nums">{r.currency !== "CAD" && r.costPrice != null ? `${num(r.costPrice)} ${r.currency}` : cad(r.costPrice)}</td>
                    <td className="text-right tabular-nums">{cad(r.salePrice)}</td>
                    <td className="text-right tabular-nums text-ink-2">{pct(r.sheetRoi, 0)}</td>
                    <td className="text-right tabular-nums text-ink-2">{cad(r.sheetProfit)}</td>
                    <td className="text-right tabular-nums text-ink-2">{num(r.estimatedSales)}</td>
                    <td>
                      <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setOpen(open === r.offerId ? null : r.offerId)} aria-expanded={open === r.offerId}>
                        Historique <ChevronDown size={13} className={cn("transition", open === r.offerId && "rotate-180")} />
                      </button>
                    </td>
                  </tr>
                  {open === r.offerId && (
                    <tr>
                      <td colSpan={11} className="bg-page/50 whitespace-normal">
                        {r.notes && <p className="mb-2 text-xs text-ink-2"><span className="text-ink-3">Notes :</span> {r.notes}</p>}
                        {r.stockDetail && <p className="mb-2 text-xs text-ink-2"><span className="text-ink-3">Détail du contrôle :</span> {r.stockDetail}</p>}
                        {r.checks.length ? (
                          <ul className="grid gap-1 text-xs">
                            {r.checks.map((c) => (
                              <li key={c.id} className="flex flex-wrap items-center gap-2">
                                <span className="w-36 text-ink-3">{formatDateTime(c.recordedAt)}</span>
                                <StockBadge status={c.status} />
                                <span className="text-ink-2">{c.origin === "MANUAL" ? "Vérification manuelle" : `Sheet : « ${c.availability ?? "—"} »`}</span>
                                {c.checkedText && <span className="text-ink-3">contrôle du {c.checkedText}</span>}
                                {c.detail && <span className="text-ink-3">— {c.detail}</span>}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-ink-3">Aucune vérification enregistrée.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-line px-3 py-2.5 text-xs text-ink-3">
        Un produit n&apos;est marqué « {STOCK_LABELS.IN_STOCK} » que si la Sheet indique une disponibilité ET une date de vérification valide (colonnes N et O). ROI et profit « Sheet » sont les valeurs saisies dans la feuille, non recalculées.
      </p>
    </div>
  );
}
