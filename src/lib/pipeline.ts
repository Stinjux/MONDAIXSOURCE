// Pipeline de sourcing (Kanban) : étape de chaque lead, déduite à l'affichage de son statut de
// revue, de sa fraîcheur, de son stock et de ses achats. Aucune donnée stockée n'est réécrite.
import type { FreshnessState } from "./freshness";
import type { ReviewStatus } from "./labels";

export const STAGES = ["NEW", "ANALYSIS", "RECONFIRM", "READY", "BOUGHT", "WATCH", "REJECTED"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_INFO: Record<Stage, { title: string; hint: string; slug: string }> = {
  NEW: { title: "Nouveaux", hint: "À analyser (statut « À revoir »)", slug: "nouveaux" },
  ANALYSIS: { title: "En analyse", hint: "Statut « En cours »", slug: "analyse" },
  RECONFIRM: { title: "À reconfirmer", hint: "Données de 30 jours ou plus", slug: "a-reconfirmer" },
  READY: { title: "Prêts à acheter", hint: "Validés, données à jour", slug: "prets" },
  BOUGHT: { title: "Achetés", hint: "Achat confirmé depuis le panier", slug: "achetes" },
  WATCH: { title: "En veille", hint: "À suivre ou fournisseur en rupture", slug: "veille" },
  REJECTED: { title: "Rejetés", hint: "Leads écartés", slug: "rejetes" },
};

/** Statut de revue appliqué quand on dépose un lead dans une colonne (les autres colonnes sont calculées). */
export const STAGE_STATUS: Partial<Record<Stage, ReviewStatus>> = {
  NEW: "TO_REVIEW",
  ANALYSIS: "IN_PROGRESS",
  READY: "VALIDATED",
  WATCH: "FOLLOW_UP",
  REJECTED: "REJECTED",
};

// Anciennes adresses de « Achat · Rejeté · À définir »
const LEGACY_SLUGS: Record<string, Stage> = { achat: "READY", rejete: "REJECTED", "a-definir": "NEW" };

export function stageFromSlug(slug: string | null | undefined): Stage | null {
  if (!slug) return null;
  return STAGES.find((s) => STAGE_INFO[s].slug === slug) ?? LEGACY_SLUGS[slug] ?? null;
}

export function stageOf(lead: { reviewStatus: string; purchased: boolean; unavailable: boolean; fresh: FreshnessState }): Stage {
  if (lead.purchased) return "BOUGHT";
  if (lead.reviewStatus === "REJECTED") return "REJECTED";
  if (lead.reviewStatus === "FOLLOW_UP" || lead.unavailable) return "WATCH";
  if (lead.fresh === "STALE") return "RECONFIRM";
  if (lead.reviewStatus === "VALIDATED") return "READY";
  if (lead.reviewStatus === "IN_PROGRESS") return "ANALYSIS";
  return "NEW";
}
