import { DecisionWorkspace } from "@/components/DecisionWorkspace";
import { PageHeader } from "@/components/ui";
import { weekKey } from "@/lib/dates";
import { toDecisionRows } from "@/lib/decisionRows";
import { toFocusLeads } from "@/lib/focus";
import { loadProducts, purchasedProducts } from "@/lib/queries";
import { getNoteTemplates } from "@/lib/settings";

export const metadata = { title: "Buy Decisions" };

export default async function DecisionsPage({ searchParams }: { searchParams: Promise<{ asin?: string; vue?: string }> }) {
  const now = new Date();
  const [{ products, tax }, purchased, { asin, vue }, templates] = await Promise.all([loadProducts(now), purchasedProducts(), searchParams, getNoteTemplates()]);
  const rows = toDecisionRows(products, tax, now);
  return (
    <>
      <PageHeader
        title="Buy Decisions"
        description="Un lead à la fois, du plus intéressant au moins intéressant selon vos critères — ou tous en liste. « Acheter » ajoute au panier ; la commande se confirme dans le panier."
      />
      <DecisionWorkspace
        rows={rows}
        leads={toFocusLeads(products, rows, purchased)}
        tax={tax}
        templates={templates}
        currentWeek={weekKey(now)}
        startAsin={asin ?? null}
        initialView={vue === "liste" && !asin ? "list" : "focus"}
      />
    </>
  );
}
