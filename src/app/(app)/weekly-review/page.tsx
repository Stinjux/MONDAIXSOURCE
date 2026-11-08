import Link from "next/link";
import { BellRing, ChevronLeft, ChevronRight, LayoutList, SquareStack } from "lucide-react";
import { FocusScreen } from "@/components/FocusScreen";
import { ReviewBoard } from "@/components/ReviewBoard";
import { Card, Kpi, PageHeader, Progress, cn } from "@/components/ui";
import { toDecisionRows } from "@/lib/decisionRows";
import { toFocusLeads } from "@/lib/focus";
import { addDaysToKey, formatWeekRange, isWeekKey, localWeekdayIndex, weekKey } from "@/lib/dates";
import { CHECKLIST, isDecided } from "@/lib/labels";
import { loadProducts, overdueReviews, purchasedProducts } from "@/lib/queries";

export const metadata = { title: "Weekly Review" };

export default async function WeeklyReviewPage({ searchParams }: { searchParams: Promise<{ week?: string; vue?: string; asin?: string }> }) {
  const now = new Date();
  const current = weekKey(now);
  const { week: requested, vue, asin } = await searchParams;
  const week = isWeekKey(requested) && requested <= current ? requested : current;
  const [{ products, tax }, purchased] = await Promise.all([loadProducts(now), purchasedProducts()]);
  const items = products.filter((p) => p.countsTowardGoal && p.goalWeek === week).sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt));
  const overdue = week === current ? overdueReviews(products, now) : [];

  const decided = items.filter((p) => isDecided(p.reviewStatus)).length;
  const checks = items.reduce((n, p) => n + CHECKLIST.filter((c) => p.reviewChecklist[c.key]).length, 0);
  const totalChecks = items.length * CHECKLIST.length;
  const isSunday = localWeekdayIndex(now) === 6;

  // Mode rapide (par défaut) : un lead à la fois, ceux de la semaine puis ceux en retard
  const list = vue === "liste";
  const weekParam = week === current ? "" : `week=${week}`;
  const href = (v: "rapide" | "liste") => `/weekly-review?${[weekParam, v === "liste" ? "vue=liste" : ""].filter(Boolean).join("&")}`;
  const order = [...items, ...overdue].map((p) => p.id);
  const focusLeads = list ? [] : toFocusLeads(products, toDecisionRows(products, tax, now), purchased).filter((l) => order.includes(l.productId)).sort((a, b) => order.indexOf(a.productId) - order.indexOf(b.productId));
  const withoutOffer = [...items, ...overdue].filter((p) => p.offers.length === 0 && !isDecided(p.reviewStatus)).length;

  return (
    <>
      <PageHeader
        eyebrow={week === current ? "Semaine en cours" : "Semaine passée"}
        title="Weekly Review"
        description={`Revue des leads trouvés du lundi au dimanche — ${formatWeekRange(week)}. Les leads non revus restent visibles après le dimanche.`}
        actions={
          <div className="flex items-center gap-1">
            <Link href={`/weekly-review?week=${addDaysToKey(week, -7)}`} className="btn-ghost px-2.5" aria-label="Semaine précédente">
              <ChevronLeft size={16} />
            </Link>
            <span className="px-2 text-sm text-ink-2 tabular-nums">{formatWeekRange(week)}</span>
            {week < current ? (
              <Link href={`/weekly-review?week=${addDaysToKey(week, 7)}`} className="btn-ghost px-2.5" aria-label="Semaine suivante">
                <ChevronRight size={16} />
              </Link>
            ) : (
              <span className="btn-ghost px-2.5 opacity-40" aria-hidden>
                <ChevronRight size={16} />
              </span>
            )}
          </div>
        }
      />

      {isSunday && week === current && items.length > decided && (
        <div className="mb-4 flex items-center gap-3 rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
          <BellRing size={17} className="text-accent" />
          <span>C&apos;est dimanche : {items.length - decided} lead{items.length - decided > 1 ? "s" : ""} de la semaine à revoir.</span>
        </div>
      )}

      <div className="mb-4 grid grid-cols-3 gap-3 md:grid-cols-[1.5fr_1fr_1fr_1fr] md:gap-4">
        <Card className="col-span-3 md:col-span-1">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium text-ink-2">Progression de la revue</span>
            <span className="text-sm font-semibold tabular-nums">{items.length ? Math.round((decided / items.length) * 100) : 0} %</span>
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">
            {decided} <span className="text-base font-normal text-ink-3">/ {items.length} leads revus</span>
          </div>
          <Progress className="mt-3" value={decided} max={Math.max(1, items.length)} tone={items.length && decided === items.length ? "good" : "accent"} label="Leads revus" />
          <div className="mt-2 text-xs text-ink-3">
            Checklist : {checks} / {totalChecks} vérifications effectuées
          </div>
        </Card>
        <Kpi label="Validés" value={items.filter((p) => p.reviewStatus === "VALIDATED").length} tone="good" />
        <Kpi label="À suivre" value={items.filter((p) => p.reviewStatus === "FOLLOW_UP").length} tone="warning" />
        <Kpi label="Rejetés" value={items.filter((p) => p.reviewStatus === "REJECTED").length} tone="critical" />
      </div>

      <div className="mb-4 inline-flex rounded-md border border-line bg-surface p-1" role="tablist" aria-label="Affichage">
        {(
          [
            { v: "rapide", label: "Mode rapide", icon: <SquareStack size={15} />, on: !list },
            { v: "liste", label: "Liste détaillée", icon: <LayoutList size={15} />, on: list },
          ] as const
        ).map((t) => (
          <Link
            key={t.v}
            href={href(t.v)}
            role="tab"
            aria-selected={t.on}
            className={cn("flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition", t.on ? "bg-accent text-white" : "text-ink-2 hover:text-ink")}
          >
            {t.icon} {t.label}
          </Link>
        ))}
      </div>

      {list ? (
        <ReviewBoard items={items} overdue={overdue} tax={tax} />
      ) : (
        <>
          <FocusScreen key={week} leads={focusLeads} mode="review" tax={tax} currentWeek={current} startAsin={asin ?? null} />
          {withoutOffer > 0 && (
            <p className="mt-3 text-xs text-ink-3">
              {withoutOffer} lead{withoutOffer > 1 ? "s" : ""} sans fournisseur ne peu{withoutOffer > 1 ? "vent" : "t"} pas être calculé{withoutOffer > 1 ? "s" : ""} :{" "}
              <Link href={href("liste")} className="link">voir la liste détaillée</Link>.
            </p>
          )}
        </>
      )}
    </>
  );
}
