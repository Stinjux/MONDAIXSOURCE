"use client";
// Section Commandes (Sheet COMMANDES) : totaux, coût unitaire hors taxes, classement des fournisseurs
// et liste des commandes avec le lien vers le courriel.
import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, Mail, Search, ShoppingBag } from "lucide-react";
import { formatDate } from "@/lib/dates";
import { cad, pct } from "@/lib/format";
import { QC_TAX_RATE, ordersBySupplier, ordersTotals, type OrderView } from "@/lib/orders";
import { toCsv } from "@/lib/cart";
import { StoreLogo } from "./StoreLogo";
import { EmptyState, Kpi, cn } from "./ui";

type Row = OrderView & { present: boolean };

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  Object.assign(document.createElement("a"), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

const safeLink = (v: string | null) => (v && /^https?:\/\//i.test(v) ? v : null);

export function OrdersView({ orders, removed, dashboard, initialSupplier }: { orders: Row[]; removed: number; dashboard: React.ReactNode; initialSupplier: string | null }) {
  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState<string | null>(initialSupplier);
  const totals = ordersTotals(orders);
  const suppliers = useMemo(() => ordersBySupplier(orders), [orders]);
  const maxPaid = Math.max(1, ...suppliers.map((s) => s.totalPaid));
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => (!supplier || o.supplierKey === supplier) && (!q || `${o.supplierName} ${o.supplierText} ${o.orderedText ?? ""}`.toLowerCase().includes(q)));
  }, [orders, query, supplier]);
  const shown = ordersTotals(visible);

  const pickSupplier = (key: string | null) => {
    setSupplier(key);
    const url = new URL(window.location.href);
    if (key) url.searchParams.set("f", key);
    else url.searchParams.delete("f");
    window.history.replaceState(null, "", url);
  };

  const exportCsv = () =>
    download(
      `mondaix-commandes-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(
        ["Date de commande", "Fournisseur", "Quantité", "Prix total TTC", "Taxes (TPS+TVQ)", "Total HT", "Coût unitaire HT", "Lien vers le courriel", "Ligne de la Sheet"],
        visible.map((o) => [o.orderedAt.slice(0, 10), o.supplierName, o.quantity, o.totalPaid, o.taxes, o.beforeTax, o.unitCost, o.emailUrl, o.sheetRow]),
      ),
    );

  if (orders.length === 0) {
    return (
      <div className="rounded-md border border-line bg-surface">
        <EmptyState title="Aucune commande importée" icon={<ShoppingBag size={22} />}>
          Ajoutez la variable Railway <code className="font-mono text-xs">ORDERS_SHEET_ID</code> (ID de la Sheet COMMANDES, partagée en lecture avec le compte de service),
          puis synchronisez. Colonnes : A Fournisseur, B Prix total ($ CA, taxes incluses), C Quantité, D Date de commande, E Lien vers le courriel.
          {removed > 0 && ` ${removed} commande${removed > 1 ? "s" : ""} retirée${removed > 1 ? "s" : ""} de la Sheet reste${removed > 1 ? "nt" : ""} conservée${removed > 1 ? "s" : ""} en base.`}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="COGS hors taxes" value={cad(totals.beforeTax)} hint={`${totals.orders} commande${totals.orders > 1 ? "s" : ""}`} tone="accent" />
        <Kpi label="Total payé (TTC)" value={cad(totals.totalPaid)} hint={`dont ${cad(totals.taxes)} de TPS + TVQ`} />
        <Kpi label="Unités commandées" value={totals.units.toLocaleString("fr-CA")} hint={`${suppliers.length} fournisseur${suppliers.length > 1 ? "s" : ""}`} />
        <Kpi label="Coût moyen par unité" value={cad(totals.avgUnitCost)} hint="hors taxes" />
      </div>

      {dashboard}

      {/* Classement des fournisseurs */}
      <section className="overflow-hidden rounded-md border border-line bg-surface" aria-label="Classement des fournisseurs">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-[12px] font-semibold tracking-[0.1em] text-ink-2 uppercase">Où vous achetez le plus</h2>
          <span className="text-[11px] text-ink-3">Cliquez sur un fournisseur pour filtrer ses commandes</span>
        </div>
        <ol className="divide-y divide-line">
          {suppliers.map((s, i) => (
            <li key={s.key}>
              <div className={cn("flex items-center gap-3 px-4 py-2.5 transition", supplier === s.key ? "bg-accent-soft" : "hover:bg-surface-2")}>
                <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-ink-3">{i + 1}</span>
                <button type="button" onClick={() => pickSupplier(supplier === s.key ? null : s.key)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-pressed={supplier === s.key}>
                  <StoreLogo name={s.name} domain={s.domain} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-ink">{s.name}</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{cad(s.totalPaid)}</span>
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-[2px] bg-surface-3">
                      <span className="block h-full rounded-[2px] bg-[#1c5cab]" style={{ width: `${(s.totalPaid / maxPaid) * 100}%` }} />
                    </span>
                    <span className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-ink-3 tabular-nums">
                      <span>{pct(s.share, 0)} du total</span>
                      <span>{s.orders} commande{s.orders > 1 ? "s" : ""}</span>
                      <span>{s.units} unités</span>
                      <span>{cad(s.avgUnitCost)} / u. HT</span>
                      {s.lastAt && <span>dernière le {formatDate(s.lastAt)}</span>}
                    </span>
                  </span>
                </button>
                {s.key !== "unknown" && (
                  <Link href={`/suppliers?f=${encodeURIComponent(s.key)}`} className="hidden shrink-0 text-xs text-accent hover:underline sm:block">
                    Fiche fournisseur
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Commandes */}
      <div className="flex flex-col gap-3 rounded-md border border-line bg-surface p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input className="field pl-9" placeholder="Rechercher un fournisseur ou une date" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher" />
        </div>
        {supplier && (
          <button type="button" className="btn-ghost text-xs" onClick={() => pickSupplier(null)}>
            {suppliers.find((s) => s.key === supplier)?.name ?? supplier} · tout afficher
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={exportCsv}>
          <Download size={15} /> Commandes (CSV)
        </button>
      </div>
      <div className="overflow-hidden rounded-md border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Date</th>
                <th>Fournisseur</th>
                <th className="text-right">Quantité</th>
                <th className="text-right">Prix total TTC</th>
                <th className="text-right">TPS + TVQ</th>
                <th className="text-right">Total HT</th>
                <th className="text-right">Coût / u. HT</th>
                <th>Courriel</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => {
                const mail = safeLink(o.emailUrl);
                return (
                  <tr key={o.id}>
                    <td className="whitespace-nowrap text-ink-2">
                      {formatDate(o.orderedAt)}
                      {!o.dateFromSheet && <span className="block text-[10px] text-warning">date d&apos;import</span>}
                    </td>
                    <td className="max-w-64">
                      <span className="flex items-center gap-2">
                        <StoreLogo name={o.supplierName} domain={suppliers.find((s) => s.key === o.supplierKey)?.domain ?? null} size={22} />
                        <span className="truncate font-medium text-ink" title={o.supplierText}>{o.supplierName}</span>
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{o.quantity}</td>
                    <td className="text-right tabular-nums">{cad(o.totalPaid)}</td>
                    <td className="text-right tabular-nums text-ink-3">{cad(o.taxes)}</td>
                    <td className="text-right tabular-nums">{cad(o.beforeTax)}</td>
                    <td className="text-right font-semibold tabular-nums">{cad(o.unitCost)}</td>
                    <td>
                      {mail ? (
                        <a href={mail} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                          <Mail size={13} /> Ouvrir
                        </a>
                      ) : o.emailUrl ? (
                        <span className="text-xs text-ink-3" title={o.emailUrl}>{o.emailUrl.slice(0, 24)}</span>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {visible.length > 0 && (
              <tfoot>
                <tr className="font-semibold">
                  <td colSpan={2} className="text-ink-2">Total ({shown.orders} commande{shown.orders > 1 ? "s" : ""})</td>
                  <td className="text-right tabular-nums">{shown.units}</td>
                  <td className="text-right tabular-nums">{cad(shown.totalPaid)}</td>
                  <td className="text-right tabular-nums text-ink-3">{cad(shown.taxes)}</td>
                  <td className="text-right tabular-nums">{cad(shown.beforeTax)}</td>
                  <td className="text-right tabular-nums">{cad(shown.avgUnitCost)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {visible.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-3">Aucune commande ne correspond.</p>}
      </div>
      <p className="text-xs text-ink-3">
        Coût unitaire HT = prix total ÷ (1 + {String(QC_TAX_RATE).replace(".", ",")} %) ÷ quantité : le prix total de la colonne B est considéré taxes incluses (TPS 5 % + TVQ 9,975 %).
        Les commandes viennent de la Sheet COMMANDES et ne sont jamais modifiées par la synchronisation : une ligne retirée ou corrigée dans la Sheet ne compte plus, mais reste conservée en base
        {removed > 0 ? ` (${removed} actuellement)` : ""}.
      </p>
    </div>
  );
}
