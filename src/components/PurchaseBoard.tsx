"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CircleSlash, HelpCircle, Lock, PackageX, Search, ShoppingCart } from "lucide-react";
import { setReviewStatus } from "@/app/(app)/actions";
import { DEFAULT_THRESHOLDS, VERDICT_LABELS, verdict, type Thresholds, type Verdict } from "@/lib/decision";
import type { DecisionRow } from "@/lib/decisionRows";
import { cad, pct } from "@/lib/format";
import { BUCKET_STATUS as TARGET, REVIEW_LABELS, bucketOf, type Bucket, type ReviewStatus } from "@/lib/labels";
import { Asin, Badge, EmptyState, Supplier, cn } from "./ui";


const COLUMNS: { key: Bucket; title: string; hint: string; icon: React.ReactNode; accent: string }[] = [
  { key: "UNDECIDED", title: "À définir", hint: "À revoir, en cours ou à suivre", icon: <HelpCircle size={16} />, accent: "text-warning" },
  { key: "BUY", title: "Achat", hint: "Leads que vous achetez (Revu et validé)", icon: <ShoppingCart size={16} />, accent: "text-[#5fd35f]" },
  { key: "REJECT", title: "Rejeté", hint: "Leads écartés", icon: <CircleSlash size={16} />, accent: "text-[#f08080]" },
];

const VERDICT_TONE: Record<Verdict, "good" | "warning" | "critical" | "neutral"> = { BUY: "good", CONSIDER: "warning", AVOID: "critical", INCOMPLETE: "neutral" };

/** Reprend les critères définis dans Buy Decisions (même navigateur), sinon les valeurs par défaut. */
function loadThresholds(): Thresholds {
  try {
    const saved = JSON.parse(localStorage.getItem("mondaix.buyDecisions.v1") ?? "{}");
    return { ...DEFAULT_THRESHOLDS, ...(saved.thresholds ?? {}) };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

export function PurchaseBoard({ rows, currentWeek }: { rows: DecisionRow[]; currentWeek: string }) {
  const [status, setStatus] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.productId, r.reviewStatus])));
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [query, setQuery] = useState("");
  const [weekOnly, setWeekOnly] = useState(false);
  const [mobileTab, setMobileTab] = useState<Bucket>("UNDECIDED");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  useEffect(() => setThresholds(loadThresholds()), []);
  // Les données serveur rafraîchies (après une action) font foi
  useEffect(() => setStatus(Object.fromEntries(rows.map((r) => [r.productId, r.reviewStatus]))), [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!q || `${r.asin} ${r.name} ${r.supplierName ?? ""} ${r.supplierKey}`.toLowerCase().includes(q)) &&
        (!weekOnly || (r.countsTowardGoal && r.goalWeek === currentWeek)),
    );
  }, [rows, query, weekOnly, currentWeek]);

  const columns = useMemo(() => {
    const by: Record<Bucket, DecisionRow[]> = { BUY: [], REJECT: [], UNDECIDED: [] };
    for (const r of visible) by[bucketOf(status[r.productId] ?? r.reviewStatus)].push(r);
    for (const k of Object.keys(by) as Bucket[]) by[k].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.monthlyProfit ?? -Infinity) - (a.monthlyProfit ?? -Infinity));
    return by;
  }, [visible, status]);

  const move = (r: DecisionRow, to: Bucket) => {
    const previous = status[r.productId];
    const next = TARGET[to];
    setError(null);
    setBusy(r.productId);
    setStatus((s) => ({ ...s, [r.productId]: next })); // mise à jour immédiate
    start(async () => {
      const res = await setReviewStatus(r.productId, next);
      setBusy(null);
      if (!res.ok) {
        setStatus((s) => ({ ...s, [r.productId]: previous }));
        setError(res.error);
      }
    });
  };

  const summary = (list: DecisionRow[]) => {
    const rois = list.map((r) => r.roi).filter((x): x is number => x != null);
    return {
      count: list.length,
      unitCost: list.reduce((n, r) => n + (r.costPrice ?? 0), 0),
      monthly: list.reduce((n, r) => n + (r.monthlyProfit ?? 0), 0),
      avgRoi: rois.length ? rois.reduce((a, b) => a + b, 0) / rois.length : null,
    };
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input className="field pl-9" placeholder="Rechercher par ASIN, produit ou fournisseur" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" className="accent-[#3987e5]" checked={weekOnly} onChange={(e) => setWeekOnly(e.target.checked)} /> Leads de cette semaine seulement
        </label>
      </div>
      {error && <p className="rounded-lg border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-[#f08080]">{error}</p>}

      {/* Onglets sur mobile */}
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1 lg:hidden" role="tablist">
        {COLUMNS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={mobileTab === c.key}
            onClick={() => setMobileTab(c.key)}
            className={cn("rounded-lg px-2 py-2 text-xs font-medium", mobileTab === c.key ? "bg-accent-soft text-ink" : "text-ink-2")}
          >
            {c.title} <span className="text-ink-3 tabular-nums">{columns[c.key].length}</span>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {COLUMNS.map((c) => {
          const list = columns[c.key];
          const s = summary(list);
          return (
            <section key={c.key} className={cn("flex-col rounded-xl border border-line bg-surface", mobileTab === c.key ? "flex" : "hidden lg:flex")} aria-label={c.title}>
              <header className="border-b border-line px-4 py-3">
                <div className="flex items-center justify-between">
                  <h2 className={cn("flex items-center gap-2 text-sm font-semibold", c.accent)}>
                    {c.icon} {c.title}
                  </h2>
                  <span className="rounded-full bg-surface-3 px-2 text-xs font-semibold tabular-nums text-ink">{s.count}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-ink-3">{c.hint}</p>
                {c.key === "BUY" && s.count > 0 && (
                  <dl className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-page/60 p-2 text-[11px]">
                    <div><dt className="text-ink-3">1 unité de chaque</dt><dd className="font-semibold tabular-nums text-ink">{cad(s.unitCost)}</dd></div>
                    <div><dt className="text-ink-3">ROI moyen</dt><dd className="font-semibold tabular-nums text-ink">{pct(s.avgRoi, 0)}</dd></div>
                    <div><dt className="text-ink-3">Profit mensuel max.</dt><dd className="font-semibold tabular-nums text-ink">{cad(s.monthly)}</dd></div>
                  </dl>
                )}
              </header>
              <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-2">
                {list.length === 0 ? (
                  <EmptyState title="Aucun lead" icon={<PackageX size={20} />} />
                ) : (
                  list.map((r) => {
                    const v = verdict(r, thresholds).verdict;
                    const current = status[r.productId] ?? r.reviewStatus;
                    return (
                      <article key={r.productId} className={cn("rounded-lg border border-line bg-surface-2/50 p-3 transition", busy === r.productId && "opacity-60")}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-ink" title={r.name}>{r.name}</div>
                            <div className="flex flex-wrap items-center gap-x-2 text-xs">
                              <Asin asin={r.asin} url={r.amazonUrl} />
                              <span className="max-w-36 truncate"><Supplier name={r.supplierName} url={r.supplierUrl} fallback={r.supplierKey} /></span>
                            </div>
                          </div>
                          <span title="Recommandation selon vos critères de Buy Decisions" className="shrink-0">
                            <Badge tone={VERDICT_TONE[v]}>Avis : {VERDICT_LABELS[v].toLowerCase()}</Badge>
                          </span>
                        </div>
                        <dl className="mt-2 grid grid-cols-4 gap-1 text-[11px]">
                          <div><dt className="text-ink-3">ROI</dt><dd className="font-semibold tabular-nums">{pct(r.roi, 0)}</dd></div>
                          <div><dt className="text-ink-3">Marge</dt><dd className="tabular-nums">{pct(r.margin, 0)}</dd></div>
                          <div><dt className="text-ink-3">Profit/u.</dt><dd className={cn("tabular-nums", r.profit != null && r.profit < 0 && "text-[#f08080]")}>{cad(r.profit)}</dd></div>
                          <div><dt className="text-ink-3">Coût</dt><dd className="tabular-nums">{cad(r.costPrice)}</dd></div>
                        </dl>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="flex flex-wrap gap-1">
                            {c.key === "UNDECIDED" && current !== "TO_REVIEW" && <Badge>{REVIEW_LABELS[current as ReviewStatus] ?? current}</Badge>}
                            {r.unavailable && <Badge tone="critical">Rupture</Badge>}
                            {r.restricted && <Badge tone="serious" icon={<Lock size={10} />}>Restreint</Badge>}
                          </span>
                          <span className="flex gap-1">
                            {c.key !== "BUY" && (
                              <button type="button" disabled={busy === r.productId} onClick={() => move(r, "BUY")} className="btn-ghost px-2 py-1 text-xs hover:border-good/60 hover:text-[#5fd35f]">
                                <ShoppingCart size={12} /> Acheter
                              </button>
                            )}
                            {c.key !== "UNDECIDED" && (
                              <button type="button" disabled={busy === r.productId} onClick={() => move(r, "UNDECIDED")} className="btn-ghost px-2 py-1 text-xs hover:text-warning">
                                <HelpCircle size={12} /> À définir
                              </button>
                            )}
                            {c.key !== "REJECT" && (
                              <button type="button" disabled={busy === r.productId} onClick={() => move(r, "REJECT")} className="btn-ghost px-2 py-1 text-xs hover:border-critical/60 hover:text-[#f08080]">
                                <CircleSlash size={12} /> Rejeter
                              </button>
                            )}
                          </span>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
      <p className="text-xs text-ink-3">
        L&apos;avis (acheter, à considérer, éviter…) est une recommandation calculée avec vos critères de Buy Decisions ; la colonne est votre décision. Déplacer un lead change son statut de revue : Achat = « Revu et validé »,
        Rejeté = « Rejeté », À définir = « À revoir ». Chaque changement est journalisé.
      </p>
    </div>
  );
}
