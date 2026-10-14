"use client";
import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Search } from "lucide-react";
import { setReviewStatus } from "@/app/(app)/actions";
import { formatDate } from "@/lib/dates";
import { cad, num, pct } from "@/lib/format";
import { REVIEW_LABELS, REVIEW_STATUSES } from "@/lib/labels";
import { Asin, Badge, DuplicateBadges, EmptyState, SourceBadges, StockBadge, Supplier, cn } from "./ui";

export type LeadRow = {
  offerId: string;
  productId: string;
  asin: string;
  name: string;
  amazonUrl: string | null;
  supplierName: string | null;
  supplierUrl: string | null;
  supplierKey: string;
  salePrice: number | null;
  costPrice: number | null;
  fbaFee: number | null;
  estimatedSales: number | null;
  profit: number | null;
  roi: number | null;
  margin: number | null;
  monthlyProfit: number | null;
  calcIssue: string | null;
  sources: string[];
  present: boolean;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  goalWeek: string | null;
  countsTowardGoal: boolean;
  reviewStatus: string;
  stockStatus: string;
  dup: { exactOfferIds: string[]; crossSheet: boolean; multiSupplier: boolean };
};

type SortKey = "name" | "salePrice" | "costPrice" | "profit" | "roi" | "margin" | "monthlyProfit" | "estimatedSales" | "firstSeenAt" | "occurrences";
const PAGE = 100;

export function LeadsTable({ rows, currentWeek }: { rows: LeadRow[]; currentWeek: string }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [scope, setScope] = useState<"ALL" | "WEEK" | "DUP" | "ACTIVE">("ALL");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "firstSeenAt", dir: -1 });
  const [page, setPage] = useState(0);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (q && !`${r.asin} ${r.name} ${r.supplierName ?? ""} ${r.supplierKey}`.toLowerCase().includes(q)) return false;
      if (source !== "ALL" && !r.sources.includes(source)) return false;
      if (status !== "ALL" && r.reviewStatus !== status) return false;
      if (scope === "WEEK" && !(r.countsTowardGoal && r.goalWeek === currentWeek)) return false;
      if (scope === "DUP" && !(r.dup.exactOfferIds.length || r.dup.crossSheet || r.dup.multiSupplier)) return false;
      if (scope === "ACTIVE" && !r.present) return false;
      return true;
    });
    const { key, dir } = sort;
    return list.sort((a, b) => {
      const x = a[key], y = b[key];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "string" ? x.localeCompare(y as string, "fr") : (x as number) - (y as number)) * dir;
    });
  }, [rows, query, source, status, scope, sort, currentWeek]);

  const pageRows = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));

  const header = (label: string, key: SortKey, align: "left" | "right" = "left") => (
    <th className={align === "right" ? "text-right" : undefined} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className={cn("inline-flex items-center gap-1 uppercase hover:text-ink", sort.key === key && "text-ink")}
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === "name" ? 1 : -1 }))}
      >
        {label}
        {sort.key === key ? sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ChevronsUpDown size={12} className="opacity-50" />}
      </button>
    </th>
  );

  const changeStatus = (productId: string, value: string) =>
    start(async () => {
      setError(null);
      const res = await setReviewStatus(productId, value);
      if (!res.ok) setError(res.error);
    });

  const exportCsv = () => {
    const cols: [string, (r: LeadRow) => unknown][] = [
      ["ASIN", (r) => r.asin], ["Produit", (r) => r.name], ["Fournisseur", (r) => r.supplierName ?? r.supplierKey], ["URL fournisseur", (r) => r.supplierUrl],
      ["Sale Price", (r) => r.salePrice], ["Cost Price", (r) => r.costPrice], ["FBA Fee", (r) => r.fbaFee], ["Profit prélim.", (r) => r.profit?.toFixed(2)],
      ["ROI prélim. %", (r) => r.roi?.toFixed(1)], ["Marge prélim. %", (r) => r.margin?.toFixed(1)], ["Ventes est.", (r) => r.estimatedSales],
      ["Profit mensuel prélim.", (r) => r.monthlyProfit?.toFixed(2)], ["Sources", (r) => r.sources.join("+")], ["Occurrences", (r) => r.occurrences],
      ["Première découverte", (r) => r.firstSeenAt.slice(0, 10)], ["Dernière découverte", (r) => r.lastSeenAt.slice(0, 10)], ["Revue", (r) => REVIEW_LABELS[r.reviewStatus as keyof typeof REVIEW_LABELS] ?? r.reviewStatus],
    ];
    const esc = (v: unknown) => (v == null ? "" : /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = [cols.map((c) => c[0]).join(","), ...filtered.map((r) => cols.map(([, f]) => esc(f(r))).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `mondaix-leads-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const scopes = [
    ["ALL", "Tous"],
    ["WEEK", "Cette semaine"],
    ["DUP", "Doublons"],
    ["ACTIVE", "Présents dans les Sheets"],
  ] as const;

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex flex-col gap-3 border-b border-line p-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input
            className="field pl-9"
            placeholder="Rechercher par ASIN, produit ou fournisseur"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            aria-label="Rechercher"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="field w-auto" value={source} onChange={(e) => { setSource(e.target.value); setPage(0); }} aria-label="Source">
            <option value="ALL">Toutes les sources</option>
            <option value="LEADS">LEADS</option>
            <option value="OUT_OF_STOCK">OUT OF STOCK</option>
          </select>
          <select className="field w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} aria-label="Statut de revue">
            <option value="ALL">Tous les statuts</option>
            {REVIEW_STATUSES.map((s) => (
              <option key={s} value={s}>{REVIEW_LABELS[s]}</option>
            ))}
          </select>
          <button type="button" className="btn-ghost" onClick={exportCsv} title="Exporter la sélection en CSV">
            <Download size={15} /> CSV
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
        {scopes.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => { setScope(k); setPage(0); }}
            className={cn("rounded-full px-3 py-1 text-xs transition", scope === k ? "bg-accent-soft text-ink ring-1 ring-accent/40" : "text-ink-2 hover:bg-surface-2")}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-xs text-ink-3 tabular-nums">{filtered.length} offres · {new Set(filtered.map((r) => r.asin)).size} ASIN</span>
      </div>
      {error && <p className="border-b border-line bg-critical/10 px-3 py-2 text-sm text-[#f08080]">{error}</p>}

      {filtered.length === 0 ? (
        <EmptyState title="Aucun lead ne correspond">Modifiez la recherche ou les filtres.</EmptyState>
      ) : (
        <div className="max-h-[70vh] overflow-auto">
          <table className="table-base">
            <thead>
              <tr>
                {header("Produit", "name")}
                <th>Fournisseur</th>
                {header("Prix Amazon", "salePrice", "right")}
                {header("Coût", "costPrice", "right")}
                <th className="text-right">FBA</th>
                {header("Profit*", "profit", "right")}
                {header("ROI*", "roi", "right")}
                {header("Marge*", "margin", "right")}
                {header("Ventes/mois", "estimatedSales", "right")}
                {header("Profit mensuel*", "monthlyProfit", "right")}
                <th>Sources</th>
                <th>Alertes</th>
                {header("Découverte", "firstSeenAt")}
                {header("Occ.", "occurrences", "right")}
                <th>Revue</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.offerId} className={cn(!r.present && "opacity-60")}>
                  <td className="max-w-72">
                    <div className="truncate font-medium text-ink" title={r.name}>{r.name}</div>
                    <div className="flex items-center gap-2">
                      <Asin asin={r.asin} url={r.amazonUrl} />
                      {!r.present && <Badge>Retiré de la Sheet</Badge>}
                    </div>
                  </td>
                  <td className="max-w-48 truncate"><Supplier name={r.supplierName} url={r.supplierUrl} fallback={r.supplierKey} /></td>
                  <td className="text-right tabular-nums">{cad(r.salePrice)}</td>
                  <td className="text-right tabular-nums">{cad(r.costPrice)}</td>
                  <td className="text-right tabular-nums text-ink-2">{cad(r.fbaFee)}</td>
                  <td className={cn("text-right font-medium tabular-nums", r.profit != null && r.profit < 0 && "text-[#f08080]")} title={r.calcIssue ?? undefined}>
                    {r.calcIssue ? <span className="text-ink-3">n/d</span> : cad(r.profit)}
                  </td>
                  <td className="text-right tabular-nums">{pct(r.roi, 0)}</td>
                  <td className="text-right tabular-nums text-ink-2">{pct(r.margin, 0)}</td>
                  <td className="text-right tabular-nums text-ink-2">{num(r.estimatedSales)}</td>
                  <td className="text-right tabular-nums">{cad(r.monthlyProfit)}</td>
                  <td><SourceBadges sources={r.sources} /></td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      <DuplicateBadges dup={{ ...r.dup, exactOfferIds: r.dup.exactOfferIds.filter((id) => id === r.offerId) }} compact />
                      {r.sources.includes("OUT_OF_STOCK") && <StockBadge status={r.stockStatus} />}
                    </span>
                  </td>
                  <td className="text-ink-2">{formatDate(r.firstSeenAt)}</td>
                  <td className="text-right tabular-nums text-ink-2">{r.occurrences}</td>
                  <td>
                    <select
                      className="field w-auto py-1 text-xs"
                      value={r.reviewStatus}
                      disabled={pending}
                      onChange={(e) => changeStatus(r.productId, e.target.value)}
                      aria-label={`Statut de revue de ${r.asin}`}
                    >
                      {REVIEW_STATUSES.map((s) => (
                        <option key={s} value={s}>{REVIEW_LABELS[s]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-col gap-2 border-t border-line px-3 py-2.5 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between">
        <span>* Estimations préliminaires : Sale Price − Cost Price − FBA Fee. Pas un profit net.</span>
        {pages > 1 && (
          <span className="flex items-center gap-2">
            <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Précédent</button>
            <span className="tabular-nums">{page + 1} / {pages}</span>
            <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Suivant</button>
          </span>
        )}
      </div>
    </div>
  );
}
