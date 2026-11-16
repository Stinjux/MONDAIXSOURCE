"use client";
// Décision d'achat à deux sur un lead : la décision de chaque compte (qui, quand, quantité, note)
// et les boutons du compte connecté. L'achat n'est approuvé que lorsque les deux ont dit oui.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, MessageSquareWarning, Minus, Plus, ThumbsDown, ThumbsUp } from "lucide-react";
import { castBuyVote } from "@/app/(app)/actions";
import { BUY_STATE_LABELS, type BuyStatus } from "@/lib/buyApproval";
import { formatDateTime } from "@/lib/dates";
import { USER_KEYS, otherUser } from "@/lib/users";
import { useUser } from "./UserContext";
import { UserAvatar, cn } from "./ui";

const TONE: Record<string, string> = {
  APPROVED: "border-good/40 bg-good/[0.07] text-good",
  PROPOSED: "border-warning/40 bg-warning/[0.08] text-warning",
  DISCUSS: "border-critical/40 bg-critical/[0.06] text-critical",
  DECLINED: "border-line-strong bg-surface-2 text-ink-2",
  NONE: "border-line bg-surface-2 text-ink-3",
};

/** Pastille d'état : « Approuvé à deux », « En attente de Marc », « À discuter »… */
export function BuyStateBadge({ status }: { status: BuyStatus | null }) {
  const { profiles, me } = useUser();
  const s = status?.state ?? "NONE";
  const label =
    s === "PROPOSED" && status?.waitingFor
      ? status.waitingFor === me
        ? "À approuver par vous"
        : `En attente de ${profiles[status.waitingFor].name}`
      : BUY_STATE_LABELS[s];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold", TONE[s])}>
      {s === "APPROVED" ? <Check size={11} /> : s === "DISCUSS" ? <MessageSquareWarning size={11} /> : null}
      {label}
    </span>
  );
}

export function BuyVotePanel({ productId, status, defaultQty = 1, compact = false, onVoted }: { productId: string; status: BuyStatus | null; defaultQty?: number; compact?: boolean; onVoted?: (vote: "BUY" | "NO" | "NONE", qty: number) => void }) {
  const router = useRouter();
  const { me, profiles, partnerEnabled } = useUser();
  const mine = status?.latest[me];
  const [qty, setQty] = useState(mine?.quantity ?? status?.quantity ?? defaultQty);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const vote = (v: "BUY" | "NO" | "NONE") =>
    start(async () => {
      setError(null);
      const res = await castBuyVote({ productId, vote: v, quantity: v === "BUY" ? qty : null, note: note.trim() || null });
      if (!res.ok) return setError(res.error);
      setNote("");
      onVoted?.(v, qty);
      router.refresh();
    });
  const users = partnerEnabled ? [me, otherUser(me)] : USER_KEYS.filter((u) => u === "owner");

  return (
    <section className={cn("rounded-md border border-line bg-surface", compact ? "p-3" : "p-4")} aria-label="Décision d'achat">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[12px] font-semibold tracking-[0.08em] text-ink-2 uppercase">{partnerEnabled ? "Décision d'achat à deux" : "Décision d'achat"}</h3>
        <BuyStateBadge status={status} />
      </div>

      {/* Décision de chaque compte */}
      <ul className="mt-3 flex flex-col gap-2">
        {users.map((u) => {
          const v = status?.latest[u];
          const p = profiles[u];
          return (
            <li key={u} className="flex items-start gap-2.5">
              <UserAvatar profile={p} size={26} />
              <div className="min-w-0 flex-1 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-ink">{u === me ? `${p.name} (vous)` : p.name}</span>
                  {v ? (
                    <span className={cn("text-xs font-semibold", v.vote === "BUY" ? "text-good" : "text-critical")}>
                      {v.vote === "BUY" ? `Approuve l'achat${v.quantity ? ` · ${v.quantity} u.` : ""}` : "Refuse l'achat"}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-3">Pas encore décidé</span>
                  )}
                </div>
                {v && <div className="text-[11px] text-ink-3">{formatDateTime(v.at)}</div>}
                {v?.note && <p className="mt-1 rounded-sm bg-page px-2 py-1 text-xs text-ink-2">« {v.note} »</p>}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Décision du compte connecté */}
      <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-2">Quantité</span>
          <span className="inline-flex items-center rounded-sm border border-line">
            <button type="button" className="px-2 py-1 text-ink-2 hover:text-ink" aria-label="Moins" onClick={() => setQty((q) => Math.max(1, q - 1))}>
              <Minus size={13} />
            </button>
            <input className="w-12 border-x border-line py-1 text-center text-sm tabular-nums outline-none" inputMode="numeric" value={qty} onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value)) || 1))} aria-label="Quantité proposée" />
            <button type="button" className="px-2 py-1 text-ink-2 hover:text-ink" aria-label="Plus" onClick={() => setQty((q) => q + 1)}>
              <Plus size={13} />
            </button>
          </span>
          <input className="field min-w-40 flex-1 py-1 text-sm" placeholder="Note pour votre partenaire (facultatif)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} aria-label="Note" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={pending} onClick={() => vote("BUY")}>
            <ThumbsUp size={15} /> {mine?.vote === "BUY" ? "Confirmer à nouveau" : "J'approuve l'achat"}
          </button>
          <button type="button" className="btn-ghost" disabled={pending} onClick={() => vote("NO")}>
            <ThumbsDown size={15} /> {mine?.vote === "NO" ? "Je maintiens le refus" : "Je refuse l'achat"}
          </button>
        </div>
        {mine && (
          <button type="button" className="self-start text-[11px] text-ink-3 hover:text-ink hover:underline" disabled={pending} onClick={() => vote("NONE")}>
            Retirer ma décision
          </button>
        )}
        {error && <p className="text-xs text-critical">{error}</p>}
        {partnerEnabled && !compact && (
          <p className="text-[11px] text-ink-3">L&apos;achat est approuvé quand vous l&apos;avez tous les deux approuvé ; un refus d&apos;un côté le met « À discuter ». Votre décision la plus récente fait foi.</p>
        )}
      </div>
    </section>
  );
}
