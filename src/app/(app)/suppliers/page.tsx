import { SupplierBrowser } from "@/components/SupplierBrowser";
import { PageHeader } from "@/components/ui";
import { toDecisionRows } from "@/lib/decisionRows";
import { prisma } from "@/lib/prisma";
import { loadProducts, purchasedProducts } from "@/lib/queries";
import { groupBySupplier } from "@/lib/suppliers";

export const metadata = { title: "Fournisseurs" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const now = new Date();
  const [{ products, tax }, purchased, purchases, { f }] = await Promise.all([
    loadProducts(now),
    purchasedProducts(),
    prisma.purchaseItem.findMany({ where: { purchase: { cancelledAt: null } }, select: { supplierName: true, supplierUrl: true, quantity: true, unitCost: true } }),
    searchParams,
  ]);
  const groups = groupBySupplier(products, toDecisionRows(products, tax, now), tax, purchased, purchases);
  return (
    <>
      <PageHeader title="Fournisseurs" description="Vos produits regroupés par fournisseur : étape dans le Pipeline, coût et ROI chez ce fournisseur, et ce que vous y avez déjà acheté." />
      <SupplierBrowser groups={groups} initial={f && groups.some((g) => g.key === f) ? f : null} />
    </>
  );
}
