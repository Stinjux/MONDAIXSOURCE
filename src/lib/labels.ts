// Libellés et constantes partagés entre serveur et navigateur.

export const REVIEW_STATUSES = ["TO_REVIEW", "IN_PROGRESS", "VALIDATED", "REJECTED", "FOLLOW_UP"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  TO_REVIEW: "À revoir",
  IN_PROGRESS: "En cours",
  VALIDATED: "Revu et validé",
  REJECTED: "Rejeté",
  FOLLOW_UP: "À suivre",
};

/** Statuts qui comptent comme « revu » (une décision a été prise). */
export const DECIDED: ReviewStatus[] = ["VALIDATED", "REJECTED", "FOLLOW_UP"];
export const isDecided = (s: string) => (DECIDED as string[]).includes(s);

export const CHECKLIST = [
  { key: "amazonPrice", label: "Prix Amazon vérifié" },
  { key: "supplierPrice", label: "Prix fournisseur vérifié" },
  { key: "profit", label: "Rentabilité recalculée" },
  { key: "availability", label: "Disponibilité vérifiée" },
  { key: "restrictions", label: "Restrictions Amazon vérifiées" },
  { key: "duplicates", label: "Doublons examinés" },
] as const;
export type ChecklistKey = (typeof CHECKLIST)[number]["key"];
export type Checklist = Partial<Record<ChecklistKey, boolean>>;

export function parseChecklist(value: unknown): Checklist {
  if (!value || typeof value !== "object") return {};
  const out: Checklist = {};
  for (const { key } of CHECKLIST) if ((value as Record<string, unknown>)[key] === true) out[key] = true;
  return out;
}

export const RESTRICTIONS = ["UNKNOWN", "UNGATED", "GATED", "APPROVAL_PENDING", "APPROVED"] as const;
export const RESTRICTION_LABELS: Record<(typeof RESTRICTIONS)[number], string> = {
  UNKNOWN: "Non vérifié",
  UNGATED: "Aucune restriction",
  GATED: "Restreint",
  APPROVAL_PENDING: "Autorisation demandée",
  APPROVED: "Autorisé",
};

export const SOURCE_LABELS: Record<string, string> = { LEADS: "Leads", OUT_OF_STOCK: "Out of Stock", LEGACY: "Historique" };

export const RUN_STATUS_LABELS: Record<string, string> = {
  RUNNING: "En cours",
  SUCCESS: "Réussi",
  FAILED: "Échec",
  SKIPPED: "Ignoré",
  LEGACY: "Ancien format",
};

export const TRIGGER_LABELS: Record<string, string> = {
  MANUAL: "Manuel",
  CRON: "Planifié",
  CLI: "Ligne de commande",
  LEGACY_MIGRATION: "Migration",
  TEST: "Test",
};
