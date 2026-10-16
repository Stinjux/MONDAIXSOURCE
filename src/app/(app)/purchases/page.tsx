import { PurchaseBoard } from "@/components/PurchaseBoard";
import { PageHeader } from "@/components/ui";
import { weekKey } from "@/lib/dates";
import { toDecisionRows } from "@/lib/decisionRows";
import { loadProducts } from "@/lib/queries";

export const metadata = { title: "Achat · Rejeté · À définir" };

export default async function PurchasesPage() {
  const { products, tax } = await loadProducts();
  return (
    <>
      <PageHeader
        title="Achat · Rejeté · À définir"
        description="Vos décisions d'achat en trois listes distinctes. Déplacez un lead d'un clic : Acheter, Rejeter ou À définir."
      />
      <PurchaseBoard rows={toDecisionRows(products, tax)} currentWeek={weekKey(new Date())} />
    </>
  );
}
