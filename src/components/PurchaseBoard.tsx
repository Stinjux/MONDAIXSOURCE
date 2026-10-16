"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, CircleSlash, Expand, HelpCircle, Lock, Maximize2, PackageX, Search, ShoppingCart, Shrink, SlidersHorizontal } from "lucide-react";
import { setReviewStatus } from "@/app/(app)/actions";
import { VERDICT_LABELS, type Verdict } from "@/lib/decision";
import { STRATEGIES, compareRows, evaluateRow, inScope, matchesVerdict } from "@/lib/decisionFilters";
import type { DecisionRow } from "@/lib/decisionRows";
import { cad, pct } from "@/lib/format";
import { BUCKET_STATUS as TARGET, REVIEW_LABELS, VIEW_SLUGS, bucketFromSlug, bucketOf, type Bucket, type ReviewStatus } from "@/lib/labels";
import { FilterPanel, VerdictChips, countVerdicts, useDecisionFilters } from "./DecisionFilters";
import { Asin, Badge, EmptyState, Supplier, cn } from "./ui";


const COLUMNS: { key: Bucket; title: string; hint: string; icon: React.ReactNode; accent: string }[] = [
  { key: "UNDECIDED", title: "À définir", hint: "À revoir, en cours ou à suivre", icon: <HelpCircle size={16} />, accent: "text-warning" },
  { key: "BUY", title: "Achat", hint: "Leads que vous achetez (Revu et validé)", icon: <ShoppingCart size={16} />, accent: "text-[#5fd35f]" },
  { key: "REJECT", title: "Rejeté", hint: "Leads écartés", icon: <CircleSlash size={16} />, accent: "text-[#f08080]" },
];

const STRATEGY_LABEL = Object.fromEntries(STRATEGIES.map((s) => [s.key, s.label])) as Record<(typeof STRATEGIES)[number]["key"], string>;

const VERDICT_TONE: Record<Verdict, "good" | "warning" | "critical" | "neutral"> = { BUY: "good", CONSIDER: "warning", AVOID: "critical", INCOMPLETE: "neutral" };


export function PurchaseBoard({ rows, currentWeek, initialView = null }: { rows: DecisionRow[]; currentWeek: string; initialView?: Bucket | null }) {
  const [status, setStatus] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.productId, r.reviewStatus])));
  // Mêmes filtres que Buy Decisions (réglages partagés et synchronisés)
  const { filters, update } = useDecisionFilters();
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState("");
  const [mobileTab, setMobileTab] = useState<Bucket>(initialView ?? "UNDECIDED");
  // Liste ouverte en grand (null = vue des 3 listes)
  const [expanded, setExpanded] = useState<Bucket | null>(initialView);
  const [fullscreen, setFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const openView = useCallback((b: Bucket | null) => {
    setExpanded(b);
    if (b) setMobileTab(b);
    const url = new URL(window.location.href);
    if (b) url.searchParams.set("vue", VIEW_SLUGS[b]);
    else url.searchParams.delete("vue");
    window.history.pushState(null, "", url);
    window.scrollTo({ top: 0 });
  }, []);

  // Bouton « précédent » du navigateur, touche Échap, sortie du plein écran
  useEffect(() => {
    const onPop = () => setExpanded(bucketFromSlug(new URL(window.location.href).searchParams.get("vue")));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement && expanded) openView(null);
    };
    const onFs = () => setFullscreen(document.fullscreenElement === rootRef.current);
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [expanded, openView]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
    } catch {
      /* plein écran refusé par le navigateur : la vue agrandie reste disponible */
    }
  };
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  // Les données serveur rafraîchies (après une action) font foi
  useEffect(() => setStatus(Object.fromEntries(rows.map((r) => [r.productId, r.reviewStatus]))), [rows]);

  // Recherche + périmètre (semaine, ruptures), puis avis selon les critères — comme Buy Decisions
  const pool = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .map((r) => evaluateRow(r, filters.thresholds))
      .filter((r) => (!q || `${r.asin} ${r.name} ${r.supplierName ?? ""} ${r.supplierKey}`.toLowerCase().includes(q)) && inScope(r, filters, currentWeek));
  }, [rows, query, filters, currentWeek]);

  const counts = useMemo(() => countVerdicts(pool), [pool]);

  const { columns, hidden } = useMemo(() => {
    type Row = (typeof pool)[number];
    const by: Record<Bucket, Row[]> = { BUY: [], REJECT: [], UNDECIDED: [] };
    const hiddenBy: Record<Bucket, number> = { BUY: 0, REJECT: 0, UNDECIDED: 0 };
    for (const r of rows) {
      const b = bucketOf(status[r.productId] ?? r.reviewStatus);
      hiddenBy[b]++;
    }
    for (const r of pool) {
      if (!matchesVerdict(r.verdict, filters.verdict)) continue;
      const b = bucketOf(status[r.productId] ?? r.reviewStatus);
      by[b].push(r);
      hiddenBy[b]--;
    }
    const sort = compareRows(filters.strategy);
    for (const k of Object.keys(by) as Bucket[]) by[k].sort(sort);
    return { columns: by, hidden: hiddenBy };
  }, [rows, pool, status, filters.verdict, filters.strategy]);

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
    <div ref={rootRef} className="flex flex-col gap-4 [&:fullscreen]:overflow-y-auto [&:fullscreen]:bg-page [&:fullscreen]:p-6">
      <div className="rounded-xl border border-line bg-surface">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
            <input className="field pl-9" placeholder="Rechercher par ASIN, produit ou fournisseur" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher" />
          </div>
          <button type="button" className="btn-ghost" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal size={15} /> {showFilters ? "Masquer les filtres" : "Classement et critères"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2">
          <VerdictChips value={filters.verdict} onChange={(v) => update({ verdict: v })} counts={counts} total={pool.length} />
          <span className="ml-auto text-[11px] text-ink-3">
            Tri : {STRATEGY_LABEL[filters.strategy]}
            {filters.weekOnly && " · cette semaine"}
            {!filters.includeUnavailable && " · ruptures masquées"}
          </span>
        </div>
      </div>
      {showFilters && <FilterPanel filters={filters} update={update} />}
      {error && <p className="rounded-lg border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-[#f08080]">{error}</p>}

      {/* Onglets sur mobile */}
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1 lg:hidden" role="tablist">
        {COLUMNS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={(expanded ?? mobileTab) === c.key}
            onClick={() => (expanded ? openView(c.key) : setMobileTab(c.key))}
            className={cn("rounded-lg px-2 py-2 text-xs font-medium", (expanded ?? mobileTab) === c.key ? "bg-accent-soft text-ink" : "text-ink-2")}
          >
            {c.title} <span className="text-ink-3 tabular-nums">{columns[c.key].length}</span>
          </button>
        ))}
      </div>

      {expanded && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost" onClick={() => openView(null)} title="Revenir aux trois listes (Échap)">
            <ArrowLeft size={15} /> Retour aux 3 listes
          </button>
          <span className="hidden gap-1 sm:flex">
            {COLUMNS.filter((c) => c.key !== expanded).map((c) => (
              <button key={c.key} type="button" className="btn-ghost text-xs" onClick={() => openView(c.key)}>
                <span className={c.accent}>{c.icon}</span> {c.title} <span className="text-ink-3 tabular-nums">{columns[c.key].length}</span>
              </button>
            ))}
          </span>
          <button type="button" className="btn-ghost ml-auto" onClick={toggleFullscreen} title="Afficher sans le menu ni le navigateur">
            {fullscreen ? <Shrink size={15} /> : <Expand size={15} />} {fullscreen ? "Quitter le plein écran" : "Plein écran"}
          </button>
        </div>
      )}

      <div className={cn("grid items-start gap-4", !expanded && "lg:grid-cols-3")}>
        {COLUMNS.filter((c) => !expanded || c.key === expanded).map((c) => {
          const list = columns[c.key];
          const s = summary(list);
          const big = expanded === c.key;
          return (
            <section key={c.key} className={cn("flex-col rounded-xl border border-line bg-surface", big || mobileTab === c.key ? "flex" : "hidden lg:flex")} aria-label={c.title}>
              <header className="border-b border-line px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  {big ? (
                    <h2 className={cn("flex items-center gap-2 text-lg font-semibold", c.accent)}>
                      {c.icon} {c.title}
                    </h2>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openView(c.key)}
                      className={cn("group flex items-center gap-2 rounded-md text-sm font-semibold hover:underline", c.accent)}
                      title={`Ouvrir « ${c.title} » en grand`}
                    >
                      {c.icon} {c.title}
                      <Maximize2 size={13} className="text-ink-3 opacity-60 transition group-hover:opacity-100" />
                    </button>
                  )}
                  <span className="rounded-full bg-surface-3 px-2 text-xs font-semibold tabular-nums text-ink">{s.count}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-ink-3">{c.hint}</p>
                {hidden[c.key] > 0 && (
                  <p className="mt-1 text-[11px] text-ink-3">
                    + {hidden[c.key]} masqué{hidden[c.key] > 1 ? "s" : ""} par les filtres ·{" "}
                    <button type="button" className="text-accent hover:underline" onClick={() => { update({ verdict: "ALL", includeUnavailable: true, weekOnly: false }); setQuery(""); }}>
                      tout afficher
                    </button>
                  </p>
                )}
                {c.key === "BUY" && s.count > 0 && (
                  <dl className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-page/60 p-2 text-[11px]">
                    <div><dt className="text-ink-3" title="Calculé sur les leads affichés (selon les filtres)">1 unité de chaque*</dt><dd className="font-semibold tabular-nums text-ink">{cad(s.unitCost)}</dd></div>
                    <div><dt className="text-ink-3">ROI moyen</dt><dd className="font-semibold tabular-nums text-ink">{pct(s.avgRoi, 0)}</dd></div>
                    <div><dt className="text-ink-3">Profit mensuel max.</dt><dd className="font-semibold tabular-nums text-ink">{cad(s.monthly)}</dd></div>
                  </dl>
                )}
                {c.key === "BUY" && s.count > 0 && hidden.BUY > 0 && <p className="mt-1 text-[10px] text-ink-3">* Totaux des leads affichés selon les filtres.</p>}
              </header>
              <div className={cn("p-2", big ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" : "flex max-h-[70vh] flex-col gap-2 overflow-y-auto")}>
                {list.length === 0 ? (
                  <div className="col-span-full">
                    <EmptyState title="Aucun lead" icon={<PackageX size={20} />} />
                  </div>
                ) : (
                  list.map((r) => {
                    const v = r.verdict;
                    const current = status[r.productId] ?? r.reviewStatus;
                    return (
                      <article key={r.productId} className={cn("rounded-lg border border-line bg-surface-2/50 p-3 transition", busy === r.productId && "opacity-60")}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link href={`/leads/${r.asin}`} className="block truncate text-sm font-medium text-ink hover:text-accent hover:underline" title={`${r.name} — ouvrir la fiche`}>
                              {r.name}
                            </Link>
                            {r.notes && <div className="truncate text-[11px] text-ink-2" title={r.notes}>📝 {r.notes}</div>}
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
        Mêmes filtres que Buy Decisions (classement, critères, avis, semaine, ruptures) : un réglage modifié ici l&apos;est aussi là-bas. L&apos;avis est une
        recommandation calculée avec vos critères ; la colonne est votre décision. Déplacer un lead change son statut de revue : Achat = « Revu et validé »,
        Rejeté = « Rejeté », À définir = « À revoir ». Chaque changement est journalisé.
      </p>
    </div>
  );
}
