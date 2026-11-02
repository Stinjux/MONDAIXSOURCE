import { FocusScreen } from "@/components/FocusScreen";
import { PageHeader } from "@/components/ui";
import { weekKey } from "@/lib/dates";
import { toDecisionRows } from "@/lib/decisionRows";
import { toFocusLeads } from "@/lib/focus";
import { loadProducts, purchasedProducts } from "@/lib/queries";

export const metadata = { title: "Mode décision" };

export default async function DecidePage({ searchParams }: { searchParams: Promise<{ asin?: string }> }) {
  const now = new Date();
  const [{ products, tax }, purchased, { asin }] = await Promise.all([loadProducts(now), purchasedProducts(), searchParams]);
  const leads = toFocusLeads(products, toDecisionRows(products, tax, now), purchased);
  return (
    <>
      <PageHeader
        title="Mode décision"
        description="Un lead à la fois, du plus intéressant au moins intéressant selon vos filtres de Buy Decisions. Acheter l'ajoute au panier ; la commande se confirme dans Buy Decisions."
      />
      <FocusScreen leads={leads} mode="decide" tax={tax} currentWeek={weekKey(now)} startAsin={asin ?? null} />
    </>
  );
}
