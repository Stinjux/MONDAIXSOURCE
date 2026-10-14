"use client";
import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, Save } from "lucide-react";
import { saveReview, type ReviewInput } from "@/app/(app)/actions";
import { formatDate, formatWeekRange } from "@/lib/dates";
import { cad, num, pct } from "@/lib/format";
import { CHECKLIST, REVIEW_LABELS, REVIEW_STATUSES, RESTRICTIONS, RESTRICTION_LABELS, isDecided, type Checklist, type ReviewStatus } from "@/lib/labels";
import { amount } from "@/lib/normalize";
import { pick, preliminaryProfit } from "@/lib/profit";
import type { OfferView, ProductView } from "@/lib/queries";
import { Asin, Badge, DuplicateBadges, EmptyState, OriginTag, ReviewBadge, SourceBadges, StockBadge, Supplier, cn } from "./ui";

const STATUS_STYLE: Record<ReviewStatus, string> = {
  TO_REVIEW: "data-[on=true]:border-warning/60 data-[on=true]:bg-warning/10 data-[on=true]:text-warning",
  IN_PROGRESS: "data-[on=true]:border-accent/60 data-[on=true]:bg-accent/10 data-[on=true]:text-[#8fbcf2]",
  VALIDATED: "data-[on=true]:border-good/60 data-[on=true]:bg-good/10 data-[on=true]:text-[#5fd35f]",
  REJECTED: "data-[on=true]:border-critical/60 data-[on=true]:bg-critical/10 data-[on=true]:text-[#f08080]",
  FOLLOW_UP: "data-[on=true]:border-serious/60 data-[on=true]:bg-serious/10 data-[on=true]:text-serious",
};

type Filter = "ALL" | "PENDING" | ReviewStatus;

export function ReviewBoard({ items, overdue }: { items: ProductView[]; overdue: ProductView[] }) {
  const [filter, setFilter] = useState<Filter>("PENDING");
  // Une fiche qui vient d'être enregistrée reste affichée jusqu'au prochain changement de filtre.
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const onSaved = (id: string) => setPinned((s) => new Set(s).add(id));
  const all = useMemo(() => [...overdue, ...items], [items, overdue]);
  const visible = (list: ProductView[]) =>
    list.filter((p) => pinned.has(p.id) || (filter === "ALL" ? true : filter === "PENDING" ? !isDecided(p.reviewStatus) : p.reviewStatus === filter));

  const chips: [Filter, string, number][] = [
    ["PENDING", "Non revus", all.filter((p) => !isDecided(p.reviewStatus)).length],
    ["ALL", "Tous", all.length],
    ...REVIEW_STATUSES.map((s) => [s, REVIEW_LABELS[s], all.filter((p) => p.reviewStatus === s).length] as [Filter, string, number]),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {chips.map(([k, label, n]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setFilter(k);
              setPinned(new Set());
            }}
            className={cn("rounded-full px-3 py-1 text-xs transition", filter === k ? "bg-accent-soft text-ink ring-1 ring-accent/40" : "text-ink-2 hover:bg-surface-2")}
          >
            {label} <span className="ml-1 text-ink-3 tabular-nums">{n}</span>
          </button>
        ))}
      </div>

      <section>
        {overdue.length > 0 && <h2 className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">Leads de la semaine ({visible(items).length})</h2>}
        {visible(items).length ? (
          <div className="flex flex-col gap-2">
            {visible(items).map((p) => (
              <ReviewCard key={p.id} product={p} onSaved={onSaved} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-surface">
            <EmptyState title={items.length ? "Tous les leads de ce filtre sont traités" : "Aucun lead pour cette semaine"} icon={<CheckCircle2 size={22} />}>
              {items.length ? "Changez de filtre pour revoir les décisions." : "Les nouveaux leads uniques de LEADS apparaîtront ici après synchronisation."}
            </EmptyState>
          </div>
        )}
      </section>
      {overdue.length > 0 && visible(overdue).length > 0 && (
        <details className="group" open={visible(overdue).length <= 10}>
          <summary className="mb-2 cursor-pointer list-none text-xs font-semibold tracking-wide text-warning uppercase [&::-webkit-details-marker]:hidden">
            En retard — semaines précédentes ({visible(overdue).length}) <span className="text-ink-3 normal-case group-open:hidden">· afficher</span>
          </summary>
          <div className="flex flex-col gap-2">
            {visible(overdue).map((p) => (
              <ReviewCard key={p.id} product={p} overdue onSaved={onSaved} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

const toInput = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));
const fromInput = (v: string) => (v.trim() ? amount(v) ?? null : null);

function ReviewCard({ product: p, overdue, onSaved }: { product: ProductView; overdue?: boolean; onSaved: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(p.reviewStatus as ReviewStatus);
  const [notes, setNotes] = useState(p.reviewNotes ?? "");
  const [checklist, setChecklist] = useState<Checklist>(p.reviewChecklist);
  const [sale, setSale] = useState(toInput(p.verifiedSalePrice));
  const [fee, setFee] = useState(toInput(p.verifiedFbaFee));
  const [restriction, setRestriction] = useState(p.restriction);
  const [offers, setOffers] = useState(() => Object.fromEntries(p.offers.map((o) => [o.id, { cost: toInput(o.verifiedCostPrice), availability: o.verifiedAvailability ?? "" }])));
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
    setFeedback(null);
  };

  const done = CHECKLIST.filter((c) => checklist[c.key]).length;
  const invalid = [sale, fee, ...Object.values(offers).map((o) => o.cost)].some((v) => v.trim() && fromInput(v) === null);

  const save = (nextStatus = status) =>
    start(async () => {
      const input: ReviewInput = {
        productId: p.id,
        status: nextStatus,
        notes: notes || null,
        checklist,
        verifiedSalePrice: fromInput(sale),
        verifiedFbaFee: fromInput(fee),
        restriction: restriction as ReviewInput["restriction"],
        offers: p.offers.map((o) => ({
          id: o.id,
          verifiedCostPrice: fromInput(offers[o.id].cost),
          verifiedAvailability: (offers[o.id].availability || null) as "IN_STOCK" | "OUT_OF_STOCK" | null,
        })),
      };
      onSaved(p.id);
      const res = await saveReview(input);
      setFeedback(res.ok ? { ok: true, text: "Enregistré" } : { ok: false, text: res.error });
      if (res.ok) setDirty(false);
    });

  const best = p.best;
  return (
    <article className={cn("rounded-xl border bg-surface transition", open ? "border-line-strong" : "border-line", overdue && "border-l-2 border-l-warning")}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={open}>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-ink">{p.name}</span>
            <ReviewBadge status={p.reviewStatus} />
            {p.dup.any && <DuplicateBadges dup={p.dup} compact />}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
            <span className="font-mono">{p.asin}</span>
            <span>{p.offers.length} fournisseur{p.offers.length > 1 ? "s" : ""}</span>
            {overdue && p.goalWeek && <span className="text-warning">Semaine du {formatWeekRange(p.goalWeek)}</span>}
            <span>Checklist {done}/{CHECKLIST.length}</span>
          </span>
        </span>
        <span className="hidden text-right sm:block">
          <span className="block text-sm font-medium tabular-nums">{pct(best?.profit.roi, 0)}</span>
          <span className="block text-[11px] text-ink-3">ROI prélim. importé</span>
        </span>
        <ChevronDown size={18} className={cn("shrink-0 text-ink-3 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-line px-4 pt-4 pb-4">
          <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
            {/* Amazon */}
            <div className="rounded-lg border border-line bg-surface-2/50 p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold tracking-wide text-ink-2 uppercase">Amazon.ca</h3>
                <Asin asin={p.asin} url={p.amazonUrl} />
              </div>
              <dl className="mb-3 grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-ink-3">Sale Price <OriginTag origin="imported" /></dt><dd className="mt-0.5 text-sm tabular-nums">{cad(best?.salePrice)}</dd></div>
                <div><dt className="text-ink-3">Buy Box 90 j</dt><dd className="mt-0.5 text-sm tabular-nums">{cad(best?.buyBox90)}</dd></div>
                <div><dt className="text-ink-3">FBA Fee <OriginTag origin="imported" /></dt><dd className="mt-0.5 text-sm tabular-nums">{cad(best?.fbaFee)}</dd></div>
              </dl>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-ink-2">
                  Prix Amazon vérifié
                  <input className="field mt-1" inputMode="decimal" placeholder="ex. 44,99" value={sale} onChange={(e) => touch(setSale)(e.target.value)} />
                </label>
                <label className="text-xs text-ink-2">
                  Frais FBA vérifiés
                  <input className="field mt-1" inputMode="decimal" placeholder="ex. 7,10" value={fee} onChange={(e) => touch(setFee)(e.target.value)} />
                </label>
                <label className="col-span-2 text-xs text-ink-2">
                  Restrictions / autorisation Amazon
                  <select className="field mt-1" value={restriction} onChange={(e) => touch(setRestriction)(e.target.value)}>
                    {RESTRICTIONS.map((r) => (
                      <option key={r} value={r}>{RESTRICTION_LABELS[r]}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3 border-t border-line pt-3 text-xs text-ink-3">
                <div className="flex flex-wrap items-center gap-2">
                  <SourceBadges sources={p.sources} />
                  <span>{p.occurrences} occurrence{p.occurrences > 1 ? "s" : ""}</span>
                </div>
                <div className="mt-1">Découvert le {formatDate(p.firstSeenAt)} · dernière occurrence le {formatDate(p.lastSeenAt)}</div>
                {p.dup.any && <div className="mt-2"><DuplicateBadges dup={p.dup} /></div>}
              </div>
            </div>

            {/* Fournisseurs + rentabilité */}
            <div className="flex flex-col gap-2">
              {p.offers.map((o) => (
                <OfferPanel
                  key={o.id}
                  offer={o}
                  isExactDuplicate={p.dup.exactOfferIds.includes(o.id)}
                  cost={offers[o.id].cost}
                  availability={offers[o.id].availability}
                  onCost={(v) => touch(setOffers)({ ...offers, [o.id]: { ...offers[o.id], cost: v } })}
                  onAvailability={(v) => touch(setOffers)({ ...offers, [o.id]: { ...offers[o.id], availability: v } })}
                  verifiedSale={fromInput(sale)}
                  verifiedFee={fromInput(fee)}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <fieldset>
              <legend className="mb-2 text-xs font-semibold tracking-wide text-ink-2 uppercase">Checklist ({done}/{CHECKLIST.length})</legend>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {CHECKLIST.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-2 hover:bg-surface-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[#3987e5]"
                      checked={!!checklist[c.key]}
                      onChange={(e) => touch(setChecklist)({ ...checklist, [c.key]: e.target.checked })}
                    />
                    <span className={checklist[c.key] ? "text-ink line-through decoration-ink-3" : ""}>{c.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="text-xs font-semibold tracking-wide text-ink-2 uppercase">
              Notes
              <textarea
                className="field mt-2 min-h-24 font-normal tracking-normal normal-case"
                placeholder="Observations, fournisseur retenu, quantité à acheter…"
                value={notes}
                maxLength={5000}
                onChange={(e) => touch(setNotes)(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Décision">
              {REVIEW_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={status === s}
                  data-on={status === s}
                  onClick={() => touch(setStatus)(s)}
                  className={cn("rounded-lg border border-line px-3 py-1.5 text-xs text-ink-2 transition hover:border-line-strong", STATUS_STYLE[s])}
                >
                  {REVIEW_LABELS[s]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              {feedback && <span className={cn("text-xs", feedback.ok ? "text-[#5fd35f]" : "text-[#f08080]")}>{feedback.text}</span>}
              {invalid && <span className="text-xs text-[#f08080]">Montant invalide</span>}
              <button type="button" className="btn-primary" disabled={pending || invalid || !dirty} onClick={() => save()}>
                <Save size={15} /> {pending ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function OfferPanel({
  offer: o,
  isExactDuplicate,
  cost,
  availability,
  onCost,
  onAvailability,
  verifiedSale,
  verifiedFee,
}: {
  offer: OfferView;
  isExactDuplicate: boolean;
  cost: string;
  availability: string;
  onCost: (v: string) => void;
  onAvailability: (v: string) => void;
  verifiedSale: number | null;
  verifiedFee: number | null;
}) {
  const s = pick(verifiedSale, o.salePrice);
  const c = pick(fromInput(cost), o.costPrice);
  const f = pick(verifiedFee, o.fbaFee);
  // Un coût vérifié est saisi en CAD ; sinon la devise importée s'applique.
  const currency = c.origin === "verified" ? "CAD" : o.currency;
  const r = preliminaryProfit({ salePrice: s.value, costPrice: c.value, fbaFee: f.value, estimatedSales: o.estimatedSales, currency });
  const allVerified = [s, c, f].every((x) => x.origin === "verified");

  return (
    <div className="rounded-lg border border-line bg-surface-2/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium"><Supplier name={o.supplierName} url={o.supplierUrl} fallback={o.supplierKey} /></span>
          {isExactDuplicate && <Badge tone="critical">Doublon exact</Badge>}
          {o.sources.includes("OUT_OF_STOCK") && <StockBadge status={o.stockStatus} />}
        </div>
        <span className="text-xs text-ink-3">Coût importé : {o.currency !== "CAD" && o.costPrice != null ? `${num(o.costPrice)} ${o.currency}` : cad(o.costPrice)}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs text-ink-2">
          Prix fournisseur vérifié (CAD)
          <input className="field mt-1" inputMode="decimal" placeholder="ex. 19,99" value={cost} onChange={(e) => onCost(e.target.value)} />
        </label>
        <label className="text-xs text-ink-2">
          Disponibilité vérifiée
          <select className="field mt-1" value={availability} onChange={(e) => onAvailability(e.target.value)}>
            <option value="">Non vérifiée</option>
            <option value="IN_STOCK">En stock</option>
            <option value="OUT_OF_STOCK">En rupture</option>
          </select>
        </label>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-page/60 p-2.5 text-xs sm:grid-cols-4">
        <div><div className="text-ink-3">Profit</div><div className={cn("text-sm font-semibold tabular-nums", r.profit != null && r.profit < 0 && "text-[#f08080]")}>{cad(r.profit)}</div></div>
        <div><div className="text-ink-3">ROI</div><div className="text-sm font-semibold tabular-nums">{pct(r.roi, 0)}</div></div>
        <div><div className="text-ink-3">Marge</div><div className="text-sm font-semibold tabular-nums">{pct(r.margin, 0)}</div></div>
        <div><div className="text-ink-3">Profit mensuel</div><div className="text-sm font-semibold tabular-nums">{cad(r.monthlyProfit)}</div></div>
        <div className="col-span-2 text-[11px] text-ink-3 sm:col-span-4">
          {r.issue ? (
            <span className="text-warning">{r.issue}</span>
          ) : (
            <>
              Prix<OriginTag origin={s.origin} /> · Coût<OriginTag origin={c.origin} /> · FBA<OriginTag origin={f.origin} /> —{" "}
              {allVerified ? "calcul sur valeurs vérifiées" : "estimation préliminaire"}, hors commissions, transport et taxes.
            </>
          )}
        </div>
      </div>
    </div>
  );
}
