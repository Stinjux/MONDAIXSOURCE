import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileText, LineChart, ShoppingBag } from "lucide-react";
import { DocumentDrop } from "@/components/DocumentDrop";
import { ManualPurchaseForm } from "@/components/ManualPurchaseForm";
import { ProductImage } from "@/components/ProductImage";
import { Badge, Card, EmptyState, Kpi, PageHeader, Supplier, cn } from "@/components/ui";
import { cogsByProduct } from "@/lib/cogs";
import { loadCogsLines, loadProductDocuments } from "@/lib/cogsQueries";
import { formatDate } from "@/lib/dates";
import { cad } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "COGS du produit" };

export default async function CogsProductPage({ params }: { params: Promise<{ asin: string }> }) {
  const asin = decodeURIComponent((await params).asin).trim().toUpperCase();
  const [product, lines, documents] = await Promise.all([
    prisma.product.findUnique({ where: { asin }, select: { name: true, amazonUrl: true } }),
    loadCogsLines(asin),
    loadProductDocuments(asin),
  ]);
  if (!product && !lines.length && !documents.length) notFound();
  const name = product?.name ?? lines[0]?.name ?? asin;
  const summary = cogsByProduct(lines)[0];
  const docsByOrder = new Map<string, number>();
  for (const d of documents) if (d.purchaseId && !d.archivedAt) docsByOrder.set(d.purchaseId, (docsByOrder.get(d.purchaseId) ?? 0) + 1);
  const orders = lines.map((l) => ({ id: l.purchaseId, label: `${formatDate(l.orderedAt)} · ${l.quantity} u. · ${cad(l.unitCost)}/u.${l.supplierName ? ` · ${l.supplierName}` : ""}${l.cancelled ? " (annulée)" : ""}` }));
  const activeDocs = documents.filter((d) => !d.archivedAt).length;

  return (
    <>
      <Link href="/cogs" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={14} /> COGS & factures
      </Link>
      <PageHeader
        eyebrow={<span className="font-mono">{asin}</span>}
        title={name}
        description={
          <span className="flex flex-wrap items-center gap-3">
            <ProductImage asin={asin} size={56} />
            <Link href={`/leads/${asin}`} className="link inline-flex items-center gap-1">
              Fiche du lead
            </Link>
            <a href={product?.amazonUrl || `https://www.amazon.ca/dp/${asin}`} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1">
              Amazon.ca <ExternalLink size={12} />
            </a>
            <a href={`https://keepa.com/#!product/6-${asin}`} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1">
              Keepa <LineChart size={12} />
            </a>
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Unités commandées" value={summary?.units ?? 0} hint={`${summary?.orders ?? 0} commande${(summary?.orders ?? 0) > 1 ? "s" : ""}`} icon={<ShoppingBag size={16} />} tone="accent" />
        <Kpi
          label="Coût par unité"
          value={cad(summary?.avgUnitCost)}
          hint={summary && summary.minUnitCost !== summary.maxUnitCost ? `moyenne · de ${cad(summary.minUnitCost)} à ${cad(summary.maxUnitCost)}` : "moyenne pondérée"}
        />
        <Kpi label="Coût total" value={cad(summary?.totalCost ?? 0)} hint="commandes non annulées" />
        <Kpi label="Documents" value={activeDocs} hint={activeDocs ? "factures et pièces jointes" : "aucune facture"} icon={<FileText size={16} />} tone={activeDocs ? "good" : "critical"} />
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card title="Commandes" action={<a href={`/api/documents/export?asin=${asin}`} className="link text-xs">Documents (.zip)</a>} padded={false}>
          {lines.length ? (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Fournisseur</th>
                    <th className="text-right">Unités</th>
                    <th className="text-right">Coût / u.</th>
                    <th className="text-right">Total</th>
                    <th>Pièces</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={`${l.purchaseId}-${i}`} className={cn(l.cancelled && "opacity-55")}>
                      <td>
                        <span className="block">{formatDate(l.orderedAt)}</span>
                        {l.orderNumber && <span className="block font-mono text-[11px] text-ink-3">n° {l.orderNumber}</span>}
                        {l.cancelled && <Badge tone="critical">Annulée</Badge>}
                        {l.note && <span className="mt-0.5 block max-w-48 truncate text-[11px] text-ink-3" title={l.note}>{l.note}</span>}
                      </td>
                      <td className="max-w-40">{l.supplierName || l.supplierUrl ? <Supplier name={l.supplierName} url={l.supplierUrl} /> : "—"}</td>
                      <td className="text-right font-semibold tabular-nums">{l.quantity}</td>
                      <td className="text-right tabular-nums">{cad(l.unitCost)}</td>
                      <td className="text-right font-semibold tabular-nums">{cad(l.quantity * l.unitCost)}</td>
                      <td>
                        {docsByOrder.get(l.purchaseId) ? (
                          <span className="inline-flex items-center gap-1 text-xs text-ink-2">
                            <FileText size={12} className="text-accent" /> {docsByOrder.get(l.purchaseId)}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-3">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {summary && (
                  <tfoot>
                    <tr className="bg-surface-2 font-semibold">
                      <td colSpan={2} className="px-3 py-2.5 text-xs tracking-wide text-ink-2 uppercase">Total (hors annulées)</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{summary.units}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{cad(summary.avgUnitCost)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{cad(summary.totalCost)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          ) : (
            <EmptyState title="Aucun achat enregistré">Ajoutez vos achats réels de ce produit ci-dessous.</EmptyState>
          )}
          <div className="border-t border-line p-3">
            <ManualPurchaseForm asin={asin} defaultSupplier={lines.find((l) => l.supplierUrl)?.supplierUrl ?? lines.find((l) => l.supplierName)?.supplierName ?? null} />
          </div>
        </Card>

        <Card title="Factures et documents" padded>
          <DocumentDrop asin={asin} documents={documents} orders={orders} />
        </Card>
      </div>
    </>
  );
}
