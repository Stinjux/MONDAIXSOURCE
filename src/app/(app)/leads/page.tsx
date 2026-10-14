import { LeadsTable } from "@/components/LeadsTable";
import { SyncButton } from "@/components/SyncButton";
import { PageHeader } from "@/components/ui";
import { weekKey } from "@/lib/dates";
import { loadProducts } from "@/lib/queries";
import { toLeadRows } from "@/lib/rows";

export const metadata = { title: "All Leads" };

export default async function LeadsPage() {
  const { products } = await loadProducts();
  const rows = toLeadRows(products);
  return (
    <>
      <PageHeader
        title="All Leads"
        description="Une ligne par offre (ASIN × fournisseur). Les produits retirés des Sheets restent visibles et ne sont jamais supprimés."
        actions={<SyncButton />}
      />
      <LeadsTable rows={rows} currentWeek={weekKey(new Date())} />
    </>
  );
}
