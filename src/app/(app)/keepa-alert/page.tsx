import { KeepaAlertBoard } from "@/components/KeepaAlertBoard";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { keepaKey } from "@/lib/keepa";
import { loadKeepaAlerts } from "@/lib/keepaAlertQueries";

export const metadata = { title: "Keepa Alert" };

export default async function KeepaAlertPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const me = await requireAdmin();
  const { alerts, thresholds } = await loadKeepaAlerts(me);
  return (
    <>
      <PageHeader
        eyebrow="Keepa"
        title="Keepa Alert"
        description="Chaque lead analysé par Keepa, selon vos critères : New good (devient profitable à la dernière analyse), Still good (toujours profitable, depuis quand) et Still below target (pas encore dans vos critères)."
      />
      <KeepaAlertBoard alerts={alerts} thresholds={thresholds} configured={!!keepaKey()} initialTab={tab} />
    </>
  );
}
