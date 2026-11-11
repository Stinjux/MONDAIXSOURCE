import { CogsDashboard } from "@/components/CogsDashboard";
import { CogsList } from "@/components/CogsList";
import { PageHeader } from "@/components/ui";
import { loadCogsLines, loadCogsOverview } from "@/lib/cogsQueries";

export const metadata = { title: "COGS & factures" };

export default async function CogsPage() {
  const [products, lines] = await Promise.all([loadCogsOverview(), loadCogsLines()]);
  return (
    <>
      <PageHeader
        eyebrow="Inventaire"
        title="COGS & factures"
        description="Le coût de vos marchandises, produit par produit : unités commandées, coût par unité, coût total, et les factures de chaque achat."
      />
      <CogsList products={products} dashboard={lines.length ? <CogsDashboard lines={lines} now={new Date().toISOString()} /> : null} />
    </>
  );
}
