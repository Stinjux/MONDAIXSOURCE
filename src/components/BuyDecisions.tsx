"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, CircleSlash, HelpCircle, Lock, PackageX, ShoppingCart, ThumbsUp } from "lucide-react";
import { setReviewStatus } from "@/app/(app)/actions";
import { VERDICT_LABELS, planTotals, type Verdict } from "@/lib/decision";
import { compareRows, evaluateRow, inScope, matchesVerdict } from "@/lib/decisionFilters";
import { FilterPanel, VerdictChips, countVerdicts, readSaved, useDecisionFilters, writeSaved } from "./DecisionFilters";
import type { DecisionRow } from "@/lib/decisionRows";
import { cad, num, pct } from "@/lib/format";
import { NO_TAX, maxCost, type TaxConfig } from "@/lib/profit";
import { Asin, Badge, EmptyState, ReviewBadge, Supplier, cn } from "./ui";

const VERDICT_STYLE: Record<Verdict, { tone: "good" | "warning" | "critical" | "neutral"; icon: React.ReactNode }> = {
  BUY: { tone: "good", icon: <ThumbsUp size={11} /> },
  CONSIDER: { tone: "warning", icon: <HelpCircle size={11} /> },
  AVOID: { tone: "critical", icon: <CircleSlash size={11} /> },
  INCOMPLETE: { tone: "neutral", icon: <AlertTriangle size={11} /> },
};

export function BuyDecisions({ rows, currentWeek, tax = NO_TAX }: { rows: DecisionRow[]; currentWeek: string; tax?: TaxConfig }) {
  // Filtres partagés avec « Achat · Rejeté · À définir » (mêmes réglages sur les deux pages)
  const { filters, update } = useDecisionFilters();
  const { strategy, thresholds } = filters;
  const [budget, setBudget] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [includeRejected, setIncludeRejected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pending, start] = useTransition();
  const [decided, setDecided] = useState<Record<string, "VALIDATED" | "REJECTED">>({});

  // Budget et quantités conservés dans ce navigateur
  useEffect(() => {
    const s = readSaved();
    if (typeof s.budget === "string") setBudget(s.budget);
    if (s.qty && typeof s.qty === "object") setQty(s.qty as Record<string, number>);
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) writeSaved({ budget, qty });
  }, [budget, qty, loaded]);

  const evaluated = useMemo(() => rows.map((r) => evaluateRow(r, thresholds)), [rows, thresholds]);

  const pool = useMemo(
    () => evaluated.filter((r) => (includeRejected || r.reviewStatus !== "REJECTED") && inScope(r, filters, currentWeek)),
    [evaluated, includeRejected, filters, currentWeek],
  );

  const counts = useMemo(() => countVerdicts(pool), [pool]);

  const list = useMemo(() => pool.filter((r) => matchesVerdict(r.verdict, filters.verdict)).sort(compareRows(strategy)), [pool, filters.verdict, strategy]);

  const cart = rows.filter((r) => (qty[r.productId] ?? 0) > 0);
  const totals = planTotals(cart.map((r) => ({ cost: r.costPrice, profit: r.profit, qty: qty[r.productId] ?? 0 })));
  const budgetValue = Number(budget.replace(",", ".")) || 0;
  const remaining = budgetValue > 0 ? budgetValue - totals.investment : null;

  const setQuantity = (id: string, value: string) => {
    const n = Math.max(0, Math.min(9999, Math.floor(Number(value) || 0)));
    setQty((q) => {
      const next = { ...q };
      if (n > 0) next[id] = n;
      else delete next[id];
      return next;
    });
  };

  const decide = (id: string, status: "VALIDATED" | "REJECTED") =>
    start(async () => {
      const res = await setReviewStatus(id, status);
      if (res.ok) setDecided((s) => ({ ...s, [id]: status }));
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 xl:grid-cols-[1fr_340px]">
        <FilterPanel
          filters={filters}
          update={update}
          extraToggle={{ label: "Inclure les leads rejetés", checked: includeRejected, onChange: setIncludeRejected }}
        />

        {/* Planificateur */}
        <div className="rounded-xl border border-line bg-surface p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-2 uppercase"><ShoppingCart size={13} /> Plan d&apos;achat</span>
            {cart.length > 0 && (
              <button type="button" className="text-xs text-ink-3 hover:text-ink" onClick={() => setQty({})}>
                Vider
              </button>
            )}
          </div>
          <label className="text-xs text-ink-2">
            Budget disponible
            <span className="mt-1 flex items-center gap-1.5">
              <input className="field py-1.5 text-right tabular-nums" inputMode="decimal" placeholder="ex. 1500" value={budget} onChange={(e) => setBudget(e.target.value)} />
              <span className="text-ink-3">$</span>
            </span>
          </label>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <dt className="text-ink-3">Produits / unités</dt>
            <dd className="text-right tabular-nums">{cart.length} / {totals.units}</dd>
            <dt className="text-ink-3">Investissement</dt>
            <dd className="text-right font-medium tabular-nums">{cad(totals.investment)}</dd>
            <dt className="text-ink-3">Profit attendu*</dt>
            <dd className="text-right font-medium tabular-nums text-[#5fd35f]">{cad(totals.profit)}</dd>
            <dt className="text-ink-3">ROI du panier*</dt>
            <dd className="text-right tabular-nums">{pct(totals.roi, 0)}</dd>
            {remaining != null && (
              <>
                <dt className="text-ink-3">Budget restant</dt>
                <dd className={cn("text-right font-semibold tabular-nums", remaining < 0 ? "text-[#f08080]" : "text-ink")}>{cad(remaining)}</dd>
              </>
            )}
          </dl>
          {remaining != null && budgetValue > 0 && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className={cn("h-full rounded-full", remaining < 0 ? "bg-critical" : "bg-accent")} style={{ width: `${Math.min(100, (totals.investment / budgetValue) * 100)}%` }} />
            </div>
          )}
          <p className="mt-2 text-[11px] text-ink-3">Saisissez une quantité dans la liste. * Profit une fois toutes les unités vendues, selon les prix actuels.</p>
        </div>
      </div>

      {/* Liste */}
      <div className="rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
          <VerdictChips value={filters.verdict} onChange={(v) => update({ verdict: v })} counts={counts} total={pool.length} />
        </div>
        {list.length === 0 ? (
          <EmptyState title="Aucun lead dans cette catégorie" icon={<PackageX size={22} />}>Ajustez vos critères ou les filtres.</EmptyState>
        ) : (
          <div className="max-h-[75vh] overflow-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="text-right">#</th>
                  <th>Décision</th>
                  <th>Produit</th>
                  <th className={cn("text-right", strategy === "score" && "text-accent")}>Score</th>
                  <th className={cn("text-right", strategy === "roi" && "text-accent")}>ROI</th>
                  <th className={cn("text-right", strategy === "margin" && "text-accent")}>Marge</th>
                  <th className={cn("text-right", strategy === "profit" && "text-accent")}>Profit/u.</th>
                  <th className={cn("text-right", strategy === "monthlyProfit" && "text-accent")}>Profit mensuel</th>
                  <th className="text-right">Ventes/mois</th>
                  <th className="text-right">Coût</th>
                  <th className="text-right" title="Coût d'achat maximum pour atteindre vos critères de profit et de ROI">Coût max</th>
                  <th className="text-right">Qté</th>
                  <th className="text-right">Sous-total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((r, i) => {
                  const q = qty[r.productId] ?? 0;
                  const decision = decided[r.productId] ?? (r.reviewStatus === "VALIDATED" || r.reviewStatus === "REJECTED" ? r.reviewStatus : null);
                  return (
                    <tr key={r.productId} className={cn(q > 0 && "bg-accent/5")}>
                      <td className="text-right text-ink-3 tabular-nums">{i + 1}</td>
                      <td className="max-w-56 whitespace-normal">
                        <Badge tone={VERDICT_STYLE[r.verdict].tone} icon={VERDICT_STYLE[r.verdict].icon}>{VERDICT_LABELS[r.verdict]}</Badge>
                        {r.reasons.length > 0 && <div className="mt-1 text-[11px] leading-snug text-ink-3">{r.reasons.join(" · ")}</div>}
                        {r.calcIssue && <div className="mt-1 text-[11px] text-warning">{r.calcIssue}</div>}
                      </td>
                      <td className="max-w-72">
                        <div className="truncate font-medium text-ink" title={r.name}>{r.name}</div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                          <Asin asin={r.asin} url={r.amazonUrl} />
                          <span className="max-w-40 truncate"><Supplier name={r.supplierName} url={r.supplierUrl} fallback={r.supplierKey} /></span>
                          {r.offerCount > 1 && <Badge tone="accent">{r.offerCount} fourn.</Badge>}
                          {r.verifiedCount > 0 && <Badge tone="good" icon={<CheckCircle2 size={10} />}>{r.verifiedCount} vérifié{r.verifiedCount > 1 ? "s" : ""}</Badge>}
                          {r.restricted && <Badge tone="serious" icon={<Lock size={10} />}>Restreint</Badge>}
                        </div>
                      </td>
                      <td className="text-right">
                        {r.score == null ? (
                          <span className="text-ink-3">—</span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                              <span className="block h-full rounded-full bg-accent" style={{ width: `${r.score}%` }} />
                            </span>
                            <span className="w-7 font-semibold tabular-nums">{r.score}</span>
                          </span>
                        )}
                      </td>
                      <td className="text-right font-medium tabular-nums">{pct(r.roi, 0)}</td>
                      <td className="text-right tabular-nums">{pct(r.margin, 0)}</td>
                      <td className={cn("text-right tabular-nums", r.profit != null && r.profit < 0 && "text-[#f08080]")}>{cad(r.profit)}</td>
                      <td className="text-right font-medium tabular-nums">{cad(r.monthlyProfit)}</td>
                      <td className="text-right tabular-nums text-ink-2">{num(r.estimatedSales)}</td>
                      <td className="text-right tabular-nums text-ink-2">{cad(r.costPrice)}</td>
                      <td className="text-right tabular-nums">
                        {(() => {
                          const mc = maxCost({ salePrice: r.amazonPrice, fbaFee: r.fees }, thresholds, tax);
                          if (mc == null) return <span className="text-ink-3">—</span>;
                          const ok = r.costPrice != null && r.costPrice <= mc;
                          return <span className={ok ? "text-[#5fd35f]" : "text-[#f08080]"}>{cad(mc)}</span>;
                        })()}
                      </td>
                      <td className="text-right">
                        <input
                          className="field w-16 py-1 text-right text-xs tabular-nums"
                          inputMode="numeric"
                          aria-label={`Quantité pour ${r.asin}`}
                          value={q || ""}
                          placeholder="0"
                          onChange={(e) => setQuantity(r.productId, e.target.value)}
                        />
                      </td>
                      <td className="text-right tabular-nums">{q > 0 && r.costPrice != null ? cad(q * r.costPrice) : <span className="text-ink-3">—</span>}</td>
                      <td>
                        {decision ? (
                          <a href="/purchases" title="Voir dans Achat · Rejeté · À définir">
                            <Badge tone={decision === "VALIDATED" ? "good" : "critical"} icon={decision === "VALIDATED" ? <ShoppingCart size={11} /> : <CircleSlash size={11} />}>
                              {decision === "VALIDATED" ? "Achat" : "Rejeté"}
                            </Badge>
                          </a>
                        ) : (
                          <span className="flex gap-1">
                            <button type="button" disabled={pending} className="btn-ghost px-2 py-1 text-xs whitespace-nowrap hover:border-good/60 hover:text-[#5fd35f]" onClick={() => decide(r.productId, "VALIDATED")} title="Ajouter à la liste Achat">
                              <ShoppingCart size={12} /> Acheter
                            </button>
                            <button type="button" disabled={pending} className="btn-ghost px-2 py-1 text-xs whitespace-nowrap hover:border-critical/60 hover:text-[#f08080]" onClick={() => decide(r.productId, "REJECTED")} title="Ajouter à la liste Rejeté">
                              <CircleSlash size={12} />
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-line px-3 py-2.5 text-xs text-ink-3">
          Calcul façon SellerAmp : Buy Box 90 j − Cost Price − Total Fees{tax.mode !== "NONE" ? ` − taxes (${String(tax.rate).replace(".", ",")} %, réglage Settings)` : ""}, avec vos valeurs vérifiées (Weekly Review) en priorité.
          Coût max = prix d&apos;achat maximum pour respecter vos critères de profit et de ROI. Profit mensuel = profit unitaire × ventes estimées du produit
          (colonne F, ventes totales de l&apos;annonce, pas votre part). Hors transport vers Amazon, préparation et stockage.
        </p>
      </div>
    </div>
  );
}
