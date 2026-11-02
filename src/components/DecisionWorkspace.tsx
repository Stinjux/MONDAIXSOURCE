"use client";
// Buy Decisions : une seule page, deux vues sur les mêmes leads et le même panier.
//  - « Un par un » (par défaut) : la disposition du mode décision
//  - « Liste » : le tableau triable de tous les leads
// Le panier s'ouvre sur le côté depuis le bouton en haut à droite.
import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutList, ShoppingCart, SlidersHorizontal, SquareStack, X } from "lucide-react";
import { BuyDecisions } from "./BuyDecisions";
import { Cart, cartLineValues, type CartState } from "./Cart";
import { FilterPanel, VerdictChips, countVerdicts, readSaved, useDecisionFilters, writeSaved } from "./DecisionFilters";
import { FocusScreen } from "./FocusScreen";
import { evaluateRow, inScope } from "@/lib/decisionFilters";
import type { DecisionRow } from "@/lib/decisionRows";
import type { FocusLead } from "@/lib/focus";
import { cad } from "@/lib/format";
import { amount } from "@/lib/normalize";
import type { TaxConfig } from "@/lib/profit";
import { cn } from "./ui";

type View = "focus" | "list";

export function DecisionWorkspace({
  rows, leads, tax, currentWeek, startAsin = null, initialView = "focus",
}: { rows: DecisionRow[]; leads: FocusLead[]; tax: TaxConfig; currentWeek: string; startAsin?: string | null; initialView?: View }) {
  const { filters, update } = useDecisionFilters();
  const [view, setView] = useState<View>(initialView);
  const [start, setStart] = useState<{ asin: string | null; n: number }>({ asin: startAsin, n: 0 });
  const [showFilters, setShowFilters] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<CartState>({});
  const [budget, setBudget] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [pulse, setPulse] = useState(false);

  // Panier et budget conservés dans ce navigateur (partagés avec le Pipeline et la fiche ASIN)
  useEffect(() => {
    const s = readSaved();
    if (typeof s.budget === "string") setBudget(s.budget);
    if (s.cart && typeof s.cart === "object") setCart(s.cart as CartState);
    else if (s.qty && typeof s.qty === "object") {
      // Ancien « plan d'achat » : quantités reprises dans le panier
      setCart(Object.fromEntries(Object.entries(s.qty as Record<string, number>).filter(([, q]) => q > 0).map(([id, q]) => [id, { qty: q }])));
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) writeSaved({ cart, budget, qty: null });
  }, [cart, budget, loaded]);

  useEffect(() => {
    if (!cartOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCartOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cartOpen]);

  const switchView = useCallback((v: View, asin: string | null = null) => {
    setView(v);
    if (v === "focus") setStart((s) => ({ asin, n: s.n + 1 }));
    const url = new URL(window.location.href);
    url.searchParams.delete("asin");
    if (v === "list") url.searchParams.set("vue", "liste");
    else url.searchParams.delete("vue");
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0 });
  }, []);

  const byId = useMemo(() => new Map(rows.map((r) => [r.productId, r])), [rows]);
  const lines = Object.entries(cart).filter(([id]) => byId.has(id));
  const units = lines.reduce((n, [, l]) => n + l.qty, 0);
  const total = lines.reduce((n, [id, l]) => n + (cartLineValues(byId.get(id)!, l, tax).subtotal ?? 0), 0);

  const cartApi = useMemo(
    () => ({
      cart,
      budget: amount(budget) ?? null,
      paused: cartOpen,
      open: () => setCartOpen(true),
      add: (id: string, qty: number) => {
        setCart((c) => ({ ...c, [id]: { ...c[id], qty: (c[id]?.qty ?? 0) + qty } }));
        setPulse(true);
        setTimeout(() => setPulse(false), 700);
      },
    }),
    [cart, budget, cartOpen],
  );

  // Compteurs d'avis pour la vue « Un par un » (la vue Liste a les siens)
  const counts = useMemo(() => {
    const pool = rows.map((r) => evaluateRow(r, filters.thresholds)).filter((r) => r.reviewStatus !== "REJECTED" && inScope(r, filters, currentWeek));
    return { counts: countVerdicts(pool), total: pool.length };
  }, [rows, filters, currentWeek]);

  // La file « Un par un » suit vos filtres : elle se recrée quand ils changent
  const queueKey = JSON.stringify([filters.strategy, filters.verdict, filters.weekOnly, filters.includeUnavailable, filters.thresholds, start.n]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-line bg-surface p-1" role="tablist" aria-label="Affichage">
          {(
            [
              { v: "focus", label: "Un par un", icon: <SquareStack size={15} /> },
              { v: "list", label: "Liste", icon: <LayoutList size={15} /> },
            ] as const
          ).map((t) => (
            <button
              key={t.v}
              type="button"
              role="tab"
              aria-selected={view === t.v}
              onClick={() => switchView(t.v)}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition", view === t.v ? "bg-accent text-white" : "text-ink-2 hover:text-ink")}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {view === "focus" && (
          <button type="button" className="btn-ghost" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal size={15} /> {showFilters ? "Masquer les filtres" : "Classement et critères"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className={cn("btn-ghost ml-auto transition", lines.length > 0 && "border-accent/60 bg-accent/10 text-ink", pulse && "scale-105 ring-2 ring-accent/40")}
        >
          <ShoppingCart size={15} /> Panier
          {lines.length > 0 ? (
            <span className="tabular-nums">
              · {units} u. · <b>{cad(total)}</b>
            </span>
          ) : (
            <span className="text-ink-3">vide</span>
          )}
        </button>
      </div>

      {view === "focus" ? (
        <>
          {showFilters && (
            <div className="flex flex-col gap-3">
              <FilterPanel filters={filters} update={update} />
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2">
                <VerdictChips value={filters.verdict} onChange={(v) => update({ verdict: v })} counts={counts.counts} total={counts.total} />
              </div>
            </div>
          )}
          <FocusScreen key={queueKey} leads={leads} mode="decide" tax={tax} currentWeek={currentWeek} startAsin={start.asin} cartApi={cartApi} />
        </>
      ) : (
        <BuyDecisions rows={rows} currentWeek={currentWeek} tax={tax} cart={cart} setCart={setCart} onOpen={(asin) => switchView("focus", asin)} />
      )}

      {/* Panier sur le côté */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Panier">
          <button type="button" className="absolute inset-0 bg-black/55" aria-label="Fermer le panier" onClick={() => setCartOpen(false)} />
          <div className="relative flex h-full w-full max-w-[420px] flex-col gap-2 overflow-y-auto border-l border-line bg-page p-3 shadow-2xl">
            <button type="button" className="btn-ghost self-end px-2 py-1 text-xs" onClick={() => setCartOpen(false)}>
              <X size={14} /> Fermer <span className="text-ink-3">(Échap)</span>
            </button>
            <Cart rows={rows} cart={cart} setCart={setCart} budget={budget} setBudget={setBudget} tax={tax} />
          </div>
        </div>
      )}
    </div>
  );
}
