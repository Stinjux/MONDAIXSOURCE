import { ApprovalsBoard } from "@/components/ApprovalsBoard";
import { PageHeader } from "@/components/ui";
import { loadBuyStatuses } from "@/lib/buyQueries";
import { weekKey } from "@/lib/dates";
import { toDecisionRows } from "@/lib/decisionRows";
import { loadProducts } from "@/lib/queries";

export const metadata = { title: "Achats à deux" };

export default async function ApprovalsPage() {
  const now = new Date();
  const [{ products, tax }, statuses] = await Promise.all([loadProducts(now), loadBuyStatuses()]);
  return (
    <>
      <PageHeader
        eyebrow="Sourcing"
        title="Achats à deux"
        description="Chaque achat est confirmé par vous deux : « Acheter » dans Buy Decisions enregistre votre approbation, votre partenaire voit votre proposition et approuve ou refuse de son côté. En cas de désaccord, le lead passe « À discuter »."
      />
      <ApprovalsBoard rows={toDecisionRows(products, tax, now)} statuses={Object.fromEntries(statuses)} currentWeek={weekKey(now)} />
    </>
  );
}
