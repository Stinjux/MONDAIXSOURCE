import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Copy, PackageCheck, Target, XCircle } from "lucide-react";
import { WeeklyLeadsChart } from "@/components/charts";
import { SyncButton } from "@/components/SyncButton";
import { Asin, Card, DuplicateBadges, EmptyState, Kpi, PageHeader, Progress, ReviewBadge, Supplier, cn } from "@/components/ui";
import { daysLeftInWeek, formatDateTime, formatWeekRange, formatWeekShort, weekBounds } from "@/lib/dates";
import { cad, pct, plural } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { storeName } from "@/lib/stores";
import { history, lastSuccessfulSync, loadProducts, overdueReviews, purchasedProducts, weekStats } from "@/lib/queries";
import { DashboardGrid } from "@/components/DashboardGrid";
import { StageBar } from "@/components/SupplierBrowser";
import { StoreLogo } from "@/components/StoreLogo";
import { toDecisionRows } from "@/lib/decisionRows";
import { STAGES, STAGE_INFO, stageOf, type Stage } from "@/lib/pipeline";
import { groupBySupplier, type SupplierGroup } from "@/lib/suppliers";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const now = new Date();
  const week = weekBounds(now);
  const [{ products, duplicateEvents, tax }, lastSync, lastRuns, purchased] = await Promise.all([
    loadProducts(now),
    lastSuccessfulSync(),
    prisma.importRun.findMany({ where: { trigger: { not: "LEGACY_MIGRATION" } }, orderBy: { startedAt: "desc" }, take: 2 }),
    purchasedProducts(),
  ]);

  const stats = weekStats(products, duplicateEvents, week.key);
  const hist = history(products, duplicateEvents, now, 8);
  const overdue = overdueReviews(products, now);
  const thisWeek = products.filter((p) => p.countsTowardGoal && p.goalWeek === week.key);
  const top = thisWeek
    .filter((p) => p.reviewStatus !== "REJECTED" && p.best?.profit.roi != null)
    .sort((a, b) => (b.best!.profit.monthlyProfit ?? b.best!.profit.profit ?? 0) - (a.best!.profit.monthlyProfit ?? a.best!.profit.profit ?? 0))
    .slice(0, 6);
  const backInStock = products.flatMap((p) => p.offers.filter((o) => o.backInStockAlert).map((o) => ({ p, o })));
  const dupAlerts = products.filter((p) => p.duplicateAlert);
  const failedRuns = lastRuns.filter((r) => r.status === "FAILED");
  const invalidRows = lastRuns.reduce((n, r) => n + r.errors, 0);

  // Modules Pipeline et Fournisseurs
  const rows = toDecisionRows(products, tax, now);
  const stageCounts = Object.fromEntries(STAGES.map((st) => [st, 0])) as Record<Stage, number>;
  for (const r of rows) stageCounts[stageOf({ reviewStatus: r.reviewStatus, purchased: purchased.has(r.productId), unavailable: r.unavailable, fresh: r.fresh.state })]++;
  const topSuppliers = groupBySupplier(products, rows, tax, purchased)
    .filter((g) => g.key !== "unknown")
    .slice(0, 6)
    .map((g) => ({ ...g, products: [] }));

  const remaining = Math.max(0, stats.goal - stats.found);
  const daysLeft = daysLeftInWeek(now);
  const ratio = stats.found / stats.goal;

  return (
    <>
      <PageHeader
        eyebrow={`Semaine du ${formatWeekRange(week.key)}`}
        title="Dashboard"
        description={lastSync ? <>Dernière synchronisation réussie : {formatDateTime(lastSync.at)}</> : "Aucune synchronisation réussie pour le moment."}
        actions={<SyncButton />}
      />

      <DashboardGrid
        widgets={[
          {
            id: "goal",
            title: "Objectif hebdomadaire",
            size: "s",
            node: (
        <Card className="h-full">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-2">Objectif hebdomadaire</span>
            <Target size={16} className="text-accent" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-5xl font-semibold tracking-tight tabular-nums">{stats.found}</span>
            <span className="text-lg text-ink-3">/ {stats.goal} leads uniques</span>
          </div>
          <Progress className="mt-4" value={stats.found} max={stats.goal} tone={ratio >= 1 ? "good" : "accent"} label="Progression vers l'objectif hebdomadaire" />
          <div className="mt-2 flex items-center justify-between text-xs text-ink-2">
            <span className="font-medium text-ink">{Math.round(ratio * 100)} % de l&apos;objectif</span>
            <span>{remaining > 0 ? `${plural(remaining, "lead restant", "leads restants")}` : "Objectif atteint"}</span>
          </div>
          <p className="mt-3 border-t border-line pt-3 text-xs text-ink-3">
            {remaining > 0
              ? `${plural(daysLeft, "jour restant", "jours restants")} · environ ${Math.ceil(remaining / daysLeft)} lead${Math.ceil(remaining / daysLeft) > 1 ? "s" : ""} par jour pour y arriver.`
              : "Bravo — les nouveaux leads continuent de compter dans l'historique."}
            <br />
            Seuls les nouveaux ASIN du pipeline LEADS comptent (doublons et OUT OF STOCK exclus).
          </p>
          <Link href="/weekly-review" className="mt-4 block rounded-sm border border-line bg-surface-2/60 p-3 transition hover:border-line-strong">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-ink-2">Weekly Review de dimanche</span>
              <span className="text-ink tabular-nums">
                {stats.decided} / {stats.found} revus
              </span>
            </div>
            <Progress className="mt-2 h-1.5" value={stats.decided} max={Math.max(1, stats.found)} tone="good" label="Leads de la semaine revus" />
            {overdue.length > 0 && <div className="mt-2 text-xs text-warning">+ {plural(overdue.length, "lead", "leads")} en retard des semaines précédentes</div>}
          </Link>
        </Card>
            ),
          },
          {
            id: "kpis",
            title: "Indicateurs de la semaine",
            size: "l",
            node: (
              <div className="@container">
                <div className="grid grid-cols-2 content-start gap-4 @2xl:grid-cols-4">
          <Kpi label="Qualifiés (validés)" value={stats.validated} hint="cette semaine" icon={<CheckCircle2 size={16} />} tone="good" />
          <Kpi label="Rejetés" value={stats.rejected} hint="cette semaine" icon={<XCircle size={16} />} tone="critical" />
          <Kpi
            label="À revoir"
            value={stats.toReview + stats.inProgress}
            hint={overdue.length ? `+ ${overdue.length} en retard` : `${stats.decided} / ${stats.found} revus`}
            icon={<CalendarClock size={16} />}
            tone="warning"
          />
          <Kpi label="Doublons détectés" value={stats.duplicates} hint="cette semaine (non comptés)" icon={<Copy size={16} />} tone="accent" />
                </div>
              </div>
            ),
          },
          {
            id: "weekly",
            title: "Leads par semaine",
            size: "l",
            node: (
          <Card className="h-full" title="Leads uniques par semaine" action={<Link href="/analytics" className="link text-xs">Analytics →</Link>} padded>
            <WeeklyLeadsChart data={hist.map((h) => ({ label: formatWeekShort(h.key), found: h.found, validated: h.validated, rejected: h.rejected, followUp: h.followUp, pending: h.toReview + h.inProgress }))} goal={stats.goal} height={190} />
          </Card>
            ),
          },
          {
            id: "pipeline",
            title: "Pipeline",
            size: "s",
            node: <PipelineWidget counts={stageCounts} />,
          },
          {
            id: "top",
            title: "Plus rentables",
            size: "l",
            node: (
        <Card
          className="h-full"
          title="Leads les plus rentables cette semaine"
          action={<Link href="/leads" className="link text-xs">Tous les leads →</Link>}
          padded={false}
        >
          {top.length ? (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Fournisseur</th>
                    <th className="text-right">Profit*</th>
                    <th className="text-right">ROI*</th>
                    <th className="text-right">Profit mensuel*</th>
                    <th>Revue</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((p) => (
                    <tr key={p.id}>
                      <td className="max-w-56">
                        <Link href={`/leads/${p.asin}`} className="block truncate font-medium text-ink hover:text-accent hover:underline" title={p.name}>
                          {p.name}
                        </Link>
                        <Asin asin={p.asin} url={p.amazonUrl} />
                      </td>
                      <td className="max-w-36 truncate"><Supplier name={p.best!.supplierName} url={p.best!.supplierUrl} fallback={p.best!.supplierKey} product={p.name} /></td>
                      <td className="text-right tabular-nums">{cad(p.best!.profit.profit)}</td>
                      <td className="text-right font-medium tabular-nums">{pct(p.best!.profit.roi, 0)}</td>
                      <td className="text-right tabular-nums">{cad(p.best!.profit.monthlyProfit)}</td>
                      <td><ReviewBadge status={p.reviewStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-2.5 text-[11px] text-ink-3">* Estimations préliminaires (Buy Box 90 j − Cost Price − Total Fees), frais Amazon inclus, taxes selon le réglage Settings ; hors transport, préparation et stockage.</p>
            </div>
          ) : (
            <EmptyState title="Aucun lead rentable calculable cette semaine">Synchronisez les Sheets ou complétez Buy Box 90 j (D), Total Fees (H) et Cost Price (I) dans LEADS.</EmptyState>
          )}
        </Card>
            ),
          },
          {
            id: "priorities",
            title: "Priorités",
            size: "s",
            node: (
        <Card className="h-full" title="Priorités" padded={false}>
          <ul className="max-h-[26rem] divide-y divide-line overflow-y-auto">
            {failedRuns.length > 0 && (
              <Priority href="/imports" tone="critical" icon={<AlertTriangle size={15} />} title="Dernière synchronisation en échec" text={failedRuns[0].details ?? "Voir l'historique des imports"} />
            )}
            {invalidRows > 0 && <Priority href="/imports" tone="warning" icon={<AlertTriangle size={15} />} title={plural(invalidRows, "ligne invalide", "lignes invalides")} text="Lignes ignorées lors du dernier import" />}
            {overdue.length > 0 && <Priority href="/weekly-review" tone="warning" icon={<CalendarClock size={15} />} title={`${plural(overdue.length, "lead", "leads")} en retard de revue`} text="Semaines précédentes, sans décision" />}
            {stats.toReview + stats.inProgress > 0 && (
              <Priority href="/weekly-review" tone="accent" icon={<CalendarClock size={15} />} title={`${stats.toReview + stats.inProgress} à revoir dimanche`} text={`${stats.decided} / ${stats.found} revus cette semaine`} />
            )}
            {backInStock.map(({ p, o }) => (
              <Priority key={o.id} href="/out-of-stock" tone="good" icon={<PackageCheck size={15} />} title={`De retour en stock : ${p.name}`} text={`${storeName(o)} · vérifié ${formatDateTime(o.stockCheckedAt)}`} />
            ))}
            {dupAlerts.slice(0, 4).map((p) => (
              <li key={p.id}>
                <Link href="/duplicates" className="flex flex-col gap-1 px-4 py-3 transition hover:bg-surface-2">
                  <span className="truncate text-sm text-ink">{p.name}</span>
                  <DuplicateBadges dup={p.dup} compact />
                </Link>
              </li>
            ))}
            {dupAlerts.length > 4 && <Priority href="/duplicates" tone="serious" icon={<Copy size={15} />} title={`+ ${dupAlerts.length - 4} autres alertes de doublons`} text="Voir Duplicate Alerts" />}
            {!failedRuns.length && !invalidRows && !overdue.length && !backInStock.length && !dupAlerts.length && stats.toReview + stats.inProgress === 0 && (
              <EmptyState title="Rien d'urgent" icon={<CheckCircle2 size={22} />}>Toutes les alertes sont traitées.</EmptyState>
            )}
          </ul>
        </Card>
            ),
          },
          {
            id: "suppliers",
            title: "Fournisseurs",
            size: "f",
            node: <SuppliersWidget groups={topSuppliers} />,
          },
        ]}
      />
    </>
  );
}

const PIPELINE_ROWS: Stage[] = ["NEW", "ANALYSIS", "RECONFIRM", "READY", "BOUGHT", "WATCH"];

/** Module Pipeline : nombre de leads par étape, chaque ligne ouvre la colonne correspondante. */
function PipelineWidget({ counts }: { counts: Record<Stage, number> }) {
  const max = Math.max(1, ...PIPELINE_ROWS.map((s) => counts[s]));
  return (
    <Card className="h-full" title="Pipeline" action={<Link href="/pipeline" className="link text-xs">Ouvrir →</Link>} padded={false}>
      <ul className="py-1.5">
        {PIPELINE_ROWS.map((s) => (
          <li key={s}>
            <Link href={`/pipeline?vue=${STAGE_INFO[s].slug}`} className="group flex items-center gap-3 px-4 py-2 transition hover:bg-surface-2">
              <span className="w-28 shrink-0 truncate text-sm text-ink-2 group-hover:text-ink">{STAGE_INFO[s].title}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-[2px] bg-surface-3" aria-hidden>
                <span className={cn("block h-full rounded-[2px]", s === "RECONFIRM" ? "bg-[#eb6834]" : s === "READY" ? "bg-[#1baf7a]" : "bg-[#1c5cab]")} style={{ width: `${(counts[s] / max) * 100}%` }} />
              </span>
              <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-ink">{counts[s]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Module Fournisseurs : les commerces les plus fournis, avec leur répartition par étape. */
function SuppliersWidget({ groups }: { groups: SupplierGroup[] }) {
  const max = Math.max(1, ...groups.map((g) => g.stats.products - g.stats.rejected));
  return (
    <Card className="h-full" title="Fournisseurs" action={<Link href="/suppliers" className="link text-xs">Tous les fournisseurs →</Link>} padded={false}>
      {groups.length ? (
        <div className="@container">
          <ul className="grid grid-cols-1 divide-line @xl:grid-cols-2 @4xl:grid-cols-3">
            {groups.map((g) => (
              <li key={g.key} className="border-b border-line">
                <Link href={`/suppliers?f=${encodeURIComponent(g.key)}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
                  <StoreLogo name={g.name} domain={g.domain} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-ink">{g.name}</span>
                      <span className="text-sm font-semibold tabular-nums text-ink">{g.stats.products - g.stats.rejected}</span>
                    </span>
                    <span className="mt-1.5 block">
                      <StageBar g={g} max={max} />
                    </span>
                    <span className="mt-1 flex justify-between text-[11px] text-ink-3">
                      <span>{g.stats.ready > 0 ? <span className="font-medium text-good">{g.stats.ready} prêt{g.stats.ready > 1 ? "s" : ""}</span> : `${g.stats.toReview} à traiter`}</span>
                      {g.stats.avgRoi != null && <span className="tabular-nums">ROI moy. {pct(g.stats.avgRoi, 0)}</span>}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyState title="Aucun fournisseur pour le moment" />
      )}
    </Card>
  );
}

function Priority({ href, icon, title, text, tone }: { href: string; icon: React.ReactNode; title: string; text: string; tone: "critical" | "warning" | "accent" | "good" | "serious" }) {
  const color = { critical: "text-critical", warning: "text-warning", accent: "text-accent", good: "text-good", serious: "text-serious" }[tone];
  return (
    <li>
      <Link href={href} className="flex items-start gap-3 px-4 py-3 transition hover:bg-surface-2">
        <span className={`mt-0.5 ${color}`}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink">{title}</span>
          <span className="block truncate text-xs text-ink-3">{text}</span>
        </span>
        <ArrowRight size={14} className="mt-1 text-ink-3" />
      </Link>
    </li>
  );
}

