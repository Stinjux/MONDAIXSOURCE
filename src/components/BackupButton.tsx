"use client";
import { useState, useTransition } from "react";
import { DatabaseBackup } from "lucide-react";
import { createManualBackup } from "@/app/(app)/actions";

export function BackupButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        className="btn-ghost text-xs"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await createManualBackup();
            if (!res.ok) setError(res.error);
          })
        }
      >
        <DatabaseBackup size={14} className={pending ? "animate-pulse" : ""} /> {pending ? "Sauvegarde…" : "Créer une sauvegarde maintenant"}
      </button>
      {error && <span role="alert" className="text-xs text-[#f08080]">{error}</span>}
    </span>
  );
}
