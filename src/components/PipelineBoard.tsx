"use client";
// Pipeline de sourcing en colonnes (Kanban) : glisser-déposer une carte change son statut de revue.
// Les colonnes « À reconfirmer » et « Achetés » sont calculées (fraîcheur, achats confirmés).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowLeft, CheckCircle2, CircleSlash, Expand, Eye, Gavel, Inbox, Lock, Maximize2, PackageCheck, RefreshCw, Search, ShoppingCart, Shrink, SlidersHorizontal, Sparkles,
} from "lucide-react";
import { setReviewStatus } from "@/app/(app)/actions";
import { VERDICT_LABELS, type Verdict } from "@/lib/decision";
import { STRATEGIES, compareRows, evaluateRow, matchesVerdict } from "@/lib/decisionFilters";
import type { DecisionRow } from "@/lib/decisionRows";
import { formatDate } from "@/lib/dates";
import { cad, pct } from "@/lib/format";
import { STAGES, STAGE_INFO, STAGE_STATUS, stageFromSlug, stageOf, type Stage } from "@/lib/pipeline";
import type { CartState } from "./Cart";
import { FilterPanel, VerdictChips, countVerdicts, readSaved, useDecisionFilters, writeSaved } from "./DecisionFilters";
import { FreshnessPill } from "./Freshness";
import { ProductImage } from "./ProductImage";
import { Badge, EmptyState, Supplier, cn } from "./ui";

const ICONS: Record<Stage, React.ReactNode> = {
  NEW: <Inbox size={15} />,
  ANALYSIS: <Sparkles size={15} />,
  RECONFIRM: <RefreshCw size={15} />,
  READY: <CheckCircle2 size={15} />,
  BOUGHT: <PackageCheck size={15} />,
  WATCH: <Eye size={15} />,
  REJECTED: <CircleSlash size={15} />,
};
const ACCENT: Record<Stage, string> = {
  NEW: "text-ink",
  ANALYSIS: "text-accent",
  RECONFIRM: "text-[#f08080]",
  READY: "text-[#5fd35f]",
  BOUGHT: "text-[#5fd35f]",
  WATCH: "text-warning",
  REJECTED: "text-ink-3",
};
const VERDICT_TONE: Record<Verdict, "good" | "warning" | "critical" | "neutral"> = { BUY: "good", CONSIDER: "warning", AVOID: "critical", INCOMPLETE: "neutral" };
const STRATEGY_LABEL = Object.fromEntries(STRATEGIES.map((s) => [s.key, s.label])) as Record<(typeof STRATEGIES)[number]["key"], string>;

type Purchased = Record<string, { lastAt: string; units: number }>;

export function PipelineBoard({ rows, purchased, currentWeek, initialView = null }: { rows: DecisionRow[]; purchased: Purchased; currentWeek: string; initialView?: Stage | null }) {
  const router = useRouter();
  const { filters, update } = useDecisionFilters();
  const [status, setStatus] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.productId, r.reviewStatus])));
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [expanded, setExpanded] = useState<Stage | null>(initialView);
  const [mobileTab, setMobileTab] = useState<Stage>(initialView ?? "NEW");
  const [fullscreen, setFullscreen] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cart, setCart] = useState<CartState>({});
  const [, start] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => setStatus(Object.fromEntries(rows.map((r) => [r.productId, r.reviewStatus]))), [rows]);
  useEffect(() => setCart((readSaved().cart ?? {}) as CartState), []);

  const openView = useCallback((s: Stage | null) => {
    setExpanded(s);
    if (s) setMobileTab(s);
    const url = new URL(window.location.href);
    if (s) url.searchParams.set("vue", STAGE_INFO[s].slug);
    else url.searchParams.delete("vue");
    window.history.pushState(null, "", url);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onPop = () => setExpanded(stageFromSlug(new URL(window.location.href).searchParams.get("vue")));
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
      /* plein écran refusé par le navigateur */
    }
  };

  // Recherche, semaine et avis (comme Buy Decisions). Les ruptures restent visibles : elles ont leur colonne « En veille ».
  const evaluated = useMemo(() => rows.map((r) => ({ ...evaluateRow(r, filters.thresholds), reviewStatus: status[r.productId] ?? r.reviewStatus })), [rows, filters.thresholds, status]);
  const pool = useMemo(() => {
    const q = query.trim().toLowerCase();
    return evaluated.filter(
      (r) => (!q || `${r.asin} ${r.name} ${r.supplierName ?? ""} ${r.supplierKey}`.toLowerCase().includes(q)) && (!filters.weekOnly || (r.countsTowardGoal && r.goalWeek === currentWeek)),
    );
  }, [evaluated, query, filters.weekOnly, currentWeek]);
  const counts = useMemo(() => countVerdicts(pool), [pool]);

  const { columns, hidden } = useMemo(() => {
    type Row = (typeof pool)[number];
    const by = Object.fromEntries(STAGES.map((s) => [s, [] as Row[]])) as Record<Stage, Row[]>;
    const total = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
    const stageOfRow = (r: Row) => stageOf({ reviewStatus: r.reviewStatus, purchased: !!purchased[r.productId], unavailable: r.unavailable, fresh: r.fresh.state });
    for (const r of evaluated) total[stageOfRow(r)]++;
    for (const r of pool) if (matchesVerdict(r.verdict, filters.verdict)) by[stageOfRow(r)].push(r);
    const sort = compareRows(filters.strategy);
    for (const s of STAGES) by[s].sort(sort);
    by.BOUGHT.sort((a, b) => (purchased[b.productId]?.lastAt ?? "").localeCompare(purchased[a.productId]?.lastAt ?? ""));
    const hiddenBy = Object.fromEntries(STAGES.map((s) => [s, total[s] - by[s].length])) as Record<Stage, number>;
    return { columns: by, hidden: hiddenBy };
  }, [evaluated, pool, purchased, filters.verdict, filters.strategy]);

  const addToCart = (r: DecisionRow) => {
    const next = { ...((readSaved().cart ?? {}) as CartState) };
    next[r.productId] = { ...next[r.productId], qty: (next[r.productId]?.qty ?? 0) + 1 };
    writeSaved({ cart: next });
    setCart(next);
    setMessage({ ok: true, text: `${r.name} ajouté au panier — confirmez la commande dans Buy Decisions.` });
  };

  const move = (r: DecisionRow, to: Stage) => {
    setMessage(null);
    if (to === "RECONFIRM" || (to === "READY" && r.fresh.state === "STALE")) return router.push(`/reconfirm?asin=${r.asin}`);
    if (to === "BOUGHT") return setMessage({ ok: false, text: "Un achat se confirme depuis le panier de Buy Decisions." });
    const next = STAGE_STATUS[to];
    const previous = status[r.productId] ?? r.reviewStatus;
    if (!next || next === previous) return;
    setBusy(r.productId);
    setStatus((s) => ({ ...s, [r.productId]: next }));
    start(async () => {
      const res = await setReviewStatus(r.productId, next);
      setBusy(null);
      if (!res.ok) {
        setStatus((s) => ({ ...s, [r.productId]: previous }));
        setMessage({ ok: false, text: res.error });
      } else if (r.fresh.state === "STALE" && (to === "NEW" || to === "ANALYSIS")) {
        setMessage({ ok: true, text: "Statut changé ; le lead reste dans « À reconfirmer » tant que ses données ne sont pas reconfirmées." });
      } else if (r.unavailable && to !== "WATCH" && to !== "REJECTED") {
        setMessage({ ok: true, text: "Statut changé ; le lead reste « En veille » tant que le fournisseur est en rupture." });
      }
    });
  };

  const byId = useMemo(() => new Map(rows.map((r) => [r.productId, r])), [rows]);
  const droppable = (s: Stage) => s !== "BOUGHT";
  const visible = expanded ? [expanded] : STAGES;

  return (
    <div ref={rootRef} className="flex flex-col gap-4 [&:fullscreen]:overflow-y-auto [&:fullscreen]:bg-page [&:fullscreen]:p-6">
      <div className="rounded-xl border border-line bg-surface">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
            <input className="field pl-9" placeholder="Rechercher par ASIN, produit ou fournisseur" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher" />
          </div>
          <Link href="/decisions" className="btn-primary"><Gavel size={15} /> Décider un par un</Link>
          <Link href="/reconfirm" className="btn-ghost"><RefreshCw size={15} /> Reconfirmer ({columns.RECONFIRM.length + hidden.RECONFIRM})</Link>
          <button type="button" className="btn-ghost" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal size={15} /> {showFilters ? "Masquer" : "Filtres"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2">
          <VerdictChips value={filters.verdict} onChange={(v) => update({ verdict: v })} counts={counts} total={pool.length} />
          <span className="ml-auto text-[11px] text-ink-3">Tri : {STRATEGY_LABEL[filters.strategy]}{filters.weekOnly && " · cette semaine"}</span>
        </div>
      </div>
      {showFilters && <FilterPanel filters={filters} update={update} />}
      {message && <p className={cn("rounded-lg border px-3 py-2 text-sm", message.ok ? "border-line bg-surface text-ink-2" : "border-critical/40 bg-critical/10 text-[#f08080]")}>{message.text}</p>}

      {/* Onglets sur mobile */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1 lg:hidden" role="tablist">
        {STAGES.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={(expanded ?? mobileTab) === s}
            onClick={() => (expanded ? openView(s) : setMobileTab(s))}
            className={cn("shrink-0 rounded-lg px-2.5 py-2 text-xs font-medium whitespace-nowrap", (expanded ?? mobileTab) === s ? "bg-accent-soft text-ink" : "text-ink-2")}
          >
            {STAGE_INFO[s].title} <span className="text-ink-3 tabular-nums">{columns[s].length}</span>
          </button>
        ))}
      </div>

      {expanded && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost" onClick={() => openView(null)} title="Revenir au pipeline (Échap)"><ArrowLeft size={15} /> Tout le pipeline</button>
          <button type="button" className="btn-ghost ml-auto" onClick={toggleFullscreen}>
            {fullscreen ? <Shrink size={15} /> : <Expand size={15} />} {fullscreen ? "Quitter le plein écran" : "Plein écran"}
          </button>
        </div>
      )}

      <div className={cn(expanded ? "" : "flex items-start gap-3 lg:overflow-x-auto lg:pb-2")}>
        {visible.map((s) => {
          const list = columns[s];
          const big = expanded === s;
          const parking = s === "WATCH" || s === "REJECTED";
          const readyCost = s === "READY" ? list.reduce((n, r) => n + (r.costPrice ?? 0), 0) : 0;
          const readyMonthly = s === "READY" ? list.reduce((n, r) => n + (r.monthlyProfit ?? 0), 0) : 0;
          return (
            <section
              key={s}
              aria-label={STAGE_INFO[s].title}
              onDragOver={(e) => {
                if (!dragging || !droppable(s)) return;
                e.preventDefault();
                setOver(s);
              }}
              onDragLeave={() => setOver((o) => (o === s ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const r = byId.get(e.dataTransfer.getData("text/plain"));
                if (r) move(r, s);
              }}
              className={cn(
                "flex-col rounded-xl border bg-surface transition",
                big ? "flex" : cn("w-full lg:w-[272px] lg:shrink-0", mobileTab === s ? "flex" : "hidden lg:flex"),
                parking && !big && "bg-surface/60",
                over === s ? "border-accent ring-2 ring-accent/30" : "border-line",
              )}
            >
              <header className="border-b border-line px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => (big ? openView(null) : openView(s))} className={cn("group flex items-center gap-1.5 text-sm font-semibold hover:underline", ACCENT[s])} title={big ? "Revenir au pipeline" : "Ouvrir en grand"}>
                    {ICONS[s]} {STAGE_INFO[s].title}
                    {!big && <Maximize2 size={12} className="text-ink-3 opacity-0 transition group-hover:opacity-100" />}
                  </button>
                  <span className="rounded-full bg-surface-3 px-2 text-xs font-semibold tabular-nums text-ink">{list.length}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-ink-3">{STAGE_INFO[s].hint}</p>
                {s === "READY" && list.length > 0 && (
                  <p className="mt-1 text-[11px] text-ink-2">1 u. de chaque : <b className="text-ink tabular-nums">{cad(readyCost)}</b> · profit mensuel max <b className="text-[#5fd35f] tabular-nums">{cad(readyMonthly)}</b></p>
                )}
                {s === "RECONFIRM" && list.length > 0 && <Link href="/reconfirm" className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"><RefreshCw size={11} /> Lancer la reconfirmation</Link>}
                {hidden[s] > 0 && (
                  <p className="mt-1 text-[11px] text-ink-3">
                    + {hidden[s]} masqué{hidden[s] > 1 ? "s" : ""} ·{" "}
                    <button type="button" className="text-accent hover:underline" onClick={() => { update({ verdict: "ALL", weekOnly: false }); setQuery(""); }}>tout afficher</button>
                  </p>
                )}
              </header>
              <div className={cn("p-2", big ? "grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" : "flex max-h-[72vh] flex-col gap-2 overflow-y-auto")}>
                {list.length === 0 ? (
                  <div className="col-span-full"><EmptyState title={dragging && droppable(s) ? "Déposez ici" : "Aucun lead"} /></div>
                ) : (
                  list.map((r) => (
                    <LeadCard
                      key={r.productId}
                      r={r}
                      stage={s}
                      busy={busy === r.productId}
                      inCart={cart[r.productId]?.qty ?? 0}
                      purchased={purchased[r.productId]}
                      onMove={(to) => move(r, to)}
                      onAddToCart={() => addToCart(r)}
                      onDragStart={() => setDragging(r.productId)}
                      onDragEnd={() => { setDragging(null); setOver(null); }}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
      <p className="text-xs text-ink-3">
        Glissez une carte d&apos;une colonne à l&apos;autre (ou utilisez « Déplacer ») : son statut de revue change et le changement est journalisé. « À reconfirmer »
        regroupe les leads dont les données ont 30 jours ou plus ; « Achetés » ceux dont un achat est confirmé. Mêmes filtres que Buy Decisions (avis, semaine, tri).
      </p>
    </div>
  );
}

function LeadCard({
  r, stage, busy, inCart, purchased, onMove, onAddToCart, onDragStart, onDragEnd,
}: {
  r: DecisionRow & { verdict: Verdict };
  stage: Stage;
  busy: boolean;
  inCart: number;
  purchased?: { lastAt: string; units: number };
  onMove: (to: Stage) => void;
  onAddToCart: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const draggable = stage !== "BOUGHT";
  return (
    <article
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", r.productId);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn("rounded-lg border border-line bg-surface-2/60 p-2.5 transition hover:border-line-strong", draggable && "cursor-grab active:cursor-grabbing", busy && "opacity-50")}
    >
      <div className="flex gap-2.5">
        <ProductImage asin={r.asin} size={44} />
        <div className="min-w-0 flex-1">
          <Link href={`/leads/${r.asin}`} className="line-clamp-2 text-[13px] leading-snug font-medium text-ink hover:text-accent hover:underline" title={r.name} draggable={false}>
            {r.name}
          </Link>
          <div className="mt-0.5 truncate text-[11px] text-ink-3">
            <span className="font-mono">{r.asin}</span> · <Supplier name={r.supplierName} url={r.supplierUrl} fallback={r.supplierKey} product={r.name} />
            {r.offerCount > 1 && ` +${r.offerCount - 1}`}
          </div>
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-1 text-[11px]">
        <div><dt className="text-ink-3">ROI</dt><dd className="font-semibold tabular-nums">{pct(r.roi, 0)}</dd></div>
        <div><dt className="text-ink-3">Profit/u.</dt><dd className={cn("tabular-nums", r.profit != null && r.profit < 0 && "text-[#f08080]")}>{cad(r.profit)}</dd></div>
        <div><dt className="text-ink-3">/ mois</dt><dd className="tabular-nums">{cad(r.monthlyProfit)}</dd></div>
      </dl>
      <div className="mt-2 flex flex-wrap gap-1">
        <Badge tone={VERDICT_TONE[r.verdict]}>{VERDICT_LABELS[r.verdict]}</Badge>
        {stage !== "BOUGHT" && stage !== "REJECTED" && <FreshnessPill fresh={r.fresh} compact />}
        {r.unavailable && <Badge tone="critical">Rupture</Badge>}
        {r.restricted && <Badge tone="serious" icon={<Lock size={10} />}>Restreint</Badge>}
        {inCart > 0 && <Badge tone="accent" icon={<ShoppingCart size={10} />}>× {inCart}</Badge>}
      </div>
      {purchased && <p className="mt-1.5 text-[11px] text-ink-2">Acheté le {formatDate(purchased.lastAt)} · {purchased.units} u.</p>}
      <div className="mt-2 flex items-center justify-between gap-1.5">
        <select
          className="field w-auto py-1 pr-6 pl-2 text-[11px]"
          value=""
          onChange={(e) => e.target.value && onMove(e.target.value as Stage)}
          aria-label={`Déplacer ${r.asin}`}
          disabled={busy}
        >
          <option value="">Déplacer…</option>
          {STAGES.filter((s) => s !== stage && s !== "BOUGHT").map((s) => (
            <option key={s} value={s}>{STAGE_INFO[s].title}</option>
          ))}
        </select>
        {stage === "RECONFIRM" ? (
          <Link href={`/reconfirm?asin=${r.asin}`} className="btn-ghost px-2 py-1 text-[11px] text-[#f08080]"><RefreshCw size={11} /> Reconfirmer</Link>
        ) : stage === "READY" ? (
          <button type="button" className="btn-ghost px-2 py-1 text-[11px]" onClick={onAddToCart}><ShoppingCart size={11} /> Panier</button>
        ) : stage === "NEW" || stage === "ANALYSIS" || stage === "BOUGHT" ? (
          <Link href={`/decisions?asin=${r.asin}`} className="btn-ghost px-2 py-1 text-[11px]"><Gavel size={11} /> {stage === "BOUGHT" ? "Racheter" : "Décider"}</Link>
        ) : null}
      </div>
    </article>
  );
}
