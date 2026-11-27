// Décisions d'achat à deux (lecture, serveur).
import "server-only";
import { prisma } from "./prisma";
import { partnerEnabled } from "./auth";
import { bucketFor, buyStatus, type BuyStatus, type BuyVoteKind } from "./buyApproval";
import { purchasedProducts } from "./queries";
import type { UserKey } from "./users";

/** Statut d'achat de chaque lead qui a au moins une décision (depuis son dernier achat confirmé). */
export async function loadBuyStatuses(productIds?: string[]): Promise<Map<string, BuyStatus>> {
  const [votes, purchased] = await Promise.all([
    prisma.buyVote.findMany({ where: productIds ? { productId: { in: productIds } } : {}, orderBy: { createdAt: "asc" } }),
    purchasedProducts(),
  ]);
  const byProduct = new Map<string, typeof votes>();
  for (const v of votes) byProduct.set(v.productId, [...(byProduct.get(v.productId) ?? []), v]);
  const enabled = partnerEnabled();
  const out = new Map<string, BuyStatus>();
  for (const [id, list] of byProduct) {
    const status = buyStatus(
      list.map((v) => ({ user: v.user as UserKey, vote: v.vote as BuyVoteKind, quantity: v.quantity, note: v.note, at: v.createdAt.toISOString() })),
      { partnerEnabled: enabled, since: purchased.get(id)?.lastAt ?? null },
    );
    if (status.state !== "NONE") out.set(id, status);
  }
  return out;
}

/** Leads qui attendent une action du compte connecté : à approuver ou à discuter. */
export async function buyActionCount(me: UserKey): Promise<number> {
  if (!partnerEnabled()) return 0;
  const statuses = await loadBuyStatuses();
  return [...statuses.values()].filter((s) => {
    const b = bucketFor(s, me);
    return b === "TO_APPROVE" || b === "DISCUSS";
  }).length;
}
