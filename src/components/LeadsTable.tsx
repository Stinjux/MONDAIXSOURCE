"use client";
import Link from "next/link";
import { Fragment, useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronsUpDown, Download, Search, Star } from "lucide-react";
import { setReviewStatus } from "@/app/(app)/actions";
import { formatDate } from "@/lib/dates";
import { cad, num, pct } from "@/lib/format";
import { REVIEW_LABELS, REVIEW_STATUSES } from "@/lib/labels";
import { Asin, Badge, DuplicateBadges, EmptyState, SourceBadges, StockBadge, Supplier, cn } from "./ui";

/** Offre d'un fournisseur pour l'ASIN. */
export type SupplierRow = {
  offerId: string;
  supplierName: string | null;
  supplierUrl: string | null;
  supplierKey: string;
  salePrice: number | null;
  costPrice: number | null;
  fbaFee: number | null;
  estimatedSales: number | null;
  currency: string;
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
  stockStatus: string;
  exactDuplicate: boolean;
};

/** Un lead = un ASIN, avec tous ses fournisseurs. Les montants affichés sont ceux de la meilleure offre. */
export type LeadRow = {
  productId: string;
  asin: string;
  name: string;
  amazonUrl: string | null;
  suppliers: SupplierRow[];
  best: SupplierRow | null;
  salePrice: number | null;
  costPrice: number | null;
  profit: number | null;
  roi: number | null;
  margin: number | null;
  monthlyProfit: number | null;
  estimatedSales: number | null;
  sources: string[];
  present: boolean;
  occurrences: number;
  supplierCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  goalWeek: string | null;
  countsTowardGoal: boolean;
  reviewStatus: string;
  dup: { exactOfferIds: string[]; crossSheet: boolean; multiSupplier: boolean };
};

type SortKey = "name" | "salePrice" | "costPrice" | "profit" | "roi" | "margin" | "monthlyProfit" | "estimatedSales" | "firstSeenAt" | "supplierCount";
const PAGE = 100;

export function LeadsTable({ rows, currentWeek }: { rows: LeadRow[]; currentWeek: string }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [scope, setScope] = useState<"ALL" | "WEEK" | "MULTI" | "DUP" | "ACTIVE">("ALL");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "firstSeenAt", dir: -1 });
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (q && !`${r.asin} ${r.name} ${r.suppliers.map((s) => `${s.supplierName ?? ""} ${s.supplierKey}`).join(" ")}`.toLowerCase().includes(q)) return false;
      if (source !== "ALL" && !r.sources.includes(source)) return false;
      if (status !== "ALL" && r.reviewStatus !== status) return false;
      if (scope === "WEEK" && !(r.countsTowardGoal && r.goalWeek === currentWeek)) return false;
      if (scope === "MULTI" && r.supplierCount < 2) return false;
      if (scope === "DUP" && !(r.dup.exactOfferIds.length || r.dup.crossSheet)) return false;
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
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
    // Une ligne par fournisseur, regroupées par ASIN (le statut de revue est celui de l'ASIN).
    const head = ["ASIN", "Produit", "Fournisseur", "Meilleure offre", "URL fournisseur", "Prix Amazon (Buy Box 90 j)", "Cost Price", "Total Fees", "Profit prélim.", "ROI prélim. %", "Marge prélim. %", "Ventes est.", "Profit mensuel prélim.", "Sources", "Occurrences", "Première découverte", "Dernière découverte", "Revue"];
    const esc = (v: unknown) => (v == null ? "" : /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const lines = filtered.flatMap((r) =>
      r.suppliers.map((s) =>
        [
          r.asin, r.name, s.supplierName ?? s.supplierKey, r.best?.offerId === s.offerId ? "oui" : "", s.supplierUrl, s.salePrice, s.costPrice, s.fbaFee,
          s.profit?.toFixed(2), s.roi?.toFixed(1), s.margin?.toFixed(1), s.estimatedSales, s.monthlyProfit?.toFixed(2), s.sources.join("+"), s.occurrences,
          s.firstSeenAt.slice(0, 10), s.lastSeenAt.slice(0, 10), REVIEW_LABELS[r.reviewStatus as keyof typeof REVIEW_LABELS] ?? r.reviewStatus,
        ].map(esc).join(","),
      ),
    );
    const url = URL.createObjectURL(new Blob(["﻿" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `mondaix-leads-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const scopes = [
    ["ALL", "Tous"],
    ["WEEK", "Cette semaine"],
    ["MULTI", "Plusieurs fournisseurs"],
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
        <span className="ml-auto text-xs text-ink-3 tabular-nums">
          {filtered.length} ASIN · {filtered.reduce((n, r) => n + r.supplierCount, 0)} fournisseurs
        </span>
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
                {header("Fournisseurs", "supplierCount")}
                {header("Prix Amazon (BB 90 j)", "salePrice", "right")}
                {header("Coût", "costPrice", "right")}
                {header("Profit*", "profit", "right")}
                {header("ROI*", "roi", "right")}
                {header("Marge*", "margin", "right")}
                {header("Ventes/mois", "estimatedSales", "right")}
                {header("Profit mensuel*", "monthlyProfit", "right")}
                <th>Sources</th>
                <th>Alertes</th>
                {header("Découverte", "firstSeenAt")}
                <th>Revue</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const isOpen = open.has(r.productId);
                const others = r.supplierCount - 1;
                return (
                  <Fragment key={r.productId}>
                    <tr className={cn(!r.present && "opacity-60", isOpen && "bg-surface-2/40")}>
                      <td className="max-w-72">
                        <Link href={`/leads/${r.asin}`} className="block truncate font-medium text-ink hover:text-accent hover:underline" title={`${r.name} — ouvrir la fiche`}>
                          {r.name}
                        </Link>
                        <div className="flex items-center gap-2">
                          <Asin asin={r.asin} url={r.amazonUrl} />
                          {!r.present && <Badge>Retiré de la Sheet</Badge>}
                        </div>
                      </td>
                      <td className="max-w-56">
                        <button
                          type="button"
                          onClick={() => toggle(r.productId)}
                          aria-expanded={isOpen}
                          className="flex max-w-full items-center gap-1.5 text-left"
                          title="Afficher tous les fournisseurs de cet ASIN"
                        >
                          <span className="truncate">
                            {r.best ? <Supplier name={r.best.supplierName} url={null} fallback={r.best.supplierKey} /> : "—"}
                          </span>
                          {others > 0 && <Badge tone="accent">+{others}</Badge>}
                          <ChevronDown size={14} className={cn("shrink-0 text-ink-3 transition", isOpen && "rotate-180")} />
                        </button>
                      </td>
                      <td className="text-right tabular-nums">{cad(r.salePrice)}</td>
                      <td className="text-right tabular-nums">{cad(r.costPrice)}</td>
                      <td className={cn("text-right font-medium tabular-nums", r.profit != null && r.profit < 0 && "text-[#f08080]")} title={r.best?.calcIssue ?? undefined}>
                        {r.profit == null ? <span className="text-ink-3">n/d</span> : cad(r.profit)}
                      </td>
                      <td className="text-right tabular-nums">{pct(r.roi, 0)}</td>
                      <td className="text-right tabular-nums text-ink-2">{pct(r.margin, 0)}</td>
                      <td className="text-right tabular-nums text-ink-2">{num(r.estimatedSales)}</td>
                      <td className="text-right tabular-nums">{cad(r.monthlyProfit)}</td>
                      <td><SourceBadges sources={r.sources} /></td>
                      <td>
                        <span className="flex flex-wrap gap-1">
                          <DuplicateBadges dup={{ ...r.dup, multiSupplier: false }} compact />
                          {r.suppliers.some((s) => s.sources.includes("OUT_OF_STOCK")) && (
                            <StockBadge status={r.suppliers.find((s) => s.sources.includes("OUT_OF_STOCK"))!.stockStatus} />
                          )}
                        </span>
                      </td>
                      <td className="text-ink-2">{formatDate(r.firstSeenAt)}</td>
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
                    {isOpen && (
                      <tr>
                        <td colSpan={13} className="bg-page/50 px-3 py-3 whitespace-normal">
                          <SupplierList row={r} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-col gap-2 border-t border-line px-3 py-2.5 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between">
        <span>Un lead = un ASIN. Montants = meilleure offre (ROI le plus élevé). Prix Amazon = Buy Box moyenne 90 j (colonne D). * Estimations préliminaires : Buy Box 90 j − Cost Price − Total Fees (colonne H, frais Amazon totaux) − taxes selon le réglage Settings. Hors transport et préparation.</span>
        {pages > 1 && (
          <span className="flex shrink-0 items-center gap-2">
            <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Précédent</button>
            <span className="tabular-nums">{page + 1} / {pages}</span>
            <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Suivant</button>
          </span>
        )}
      </div>
    </div>
  );
}

function SupplierList({ row }: { row: LeadRow }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left text-xs">
        <thead className="text-ink-3">
          <tr className="border-b border-line">
            <th className="px-3 py-2 font-medium">Fournisseur ({row.supplierCount})</th>
            <th className="px-3 py-2 text-right font-medium">Coût</th>
            <th className="px-3 py-2 text-right font-medium">Prix Amazon (BB 90 j)</th>
            <th className="px-3 py-2 text-right font-medium">Total Fees</th>
            <th className="px-3 py-2 text-right font-medium">Profit*</th>
            <th className="px-3 py-2 text-right font-medium">ROI*</th>
            <th className="px-3 py-2 text-right font-medium">Profit mensuel*</th>
            <th className="px-3 py-2 font-medium">Sources</th>
            <th className="px-3 py-2 text-right font-medium">Occ.</th>
            <th className="px-3 py-2 font-medium">Première / dernière découverte</th>
          </tr>
        </thead>
        <tbody>
          {row.suppliers.map((s) => {
            const isBest = row.best?.offerId === s.offerId;
            return (
              <tr key={s.offerId} className={cn("border-b border-line/50 last:border-0", !s.present && "opacity-60")}>
                <td className="px-3 py-2">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Supplier name={s.supplierName} url={s.supplierUrl} fallback={s.supplierKey} />
                    {isBest && row.supplierCount > 1 && <Badge tone="good" icon={<Star size={10} />}>Meilleure offre</Badge>}
                    {s.exactDuplicate && <Badge tone="critical">Doublon exact</Badge>}
                    {s.sources.includes("OUT_OF_STOCK") && <StockBadge status={s.stockStatus} />}
                    {!s.present && <Badge>Retiré</Badge>}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{s.currency !== "CAD" && s.costPrice != null ? `${num(s.costPrice)} ${s.currency}` : cad(s.costPrice)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{cad(s.salePrice)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-2">{cad(s.fbaFee)}</td>
                <td className={cn("px-3 py-2 text-right font-medium tabular-nums", s.profit != null && s.profit < 0 && "text-[#f08080]")} title={s.calcIssue ?? undefined}>
                  {s.calcIssue ? <span className="text-ink-3">n/d</span> : cad(s.profit)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(s.roi, 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{cad(s.monthlyProfit)}</td>
                <td className="px-3 py-2"><SourceBadges sources={s.sources} /></td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-2">{s.occurrences}</td>
                <td className="px-3 py-2 text-ink-2">{formatDate(s.firstSeenAt)} · {formatDate(s.lastSeenAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
