import { AlertTriangle, CircleSlash, PackageCheck, PackageSearch, RefreshCcw } from "lucide-react";
import { AckButton } from "@/components/AckButton";
import { OosTable, type OosRow } from "@/components/OosTable";
import { Asin, Card, Kpi, PageHeader, Supplier } from "@/components/ui";
import { config } from "@/lib/config";
import { formatDateTime } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { loadProducts } from "@/lib/queries";

export const metadata = { title: "Out of Stock" };

export default async function OutOfStockPage() {
  const { products } = await loadProducts();
  const tracked = products.flatMap((p) => p.offers.filter((o) => o.sources.includes("OUT_OF_STOCK")).map((o) => ({ p, o })));
  const checks = await prisma.stockCheck.findMany({
    where: { offerId: { in: tracked.map((t) => t.o.id) } },
    orderBy: { recordedAt: "desc" },
  });
  const checksByOffer = new Map<string, typeof checks>();
  for (const c of checks) {
    const list = checksByOffer.get(c.offerId) ?? [];
    if (list.length < 10) list.push(c);
    checksByOffer.set(c.offerId, list);
  }

  const rows: OosRow[] = tracked.map(({ p, o }) => ({
    offerId: o.id,
    asin: p.asin,
    name: p.name,
    amazonUrl: p.amazonUrl,
    supplierName: o.supplierName,
    supplierUrl: o.supplierUrl,
    supplierKey: o.supplierKey,
    costPrice: o.costPrice,
    currency: o.currency,
    salePrice: o.amazonPrice,
    sheetRoi: o.sheetRoi,
    sheetProfit: o.sheetProfit,
    estimatedSales: o.estimatedSales,
    availability: o.oosAvailability,
    notes: o.oosNotes,
    stockStatus: o.stockStatus,
    stockCheckedAt: o.stockCheckedAt,
    stockDetail: o.stockDetail,
    needsRecheck: o.needsRecheck,
    backInStockAt: o.backInStockAt,
    present: o.present,
    inLeads: o.sources.includes("LEADS"),
    checks: (checksByOffer.get(o.id) ?? []).map((c) => ({
      id: c.id, origin: c.origin, status: c.status, availability: c.availability, checkedAt: c.checkedAt?.toISOString() ?? null,
      checkedText: c.checkedText, detail: c.detail, recordedAt: c.recordedAt.toISOString(),
    })),
  }));

  const active = rows.filter((r) => r.present);
  const count = (s: string) => active.filter((r) => r.stockStatus === s).length;
  const alerts = tracked.filter(({ o }) => o.backInStockAlert);

  return (
    <>
      <PageHeader title="Out of Stock" description="Surveillance des produits en rupture chez leurs fournisseurs (Sheet OUT OF STOCK, colonnes A à P)." />
      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-5">
        <Kpi label="Produits suivis" value={active.length} hint={rows.length > active.length ? `+ ${rows.length - active.length} retirés de la Sheet` : "présents dans la Sheet"} icon={<PackageSearch size={16} />} />
        <Kpi label="Encore indisponibles" value={count("OUT_OF_STOCK")} icon={<CircleSlash size={16} />} tone="critical" />
        <Kpi label="Revenus en stock" value={count("IN_STOCK")} hint="vérifiés (date valide)" icon={<PackageCheck size={16} />} tone="good" />
        <Kpi label="Vérification échouée" value={count("CHECK_FAILED")} icon={<AlertTriangle size={16} />} tone="warning" />
        <Kpi label="À revérifier" value={active.filter((r) => r.needsRecheck).length} hint={`incertain ou > ${config.recheckDays} jours`} icon={<RefreshCcw size={16} />} tone="accent" />
      </div>

      {alerts.length > 0 && (
        <Card className="mb-4 border-good/40" title={<span className="flex items-center gap-2 text-[#5fd35f]"><PackageCheck size={16} /> De retour en stock</span>} padded={false}>
          <ul className="divide-y divide-line">
            {alerts.map(({ p, o }) => (
              <li key={o.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                    <Asin asin={p.asin} url={p.amazonUrl} />
                    <Supplier name={o.supplierName} url={o.supplierUrl} fallback={o.supplierKey} />
                    <span>vérifié le {formatDateTime(o.stockCheckedAt)}</span>
                  </div>
                </div>
                <AckButton kind="stock" id={o.id} label="Vu" />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <OosTable rows={rows} />
    </>
  );
}
