"use client";
// Section COGS : coût des marchandises par produit, avec le nombre de factures de chacun.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Download, FileText, Receipt, Search } from "lucide-react";
import type { CogsProduct } from "@/lib/cogs";
import { formatDate } from "@/lib/dates";
import { cad } from "@/lib/format";
import { toCsv } from "@/lib/cart";
import { ProductImage } from "./ProductImage";
import { ManualPurchaseForm } from "./ManualPurchaseForm";
import { EmptyState, Kpi, Supplier, cn } from "./ui";

type Row = CogsProduct & { documents: number };

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  Object.assign(document.createElement("a"), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

export function CogsList({ products, dashboard }: { products: Row[]; dashboard?: React.ReactNode }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const missing = products.filter((p) => p.units > 0 && p.documents === 0);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => (!missingOnly || (p.units > 0 && p.documents === 0)) && (!q || `${p.asin} ${p.name} ${p.suppliers.map((s) => s.name).join(" ")}`.toLowerCase().includes(q)));
  }, [products, query, missingOnly]);
  const total = products.reduce((n, p) => n + p.totalCost, 0);
  const units = products.reduce((n, p) => n + p.units, 0);
  const docs = products.reduce((n, p) => n + p.documents, 0);

  const exportCsv = () =>
    download(
      `mondaix-cogs-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(
        ["ASIN", "Produit", "Fournisseurs", "Unités commandées", "Coût moyen / u.", "Coût min / u.", "Coût max / u.", "Coût total", "Commandes", "Première commande", "Dernière commande", "Documents"],
        visible.map((p) => [p.asin, p.name, p.suppliers.map((s) => s.name).filter(Boolean).join(" / "), p.units, p.avgUnitCost, p.minUnitCost, p.maxUnitCost, p.totalCost, p.orders, p.firstAt?.slice(0, 10) ?? null, p.lastAt?.slice(0, 10) ?? null, p.documents]),
      ),
    );

  if (products.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <ManualPurchaseForm defaultOpen label="Nouvel achat" />
        <div className="rounded-md border border-line bg-surface">
          <EmptyState title="Aucun achat enregistré" icon={<Receipt size={22} />}>
            Ajoutez vos achats réels ci-dessus, à partir du lien Amazon du produit. Le panier potentiel de Buy Decisions n&apos;est pas compté dans les COGS.
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <ManualPurchaseForm label="Nouvel achat" />
      </div>
      {dashboard}
      <h2 className="mt-2 border-b border-line pb-2 text-[12px] font-semibold tracking-[0.1em] text-ink-2 uppercase">Tous les achats, par produit</h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Coût total des achats" value={cad(total)} hint="commandes non annulées" />
        <Kpi label="Unités commandées" value={units.toLocaleString("fr-CA")} hint={`${products.filter((p) => p.units > 0).length} produits`} />
        <Kpi label="Documents" value={docs} hint="factures, reçus et autres" icon={<FileText size={16} />} tone="accent" />
        <Kpi
          label="Sans facture"
          value={missing.length}
          hint={missing.length ? "produits achetés sans document" : "tous les achats sont justifiés"}
          icon={<AlertTriangle size={16} />}
          tone={missing.length ? "critical" : "good"}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-line bg-surface p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input className="field pl-9" placeholder="Rechercher par ASIN, produit ou fournisseur" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" className="accent-accent" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} /> Sans facture seulement ({missing.length})
        </label>
        <button type="button" className="btn-ghost" onClick={exportCsv}>
          <Download size={15} /> COGS (CSV)
        </button>
        <a href="/api/documents/export" className="btn-ghost">
          <Download size={15} /> Tous les documents (.zip)
        </a>
      </div>

      <div className="overflow-hidden rounded-md border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Fournisseurs</th>
                <th className="text-right">Unités</th>
                <th className="text-right">Coût moyen / u.</th>
                <th className="text-right">Coût total</th>
                <th className="text-right">Commandes</th>
                <th>Dernière commande</th>
                <th>Documents</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.asin} className="cursor-pointer" onClick={(e) => !(e.target as HTMLElement).closest("a") && router.push(`/cogs/${p.asin}`)}>
                  <td className="max-w-96">
                    <div className="flex items-center gap-2.5">
                      <ProductImage asin={p.asin} size={40} />
                      <div className="min-w-0">
                        <Link href={`/cogs/${p.asin}`} className="block truncate font-medium text-ink hover:text-accent hover:underline" title={p.name}>
                          {p.name}
                        </Link>
                        <span className="font-mono text-xs text-ink-3">{p.asin}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      {p.suppliers.slice(0, 2).map((s, i) => (
                        <Supplier key={i} name={s.name} url={s.url} />
                      ))}
                      {p.suppliers.length > 2 && <span className="text-xs text-ink-3">+{p.suppliers.length - 2}</span>}
                    </span>
                  </td>
                  <td className="text-right font-semibold tabular-nums">{p.units}</td>
                  <td className="text-right tabular-nums">
                    {cad(p.avgUnitCost)}
                    {p.minUnitCost != null && p.maxUnitCost != null && p.minUnitCost !== p.maxUnitCost && (
                      <span className="block text-[11px] text-ink-3">
                        {cad(p.minUnitCost)} – {cad(p.maxUnitCost)}
                      </span>
                    )}
                  </td>
                  <td className="text-right font-semibold tabular-nums">{cad(p.totalCost)}</td>
                  <td className="text-right tabular-nums">{p.orders}</td>
                  <td className="text-ink-2">{p.lastAt ? formatDate(p.lastAt) : "—"}</td>
                  <td>
                    {p.documents > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-2">
                        <FileText size={13} className="text-accent" /> {p.documents}
                      </span>
                    ) : p.units > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-sm border border-critical/30 bg-critical/[0.06] px-1.5 text-[11px] font-medium text-critical">
                        <AlertTriangle size={11} /> Aucune facture
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-right text-ink-3">
                    <ChevronRight size={16} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visible.length === 0 && <p className={cn("px-4 py-6 text-center text-sm text-ink-3")}>Aucun produit ne correspond.</p>}
      </div>
      <p className="text-xs text-ink-3">
        COGS = unités commandées × coût unitaire payé, d&apos;après les achats réels saisis ici (le panier potentiel de Buy Decisions n&apos;en fait pas partie).
        Le contenu des documents n&apos;est pas recopié dans les sauvegardes automatiques : téléchargez de temps en temps « Tous les documents (.zip) » et gardez-le hors de Railway.
      </p>
    </div>
  );
}
