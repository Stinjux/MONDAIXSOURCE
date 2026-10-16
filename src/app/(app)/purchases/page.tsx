import { PurchaseBoard } from "@/components/PurchaseBoard";
import { bucketFromSlug } from "@/lib/labels";
import { PageHeader } from "@/components/ui";
import { weekKey } from "@/lib/dates";
import { toDecisionRows } from "@/lib/decisionRows";
import { loadProducts } from "@/lib/queries";

export const metadata = { title: "Achat · Rejeté · À définir" };

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const initialView = bucketFromSlug((await searchParams).vue);
  const { products, tax } = await loadProducts();
  return (
    <>
      <PageHeader
        title="Achat · Rejeté · À définir"
        description="Vos décisions d'achat en trois listes distinctes. Cliquez sur le titre d'une liste pour l'ouvrir en grand ; déplacez un lead d'un clic."
      />
      <PurchaseBoard rows={toDecisionRows(products, tax)} currentWeek={weekKey(new Date())} initialView={initialView} />
    </>
  );
}
