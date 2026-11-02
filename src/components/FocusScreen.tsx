"use client";
// Écran « un lead à la fois », en deux modes :
//  - reconfirm : file des leads dont les données ont 30 jours ou plus — « Toujours bon » en un clic
//  - decide    : décision d'achat visuelle (Acheter / À suivre / Rejeter) avec budget et panier
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowLeft, ArrowRight, CheckCircle2, CircleSlash, ExternalLink, Eye, Keyboard, LineChart, Lock, Minus, PackageCheck, Plus, RefreshCw, ShoppingCart, Star, StickyNote,
} from "lucide-react";
import { reconfirmLead, setReviewStatus } from "@/app/(app)/actions";
import { VERDICT_LABELS, type Thresholds, type Verdict } from "@/lib/decision";
import { compareRows, evaluateRow, inScope, matchesVerdict } from "@/lib/decisionFilters";
import { changedValues, evaluateFocus, hasChanges, type Availability, type FocusEdits, type FocusLead } from "@/lib/focus";
import { freshnessText } from "@/lib/freshness";
import { cad, num, pct } from "@/lib/format";
import { amount } from "@/lib/normalize";
import type { TaxConfig } from "@/lib/profit";
import { REVIEW_LABELS, type ReviewStatus } from "@/lib/labels";
import { cartLineValues, type CartState } from "./Cart";
import { readSaved, useDecisionFilters, writeSaved } from "./DecisionFilters";
import { FreshnessPill } from "./Freshness";
import { ProductImage } from "./ProductImage";
import { Badge, EmptyState, Supplier, cn } from "./ui";

export type FocusMode = "reconfirm" | "decide";
/** Panier partagé avec la page (Buy Decisions). Sans lui, l'écran lit et écrit le panier du navigateur directement. */
export type CartApi = { cart: CartState; add: (productId: string, qty: number) => void; budget: number | null; open: () => void; paused: boolean };
type Outcome = "confirmed" | "rejected" | "later" | "bought";

const VERDICT_TONE: Record<Verdict, "good" | "warning" | "critical" | "neutral"> = { BUY: "good", CONSIDER: "warning", AVOID: "critical", INCOMPLETE: "neutral" };
const OUTCOME_LABEL: Record<Outcome, string> = { confirmed: "Reconfirmé", rejected: "Rejeté", later: "À suivre", bought: "Au panier" };

const toField = (v: number | null | undefined) => (v == null ? "" : String(Math.round(v * 100) / 100).replace(".", ","));
/** Saisie → nombre (null si vide, undefined si invalide) */
const parseField = (s: string): number | null | undefined => (s.trim() ? (amount(s) ?? undefined) : null);

export function FocusScreen({
  leads, mode, tax, currentWeek, startAsin, cartApi,
}: { leads: FocusLead[]; mode: FocusMode; tax: TaxConfig; currentWeek: string; startAsin?: string | null; cartApi?: CartApi }) {
  const { filters, loaded } = useDecisionFilters();
  const byId = useMemo(() => new Map(leads.map((l) => [l.productId, l])), [leads]);
  // La file est figée à l'ouverture : un lead traité ne disparaît pas sous vos yeux
  const [queue, setQueue] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<Record<string, Outcome>>({});

  useEffect(() => {
    if (queue || !loaded) return;
    let list: FocusLead[];
    if (mode === "reconfirm") {
      const rank = { STALE: 0, SOON: 1, FRESH: 2 };
      list = leads
        .filter((l) => l.row.fresh.state !== "FRESH" && l.reviewStatus !== "REJECTED" && !l.purchased)
        .sort((a, b) => rank[a.row.fresh.state] - rank[b.row.fresh.state] || (b.row.score ?? -1) - (a.row.score ?? -1));
    } else {
      const sort = compareRows(filters.strategy);
      const evaluated = leads.map((l) => ({ l, e: evaluateRow(l.row, filters.thresholds) }));
      list = evaluated
        .filter(({ l, e }) => l.reviewStatus !== "REJECTED" && !l.purchased && inScope(e, filters, currentWeek) && matchesVerdict(e.verdict, filters.verdict))
        .sort((a, b) => sort(a.e, b.e))
        .map(({ l }) => l);
    }
    const ids = list.map((l) => l.productId);
    const start = startAsin ? leads.find((l) => l.asin === startAsin.toUpperCase()) : undefined;
    if (start) ids.splice(0, ids.length, start.productId, ...ids.filter((id) => id !== start.productId));
    setQueue(ids);
  }, [queue, loaded, leads, mode, filters, currentWeek, startAsin]);

  if (!queue) return <div className="h-64 animate-pulse rounded-md border border-line bg-surface" />;
  if (queue.length === 0) {
    return (
      <div className="rounded-md border border-line bg-surface">
        {mode === "reconfirm" ? (
          <EmptyState title="Rien à reconfirmer" icon={<CheckCircle2 size={22} />}>Tous vos leads actifs ont des données de moins de 23 jours.</EmptyState>
        ) : (
          <EmptyState title="Aucun lead à décider" icon={<PackageCheck size={22} />}>
            Aucun lead ne correspond à vos filtres de <Link href="/decisions" className="link">Buy Decisions</Link> (avis, semaine, ruptures).
          </EmptyState>
        )}
      </div>
    );
  }

  const finished = index >= queue.length;
  const counts = Object.values(done).reduce<Record<Outcome, number>>((n, o) => ({ ...n, [o]: n[o] + 1 }), { confirmed: 0, rejected: 0, later: 0, bought: 0 });
  const progress = Math.min(queue.length, Object.keys(done).length);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-line bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-semibold text-ink tabular-nums">{finished ? "Terminé" : `Lead ${index + 1} / ${queue.length}`}</span>
          <span className="flex flex-wrap gap-1.5">
            {(Object.keys(counts) as Outcome[]).filter((k) => counts[k] > 0).map((k) => (
              <Badge key={k} tone={k === "rejected" ? "critical" : k === "later" ? "serious" : "good"}>{OUTCOME_LABEL[k]} · {counts[k]}</Badge>
            ))}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={progress} aria-valuemax={queue.length} aria-label="Leads traités">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(progress / queue.length) * 100}%` }} />
        </div>
      </div>

      {finished ? (
        <div className="rounded-md border border-line bg-surface">
          <EmptyState title="File terminée" icon={<CheckCircle2 size={22} />}>
            {progress} lead{progress > 1 ? "s" : ""} traité{progress > 1 ? "s" : ""}.{" "}
            {counts.bought > 0 && (
              <>
                {cartApi ? <button type="button" className="link" onClick={cartApi.open}>Voir le panier</button> : <Link href="/decisions" className="link">Voir le panier</Link>} ·{" "}
              </>
            )}
            <Link href="/pipeline" className="link">Pipeline</Link> ·{" "}
            <button type="button" className="link" onClick={() => setIndex(0)}>Revoir depuis le début</button>
          </EmptyState>
        </div>
      ) : (
        <LeadPanel
          key={queue[index]}
          lead={byId.get(queue[index])!}
          mode={mode}
          tax={tax}
          thresholds={filters.thresholds}
          outcome={done[queue[index]]}
          rows={leads}
          cartApi={cartApi}
          onDone={(o) => {
            setDone((d) => ({ ...d, [queue[index]]: o }));
            setIndex((i) => i + 1);
          }}
          onSkip={() => setIndex((i) => i + 1)}
          onPrev={index > 0 ? () => setIndex((i) => i - 1) : undefined}
        />
      )}
    </div>
  );
}

function LeadPanel({
  lead, mode, tax, thresholds, outcome, rows, cartApi, onDone, onSkip, onPrev,
}: {
  lead: FocusLead;
  mode: FocusMode;
  tax: TaxConfig;
  thresholds: Thresholds;
  outcome?: Outcome;
  rows: FocusLead[];
  cartApi?: CartApi;
  onDone: (o: Outcome) => void;
  onSkip: () => void;
  onPrev?: () => void;
}) {
  const initialCost = (o: FocusLead["offers"][number]) => toField(o.verifiedCost ?? o.importedCost);
  const [sale, setSale] = useState(toField(lead.row.amazonPrice));
  const [fees, setFees] = useState(toField(lead.row.fees));
  const [costs, setCosts] = useState<Record<string, string>>(() => Object.fromEntries(lead.offers.map((o) => [o.id, initialCost(o)])));
  const [avail, setAvail] = useState<Record<string, Availability | null>>(() => Object.fromEntries(lead.offers.map((o) => [o.id, o.verifiedAvailability])));
  const [confirmedNow, setConfirmedNow] = useState(false);
  const [qty, setQty] = useState(1);
  const [localCart, setLocalCart] = useState<CartState>({});
  const [localBudget, setLocalBudget] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (cartApi) return;
    const s = readSaved();
    setLocalCart((s.cart ?? {}) as CartState);
    setLocalBudget(typeof s.budget === "string" ? (amount(s.budget) ?? null) : null);
  }, [cartApi]);
  const cart = cartApi?.cart ?? localCart;
  const budget = cartApi ? cartApi.budget : localBudget;

  // Saisies → valeurs ; un champ inchangé n'est pas envoyé
  const parsed = {
    sale: sale === toField(lead.row.amazonPrice) ? undefined : parseField(sale),
    fees: fees === toField(lead.row.fees) ? undefined : parseField(fees),
  };
  const invalid = (sale !== toField(lead.row.amazonPrice) && parsed.sale === undefined) || (fees !== toField(lead.row.fees) && parsed.fees === undefined) ||
    lead.offers.some((o) => costs[o.id] !== initialCost(o) && parseField(costs[o.id]) === undefined);
  const edits: FocusEdits = {
    salePrice: parsed.sale,
    fees: parsed.fees,
    offers: Object.fromEntries(
      lead.offers.map((o) => [o.id, { cost: costs[o.id] === initialCost(o) ? undefined : parseField(costs[o.id]), availability: avail[o.id] === o.verifiedAvailability ? undefined : avail[o.id] }]),
    ),
  };
  const changes = changedValues(lead, edits);
  const dirty = hasChanges(changes);
  const before = useMemo(() => evaluateFocus(lead, {}, tax).best, [lead, tax]);
  const { offers, best } = evaluateFocus(lead, edits, tax);
  const metrics = best?.metrics ?? lead.row;
  const evaluated = evaluateRow(
    { ...metrics, score: best?.score ?? null, unavailable: best?.unavailable ?? false, restricted: lead.restricted, countsTowardGoal: lead.row.countsTowardGoal, goalWeek: lead.row.goalWeek },
    thresholds,
  );
  const stale = lead.row.fresh.state === "STALE" && !confirmedNow;
  const mustConfirm = mode === "reconfirm" || stale || dirty;

  // Budget : panier actuel + cette ligne
  const rowsById = useMemo(() => new Map(rows.map((r) => [r.productId, r.row])), [rows]);
  const cartCost = Object.entries(cart).reduce((n, [id, line]) => {
    const r = rowsById.get(id);
    return r ? n + (cartLineValues(r, line, tax).subtotal ?? 0) : n;
  }, 0);
  const thisCost = (best?.cost ?? 0) * qty;
  const inCart = cart[lead.productId]?.qty ?? 0;

  const run = useCallback(
    (fn: () => Promise<{ ok: boolean; error?: string }>, after: () => void) =>
      start(async () => {
        setError(null);
        const res = await fn();
        if (res.ok) after();
        else setError(res.error ?? "Erreur");
      }),
    [],
  );

  const confirm = () =>
    run(
      () => reconfirmLead({ productId: lead.productId, ...changes }),
      () => (mode === "reconfirm" ? onDone("confirmed") : setConfirmedNow(true)),
    );
  const reject = () => run(() => setReviewStatus(lead.productId, "REJECTED"), () => onDone("rejected"));
  const later = () => run(() => setReviewStatus(lead.productId, "FOLLOW_UP"), () => onDone("later"));
  const buy = () => {
    if (cartApi) cartApi.add(lead.productId, qty);
    else {
      const next = { ...((readSaved().cart ?? {}) as CartState) };
      next[lead.productId] = { ...next[lead.productId], qty: (next[lead.productId]?.qty ?? 0) + qty };
      writeSaved({ cart: next });
      setLocalCart(next);
    }
    if (lead.reviewStatus === "VALIDATED") return onDone("bought");
    run(() => setReviewStatus(lead.productId, "VALIDATED"), () => onDone("bought"));
  };
  const primary = () => {
    if (pending || invalid) return;
    if (mustConfirm) confirm();
    else if (mode === "decide" && best?.cost != null) buy();
  };

  // Raccourcis clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || cartApi?.paused) return;
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA";
      if (e.key === "Enter" && el.tagName !== "BUTTON" && el.tagName !== "A" && el.tagName !== "TEXTAREA") {
        e.preventDefault();
        primary();
        return;
      }
      if (typing && e.key === "Escape") return el.blur(); // Échap : sortir du champ pour retrouver les raccourcis
      if (typing || pending) return;
      const k = e.key.toLowerCase();
      if (k === "r") reject();
      else if (k === "p" && mode === "decide") later();
      else if (k === "a" && mode === "decide" && !mustConfirm) buy();
      else if (e.key === "ArrowRight") onSkip();
      else if (e.key === "ArrowLeft" && onPrev) onPrev();
      else if ((e.key === "+" || e.key === "=") && mode === "decide") setQty((q) => Math.min(999, q + 1));
      else if (e.key === "-" && mode === "decide") setQty((q) => Math.max(1, q - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const keepa = `https://keepa.com/#!product/6-${lead.asin}`;

  return (
    <article className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        {/* Produit */}
        <section className="rounded-md border border-line bg-surface p-4">
          <div className="flex gap-4">
            <ProductImage asin={lead.asin} size={112} />
            <div className="min-w-0 flex-1">
              <Link href={`/leads/${lead.asin}`} className="line-clamp-2 text-lg font-semibold text-ink hover:text-accent hover:underline">{lead.name}</Link>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-xs text-ink-2">{lead.asin}</span>
                <FreshnessPill fresh={confirmedNow ? { ...lead.row.fresh, state: "FRESH", ageDays: 0, daysLeft: 30 } : lead.row.fresh} />
                <Badge>{REVIEW_LABELS[lead.reviewStatus as ReviewStatus] ?? lead.reviewStatus}</Badge>
                {lead.restricted && <Badge tone="serious" icon={<Lock size={10} />}>Restreint</Badge>}
                {inCart > 0 && <Badge tone="accent" icon={<ShoppingCart size={10} />}>{inCart} au panier</Badge>}
                {outcome && <Badge tone="good">{OUTCOME_LABEL[outcome]}</Badge>}
              </div>
              <p className="mt-1 text-xs text-ink-3">{confirmedNow ? "Reconfirmé à l'instant" : freshnessText(lead.row.fresh)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <a href={lead.amazonUrl} target="_blank" rel="noreferrer" className="btn-ghost px-2 py-1 text-xs"><ExternalLink size={12} /> Amazon.ca</a>
                <a href={keepa} target="_blank" rel="noreferrer" className="btn-ghost px-2 py-1 text-xs"><LineChart size={12} /> Keepa</a>
                {lead.offers.filter((o) => o.url).map((o) => (
                  <a key={o.id} href={o.url!} target="_blank" rel="noreferrer" className="btn-ghost max-w-48 px-2 py-1 text-xs"><ExternalLink size={12} /> <span className="truncate">{o.supplier}</span></a>
                ))}
              </div>
            </div>
          </div>
          {lead.notes && (
            <p className="mt-3 flex items-start gap-1.5 rounded-sm bg-page/60 px-3 py-2 text-xs text-ink-2">
              <StickyNote size={12} className="mt-0.5 shrink-0 text-warning" /> {lead.notes}
            </p>
          )}
        </section>

        {/* Valeurs à vérifier */}
        <section className="rounded-md border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">Amazon</h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <MoneyField label="Prix Amazon (Buy Box)" value={sale} onChange={setSale} initial={toField(lead.row.amazonPrice)} />
            <MoneyField label="Total Fees" value={fees} onChange={setFees} initial={toField(lead.row.fees)} />
          </div>
          <h2 className="mt-4 text-sm font-semibold text-ink">Fournisseurs</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {offers.map((r) => {
              const o = r.offer;
              const isBest = best?.offer.id === o.id && offers.length > 1;
              return (
                <li key={o.id} className={cn("grid items-end gap-2 rounded-sm border p-2.5 sm:grid-cols-[minmax(0,1fr)_140px_auto_64px]", isBest ? "border-accent/50 bg-accent/5" : "border-line")}>
                  <div className="min-w-0 text-sm">
                    <span className="flex items-center gap-1 font-medium text-ink">
                      {isBest && <Star size={12} className="shrink-0 fill-accent text-accent" aria-label="Meilleure offre" />}
                      <span className="min-w-0 truncate"><Supplier name={o.supplier} url={o.url} product={lead.name} /></span>
                    </span>
                    {r.unavailable && <span className="text-[11px] text-critical">En rupture</span>}
                    {o.currency !== "CAD" && costs[o.id] === initialCost(o) && <span className="text-[11px] text-warning">Coût en {o.currency}</span>}
                  </div>
                  <MoneyField label="Coût" value={costs[o.id]} onChange={(v) => setCosts((c) => ({ ...c, [o.id]: v }))} initial={initialCost(o)} compact />
                  <div className="flex gap-1" role="group" aria-label={`Disponibilité chez ${o.supplier}`}>
                    {(["IN_STOCK", "OUT_OF_STOCK"] as const).map((a) => (
                      <button
                        key={a}
                        type="button"
                        aria-pressed={avail[o.id] === a}
                        onClick={() => setAvail((s) => ({ ...s, [o.id]: s[o.id] === a ? null : a }))}
                        className={cn(
                          "rounded-sm border px-2 py-1.5 text-xs whitespace-nowrap",
                          avail[o.id] === a ? (a === "IN_STOCK" ? "border-good/60 bg-good/15 text-good" : "border-critical/60 bg-critical/15 text-critical") : "border-line text-ink-3 hover:text-ink",
                        )}
                      >
                        {a === "IN_STOCK" ? "En stock" : "Rupture"}
                      </button>
                    ))}
                  </div>
                  <span className={cn("text-right text-sm font-semibold tabular-nums", r.metrics.roi != null && r.metrics.roi < thresholds.minRoi ? "text-critical" : "text-good")} title="ROI avec ce fournisseur">
                    {pct(r.metrics.roi, 0)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] text-ink-3">Modifiez seulement ce qui a changé : les nouvelles valeurs sont enregistrées comme vérifiées, les valeurs de la Sheet restent intactes.</p>
        </section>
      </div>

      {/* Résultat et actions */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
        <section className="rounded-md border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <Badge tone={VERDICT_TONE[evaluated.verdict]}>{VERDICT_LABELS[evaluated.verdict]}</Badge>
            {best?.score != null && <span className="text-xs text-ink-3">Score <b className="text-base text-ink tabular-nums">{best.score}</b>/100</span>}
          </div>
          {evaluated.reasons.length > 0 && <p className="mt-1.5 text-[11px] leading-snug text-ink-3">{evaluated.reasons.join(" · ")}</p>}
          {best?.issue && <p className="mt-1.5 text-[11px] text-warning">{best.issue}</p>}
          <div className="mt-3 flex flex-col gap-2.5">
            <Gauge label="ROI" value={metrics.roi} before={before?.metrics.roi} threshold={thresholds.minRoi} format={(v) => pct(v, 0)} />
            <Gauge label="Marge" value={metrics.margin} before={before?.metrics.margin} threshold={thresholds.minMargin} format={(v) => pct(v, 0)} />
            <Gauge label="Profit / unité" value={metrics.profit} before={before?.metrics.profit} threshold={thresholds.minProfit} format={cad} />
            <Gauge label="Ventes / mois" value={metrics.estimatedSales} threshold={thresholds.minSales} format={(v) => num(v)} />
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3 text-xs">
            <span className="text-ink-3">Profit mensuel (annonce)</span>
            <span className="text-sm font-semibold tabular-nums text-ink">{cad(metrics.monthlyProfit)}</span>
          </div>
        </section>

        <section className="rounded-md border border-line bg-surface p-4">
          {mode === "decide" && (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-ink-2">Quantité</span>
                <span className="flex items-center gap-1">
                  <button type="button" className="btn-ghost px-2 py-1" aria-label="Moins" onClick={() => setQty((q) => Math.max(1, q - 1))}><Minus size={13} /></button>
                  <input className="field w-16 py-1 text-center tabular-nums" inputMode="numeric" value={qty} onChange={(e) => setQty(Math.max(1, Math.min(999, Math.floor(Number(e.target.value) || 1))))} aria-label="Quantité" />
                  <button type="button" className="btn-ghost px-2 py-1" aria-label="Plus" onClick={() => setQty((q) => Math.min(999, q + 1))}><Plus size={13} /></button>
                </span>
              </div>
              <div className="mt-2 flex justify-between text-xs">
                <span className="text-ink-3">Cette ligne</span>
                <span className="tabular-nums"><b className="text-ink">{cad(thisCost)}</b> · profit <span className="text-good">{cad(metrics.profit == null ? null : metrics.profit * qty)}</span></span>
              </div>
              {budget != null && budget > 0 && (
                <div className="mt-2">
                  <div className="flex justify-between text-[11px] text-ink-3">
                    <span>Budget : panier {cad(cartCost)} + {cad(thisCost)}</span>
                    <span className={cn("tabular-nums", cartCost + thisCost > budget ? "text-critical" : "text-ink-2")}>/ {cad(budget)}</span>
                  </div>
                  <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full bg-accent" style={{ width: `${Math.min(100, (cartCost / budget) * 100)}%` }} />
                    <div className={cn("h-full", cartCost + thisCost > budget ? "bg-critical" : "bg-accent/50")} style={{ width: `${Math.max(0, Math.min(100 - (cartCost / budget) * 100, (thisCost / budget) * 100))}%` }} />
                  </div>
                </div>
              )}
              {stale && <p className="mt-3 rounded-sm border border-critical/40 bg-critical/10 px-2.5 py-2 text-[11px] text-critical">Données de plus de 30 jours : vérifiez les prix ci-contre, puis reconfirmez pour pouvoir acheter.</p>}
            </>
          )}

          <div className={cn("flex flex-col gap-2", mode === "decide" && "mt-3")}>
            {mustConfirm ? (
              <button type="button" className="btn-primary w-full justify-center py-2.5" disabled={pending || invalid} onClick={confirm}>
                {dirty ? <RefreshCw size={16} /> : <CheckCircle2 size={16} />}
                {dirty ? "Enregistrer et reconfirmer" : mode === "reconfirm" ? "Toujours bon" : "Reconfirmer"}
                <Kbd>Entrée</Kbd>
              </button>
            ) : (
              <button type="button" className="btn-primary w-full justify-center py-2.5" disabled={pending || best?.cost == null} onClick={buy}>
                <ShoppingCart size={16} /> Acheter × {qty} <Kbd>A</Kbd>
              </button>
            )}
            <div className={cn("grid gap-2", mode === "decide" ? "grid-cols-2" : "grid-cols-1")}>
              {mode === "decide" && (
                <button type="button" className="btn-ghost justify-center" disabled={pending} onClick={later} title="Mettre en veille (statut « À suivre »)">
                  <Eye size={14} /> À suivre <Kbd>P</Kbd>
                </button>
              )}
              <button type="button" className="btn-ghost justify-center hover:border-critical/60 hover:text-critical" disabled={pending} onClick={reject}>
                <CircleSlash size={14} /> Rejeter <Kbd>R</Kbd>
              </button>
            </div>
            <div className="flex justify-between">
              <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={!onPrev} onClick={onPrev}><ArrowLeft size={13} /> Précédent</button>
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onSkip}>Passer <ArrowRight size={13} /></button>
            </div>
          </div>
          {invalid && <p className="mt-2 text-[11px] text-critical">Un montant saisi est invalide.</p>}
          {error && <p className="mt-2 text-[11px] text-critical">{error}</p>}
          <p className="mt-3 flex items-center gap-1.5 text-[10px] text-ink-3">
            <Keyboard size={11} /> Entrée {mode === "reconfirm" ? "reconfirme" : "valide"} · Échap sort d&apos;un champ · R rejette{mode === "decide" ? " · P à suivre · A achète · +/− quantité" : ""} · ←/→ précédent / suivant
          </p>
        </section>
      </aside>
    </article>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="ml-auto rounded-sm border border-current px-1.5 font-sans text-[10px] font-normal opacity-60">{children}</kbd>;
}

function MoneyField({ label, value, onChange, initial, compact }: { label: string; value: string; onChange: (v: string) => void; initial: string; compact?: boolean }) {
  const changed = value !== initial;
  const bad = changed && parseField(value) === undefined;
  return (
    <label className={cn("text-xs text-ink-3", compact && "text-[11px]")}>
      {label}
      <span className="relative mt-0.5 block">
        <input
          className={cn("field pr-7 text-right tabular-nums", changed && "border-accent/70 bg-accent/5", bad && "border-critical")}
          inputMode="decimal"
          value={value}
          placeholder="—"
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
        />
        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-3">$</span>
      </span>
      {changed && !compact && <span className="mt-0.5 block text-[10px] text-accent">avant : {initial ? `${initial} $` : "—"}</span>}
    </label>
  );
}

/** Jauge horizontale : le repère vertical marque votre critère minimum. */
function Gauge({ label, value, before, threshold, format }: { label: string; value: number | null; before?: number | null; threshold: number; format: (v: number | null) => string }) {
  const scale = Math.max(threshold * 2, 1);
  const fill = value == null ? 0 : Math.max(0, Math.min(1, value / scale));
  const ok = value != null && value >= threshold;
  const close = value != null && !ok && value >= threshold * 0.75;
  const changed = before !== undefined && before !== value && before != null && value != null;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-ink-2">{label}</span>
        <span className="tabular-nums">
          {changed && <span className="mr-1.5 text-ink-3 line-through">{format(before!)}</span>}
          <b className={cn("text-sm", ok ? "text-good" : close ? "text-warning" : value == null ? "text-ink-3" : "text-critical")}>{format(value)}</b>
        </span>
      </div>
      <div className="relative mt-1 h-2 rounded-full bg-surface-3" title={`Votre minimum : ${format(threshold)}`}>
        <div className={cn("h-full rounded-full transition-all", ok ? "bg-good" : close ? "bg-warning" : "bg-critical")} style={{ width: `${fill * 100}%` }} />
        <span className="absolute top-[-3px] h-[14px] w-0.5 rounded bg-ink/70" style={{ left: "50%" }} aria-hidden />
      </div>
    </div>
  );
}
