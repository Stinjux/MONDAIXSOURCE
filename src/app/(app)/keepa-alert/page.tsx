import { KeepaAlertBoard } from "@/components/KeepaAlertBoard";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { keepaKey } from "@/lib/keepa";
import { loadKeepaAlerts } from "@/lib/keepaAlertQueries";

export const metadata = { title: "Keepa Alert" };

export default async function KeepaAlertPage() {
  const me = await requireAdmin();
  const { alerts, thresholds } = await loadKeepaAlerts(me);
  return (
    <>
      <PageHeader
        eyebrow="Sourcing"
        title="Keepa Alert"
        description="Les leads que vous aviez rejetés, ou qui ne respectaient pas vos critères, et que la Buy Box Keepa rend maintenant intéressants. Avant = analyse Keepa précédente (ou la Sheet) ; maintenant = dernière analyse Keepa."
      />
      <KeepaAlertBoard alerts={alerts} thresholds={thresholds} configured={!!keepaKey()} />
    </>
  );
}
