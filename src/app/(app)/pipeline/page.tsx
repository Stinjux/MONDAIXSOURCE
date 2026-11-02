import { PipelineBoard } from "@/components/PipelineBoard";
import { PageHeader } from "@/components/ui";
import { weekKey } from "@/lib/dates";
import { toDecisionRows } from "@/lib/decisionRows";
import { stageFromSlug } from "@/lib/pipeline";
import { loadProducts, purchasedProducts } from "@/lib/queries";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const now = new Date();
  const [{ products, tax }, purchased, { vue }] = await Promise.all([loadProducts(now), purchasedProducts(), searchParams]);
  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Chaque lead, de son arrivée à l'achat. Glissez une carte pour changer son statut ; cliquez sur le titre d'une colonne pour l'ouvrir en grand."
      />
      <PipelineBoard rows={toDecisionRows(products, tax, now)} purchased={Object.fromEntries(purchased)} currentWeek={weekKey(now)} initialView={stageFromSlug(vue)} />
    </>
  );
}
