"use client";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { runManualSync } from "@/app/(app)/actions";
import { SOURCE_LABELS } from "@/lib/labels";

export function SyncButton() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const onClick = () =>
    start(async () => {
      setMessage(null);
      const res = await runManualSync();
      if (res.error) return setMessage({ ok: false, text: res.error });
      const parts = (res.results ?? []).map((r) =>
        r.status === "SKIPPED"
          ? r.message ?? "Ignorée"
          : r.status === "FAILED"
            ? `${SOURCE_LABELS[r.source] ?? r.source} : échec — ${r.message}`
            : `${SOURCE_LABELS[r.source] ?? r.source} : ${r.imported} nouveaux, ${r.duplicates} doublons, ${r.updated} mis à jour${r.errors ? `, ${r.errors} lignes invalides` : ""}`,
      );
      setMessage({ ok: res.ok, text: parts.join(" · ") });
    });

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button type="button" onClick={onClick} disabled={pending} className="btn-primary">
        <RefreshCw size={15} className={pending ? "animate-spin" : ""} />
        {pending ? "Synchronisation…" : "Synchroniser les Sheets"}
      </button>
      {message && (
        <p role="status" className={`max-w-md text-right text-xs ${message.ok ? "text-ink-2" : "text-[#f08080]"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
