"use client";
// Achat fait en dehors du panier (magasin, ancienne commande…) : enregistré dans les COGS du produit.
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { addManualPurchase } from "@/app/(app)/actions";
import { cad } from "@/lib/format";
import { amount } from "@/lib/normalize";
import { cn } from "./ui";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function ManualPurchaseForm({ asin, defaultSupplier }: { asin: string; defaultSupplier: string | null }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [qty, setQty] = useState("1");
  const [cost, setCost] = useState("");
  const [supplier, setSupplier] = useState(defaultSupplier ?? "");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const q = Math.floor(Number(qty));
  const c = amount(cost);
  const valid = q >= 1 && c != null && c >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  if (!open) {
    return (
      <button type="button" className="btn-ghost text-xs" onClick={() => setOpen(true)}>
        <Plus size={13} /> Ajouter un achat fait hors du panier
      </button>
    );
  }
  return (
    <form
      className="rounded-md border border-line bg-surface-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        start(async () => {
          const res = await addManualPurchase({ asin, orderedAt: date, quantity: q, unitCost: c!, supplierName: supplier || null, note: note || null });
          if (res.ok) {
            setMsg({ ok: true, text: "Achat ajouté" });
            setQty("1");
            setCost("");
            setNote("");
            setOpen(false);
          } else setMsg({ ok: false, text: res.error });
        });
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[140px_90px_120px_1fr]">
        <label className="text-[11px] text-ink-3">
          Date
          <input type="date" className="field mt-0.5 py-1.5 text-sm" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="text-[11px] text-ink-3">
          Unités
          <input className="field mt-0.5 py-1.5 text-right text-sm tabular-nums" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} required />
        </label>
        <label className="text-[11px] text-ink-3">
          Coût / unité (CAD)
          <input className="field mt-0.5 py-1.5 text-right text-sm tabular-nums" inputMode="decimal" placeholder="ex. 12,49" value={cost} onChange={(e) => setCost(e.target.value)} required />
        </label>
        <label className="text-[11px] text-ink-3">
          Fournisseur
          <input className="field mt-0.5 py-1.5 text-sm" placeholder="ex. Costco" value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={120} />
        </label>
      </div>
      <input className="field mt-2 py-1.5 text-sm" placeholder="Note (n° de commande, magasin…)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-primary py-1.5 text-xs" disabled={!valid || pending}>
          {pending ? "Ajout…" : `Ajouter · ${valid ? cad(q * c!) : "—"}`}
        </button>
        <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setOpen(false)}>
          Annuler
        </button>
        {msg && <span className={cn("text-xs", msg.ok ? "text-good" : "text-critical")}>{msg.text}</span>}
      </div>
    </form>
  );
}
