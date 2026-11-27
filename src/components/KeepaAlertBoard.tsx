"use client";
// Keepa Alert : chaque lead analysé par Keepa, selon vos critères, en trois sections.
//  * New good : devient profitable à la dernière analyse (date et prix extrait), avant → maintenant.
//  * Still good : toujours profitable, depuis quand.
//  * Still below target : pas encore dans vos critères, ce qui manque et l'évolution.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowRight, Check, CheckCircle2, Gavel, Minus, RotateCcw, Search, Sparkles, Target, TrendingDown, TrendingUp } from "lucide-react";
import { setReviewStatus } from "@/app/(app)/actions";
import { VERDICT_LABELS, type Thresholds, type Verdict } from "@/lib/decision";
import { formatDate, formatDateTime } from "@/lib/dates";
import { cad, num, pct } from "@/lib/format";
import { daysSince, type AlertGroup, type AlertSide, type KeepaAlert } from "@/lib/keepaAlerts";
import { pushSaved, readSaved, writeSaved } from "./DecisionFilters";
import { ProductImage } from "./ProductImage";
import { useUser } from "./UserContext";
import { Badge, EmptyState, KeepaBadges, ReviewBadge, Supplier, cn } from "./ui";

const TONE: Record<Verdict, "good" | "warning" | "critical" | "neutral"> = { BUY: "good", CONSIDER: "warning", AVOID: "critical", INCOMPLETE: "neutral" };

const TABS: { key: AlertGroup; label: string; hint: string; icon: React.ReactNode }[] = [
  { key: "NEW_GOOD", label: "New good", hint: "Devenus profitables à la dernière analyse Keepa", icon: <Sparkles size={15} /> },
  { key: "STILL_GOOD", label: "Still good", hint: "Toujours profitables, depuis combien de temps", icon: <CheckCircle2 size={15} /> },
  { key: "BELOW", label: "Still below target", hint: "Analysés, pas encore dans vos critères", icon: <Target size={15} /> },
];

const ROWS: { label: string; get: (s: AlertSide) => string; better?: (b: AlertSide, n: AlertSide) => boolean }[] = [
  { label: "Prix Amazon", get: (s) => cad(s.price) },
  { label: "ROI", get: (s) => pct(s.roi, 0), better: (b, n) => (n.roi ?? -Infinity) > (b.roi ?? -Infinity) },
  { label: "Profit / unité", get: (s) => cad(s.profit), better: (b, n) => (n.profit ?? -Infinity) > (b.profit ?? -Infinity) },
  { label: "Ventes / mois", get: (s) => num(s.sales) },
  { label: "Profit mensuel", get: (s) => cad(s.monthlyProfit), better: (b, n) => (n.monthlyProfit ?? -Infinity) > (b.monthlyProfit ?? -Infinity) },
];

const since = (iso: string, atLeast = false) => {
  const d = daysSince(iso);
  if (d === 0) return atLeast ? "depuis au moins aujourd'hui" : "depuis aujourd'hui";
  return `depuis ${atLeast ? "au moins " : ""}${d} jour${d > 1 ? "s" : ""}`;
};

export function KeepaAlertBoard({ alerts, thresholds, configured, initialTab }: { alerts: KeepaAlert[]; thresholds: Thresholds; configured: boolean; initialTab?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<AlertGroup>(TABS.some((t) => t.key === initialTab) ? (initialTab as AlertGroup) : "NEW_GOOD");
  const [seenNow, setSeenNow] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [risingOnly, setRisingOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => alerts.map((a) => (seenNow.has(a.productId) ? { ...a, seen: true } : a)), [alerts, seenNow]);
  const counts = useMemo(() => {
    const c: Record<AlertGroup, number> = { NEW_GOOD: 0, STILL_GOOD: 0, BELOW: 0 };
    for (const a of all) c[a.group]++;
    return c;
  }, [all]);
  const unseen = all.filter((a) => a.group === "NEW_GOOD" && !a.seen).length;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((a) => a.group === tab && (!q || `${a.asin} ${a.name}`.toLowerCase().includes(q)) && (tab !== "BELOW" || !risingOnly || a.trend === "UP"));
  }, [all, tab, query, risingOnly]);
  const LIMIT = 100;
  const shown = showAll ? visible : visible.slice(0, LIMIT);

  const markSeen = (a: KeepaAlert) => {
    const prev = (readSaved().keepaAlertsDismissed ?? {}) as Record<string, string>;
    writeSaved({ keepaAlertsDismissed: { ...prev, [a.productId]: a.keepaAt } });
    setSeenNow((s) => new Set([...s, a.productId]));
    // Le compteur du menu se met à jour une fois le réglage enregistré
    pushSaved().finally(() => router.refresh());
  };
  const reopen = (a: KeepaAlert) =>
    start(async () => {
      setError(null);
      const res = await setReviewStatus(a.productId, "TO_REVIEW");
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  const actions = { pending, reopen, markSeen };

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-ink-2">
        Tous les leads analysés par Keepa (sauf les achetés), selon <b className="text-ink">vos critères</b> : ROI ≥ {thresholds.minRoi} %, profit ≥ {cad(thresholds.minProfit)}, marge ≥{" "}
        {thresholds.minMargin} %, ventes ≥ {thresholds.minSales} / mois — <Link href="/decisions" className="link">modifier dans Buy Decisions (Classement et critères)</Link>.
        {!configured && <span className="block text-warning">KEEPA_API_KEY n&apos;est pas configurée : pas de nouvelle analyse Keepa pour l&apos;instant.</span>}
      </p>

      <div className="grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Sections Keepa Alert">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              setShowAll(false);
            }}
            className={cn(
              "flex flex-col items-start gap-1 rounded-md border bg-surface px-3 py-2.5 text-left transition",
              tab === t.key ? "border-accent bg-accent-soft ring-1 ring-accent/30" : "border-line hover:border-line-strong",
            )}
          >
            <span className={cn("flex w-full items-center gap-1.5 text-sm font-semibold", tab === t.key ? "text-accent" : "text-ink")}>
              {t.icon} <span className="truncate">{t.label}</span>
              <span className={cn("ml-auto rounded-sm px-1.5 text-xs tabular-nums", t.key === "NEW_GOOD" && unseen ? "bg-accent text-white" : "bg-surface-3 text-ink-2")}>{counts[t.key]}</span>
            </span>
            <span className="text-[11px] leading-snug text-ink-3">{t.hint}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-line bg-surface p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input className="field pl-9" placeholder="Rechercher un lead (nom ou ASIN)" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher" />
        </div>
        {tab === "BELOW" && (
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={risingOnly} onChange={(e) => setRisingOnly(e.target.checked)} />
            En hausse seulement
          </label>
        )}
        <span className="text-xs text-ink-3 tabular-nums">
          {visible.length} lead{visible.length > 1 ? "s" : ""}
        </span>
      </div>
      {error && <p className="text-sm text-critical">{error}</p>}

      {visible.length === 0 ? (
        <div className="rounded-md border border-line bg-surface">
          <EmptyState title="Aucun lead ici" icon={TABS.find((t) => t.key === tab)!.icon}>
            {tab === "NEW_GOOD"
              ? "Aucun lead n'est devenu profitable à sa dernière analyse Keepa. Les leads actifs sont analysés chaque jour, les rejetés chaque semaine."
              : tab === "STILL_GOOD"
                ? "Aucun lead n'est profitable depuis au moins deux analyses Keepa."
                : "Tous les leads analysés répondent à vos critères."}
          </EmptyState>
        </div>
      ) : tab === "NEW_GOOD" ? (
        <ul className="grid gap-3 xl:grid-cols-2">
          {shown.map((a) => (
            <NewGoodCard key={a.productId} a={a} {...actions} />
          ))}
        </ul>
      ) : (
        <AlertTable rows={shown} group={tab} {...actions} />
      )}
      {!showAll && visible.length > LIMIT && (
        <button type="button" className="btn-ghost self-center" onClick={() => setShowAll(true)}>
          Afficher les {visible.length} leads
        </button>
      )}
    </div>
  );
}

type Actions = { pending: boolean; reopen: (a: KeepaAlert) => void; markSeen: (a: KeepaAlert) => void };

function LeadCell({ a, size = 36 }: { a: KeepaAlert; size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <ProductImage asin={a.asin} size={size} />
      <div className="min-w-0">
        <Link href={`/leads/${a.asin}`} className="block max-w-80 truncate font-medium text-ink hover:text-accent hover:underline" title={a.name}>
          {a.name}
        </Link>
        <span className="font-mono text-xs text-ink-3">{a.asin}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1">
          <KeepaBadges keepa={a.keepa} compact />
        </span>
      </div>
    </div>
  );
}

function RowActions({ a, pending, reopen }: { a: KeepaAlert } & Pick<Actions, "pending" | "reopen">) {
  return (
    <div className="flex justify-end gap-1.5">
      {a.reviewStatus === "REJECTED" && (
        <button type="button" className="btn-ghost px-2 text-xs" disabled={pending} onClick={() => reopen(a)} title="Remet le lead « À revoir » (enregistré à votre nom)">
          <RotateCcw size={13} /> Remettre en revue
        </button>
      )}
      <Link href={`/decisions?asin=${a.asin}`} className="btn-ghost px-2 text-xs" title="Ouvrir dans Buy Decisions">
        <Gavel size={13} /> Décision
      </Link>
    </div>
  );
}

function Trend({ a }: { a: KeepaAlert }) {
  const b = a.before.monthlyProfit ?? a.before.profit;
  const n = a.now.monthlyProfit ?? a.now.profit;
  const unit = a.now.monthlyProfit != null && a.before.monthlyProfit != null ? " $/mois" : " $/u.";
  const diff = b != null && n != null ? Math.round(n - b) : null;
  const from = a.beforeFrom ? `analyse Keepa du ${formatDate(a.beforeFrom)}` : "la Sheet";
  if (a.trend === "UP")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-good" title={`Par rapport à ${from}`}>
        <TrendingUp size={13} /> +{diff}
        {unit}
      </span>
    );
  if (a.trend === "DOWN")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-critical" title={`Par rapport à ${from}`}>
        <TrendingDown size={13} /> {diff}
        {unit}
      </span>
    );
  if (a.trend === "SAME")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-ink-3" title={`Par rapport à ${from}`}>
        <Minus size={13} /> stable
      </span>
    );
  return <span className="text-ink-3">—</span>;
}

function AlertTable({ rows, group, pending, reopen }: { rows: KeepaAlert[]; group: AlertGroup } & Actions) {
  const good = group === "STILL_GOOD";
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Lead</th>
              {good ? <th>Profitable depuis</th> : <th>Ce qui manque</th>}
              <th className="text-right">Prix Amazon</th>
              <th className="text-right">ROI</th>
              <th className="text-right">Profit / u.</th>
              <th className="text-right">Ventes / mois</th>
              <th className="text-right">Profit mensuel</th>
              <th>Évolution</th>
              <th>Statut</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.productId}>
                <td>
                  <LeadCell a={a} />
                </td>
                {good ? (
                  <td className="whitespace-nowrap">
                    <span className="block font-semibold text-good">{since(a.goodSince ?? a.keepaAt, a.goodBeforeKeepa)}</span>
                    <span className="text-[11px] text-ink-3">
                      {a.goodBeforeKeepa ? `1re analyse Keepa le ${formatDate(a.goodSince ?? a.keepaAt)} · déjà bon dans la Sheet` : `le ${formatDate(a.goodSince ?? a.keepaAt)}`}
                    </span>
                  </td>
                ) : (
                  <td className="max-w-72">
                    <span className="flex flex-wrap gap-1">
                      {a.reasons.length ? a.reasons.map((r) => <Badge key={r} tone={TONE[a.now.verdict]}>{r}</Badge>) : <Badge tone="neutral">{VERDICT_LABELS[a.now.verdict]}</Badge>}
                    </span>
                  </td>
                )}
                <td className="text-right whitespace-nowrap tabular-nums">
                  {cad(a.now.price)}
                  <span className="block text-[11px] text-ink-3">Keepa {formatDate(a.keepaAt)}</span>
                </td>
                <td className="text-right tabular-nums">{pct(a.now.roi, 0)}</td>
                <td className="text-right tabular-nums">{cad(a.now.profit)}</td>
                <td className="text-right tabular-nums">{num(a.now.sales)}</td>
                <td className="text-right font-semibold tabular-nums">{cad(a.now.monthlyProfit)}</td>
                <td className="whitespace-nowrap">
                  <Trend a={a} />
                </td>
                <td>
                  <ReviewBadge status={a.reviewStatus} />
                </td>
                <td>
                  <RowActions a={a} pending={pending} reopen={reopen} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewGoodCard({ a, pending, reopen, markSeen }: { a: KeepaAlert } & Actions) {
  const { profiles } = useUser();
  return (
    <li className={cn("flex flex-col gap-3 rounded-md border bg-surface p-4", a.seen ? "border-line opacity-75" : "border-good/50")}>
      <div className="flex gap-3">
        <ProductImage asin={a.asin} size={64} />
        <div className="min-w-0 flex-1">
          <Link href={`/leads/${a.asin}`} className="line-clamp-2 text-sm font-semibold text-ink hover:text-accent hover:underline">
            {a.name}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
            <span className="font-mono">{a.asin}</span>
            {a.supplierName && <Supplier name={a.supplierName} url={a.supplierUrl} product={a.name} />}
            {a.costPrice != null && <span>coût {cad(a.costPrice)}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="good" icon={<Sparkles size={10} />}>
              Profitable depuis le {formatDateTime(a.keepaAt)} · prix extrait {cad(a.now.price)}
            </Badge>
            {a.reviewStatus === "REJECTED" ? (
              <Badge tone="critical">
                Rejeté{a.rejectedAt ? ` le ${formatDate(a.rejectedAt)}` : ""}
                {a.rejectedBy ? ` par ${profiles[a.rejectedBy].name}` : ""}
              </Badge>
            ) : (
              <ReviewBadge status={a.reviewStatus} />
            )}
            <KeepaBadges keepa={a.keepa} compact />
            {a.seen && (
              <Badge tone="neutral" icon={<Check size={10} />}>
                Vu
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Avant → maintenant */}
      <table className="table-base text-xs">
        <thead>
          <tr>
            <th />
            <th className="text-right">Avant{a.beforeFrom ? ` (Keepa ${formatDate(a.beforeFrom)})` : " (Sheet)"}</th>
            <th className="w-4" />
            <th className="text-right">Maintenant (Keepa {formatDate(a.keepaAt)})</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.label}>
              <td className="text-ink-2">{r.label}</td>
              <td className="text-right tabular-nums text-ink-3">{r.get(a.before)}</td>
              <td className="text-ink-3">
                <ArrowRight size={12} />
              </td>
              <td className={cn("text-right font-semibold tabular-nums", r.better?.(a.before, a.now) ? "text-good" : "text-ink")}>{r.get(a.now)}</td>
            </tr>
          ))}
          <tr>
            <td className="text-ink-2">Avis</td>
            <td className="text-right">
              <Badge tone={TONE[a.before.verdict]}>{VERDICT_LABELS[a.before.verdict]}</Badge>
            </td>
            <td className="text-ink-3">
              <ArrowRight size={12} />
            </td>
            <td className="text-right">
              <Badge tone="good">{VERDICT_LABELS[a.now.verdict]}</Badge>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="flex flex-wrap gap-2">
        {a.reviewStatus === "REJECTED" && (
          <button type="button" className="btn-primary" disabled={pending} onClick={() => reopen(a)} title="Remet le lead « À revoir » (enregistré à votre nom)">
            <RotateCcw size={15} /> Remettre en revue
          </button>
        )}
        <Link href={`/decisions?asin=${a.asin}`} className={a.reviewStatus === "REJECTED" ? "btn-ghost" : "btn-primary"}>
          <Gavel size={15} /> Ouvrir la décision
        </Link>
        {!a.seen && (
          <button type="button" className="btn-ghost ml-auto" onClick={() => markSeen(a)} title="Ne compte plus dans le menu ; le lead reste ici jusqu'à sa prochaine analyse Keepa">
            <Check size={15} /> Marquer comme vu
          </button>
        )}
      </div>
    </li>
  );
}
