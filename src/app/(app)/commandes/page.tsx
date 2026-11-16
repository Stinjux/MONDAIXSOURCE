import Link from "next/link";
import { CogsDashboard } from "@/components/CogsDashboard";
import { OrdersSyncStatus, type OrdersSyncInfo } from "@/components/OrdersSyncStatus";
import { OrdersView } from "@/components/OrdersView";
import { sheetConfig } from "@/lib/google";
import { PageHeader } from "@/components/ui";
import type { CogsLine } from "@/lib/cogs";
import { prisma } from "@/lib/prisma";
import { loadOrders } from "@/lib/ordersQueries";

export const metadata = { title: "Commandes" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const [orders, removed, lastRun, { f }] = await Promise.all([
    loadOrders(),
    prisma.supplierOrder.count({ where: { present: false } }),
    prisma.importRun.findFirst({ where: { source: "ORDERS" }, orderBy: { startedAt: "desc" }, include: { issues: { take: 30, orderBy: { sheetRow: "asc" } } } }),
    searchParams,
  ]);
  const cfg = sheetConfig("ORDERS");
  const info: OrdersSyncInfo = {
    configured: !!cfg.id,
    idVar: cfg.idVar,
    range: cfg.range,
    rangeSet: cfg.rangeSet,
    lastRun: lastRun && {
      status: lastRun.status,
      startedAt: lastRun.startedAt.toISOString(),
      details: lastRun.details,
      rowsRead: lastRun.rowsRead,
      imported: lastRun.imported,
      errors: lastRun.errors,
      warnings: lastRun.warnings,
      missing: lastRun.missing,
    },
    issues: (lastRun?.issues ?? []).map((i) => ({ sheetRow: i.sheetRow, severity: i.severity, message: i.message })),
  };
  // Tableau de bord par période : coût hors taxes de chaque commande
  const lines: CogsLine[] = orders.map((o) => ({
    purchaseId: o.id,
    asin: "",
    name: "",
    quantity: o.quantity,
    unitCost: o.quantity ? o.beforeTax / o.quantity : 0,
    supplierName: o.supplierName,
    supplierUrl: o.supplierUrl,
    orderedAt: o.orderedAt,
    cancelled: false,
    source: "ORDERS",
    note: null,
  }));
  return (
    <>
      <PageHeader
        eyebrow="Inventaire"
        title="Commandes"
        description={
          <>
            Chaque commande passée chez un fournisseur, lue dans la Sheet COMMANDES : coût total, taxes du Québec retirées, coût par unité, et les fournisseurs où vous achetez le plus.
            Les achats saisis produit par produit restent dans <Link href="/cogs" className="link">COGS &amp; factures</Link>.
          </>
        }
      />
      <div className="mb-4">
        <OrdersSyncStatus info={info} hasOrders={orders.length > 0} />
      </div>
      <OrdersView
        orders={orders}
        removed={removed}
        initialSupplier={f && orders.some((o) => o.supplierKey === f) ? f : null}
        dashboard={lines.length ? <CogsDashboard lines={lines} now={new Date().toISOString()} byProduct={false} label="COGS HT" /> : null}
      />
    </>
  );
}
