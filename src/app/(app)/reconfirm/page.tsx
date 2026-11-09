import { FocusScreen } from "@/components/FocusScreen";
import { PageHeader } from "@/components/ui";
import { weekKey } from "@/lib/dates";
import { toDecisionRows } from "@/lib/decisionRows";
import { toFocusLeads } from "@/lib/focus";
import { FRESH_DAYS } from "@/lib/freshness";
import { loadProducts, purchasedProducts } from "@/lib/queries";
import { getNoteTemplates } from "@/lib/settings";

export const metadata = { title: "À reconfirmer" };

export default async function ReconfirmPage({ searchParams }: { searchParams: Promise<{ asin?: string }> }) {
  const now = new Date();
  const [{ products, tax }, purchased, { asin }, templates] = await Promise.all([loadProducts(now), purchasedProducts(), searchParams, getNoteTemplates()]);
  const leads = toFocusLeads(products, toDecisionRows(products, tax, now), purchased);
  return (
    <>
      <PageHeader
        title="À reconfirmer"
        description={`Les données d'un lead sont à reconfirmer ${FRESH_DAYS} jours après son dernier export. Les plus rentables d'abord : vérifiez Amazon et le fournisseur, puis « Toujours bon » si rien n'a changé.`}
      />
      <FocusScreen leads={leads} mode="reconfirm" tax={tax} currentWeek={weekKey(now)} startAsin={asin ?? null} templates={templates} />
    </>
  );
}
