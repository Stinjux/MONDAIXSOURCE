"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, CircleSlash, HelpCircle, Lock, PackageX, Pencil, ShoppingCart, StickyNote, ThumbsUp } from "lucide-react";
import { setReviewStatus } from "@/app/(app)/actions";
import { VERDICT_LABELS, type Verdict } from "@/lib/decision";
import { Cart, type CartState } from "./Cart";
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
  const [cart, setCartState] = useState<CartState>({});
  const [includeRejected, setIncludeRejected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pending, start] = useTransition();
  const [decided, setDecided] = useState<Record<string, "VALIDATED" | "REJECTED">>({});

  // Budget et quantités conservés dans ce navigateur
  useEffect(() => {
    const s = readSaved();
    if (typeof s.budget === "string") setBudget(s.budget);
    if (s.cart && typeof s.cart === "object") setCartState(s.cart as CartState);
    else if (s.qty && typeof s.qty === "object") {
      // Ancien « plan d'achat » : quantités reprises dans le panier
      setCartState(Object.fromEntries(Object.entries(s.qty as Record<string, number>).filter(([, q]) => q > 0).map(([id, q]) => [id, { qty: q }])));
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) writeSaved({ budget, cart, qty: null });
  }, [budget, cart, loaded]);
  const setCart = (updater: (c: CartState) => CartState) => setCartState(updater);
  const addToCart = (id: string) => setCartState((c) => ({ ...c, [id]: { ...c[id], qty: (c[id]?.qty ?? 0) + 1 } }));

  const evaluated = useMemo(() => rows.map((r) => evaluateRow(r, thresholds)), [rows, thresholds]);

  const pool = useMemo(
    () => evaluated.filter((r) => (includeRejected || r.reviewStatus !== "REJECTED") && inScope(r, filters, currentWeek)),
    [evaluated, includeRejected, filters, currentWeek],
  );

  const counts = useMemo(() => countVerdicts(pool), [pool]);

  const list = useMemo(() => pool.filter((r) => matchesVerdict(r.verdict, filters.verdict)).sort(compareRows(strategy)), [pool, filters.verdict, strategy]);

  const decide = (id: string, status: "VALIDATED" | "REJECTED") =>
    start(async () => {
      const res = await setReviewStatus(id, status);
      if (res.ok) setDecided((s) => ({ ...s, [id]: status }));
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <aside className="order-first xl:sticky xl:top-4 xl:order-last">
        <Cart rows={rows} cart={cart} setCart={setCart} budget={budget} setBudget={setBudget} tax={tax} />
      </aside>
      <div className="flex min-w-0 flex-col gap-4">
        <FilterPanel
          filters={filters}
          update={update}
          extraToggle={{ label: "Inclure les leads rejetés", checked: includeRejected, onChange: setIncludeRejected }}
        />

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
                  <th className="text-center">Panier</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((r, i) => {
                  const q = cart[r.productId]?.qty ?? 0;
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
                        <Link href={`/leads/${r.asin}`} className="block truncate font-medium text-ink hover:text-accent hover:underline" title={`${r.name} — ouvrir la fiche (notes, prix, statut)`}>
                          {r.name}
                        </Link>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                          <Asin asin={r.asin} url={r.amazonUrl} />
                          <span className="max-w-40 truncate"><Supplier name={r.supplierName} url={r.supplierUrl} fallback={r.supplierKey} /></span>
                          {r.offerCount > 1 && <Badge tone="accent">{r.offerCount} fourn.</Badge>}
                          {r.verifiedCount > 0 && <Badge tone="good" icon={<CheckCircle2 size={10} />}>{r.verifiedCount} vérifié{r.verifiedCount > 1 ? "s" : ""}</Badge>}
                          {r.restricted && <Badge tone="serious" icon={<Lock size={10} />}>Restreint</Badge>}
                        </div>
                        {r.notes && (
                          <div className="mt-1 flex max-w-72 items-start gap-1 text-[11px] text-ink-2" title={r.notes}>
                            <StickyNote size={11} className="mt-0.5 shrink-0 text-warning" />
                            <span className="truncate">{r.notes}</span>
                          </div>
                        )}
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
                      <td className="text-center">
                        <button
                          type="button"
                          onClick={() => addToCart(r.productId)}
                          title={q > 0 ? "Ajouter une unité" : "Ajouter au panier"}
                          aria-label={`Ajouter ${r.asin} au panier`}
                          className={cn("btn-ghost px-2 py-1 text-xs whitespace-nowrap", q > 0 && "border-accent/60 bg-accent/10 text-ink")}
                        >
                          <ShoppingCart size={13} /> {q > 0 ? `× ${q}` : "+"}
                        </button>
                      </td>
                      <td>
                        <span className="flex items-center gap-1">
                        <Link href={`/leads/${r.asin}`} className="btn-ghost px-2 py-1 text-xs" title="Modifier : notes, prix vérifiés, statut, restrictions">
                          <Pencil size={12} />
                        </Link>
                        {decision ? (
                          <a href="/purchases" title="Voir dans Achat · Rejeté · À définir">
                            <Badge tone={decision === "VALIDATED" ? "good" : "critical"} icon={decision === "VALIDATED" ? <ShoppingCart size={11} /> : <CircleSlash size={11} />}>
                              {decision === "VALIDATED" ? "Achat" : "Rejeté"}
                            </Badge>
                          </a>
                        ) : (
                          <span className="flex gap-1">
                            <button type="button" disabled={pending} className="btn-ghost px-2 py-1 text-xs whitespace-nowrap hover:border-good/60 hover:text-[#5fd35f]" onClick={() => decide(r.productId, "VALIDATED")} title="Classer dans la liste Achat (sans passer commande)">
                              <CheckCircle2 size={12} /> Achat
                            </button>
                            <button type="button" disabled={pending} className="btn-ghost px-2 py-1 text-xs whitespace-nowrap hover:border-critical/60 hover:text-[#f08080]" onClick={() => decide(r.productId, "REJECTED")} title="Ajouter à la liste Rejeté">
                              <CircleSlash size={12} />
                            </button>
                          </span>
                        )}
                        </span>
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
      </div>
    </div>
  );
}
