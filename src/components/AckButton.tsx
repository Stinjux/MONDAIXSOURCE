"use client";
import { useTransition } from "react";
import { Check } from "lucide-react";
import { acknowledgeBackInStock, acknowledgeDuplicate } from "@/app/(app)/actions";

export function AckButton({ kind, id, label = "Marquer comme examiné" }: { kind: "duplicate" | "stock"; id: string; label?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (kind === "duplicate" ? await acknowledgeDuplicate(id) : await acknowledgeBackInStock(id)))}
      className="btn-ghost shrink-0 px-2.5 py-1 text-xs whitespace-nowrap"
    >
      <Check size={13} /> {pending ? "…" : label}
    </button>
  );
}
