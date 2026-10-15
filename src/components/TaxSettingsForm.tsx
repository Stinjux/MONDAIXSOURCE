"use client";
import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { saveTaxSettings } from "@/app/(app)/actions";
import { cad, pct } from "@/lib/format";
import { DEFAULT_TAX, QUEBEC_TAX_RATE, TAX_MODE_LABELS, preliminaryProfit, type TaxConfig, type TaxMode } from "@/lib/profit";
import { cn } from "./ui";

// Exemple de référence (calculateur SellerAmp) pour vérifier le réglage
const EXAMPLE = { salePrice: 20.2, costPrice: 8.13, fbaFee: 9.46 };

export function TaxSettingsForm({ initial }: { initial: TaxConfig }) {
  const [mode, setMode] = useState<TaxMode>(initial.mode);
  const [rate, setRate] = useState(String(initial.mode === "NONE" && !initial.rate ? DEFAULT_TAX.rate : initial.rate).replace(".", ","));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const rateNum = Number(rate.replace(",", "."));
  const valid = Number.isFinite(rateNum) && rateNum >= 0 && rateNum <= 50;
  const preview = preliminaryProfit(EXAMPLE, { mode, rate: valid ? rateNum : 0 });

  const save = () =>
    start(async () => {
      const res = await saveTaxSettings({ mode, rate: valid ? rateNum : 0 });
      setMsg(res.ok ? { ok: true, text: "Enregistré — tous les calculs sont mis à jour" } : { ok: false, text: res.error });
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Traitement des taxes">
        {(Object.keys(TAX_MODE_LABELS) as TaxMode[]).map((m) => (
          <label key={m} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", mode === m ? "border-accent/60 bg-accent/10" : "border-line")}>
            <input type="radio" name="taxMode" className="accent-[#3987e5]" checked={mode === m} onChange={() => { setMode(m); setMsg(null); }} />
            {TAX_MODE_LABELS[m]}
          </label>
        ))}
      </div>
      {mode !== "NONE" && (
        <label className="text-xs text-ink-2">
          Taux de taxe
          <span className="mt-1 flex items-center gap-1.5">
            <input className="field w-24 text-right tabular-nums" inputMode="decimal" value={rate} onChange={(e) => { setRate(e.target.value); setMsg(null); }} />
            <span className="text-ink-3">%</span>
            <button type="button" className="ml-2 text-xs text-accent hover:underline" onClick={() => { setRate("20"); setMsg(null); }}>
              20 % (prudent, comme SellerAmp)
            </button>
            <button type="button" className="ml-2 text-xs text-ink-3 hover:text-ink hover:underline" onClick={() => { setRate(String(QUEBEC_TAX_RATE).replace(".", ",")); setMsg(null); }}>
              14,975 % (taux réel Québec)
            </button>
          </span>
        </label>
      )}
      <div className="rounded-lg bg-page/60 p-3 text-xs text-ink-2">
        <div className="mb-1 font-medium text-ink">Aperçu sur l&apos;exemple SellerAmp</div>
        Vente 20,20 $ · Coût 8,13 $ · Total Fees 9,46 $ →{" "}
        <b className="text-ink">profit {cad(preview.profit)}</b>, ROI {pct(preview.roi, 2)}, marge {pct(preview.margin, 2)}
        {preview.taxes ? <>, taxes {cad(preview.taxes)}</> : null}
        <div className="mt-1 text-ink-3">
          Avec « Inscrit » à 20 % (réglage par défaut), on retrouve exactement SellerAmp : 0,60 $ · 7,38 % · 2,97 %. Le taux réel au Québec est de 14,975 % :
          garder 20 % ajoute une marge de sécurité.
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary" disabled={pending || (mode !== "NONE" && !valid)} onClick={save}>
          <Save size={15} /> {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        {msg && <span className={cn("text-xs", msg.ok ? "text-[#5fd35f]" : "text-[#f08080]")}>{msg.text}</span>}
      </div>
    </div>
  );
}
