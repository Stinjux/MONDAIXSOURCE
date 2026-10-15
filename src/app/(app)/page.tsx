import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Copy, PackageCheck, Target, XCircle } from "lucide-react";
import { WeeklyLeadsChart } from "@/components/charts";
import { SyncButton } from "@/components/SyncButton";
import { Asin, Card, DuplicateBadges, EmptyState, Kpi, PageHeader, Progress, ReviewBadge, Supplier } from "@/components/ui";
import { daysLeftInWeek, formatDateTime, formatWeekRange, formatWeekShort, weekBounds } from "@/lib/dates";
import { cad, pct, plural } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { history, lastSuccessfulSync, loadProducts, overdueReviews, weekStats } from "@/lib/queries";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const now = new Date();
  const week = weekBounds(now);
  const [{ products, duplicateEvents }, lastSync, lastRuns] = await Promise.all([
    loadProducts(now),
    lastSuccessfulSync(),
    prisma.importRun.findMany({ where: { trigger: { not: "LEGACY_MIGRATION" } }, orderBy: { startedAt: "desc" }, take: 2 }),
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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
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
          <Link href="/weekly-review" className="mt-4 block rounded-lg border border-line bg-surface-2/60 p-3 transition hover:border-line-strong">
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

        <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-4">
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
          <Card className="col-span-2 lg:col-span-4" title="Leads uniques par semaine" action={<Link href="/analytics" className="link text-xs">Analytics →</Link>} padded>
            <WeeklyLeadsChart data={hist.map((h) => ({ label: formatWeekShort(h.key), found: h.found, validated: h.validated, rejected: h.rejected, followUp: h.followUp, pending: h.toReview + h.inProgress }))} goal={stats.goal} height={190} />
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
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
                        <div className="truncate font-medium text-ink" title={p.name}>{p.name}</div>
                        <Asin asin={p.asin} url={p.amazonUrl} />
                      </td>
                      <td className="max-w-36 truncate"><Supplier name={p.best!.supplierName} url={p.best!.supplierUrl} fallback={p.best!.supplierKey} /></td>
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

        <Card title="Priorités" padded={false}>
          <ul className="divide-y divide-line">
            {failedRuns.length > 0 && (
              <Priority href="/imports" tone="critical" icon={<AlertTriangle size={15} />} title="Dernière synchronisation en échec" text={failedRuns[0].details ?? "Voir l'historique des imports"} />
            )}
            {invalidRows > 0 && <Priority href="/imports" tone="warning" icon={<AlertTriangle size={15} />} title={plural(invalidRows, "ligne invalide", "lignes invalides")} text="Lignes ignorées lors du dernier import" />}
            {overdue.length > 0 && <Priority href="/weekly-review" tone="warning" icon={<CalendarClock size={15} />} title={`${plural(overdue.length, "lead", "leads")} en retard de revue`} text="Semaines précédentes, sans décision" />}
            {stats.toReview + stats.inProgress > 0 && (
              <Priority href="/weekly-review" tone="accent" icon={<CalendarClock size={15} />} title={`${stats.toReview + stats.inProgress} à revoir dimanche`} text={`${stats.decided} / ${stats.found} revus cette semaine`} />
            )}
            {backInStock.map(({ p, o }) => (
              <Priority key={o.id} href="/out-of-stock" tone="good" icon={<PackageCheck size={15} />} title={`De retour en stock : ${p.name}`} text={`${o.supplierName ?? o.supplierKey} · vérifié ${formatDateTime(o.stockCheckedAt)}`} />
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
      </div>
    </>
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

