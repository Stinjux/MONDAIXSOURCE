import { DecisionWorkspace } from "@/components/DecisionWorkspace";
import { PageHeader } from "@/components/ui";
import { weekKey } from "@/lib/dates";
import { toDecisionRows } from "@/lib/decisionRows";
import { toFocusLeads } from "@/lib/focus";
import { loadProducts, purchasedProducts } from "@/lib/queries";
import { getNoteTemplates } from "@/lib/settings";
import { loadBuyStatuses } from "@/lib/buyQueries";

export const metadata = { title: "Buy Decisions" };

export default async function DecisionsPage({ searchParams }: { searchParams: Promise<{ asin?: string; vue?: string }> }) {
  const now = new Date();
  const [{ products, tax }, purchased, { asin, vue }, templates, buy] = await Promise.all([loadProducts(now), purchasedProducts(), searchParams, getNoteTemplates(), loadBuyStatuses()]);
  const rows = toDecisionRows(products, tax, now);
  return (
    <>
      <PageHeader
        title="Buy Decisions"
        description="Un lead à la fois, du plus intéressant au moins intéressant selon vos critères — ou tous en liste, ou sur une carte aux axes de votre choix. « Acheter » ajoute au panier ; la commande se confirme dans le panier."
      />
      <DecisionWorkspace
        rows={rows}
        leads={toFocusLeads(products, rows, purchased).map((l) => ({ ...l, buy: buy.get(l.productId) ?? null }))}
        tax={tax}
        templates={templates}
        currentWeek={weekKey(now)}
        startAsin={asin ?? null}
        initialView={asin ? "focus" : vue === "liste" ? "list" : vue === "carte" ? "map" : "focus"}
      />
    </>
  );
}
