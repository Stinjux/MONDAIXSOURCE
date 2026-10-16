// Résumé lisible des entrées du journal des modifications (ChangeLog).
import { REVIEW_LABELS, RESTRICTION_LABELS, CHECKLIST } from "./labels";

export const ACTION_LABELS: Record<string, string> = {
  REVIEW: "Revue enregistrée",
  REVIEW_STATUS: "Statut modifié",
  VERIFY: "Vérification fournisseur",
  DUPLICATE_ACK: "Doublon examiné",
  BACK_IN_STOCK_ACK: "Retour en stock vu",
  CREATE: "Création",
  CANCEL: "Annulation",
  RESTORE: "Rétablissement",
  UPDATE: "Mise à jour",
};

const FIELD_LABELS: Record<string, string> = {
  reviewStatus: "Statut",
  reviewNotes: "Notes",
  verifiedSalePrice: "Prix Amazon vérifié",
  verifiedFbaFee: "Total Fees vérifiés",
  restriction: "Restrictions",
  verifiedCostPrice: "Coût fournisseur vérifié",
  verifiedAvailability: "Disponibilité vérifiée",
  reviewChecklist: "Checklist",
};

const money = (v: unknown) => (typeof v === "number" ? `${v.toFixed(2).replace(".", ",")} $` : "—");

function show(field: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (field === "reviewStatus") return REVIEW_LABELS[v as keyof typeof REVIEW_LABELS] ?? String(v);
  if (field === "restriction") return RESTRICTION_LABELS[v as keyof typeof RESTRICTION_LABELS] ?? String(v);
  if (field === "verifiedAvailability") return v === "IN_STOCK" ? "En stock" : v === "OUT_OF_STOCK" ? "En rupture" : String(v);
  if (field.startsWith("verified") && field !== "verifiedAvailability") return money(v);
  if (field === "reviewChecklist" && typeof v === "object") {
    const done = CHECKLIST.filter((c) => (v as Record<string, unknown>)[c.key] === true).length;
    return `${done}/${CHECKLIST.length}`;
  }
  return String(v);
}

/** Liste des champs modifiés : « Statut : À revoir → Revu et validé ». Les notes sont résumées. */
export function describeChange(before: unknown, after: unknown): string[] {
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  const out: string[] = [];
  for (const key of Object.keys(a)) {
    if (!(key in FIELD_LABELS)) continue;
    if (JSON.stringify(b[key] ?? null) === JSON.stringify(a[key] ?? null)) continue;
    // Checklist vide (null ou {}) : pas un changement réel
    if (key === "reviewChecklist" && show(key, b[key] ?? {}) === show(key, a[key] ?? {})) continue;
    if (key === "reviewNotes") {
      out.push(a[key] ? `Notes : « ${String(a[key]).slice(0, 80)}${String(a[key]).length > 80 ? "…" : ""} »` : "Notes effacées");
      continue;
    }
    out.push(`${FIELD_LABELS[key]} : ${show(key, b[key])} → ${show(key, a[key])}`);
  }
  return out;
}
