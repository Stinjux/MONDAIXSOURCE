"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ChevronDown, Download, PackageCheck, RotateCcw, Search, XCircle } from "lucide-react";
import { cancelPurchase } from "@/app/(app)/actions";
import { toCsv } from "@/lib/cart";
import { formatDateTime } from "@/lib/dates";
import { cad, pct } from "@/lib/format";
import { Asin, Badge, EmptyState, Kpi, Supplier, cn } from "./ui";

export type PurchasedItem = {
  id: string;
  asin: string;
  name: string;
  supplierName: string | null;
  supplierUrl: string | null;
  quantity: number;
  unitCost: number;
  amazonPrice: number | null;
  fees: number | null;
  taxes: number | null;
  unitProfit: number | null;
  roi: number | null;
  margin: number | null;
};

export type PurchaseView = {
  id: string;
  createdAt: string;
  note: string | null;
  totalCost: number;
  totalProfit: number | null;
  totalUnits: number;
  cancelledAt: string | null;
  items: PurchasedItem[];
};

const CSV_HEADER = [
  "Date", "Commande", "Note", "ASIN", "Produit", "Fournisseur", "URL fournisseur", "Quantité", "Coût unitaire", "Coût total",
  "Prix Amazon (BB 90 j)", "Total Fees", "Taxes / u.", "Profit / u.", "Profit total", "ROI %", "Marge %", "Statut",
];

function csvRows(purchases: PurchaseView[]) {
  return purchases.flatMap((p) =>
    p.items.map((i) => [
      p.createdAt.slice(0, 10), p.id.slice(-8).toUpperCase(), p.note, i.asin, i.name, i.supplierName, i.supplierUrl, i.quantity, i.unitCost,
      i.unitCost * i.quantity, i.amazonPrice, i.fees, i.taxes, i.unitProfit, i.unitProfit == null ? null : i.unitProfit * i.quantity,
      i.roi, i.margin, p.cancelledAt ? "Annulé" : "Acheté",
    ]),
  );
}

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export function PurchasedList({ purchases }: { purchases: PurchaseView[] }) {
  const [query, setQuery] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set(purchases.slice(0, 1).map((p) => p.id)));
  const [pending, start] = useTransition();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return purchases
      .filter((p) => showCancelled || !p.cancelledAt)
      .map((p) => (q ? { ...p, items: p.items.filter((i) => `${i.asin} ${i.name} ${i.supplierName ?? ""} ${p.note ?? ""}`.toLowerCase().includes(q)) } : p))
      .filter((p) => p.items.length > 0);
  }, [purchases, query, showCancelled]);

  const active = visible.filter((p) => !p.cancelledAt);
  const items = active.flatMap((p) => p.items);
  const cost = items.reduce((n, i) => n + i.unitCost * i.quantity, 0);
  const profit = items.reduce((n, i) => n + (i.unitProfit ?? 0) * i.quantity, 0);
  const units = items.reduce((n, i) => n + i.quantity, 0);

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const stamp = new Date().toISOString().slice(0, 10);

  if (purchases.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState title="Aucun achat confirmé" icon={<PackageCheck size={22} />}>
          Ajoutez des produits au panier dans <Link href="/decisions" className="link">Buy Decisions</Link> puis cliquez sur « Confirmer l&apos;achat ».
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Commandes" value={active.length} hint={query ? "selon la recherche" : "non annulées"} />
        <Kpi label="Unités achetées" value={units} />
        <Kpi label="Investissement" value={cad(cost)} />
        <Kpi label="Profit attendu" value={cad(profit)} hint={cost > 0 ? `ROI ${pct((profit / cost) * 100, 0)} · prix au moment de l'achat` : undefined} tone="good" />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input className="field pl-9" placeholder="Rechercher par ASIN, produit, fournisseur ou note" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" className="accent-[#3987e5]" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Afficher les achats annulés
        </label>
        <button type="button" className="btn-primary" disabled={!visible.length} onClick={() => download(`mondaix-achats-${stamp}.csv`, toCsv(CSV_HEADER, csvRows(visible)))}>
          <Download size={15} /> Exporter en CSV
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState title="Aucun achat ne correspond" />
        </div>
      ) : (
        visible.map((p) => {
          const isOpen = open.has(p.id);
          return (
            <section key={p.id} className={cn("rounded-xl border bg-surface", p.cancelledAt ? "border-line opacity-60" : "border-line")}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => toggle(p.id)} aria-expanded={isOpen}>
                  <ChevronDown size={16} className={cn("shrink-0 text-ink-3 transition", isOpen && "rotate-180")} />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{formatDateTime(p.createdAt)}</span>
                      <span className="font-mono text-[11px] text-ink-3">#{p.id.slice(-8).toUpperCase()}</span>
                      {p.cancelledAt && <Badge tone="critical">Annulé</Badge>}
                    </span>
                    {p.note && <span className="block truncate text-xs text-ink-2">{p.note}</span>}
                  </span>
                </button>
                <span className="flex gap-4 text-xs text-ink-2 tabular-nums">
                  <span><b className="text-ink">{p.items.length}</b> produits</span>
                  <span><b className="text-ink">{p.totalUnits}</b> unités</span>
                  <span>Coût <b className="text-ink">{cad(p.totalCost)}</b></span>
                  <span>Profit <b className="text-[#5fd35f]">{cad(p.totalProfit)}</b></span>
                </span>
                <span className="flex gap-1">
                  <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => download(`mondaix-achat-${p.createdAt.slice(0, 10)}-${p.id.slice(-8)}.csv`, toCsv(CSV_HEADER, csvRows([p])))}>
                    <Download size={12} /> CSV
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    className="btn-ghost px-2 py-1 text-xs"
                    onClick={() => {
                      if (!p.cancelledAt && !window.confirm("Annuler cet achat ? Il restera dans l'historique, marqué « Annulé ».")) return;
                      start(async () => void (await cancelPurchase(p.id, !p.cancelledAt)));
                    }}
                  >
                    {p.cancelledAt ? <><RotateCcw size={12} /> Rétablir</> : <><XCircle size={12} /> Annuler</>}
                  </button>
                </span>
              </div>
              {isOpen && (
                <div className="overflow-x-auto border-t border-line">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Produit</th>
                        <th>Fournisseur</th>
                        <th className="text-right">Qté</th>
                        <th className="text-right">Coût / u.</th>
                        <th className="text-right">Coût total</th>
                        <th className="text-right">Prix Amazon</th>
                        <th className="text-right">Total Fees</th>
                        <th className="text-right">Profit / u.</th>
                        <th className="text-right">Profit total</th>
                        <th className="text-right">ROI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.items.map((i) => (
                        <tr key={i.id}>
                          <td className="max-w-72">
                            <Link href={`/leads/${i.asin}`} className="block truncate font-medium text-ink hover:text-accent hover:underline" title={i.name}>
                              {i.name}
                            </Link>
                            <Asin asin={i.asin} />
                          </td>
                          <td className="max-w-48 truncate"><Supplier name={i.supplierName} url={i.supplierUrl} fallback="—" /></td>
                          <td className="text-right font-semibold tabular-nums">{i.quantity}</td>
                          <td className="text-right tabular-nums">{cad(i.unitCost)}</td>
                          <td className="text-right font-medium tabular-nums">{cad(i.unitCost * i.quantity)}</td>
                          <td className="text-right tabular-nums text-ink-2">{cad(i.amazonPrice)}</td>
                          <td className="text-right tabular-nums text-ink-2">{cad(i.fees)}</td>
                          <td className={cn("text-right tabular-nums", i.unitProfit != null && i.unitProfit < 0 && "text-[#f08080]")}>{cad(i.unitProfit)}</td>
                          <td className="text-right font-medium tabular-nums text-[#5fd35f]">{i.unitProfit == null ? "—" : cad(i.unitProfit * i.quantity)}</td>
                          <td className="text-right tabular-nums">{pct(i.roi, 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })
      )}
      <p className="text-xs text-ink-3">
        Prix, frais, taxes et profit sont figés au moment de la confirmation : ils ne changent pas si la Sheet est mise à jour ensuite. Un achat annulé
        reste dans l&apos;historique et n&apos;est pas compté dans les totaux.
      </p>
    </div>
  );
}
