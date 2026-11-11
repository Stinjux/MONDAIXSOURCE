"use client";
// Achat réel saisi dans COGS, de A à Z : lien Amazon (ou ASIN), produit, date, unités, coût par unité,
// fournisseur (nom ou lien), n° de commande, note. Depuis la liste COGS, ouvre ensuite la fiche du
// produit pour y déposer la facture.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { addManualPurchase } from "@/app/(app)/actions";
import { cad } from "@/lib/format";
import { amount, extractAsin } from "@/lib/normalize";
import { cn } from "./ui";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function ManualPurchaseForm({
  asin: fixedAsin, defaultSupplier = null, defaultOpen = false, label = "Ajouter un achat",
}: { asin?: string; defaultSupplier?: string | null; defaultOpen?: boolean; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [amazon, setAmazon] = useState(fixedAsin ?? "");
  const [name, setName] = useState("");
  const [date, setDate] = useState(today);
  const [qty, setQty] = useState("1");
  const [cost, setCost] = useState("");
  const [supplier, setSupplier] = useState(defaultSupplier ?? "");
  const [orderNumber, setOrderNumber] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const asin = fixedAsin ?? extractAsin(amazon, amazon);
  const q = Math.floor(Number(qty));
  const c = amount(cost);
  const valid = !!asin && q >= 1 && c != null && c >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  if (!open) {
    return (
      <button type="button" className={fixedAsin ? "btn-ghost text-xs" : "btn-primary"} onClick={() => setOpen(true)}>
        <Plus size={fixedAsin ? 13 : 15} /> {label}
      </button>
    );
  }
  const field = "field mt-0.5 py-1.5 text-sm";
  return (
    <form
      className="rounded-md border border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        start(async () => {
          const res = await addManualPurchase({
            amazon: fixedAsin ?? amazon,
            name: name || null,
            orderedAt: date,
            quantity: q,
            unitCost: c!,
            supplier: supplier || null,
            orderNumber: orderNumber || null,
            note: note || null,
          });
          if (!res.ok) return setMsg({ ok: false, text: res.error });
          setMsg({ ok: true, text: "Achat enregistré" });
          setQty("1");
          setCost("");
          setOrderNumber("");
          setNote("");
          if (fixedAsin) setOpen(false);
          else router.push(`/cogs/${res.asin}`);
        });
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase">{fixedAsin ? "Ajouter un achat" : "Nouvel achat"}</h2>
        <button type="button" className="text-ink-3 hover:text-ink" aria-label="Fermer" onClick={() => setOpen(false)}>
          <X size={16} />
        </button>
      </div>
      {!fixedAsin && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-[11px] text-ink-3">
            Lien Amazon ou ASIN *
            <input className={cn(field, amazon && !asin && "border-critical")} placeholder="https://www.amazon.ca/dp/B0…" value={amazon} onChange={(e) => setAmazon(e.target.value)} required autoFocus />
            {asin && <span className="mt-0.5 block font-mono text-[10px] text-good">ASIN {asin}</span>}
          </label>
          <label className="text-[11px] text-ink-3">
            Nom du produit
            <input className={field} placeholder="Facultatif si le produit est déjà dans MONDAIX" value={name} onChange={(e) => setName(e.target.value)} maxLength={300} />
          </label>
        </div>
      )}
      <div className={cn("grid gap-2 sm:grid-cols-[150px_100px_140px_1fr]", !fixedAsin && "mt-2")}>
        <label className="text-[11px] text-ink-3">
          Date d&apos;achat *
          <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="text-[11px] text-ink-3">
          Unités *
          <input className={cn(field, "text-right tabular-nums")} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} required />
        </label>
        <label className="text-[11px] text-ink-3">
          Coût / unité (CAD) *
          <input className={cn(field, "text-right tabular-nums")} inputMode="decimal" placeholder="ex. 12,49" value={cost} onChange={(e) => setCost(e.target.value)} required />
        </label>
        <label className="text-[11px] text-ink-3">
          Fournisseur (nom ou lien du produit)
          <input className={field} placeholder="ex. Costco ou https://www.costco.ca/…" value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={500} />
        </label>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-[220px_1fr]">
        <label className="text-[11px] text-ink-3">
          N° de commande
          <input className={field} placeholder="ex. 1234-5678" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} maxLength={120} />
        </label>
        <label className="text-[11px] text-ink-3">
          Note
          <input className={field} placeholder="Magasin, carte utilisée, promo…" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-primary" disabled={!valid || pending}>
          {pending ? "Enregistrement…" : `Enregistrer l'achat · ${valid ? cad(q * c!) : "—"}`}
        </button>
        {!fixedAsin && <span className="text-xs text-ink-3">Vous pourrez ensuite déposer la facture sur la fiche du produit.</span>}
        {msg && <span className={cn("text-xs", msg.ok ? "text-good" : "text-critical")}>{msg.text}</span>}
      </div>
    </form>
  );
}
