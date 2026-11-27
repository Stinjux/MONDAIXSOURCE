// Achat confirmé à deux : chaque compte approuve (BUY) ou refuse (NO) l'achat d'un lead.
// Seule la décision la plus récente de chacun compte, et seulement depuis le dernier achat confirmé
// du lead (un nouvel achat repart de zéro). Fonctions pures, testées.
import { otherUser, type UserKey } from "./users";

/** BUY = j'approuve · NO = je refuse · NONE = je retire ma décision (annuler) */
export type BuyVoteKind = "BUY" | "NO" | "NONE";
export type BuyVoteView = { user: UserKey; vote: BuyVoteKind; quantity: number | null; note: string | null; at: string };

/**
 * NONE : personne n'a proposé l'achat · PROPOSED : approuvé par l'un, en attente de l'autre ·
 * APPROVED : approuvé par les deux (ou par le propriétaire si l'app n'a qu'un compte) ·
 * DISCUSS : l'un approuve, l'autre refuse · DECLINED : refusé, sans approbation.
 */
export type BuyState = "NONE" | "PROPOSED" | "APPROVED" | "DISCUSS" | "DECLINED";

export const BUY_STATE_LABELS: Record<BuyState, string> = {
  NONE: "Pas encore proposé",
  PROPOSED: "En attente",
  APPROVED: "Approuvé à deux",
  DISCUSS: "À discuter",
  DECLINED: "Achat refusé",
};

export type BuyStatus = {
  state: BuyState;
  /** Décision actuelle de chaque compte */
  latest: Partial<Record<UserKey, BuyVoteView>>;
  /** Compte dont on attend la décision (PROPOSED) */
  waitingFor: UserKey | null;
  /** Quantité proposée la plus récente */
  quantity: number | null;
};

export function buyStatus(votes: BuyVoteView[], opts: { partnerEnabled: boolean; since?: string | null }): BuyStatus {
  const latest: Partial<Record<UserKey, BuyVoteView>> = {};
  for (const v of votes) {
    if (opts.since && v.at <= opts.since) continue;
    if (!opts.partnerEnabled && v.user === "partner") continue;
    const cur = latest[v.user];
    if (!cur || v.at > cur.at) latest[v.user] = v;
  }
  // Décision retirée : comme si ce compte n'avait pas encore décidé
  for (const u of Object.keys(latest) as UserKey[]) if (latest[u]!.vote === "NONE") delete latest[u];
  const buys = Object.values(latest).filter((v) => v.vote === "BUY").sort((a, b) => b.at.localeCompare(a.at));
  const quantity = buys.find((v) => v.quantity != null)?.quantity ?? null;
  const o = latest.owner?.vote, p = latest.partner?.vote;
  let state: BuyState;
  let waitingFor: UserKey | null = null;
  if (!opts.partnerEnabled) state = o === "BUY" ? "APPROVED" : o === "NO" ? "DECLINED" : "NONE";
  else if (o === "BUY" && p === "BUY") state = "APPROVED";
  else if ((o === "BUY" && p === "NO") || (o === "NO" && p === "BUY")) state = "DISCUSS";
  else if (o === "BUY" || p === "BUY") {
    state = "PROPOSED";
    waitingFor = otherUser(o === "BUY" ? "owner" : "partner");
  } else state = o === "NO" || p === "NO" ? "DECLINED" : "NONE";
  return { state, latest, waitingFor, quantity };
}

/** Rubrique d'un lead pour le compte connecté (page « Achats à deux »). */
export type BuyBucket = "TO_APPROVE" | "WAITING" | "DISCUSS" | "APPROVED" | "DECLINED" | null;

export function bucketFor(s: BuyStatus, me: UserKey): BuyBucket {
  if (s.state === "PROPOSED") return s.waitingFor === me ? "TO_APPROVE" : "WAITING";
  if (s.state === "DISCUSS") return "DISCUSS";
  if (s.state === "APPROVED") return "APPROVED";
  if (s.state === "DECLINED") return "DECLINED";
  return null;
}
