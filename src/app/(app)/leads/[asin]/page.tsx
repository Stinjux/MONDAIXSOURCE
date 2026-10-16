import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { AddToCartButton, BackButton, LeadEditor } from "@/components/LeadActions";
import { Badge, Card, DuplicateBadges, EmptyState, PageHeader, ReviewBadge, SourceBadges, StockBadge, Supplier } from "@/components/ui";
import { ACTION_LABELS, describeChange } from "@/lib/changes";
import { formatDate, formatDateTime } from "@/lib/dates";
import { cad, num, pct } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { loadProducts } from "@/lib/queries";
import { SOURCE_LABELS } from "@/lib/labels";

export const metadata = { title: "Fiche ASIN" };

export default async function LeadPage({ params }: { params: Promise<{ asin: string }> }) {
  const asin = decodeURIComponent((await params).asin).trim().toUpperCase();
  const { products, tax } = await loadProducts(new Date(), { asin });
  const p = products[0];
  if (!p) notFound();
  const offerIds = p.offers.map((o) => o.id);

  const [occurrences, snapshots, changes, purchases] = await Promise.all([
    prisma.occurrence.findMany({ where: { productId: p.id }, orderBy: [{ source: "asc" }, { sheetRow: "asc" }], include: { offer: { select: { supplierName: true, supplierKey: true } } } }),
    prisma.priceSnapshot.findMany({ where: { offerId: { in: offerIds } }, orderBy: { capturedAt: "desc" }, take: 40, include: { offer: { select: { supplierName: true, supplierKey: true } } } }),
    prisma.changeLog.findMany({ where: { entityId: { in: [p.id, ...offerIds] } }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.purchaseItem.findMany({ where: { asin: p.asin }, include: { purchase: true }, orderBy: { purchase: { createdAt: "desc" } } }),
  ]);
  const bought = purchases.filter((i) => !i.purchase.cancelledAt);

  return (
    <>
      <PageHeader
        eyebrow={<span className="font-mono">{p.asin}</span>}
        title={p.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ReviewBadge status={p.reviewStatus} />
            <SourceBadges sources={p.sources} />
            {p.dup.any && <DuplicateBadges dup={p.dup} compact />}
            <span className="text-ink-3">Découvert le {formatDate(p.firstSeenAt)}</span>
            <a href={p.amazonUrl || `https://www.amazon.ca/dp/${p.asin}`} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1">
              Amazon.ca <ExternalLink size={12} />
            </a>
          </span>
        }
        actions={
          <>
            <BackButton />
            <AddToCartButton productId={p.id} />
          </>
        }
      />

      <div className="mb-2 text-xs font-semibold tracking-wide text-ink-2 uppercase">Modifier le lead</div>
      <p className="mb-3 text-xs text-ink-3">
        Notes, statut, prix Amazon et Total Fees vérifiés, coût et disponibilité par fournisseur, restrictions et checklist. Statut : « Revu et validé » = liste
        Achat, « Rejeté » = liste Rejeté, les autres = À définir. Les valeurs vérifiées remplacent celles de la Sheet dans tous les calculs.
      </p>
      <LeadEditor product={p} tax={tax} />

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card title={`Fournisseurs (${p.offers.length})`} padded={false}>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Fournisseur</th>
                  <th className="text-right">Coût</th>
                  <th className="text-right">Prix Amazon</th>
                  <th className="text-right">Profit*</th>
                  <th className="text-right">ROI*</th>
                  <th>Stock</th>
                </tr>
              </thead>
              <tbody>
                {p.offers.map((o) => (
                  <tr key={o.id}>
                    <td className="max-w-56 truncate"><Supplier name={o.supplierName} url={o.supplierUrl} fallback={o.supplierKey} /></td>
                    <td className="text-right tabular-nums">{cad(o.verifiedCostPrice ?? o.costPrice)}{o.verifiedCostPrice != null && <Badge tone="good">vérifié</Badge>}</td>
                    <td className="text-right tabular-nums">{cad(o.amazonPrice)}</td>
                    <td className="text-right tabular-nums">{cad(o.profit.profit)}</td>
                    <td className="text-right tabular-nums">{pct(o.profit.roi, 0)}</td>
                    <td>{o.sources.includes("OUT_OF_STOCK") ? <StockBadge status={o.stockStatus} /> : <span className="text-ink-3">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-2 text-[11px] text-ink-3">* Valeurs importées de la Sheet ; le calcul avec vos valeurs vérifiées est dans l&apos;éditeur ci-dessus.</p>
          </div>
        </Card>

        <Card title={`Achats (${bought.length})`} padded={false}>
          {purchases.length === 0 ? (
            <EmptyState title="Jamais acheté" />
          ) : (
            <ul className="divide-y divide-line">
              {purchases.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span>
                    {formatDateTime(i.purchase.createdAt)} {i.purchase.cancelledAt && <Badge tone="critical">Annulé</Badge>}
                    {i.purchase.note && <span className="block text-xs text-ink-3">{i.purchase.note}</span>}
                  </span>
                  <span className="text-xs text-ink-2 tabular-nums">
                    <b className="text-ink">{i.quantity}</b> × {cad(i.unitCost)} = <b className="text-ink">{cad(i.quantity * i.unitCost)}</b> · profit {cad(i.unitProfit == null ? null : i.unitProfit * i.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Historique des modifications" padded={false}>
          {changes.length === 0 ? (
            <EmptyState title="Aucune modification manuelle" />
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {changes.map((c) => {
                const lines = describeChange(c.before, c.after);
                return (
                  <li key={c.id} className="px-4 py-2.5 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium text-ink">{ACTION_LABELS[c.action] ?? c.action}</span>
                      <span className="text-ink-3">{formatDateTime(c.createdAt)}</span>
                    </div>
                    {lines.map((l, i) => (
                      <div key={i} className="mt-0.5 text-ink-2">{l}</div>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Historique des prix importés" padded={false}>
          {snapshots.length === 0 ? (
            <EmptyState title="Aucun prix enregistré" />
          ) : (
            <div className="max-h-96 overflow-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Fournisseur</th>
                    <th className="text-right">Buy Box 90 j</th>
                    <th className="text-right">Coût</th>
                    <th className="text-right">Total Fees</th>
                    <th className="text-right">Ventes/mois</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s) => (
                    <tr key={s.id}>
                      <td className="text-ink-2">{formatDateTime(s.capturedAt)}</td>
                      <td className="max-w-40 truncate text-ink-2">{s.offer.supplierName ?? s.offer.supplierKey} <span className="text-ink-3">· {SOURCE_LABELS[s.source] ?? s.source}</span></td>
                      <td className="text-right tabular-nums">{cad(s.buyBox90 ?? s.salePrice)}</td>
                      <td className="text-right tabular-nums">{cad(s.costPrice)}</td>
                      <td className="text-right tabular-nums">{cad(s.fbaFee)}</td>
                      <td className="text-right tabular-nums">{num(s.estimatedSales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title={`Lignes dans les Sheets (${occurrences.length})`} padded={false} className="xl:col-span-2">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Sheet</th>
                  <th className="text-right">Ligne</th>
                  <th>Fournisseur</th>
                  <th>Découverte</th>
                  <th>Dernier import</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {occurrences.map((o) => (
                  <tr key={o.id}>
                    <td><SourceBadges sources={[o.source]} /></td>
                    <td className="text-right tabular-nums">{o.sheetRow}</td>
                    <td className="max-w-56 truncate text-ink-2">{o.offer.supplierName ?? o.offer.supplierKey}</td>
                    <td className="text-ink-2">{formatDate(o.discoveredAt)}</td>
                    <td className="text-ink-2">{formatDateTime(o.lastImportedAt)}</td>
                    <td>{o.present ? <Badge tone="good">Présente</Badge> : <Badge>Retirée le {formatDate(o.missingSince)}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
