import { BuyDecisions } from "@/components/BuyDecisions";
import { PageHeader } from "@/components/ui";
import { weekKey } from "@/lib/dates";
import { toDecisionRows } from "@/lib/decisionRows";
import { loadProducts } from "@/lib/queries";

export const metadata = { title: "Buy Decisions" };

export default async function DecisionsPage() {
  const { products } = await loadProducts();
  return (
    <>
      <PageHeader
        title="Buy Decisions"
        description="Classez vos leads par score, ROI, profit mensuel ou marge, appliquez vos critères d'achat et préparez votre commande avec un budget."
      />
      <BuyDecisions rows={toDecisionRows(products)} currentWeek={weekKey(new Date())} />
    </>
  );
}
