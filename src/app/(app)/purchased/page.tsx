import { PurchasedList, type PurchaseView } from "@/components/PurchasedList";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Acheté" };

export default async function PurchasedPage() {
  const purchases = await prisma.purchase.findMany({ orderBy: { createdAt: "desc" }, include: { items: { orderBy: { asin: "asc" } } } });
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
      <PageHeader title="Acheté" description="Tous vos achats confirmés depuis le panier, avec les prix au moment de l'achat. Exportables en CSV." />
      <PurchasedList purchases={views} />
    </>
  );
}
