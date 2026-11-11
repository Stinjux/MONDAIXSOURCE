import { PurchasedList, type PurchaseView } from "@/components/PurchasedList";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Panier potentiel" };

export default async function PurchasedPage() {
  // Panier potentiel uniquement : les achats réels saisis dans COGS n'y figurent pas
  const purchases = await prisma.purchase.findMany({ where: { source: "CART" }, orderBy: { createdAt: "desc" }, include: { items: { orderBy: { asin: "asc" } } } });
  const views: PurchaseView[] = purchases.map((p) => ({
    id: p.id,
    createdAt: p.createdAt.toISOString(),
    note: p.note,
    totalCost: p.totalCost,
    totalProfit: p.totalProfit,
    totalUnits: p.totalUnits,
    cancelledAt: p.cancelledAt?.toISOString() ?? null,
    items: p.items.map((i) => ({
      id: i.id, asin: i.asin, name: i.name, supplierName: i.supplierName, supplierUrl: i.supplierUrl, quantity: i.quantity, unitCost: i.unitCost,
      amazonPrice: i.amazonPrice, fees: i.fees, taxes: i.taxes, unitProfit: i.unitProfit, roi: i.roi, margin: i.margin,
    })),
  }));
  return (
    <>
      <PageHeader title="Panier potentiel" description="Les paniers confirmés dans Buy Decisions : achats envisagés, avec les prix et profits estimés au moment de la confirmation. Ils ne comptent pas dans les COGS (achats réels : section COGS & factures). Export CSV par commande ou global." />
      <PurchasedList purchases={views} />
    </>
  );
}
