"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, ClipboardPaste, ShoppingCart, Trash2, X } from "lucide-react";
import { confirmPurchase } from "@/app/(app)/actions";
import { parsePastedAsins } from "@/lib/cart";
import type { DecisionRow } from "@/lib/decisionRows";
import { cad, pct } from "@/lib/format";
import { amount } from "@/lib/normalize";
import { preliminaryProfit, type TaxConfig } from "@/lib/profit";
import { Asin, cn } from "./ui";

/** Ligne du panier : quantité et coût unitaire saisi (vide = coût du lead). */
export type CartLine = { qty: number; unitCost?: string };
export type CartState = Record<string, CartLine>;

export function cartLineValues(row: DecisionRow, line: CartLine, tax: TaxConfig) {
  const typed = line.unitCost?.trim() ? amount(line.unitCost) ?? null : null;
  const unitCost = typed ?? row.costPrice;
  const foreign = typed == null && !!row.calcIssue?.startsWith("Devise");
  const p = unitCost == null || foreign ? null : preliminaryProfit({ salePrice: row.amazonPrice, costPrice: unitCost, fbaFee: row.fees }, tax);
  return {
    unitCost,
    invalidCost: !!line.unitCost?.trim() && typed == null,
    subtotal: unitCost == null ? null : unitCost * line.qty,
    unitProfit: p?.profit ?? null,
    profit: p?.profit == null ? null : p.profit * line.qty,
    roi: p?.roi ?? null,
  };
}

export function Cart({
  rows,
  cart,
  setCart,
  budget,
  setBudget,
  tax,
}: {
  rows: DecisionRow[];
  cart: CartState;
  setCart: (updater: (c: CartState) => CartState) => void;
  budget: string;
  setBudget: (v: string) => void;
  tax: TaxConfig;
}) {
  const [paste, setPaste] = useState("");
  const [pasteMsg, setPasteMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const byAsin = useMemo(() => new Map(rows.map((r) => [r.asin, r])), [rows]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.productId, r])), [rows]);
  const lines = Object.entries(cart)
    .map(([id, line]) => ({ id, line, row: byId.get(id) }))
    .filter((l): l is { id: string; line: CartLine; row: DecisionRow } => !!l.row);
  const values = lines.map((l) => ({ ...l, v: cartLineValues(l.row, l.line, tax) }));

  const totals = values.reduce(
    (t, { line, v }) => ({
      units: t.units + line.qty,
      cost: t.cost + (v.subtotal ?? 0),
      profit: v.profit == null ? t.profit : t.profit + v.profit,
      missingCost: t.missingCost || v.unitCost == null || v.invalidCost,
    }),
    { units: 0, cost: 0, profit: 0, missingCost: false },
  );
  const roi = totals.cost > 0 ? (totals.profit / totals.cost) * 100 : null;
  const budgetValue = amount(budget) ?? 0;
  const remaining = budgetValue > 0 ? budgetValue - totals.cost : null;

  const addPasted = () => {
    const { lines: parsed, invalid } = parsePastedAsins(paste);
    const unknown: string[] = [];
    let added = 0;
    setCart((c) => {
      const next = { ...c };
      for (const { asin, quantity } of parsed) {
        const row = byAsin.get(asin);
        if (!row) {
          unknown.push(asin);
          continue;
        }
        next[row.productId] = { ...next[row.productId], qty: (next[row.productId]?.qty ?? 0) + quantity };
        added++;
      }
      return next;
    });
    const parts = [`${added} produit${added > 1 ? "s" : ""} ajouté${added > 1 ? "s" : ""}`];
    if (unknown.length) parts.push(`introuvable${unknown.length > 1 ? "s" : ""} dans vos leads : ${unknown.join(", ")}`);
    if (invalid.length) parts.push(`${invalid.length} ligne${invalid.length > 1 ? "s" : ""} sans ASIN`);
    setPasteMsg({ ok: added > 0 && !unknown.length && !invalid.length, text: parts.join(" · ") });
    if (added > 0 && !unknown.length && !invalid.length) setPaste("");
  };

  const setLine = (id: string, patch: Partial<CartLine>) =>
    setCart((c) => {
      const next = { ...c, [id]: { ...c[id], ...patch } };
      if (!(next[id].qty > 0)) delete next[id];
      return next;
    });

  const confirm = () =>
    start(async () => {
      setResult(null);
      const res = await confirmPurchase({
        note: note || null,
        items: values.map(({ id, line, v }) => ({ productId: id, quantity: line.qty, unitCost: line.unitCost?.trim() ? v.unitCost : null })),
      });
      if (res.ok) {
        setCart(() => ({}));
        setNote("");
        setResult({ ok: true, text: "Achat confirmé" });
      } else setResult({ ok: false, text: res.error });
    });

  return (
    <div className="flex flex-col rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-2 uppercase">
          <ShoppingCart size={14} /> Panier {lines.length > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] text-white">{lines.length}</span>}
        </span>
        {lines.length > 0 && (
          <button type="button" className="flex items-center gap-1 text-xs text-ink-3 hover:text-ink" onClick={() => setCart(() => ({}))}>
            <Trash2 size={12} /> Vider
          </button>
        )}
      </div>

      {/* Ajout par copier-coller */}
      <div className="border-b border-line p-3">
        <label className="text-xs text-ink-2" htmlFor="cart-paste">
          Coller des ASIN <span className="text-ink-3">(un par ligne, suivi de la quantité)</span>
        </label>
        <textarea
          id="cart-paste"
          className="field mt-1 min-h-16 font-mono text-xs"
          placeholder={"B0ABC12345 5\nB0XYZ67890 2"}
          value={paste}
          onChange={(e) => {
            setPaste(e.target.value);
            setPasteMsg(null);
          }}
        />
        <div className="mt-2 flex items-center gap-2">
          <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" disabled={!paste.trim()} onClick={addPasted}>
            <ClipboardPaste size={13} /> Ajouter au panier
          </button>
          <span className="text-[11px] text-ink-3">ou 🛒 dans la liste</span>
        </div>
        {pasteMsg && <p className={cn("mt-1.5 text-[11px]", pasteMsg.ok ? "text-[#5fd35f]" : "text-warning")}>{pasteMsg.text}</p>}
      </div>

      {/* Lignes */}
      {lines.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-ink-3">Panier vide. Collez des ASIN ci-dessus ou cliquez sur 🛒 à côté d&apos;un lead.</p>
      ) : (
        <ul className="max-h-80 divide-y divide-line overflow-y-auto">
          {values.map(({ id, line, row, v }) => (
            <li key={id} className="px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-ink" title={row.name}>{row.name}</div>
                  <Asin asin={row.asin} url={row.amazonUrl} />
                </div>
                <button type="button" aria-label={`Retirer ${row.asin}`} className="text-ink-3 hover:text-[#f08080]" onClick={() => setLine(id, { qty: 0 })}>
                  <X size={14} />
                </button>
              </div>
              <div className="mt-1.5 grid grid-cols-[64px_1fr_auto] items-end gap-2 text-[11px]">
                <label className="text-ink-3">
                  Qté
                  <input
                    className="field mt-0.5 py-1 text-right text-xs tabular-nums"
                    inputMode="numeric"
                    value={line.qty}
                    onChange={(e) => setLine(id, { qty: Math.max(0, Math.min(99999, Math.floor(Number(e.target.value) || 0))) })}
                  />
                </label>
                <label className="text-ink-3">
                  Coût unitaire (CAD)
                  <input
                    className={cn("field mt-0.5 py-1 text-right text-xs tabular-nums", v.invalidCost && "border-critical")}
                    inputMode="decimal"
                    placeholder={row.costPrice != null ? String(row.costPrice).replace(".", ",") : "à saisir"}
                    value={line.unitCost ?? ""}
                    onChange={(e) => setLine(id, { unitCost: e.target.value })}
                  />
                </label>
                <div className="text-right">
                  <div className="font-semibold text-ink tabular-nums">{cad(v.subtotal)}</div>
                  <div className={cn("tabular-nums", v.profit != null && v.profit < 0 ? "text-[#f08080]" : "text-[#5fd35f]")}>{v.profit == null ? "profit n/d" : `+${cad(v.profit)}`}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Totaux + confirmation */}
      <div className="border-t border-line p-3">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-ink-3">Produits / unités</dt>
          <dd className="text-right tabular-nums">{lines.length} / {totals.units}</dd>
          <dt className="text-ink-3">Coût total</dt>
          <dd className="text-right font-semibold tabular-nums">{cad(totals.cost)}</dd>
          <dt className="text-ink-3">Profit attendu*</dt>
          <dd className="text-right font-semibold tabular-nums text-[#5fd35f]">{cad(totals.profit)}</dd>
          <dt className="text-ink-3">ROI du panier*</dt>
          <dd className="text-right tabular-nums">{pct(roi, 0)}</dd>
        </dl>
        <label className="mt-3 block text-xs text-ink-2">
          Budget (optionnel)
          <span className="mt-1 flex items-center gap-1.5">
            <input className="field py-1.5 text-right tabular-nums" inputMode="decimal" placeholder="ex. 1500" value={budget} onChange={(e) => setBudget(e.target.value)} />
            <span className="text-ink-3">$</span>
          </span>
        </label>
        {remaining != null && (
          <>
            <div className="mt-2 flex justify-between text-xs">
              <span className="text-ink-3">Budget restant</span>
              <span className={cn("font-semibold tabular-nums", remaining < 0 ? "text-[#f08080]" : "text-ink")}>{cad(remaining)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className={cn("h-full rounded-full", remaining < 0 ? "bg-critical" : "bg-accent")} style={{ width: `${Math.min(100, (totals.cost / budgetValue) * 100)}%` }} />
            </div>
          </>
        )}
        {lines.length > 0 && (
          <>
            <input className="field mt-3 py-1.5 text-xs" placeholder="Note (fournisseur, n° de commande…)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="button" className="btn-primary mt-2 w-full" disabled={pending || totals.missingCost} onClick={confirm}>
              <CheckCircle2 size={15} /> {pending ? "Confirmation…" : `Confirmer l'achat · ${cad(totals.cost)}`}
            </button>
            {totals.missingCost && <p className="mt-1 text-[11px] text-warning">Coût unitaire manquant ou invalide sur une ligne.</p>}
          </>
        )}
        {result && (
          <p className={cn("mt-2 text-xs", result.ok ? "text-[#5fd35f]" : "text-[#f08080]")}>
            {result.text}
            {result.ok && (
              <>
                {" "}— <Link href="/purchased" className="link">voir dans Acheté</Link>
              </>
            )}
          </p>
        )}
        <p className="mt-2 text-[10px] text-ink-3">* Profit si toutes les unités se vendent au prix Amazon actuel (Buy Box 90 j), frais et taxes déduits.</p>
      </div>
    </div>
  );
}
