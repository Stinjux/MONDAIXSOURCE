import { KeepaLog, type KeepaLogRow } from "@/components/KeepaLog";
import { PageHeader } from "@/components/ui";
import { keepaKey, priceDrop } from "@/lib/keepa";
import { keepaLeadState } from "@/lib/keepaLog";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Keepa" };

export default async function KeepaPage() {
  const now = new Date();
  const [products, counts, latest, purchased, runs] = await Promise.all([
    prisma.product.findMany({ select: { id: true, asin: true, name: true, reviewStatus: true, keepaCheckedAt: true } }),
    prisma.keepaSnapshot.groupBy({ by: ["productId"], _count: { _all: true } }),
    prisma.keepaSnapshot.findMany({ distinct: ["productId"], orderBy: [{ productId: "asc" }, { capturedAt: "desc" }], select: { productId: true, capturedAt: true, buyBox: true, buyBoxAvg90: true } }),
    prisma.purchaseItem.findMany({ where: { purchase: { cancelledAt: null } }, select: { asin: true }, distinct: ["asin"] }),
    prisma.importRun.findMany({ where: { source: "KEEPA" }, orderBy: { startedAt: "desc" }, take: 20 }),
  ]);
  const countBy = new Map(counts.map((c) => [c.productId, c._count._all]));
  const latestBy = new Map(latest.map((s) => [s.productId, s]));
  const bought = new Set(purchased.map((p) => p.asin));
  const rows: KeepaLogRow[] = products.map((p) => {
    const s = latestBy.get(p.id);
    const rejected = p.reviewStatus === "REJECTED";
    const { state, result } = keepaLeadState(
      { keepaCheckedAt: p.keepaCheckedAt?.toISOString() ?? null, lastSnapshotAt: s?.capturedAt.toISOString() ?? null, active: !bought.has(p.asin), rejected },
      now,
    );
    return {
      asin: p.asin,
      name: p.name,
      state,
      result,
      checkedAt: p.keepaCheckedAt?.toISOString() ?? null,
      dataAt: s?.capturedAt.toISOString() ?? null,
      analyses: countBy.get(p.id) ?? 0,
      buyBox: s?.buyBox ?? null,
      buyBoxAvg90: s?.buyBoxAvg90 ?? null,
      priceDrop: s ? priceDrop(s) : null,
      outReason: bought.has(p.asin) ? "Acheté" : null,
    };
  });
  return (
    <>
      <PageHeader
        eyebrow="Suivi"
        title="Keepa"
        description="Quel lead a été analysé par l'API Keepa, quand, et avec quel résultat. Les leads actifs sont analysés au plus une fois par jour, automatiquement ; les rejetés une fois par semaine (Keepa Alert) ; les achetés ne le sont plus."
      />
      <KeepaLog
        configured={!!keepaKey()}
        rows={rows}
        runs={runs.map((r) => ({ id: r.id, startedAt: r.startedAt.toISOString(), trigger: r.trigger, status: r.status, requested: r.rowsRead, updated: r.imported, noData: r.warnings, details: r.details }))}
      />
    </>
  );
}
