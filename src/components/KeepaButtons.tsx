"use client";
// Boutons Keepa : mettre à jour un lead tout de suite ; tester la clé (Settings). La clé n'est jamais affichée.
import { useState, useTransition } from "react";
import { PlugZap, RefreshCw } from "lucide-react";
import { refreshKeepaLead, testKeepa } from "@/app/(app)/actions";
import { cn } from "./ui";

export function KeepaRefreshButton({ asin }: { asin: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn-ghost px-2.5 py-1 text-xs"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await refreshKeepaLead(asin);
            setMsg(r.ok ? { ok: true, text: r.message ?? "Mis à jour" } : { ok: false, text: r.error });
          })
        }
        title="Interroge Keepa maintenant (environ 3 jetons)"
      >
        <RefreshCw size={12} className={cn(pending && "animate-spin")} /> {pending ? "Mise à jour…" : "Mettre à jour depuis Keepa"}
      </button>
      {msg && <span className={cn("text-xs", msg.ok ? "text-good" : "text-critical")}>{msg.text}</span>}
    </span>
  );
}

export function KeepaTestButton() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn-ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await testKeepa();
            setMsg(r.ok ? { ok: true, text: `Clé valide · ${r.tokensLeft} jeton${r.tokensLeft > 1 ? "s" : ""} disponible${r.tokensLeft > 1 ? "s" : ""} · +${r.refillRate} par minute` } : { ok: false, text: r.error });
          })
        }
      >
        <PlugZap size={15} /> {pending ? "Test…" : "Tester Keepa"}
      </button>
      {msg && <span className={cn("text-xs", msg.ok ? "text-good" : "text-critical")}>{msg.text}</span>}
    </span>
  );
}
