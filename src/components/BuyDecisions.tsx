"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, CircleSlash, HelpCircle, Lock, PackageX, RotateCcw, ShoppingCart, ThumbsUp } from "lucide-react";
import { setReviewStatus } from "@/app/(app)/actions";
import { DEFAULT_THRESHOLDS, VERDICT_LABELS, planTotals, verdict, type Thresholds, type Verdict } from "@/lib/decision";
import type { DecisionRow } from "@/lib/decisionRows";
import { cad, num, pct } from "@/lib/format";
import { Asin, Badge, EmptyState, ReviewBadge, Supplier, cn } from "./ui";

type Strategy = "score" | "roi" | "monthlyProfit" | "margin" | "profit";

const STRATEGIES: { key: Strategy; label: string; hint: string }[] = [
  { key: "score", label: "Score d'achat", hint: "Équilibre ROI (40 %), profit mensuel (35 %) et marge (25 %)" },
  { key: "roi", label: "ROI %", hint: "Rendement du capital : idéal avec un budget limité" },
  { key: "monthlyProfit", label: "Profit mensuel", hint: "Potentiel total : idéal pour maximiser les gains" },
  { key: "margin", label: "Marge (profit %)", hint: "Sécurité face aux baisses de prix Amazon" },
  { key: "profit", label: "Profit unitaire", hint: "Gain par unité vendue" },
];

const VERDICT_STYLE: Record<Verdict, { tone: "good" | "warning" | "critical" | "neutral"; icon: React.ReactNode }> = {
  BUY: { tone: "good", icon: <ThumbsUp size={11} /> },
  CONSIDER: { tone: "warning", icon: <HelpCircle size={11} /> },
  AVOID: { tone: "critical", icon: <CircleSlash size={11} /> },
  INCOMPLETE: { tone: "neutral", icon: <AlertTriangle size={11} /> },
};

const STORAGE_KEY = "mondaix.buyDecisions.v1";
type Saved = { thresholds: Thresholds; budget: string; qty: Record<string, number>; strategy: Strategy };

function load(): Partial<Saved> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function BuyDecisions({ rows, currentWeek }: { rows: DecisionRow[]; currentWeek: string }) {
  const [strategy, setStrategy] = useState<Strategy>("score");
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [budget, setBudget] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [show, setShow] = useState<"ACTIONABLE" | Verdict | "ALL">("ACTIONABLE");
  const [weekOnly, setWeekOnly] = useState(false);
  const [includeRejected, setIncludeRejected] = useState(false);
  const [includeUnavailable, setIncludeUnavailable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pending, start] = useTransition();
  const [validated, setValidated] = useState<Set<string>>(new Set());

  // Préférences et panier conservés dans ce navigateur
  useEffect(() => {
    const s = load();
    if (s.thresholds) setThresholds({ ...DEFAULT_THRESHOLDS, ...s.thresholds });
    if (typeof s.budget === "string") setBudget(s.budget);
    if (s.qty) setQty(s.qty);
    if (s.strategy) setStrategy(s.strategy);
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ thresholds, budget, qty, strategy } satisfies Saved));
    } catch {
      /* stockage indisponible : préférences non conservées */
    }
  }, [thresholds, budget, qty, strategy, loaded]);

  const evaluated = useMemo(
    () =>
      rows.map((r) => {
        const v = verdict(r, thresholds);
        // Un produit en rupture ou restreint ne peut pas être « Acheter » tel quel
        const blocked = r.unavailable || r.restricted;
        const finalVerdict: Verdict = v.verdict === "BUY" && blocked ? "CONSIDER" : v.verdict;
        const reasons = [...(r.unavailable ? ["Fournisseur en rupture"] : []), ...(r.restricted ? ["ASIN restreint sur Amazon"] : []), ...v.reasons];
        return { ...r, verdict: finalVerdict, reasons };
      }),
    [rows, thresholds],
  );

  const pool = useMemo(
    () =>
      evaluated.filter(
        (r) =>
          (includeRejected || r.reviewStatus !== "REJECTED") &&
          (includeUnavailable || !r.unavailable) &&
          (!weekOnly || (r.countsTowardGoal && r.goalWeek === currentWeek)),
      ),
    [evaluated, includeRejected, includeUnavailable, weekOnly, currentWeek],
  );

  const counts = useMemo(() => {
    const c: Record<Verdict, number> = { BUY: 0, CONSIDER: 0, AVOID: 0, INCOMPLETE: 0 };
    for (const r of pool) c[r.verdict]++;
    return c;
  }, [pool]);

  const list = useMemo(() => {
    const filtered = pool.filter((r) => (show === "ALL" ? true : show === "ACTIONABLE" ? r.verdict === "BUY" || r.verdict === "CONSIDER" : r.verdict === show));
    const order: Record<Verdict, number> = { BUY: 0, CONSIDER: 1, AVOID: 2, INCOMPLETE: 3 };
    return filtered.sort((a, b) => {
      const x = a[strategy], y = b[strategy];
      if (x == null && y == null) return order[a.verdict] - order[b.verdict];
      if (x == null) return 1;
      if (y == null) return -1;
      // Départage : score, puis profit mensuel, puis ROI
      return (
        (y as number) - (x as number) ||
        (b.score ?? -1) - (a.score ?? -1) ||
        (b.monthlyProfit ?? -Infinity) - (a.monthlyProfit ?? -Infinity) ||
        (b.roi ?? -Infinity) - (a.roi ?? -Infinity) ||
        order[a.verdict] - order[b.verdict]
      );
    });
  }, [pool, show, strategy]);

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

  const validate = (id: string) =>
    start(async () => {
      const res = await setReviewStatus(id, "VALIDATED");
      if (res.ok) setValidated((s) => new Set(s).add(id));
    });

  const thresholdInput = (key: keyof Thresholds, label: string, unit: string) => (
    <label className="text-xs text-ink-2">
      {label}
      <span className="mt-1 flex items-center gap-1.5">
        <input
          className="field w-20 py-1.5 text-right tabular-nums"
          inputMode="decimal"
          value={String(thresholds[key]).replace(".", ",")}
          onChange={(e) => {
            const v = Number(e.target.value.replace(",", "."));
            if (Number.isFinite(v)) setThresholds((t) => ({ ...t, [key]: v }));
          }}
        />
        <span className="text-ink-3">{unit}</span>
      </span>
    </label>
  );

  const chip = (key: typeof show, label: string, n?: number) => (
    <button
      key={key}
      type="button"
      onClick={() => setShow(key)}
      className={cn("rounded-full px-3 py-1 text-xs transition", show === key ? "bg-accent-soft text-ink ring-1 ring-accent/40" : "text-ink-2 hover:bg-surface-2")}
    >
      {label}
      {n != null && <span className="ml-1 text-ink-3 tabular-nums">{n}</span>}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Stratégie de classement */}
      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="mb-2 text-xs font-semibold tracking-wide text-ink-2 uppercase">Classer par</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" role="radiogroup" aria-label="Classement">
          {STRATEGIES.map((s) => (
            <button
              key={s.key}
              type="button"
              role="radio"
              aria-checked={strategy === s.key}
              onClick={() => setStrategy(s.key)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition",
                strategy === s.key ? "border-accent/60 bg-accent/10" : "border-line bg-surface-2/50 hover:border-line-strong",
              )}
            >
              <div className={cn("text-sm font-medium", strategy === s.key ? "text-ink" : "text-ink-2")}>{s.label}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-ink-3">{s.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_340px]">
        {/* Seuils + filtres */}
        <div className="rounded-xl border border-line bg-surface p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wide text-ink-2 uppercase">Mes critères d&apos;achat</span>
            <button type="button" className="flex items-center gap-1 text-xs text-ink-3 hover:text-ink" onClick={() => setThresholds(DEFAULT_THRESHOLDS)}>
              <RotateCcw size={12} /> Par défaut
            </button>
          </div>
          <div className="flex flex-wrap gap-4">
            {thresholdInput("minRoi", "ROI minimum", "%")}
            {thresholdInput("minProfit", "Profit unitaire min.", "$")}
            {thresholdInput("minMargin", "Marge minimum", "%")}
            {thresholdInput("minSales", "Ventes min. / mois", "u.")}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-3 text-xs text-ink-2">
            <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" className="accent-[#3987e5]" checked={weekOnly} onChange={(e) => setWeekOnly(e.target.checked)} /> Leads de cette semaine seulement</label>
            <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" className="accent-[#3987e5]" checked={includeUnavailable} onChange={(e) => setIncludeUnavailable(e.target.checked)} /> Inclure les ruptures</label>
            <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" className="accent-[#3987e5]" checked={includeRejected} onChange={(e) => setIncludeRejected(e.target.checked)} /> Inclure les leads rejetés</label>
          </div>
        </div>

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
          {chip("ACTIONABLE", "À acheter ou considérer", counts.BUY + counts.CONSIDER)}
          {chip("BUY", VERDICT_LABELS.BUY, counts.BUY)}
          {chip("CONSIDER", VERDICT_LABELS.CONSIDER, counts.CONSIDER)}
          {chip("AVOID", VERDICT_LABELS.AVOID, counts.AVOID)}
          {chip("INCOMPLETE", VERDICT_LABELS.INCOMPLETE, counts.INCOMPLETE)}
          {chip("ALL", "Tous", pool.length)}
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
                  <th className="text-right">Qté</th>
                  <th className="text-right">Sous-total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((r, i) => {
                  const q = qty[r.productId] ?? 0;
                  const isValidated = validated.has(r.productId) || r.reviewStatus === "VALIDATED";
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
                        {isValidated ? (
                          <ReviewBadge status="VALIDATED" />
                        ) : (
                          <button type="button" disabled={pending} className="btn-ghost px-2 py-1 text-xs whitespace-nowrap" onClick={() => validate(r.productId)} title="Passer le lead à « Revu et validé »">
                            <CheckCircle2 size={13} /> Valider
                          </button>
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
          Calcul : Buy Box 90 j − Cost Price − Total Fees, avec vos valeurs vérifiées (Weekly Review) en priorité. Profit mensuel = profit unitaire × ventes estimées du produit
          (colonne F, ventes totales de l&apos;annonce, pas votre part). Hors transport vers Amazon, préparation, stockage et taxes.
        </p>
      </div>
    </div>
  );
}
