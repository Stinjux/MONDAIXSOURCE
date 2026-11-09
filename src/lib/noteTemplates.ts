// Modèles de notes : motifs prédéfinis pour justifier une décision en un clic.
// Modifiables dans Settings (AppSetting « notes.templates »). Fonctions pures, testées.

export type NoteTemplates = { positive: string[]; negative: string[]; check: string[] };

export const TEMPLATE_GROUPS: { key: keyof NoteTemplates; label: string; tone: "good" | "critical" | "warning" }[] = [
  { key: "positive", label: "Pour", tone: "good" },
  { key: "negative", label: "Contre", tone: "critical" },
  { key: "check", label: "À vérifier", tone: "warning" },
];

export const DEFAULT_TEMPLATES: NoteTemplates = {
  positive: ["Bon ROI", "Bonne marge", "Fort volume de ventes", "Prix Amazon stable", "Peu de vendeurs FBA", "Amazon absent", "Fournisseur fiable", "Bon pour rachat"],
  negative: ["ROI trop bas", "Faible volume", "Trop de vendeurs", "Amazon vend", "Prix Amazon en baisse", "Restreint (gated)", "Rupture fournisseur", "Lot ou format différent", "Produit fragile ou lourd"],
  check: ["Fournisseur à vérifier", "Prix fournisseur à confirmer", "Restriction à vérifier", "Attendre une promo", "Vérifier l'historique Keepa"],
};

const clean = (list: unknown, fallback: string[]): string[] => {
  if (!Array.isArray(list)) return fallback;
  const out: string[] = [];
  for (const v of list) {
    const t = typeof v === "string" ? v.trim().slice(0, 40) : "";
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.slice(0, 20);
};

/** Relit des modèles enregistrés en ignorant toute valeur invalide (groupe absent = modèles par défaut). */
export function parseTemplates(value: unknown): NoteTemplates {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return { positive: clean(v.positive, DEFAULT_TEMPLATES.positive), negative: clean(v.negative, DEFAULT_TEMPLATES.negative), check: clean(v.check, DEFAULT_TEMPLATES.check) };
}

/** Motifs d'un lead, nettoyés (sans doublon, 12 au plus). */
export const cleanTags = (tags: unknown): string[] => clean(tags, []).slice(0, 12);

/** Groupe d'un motif selon les modèles (pour sa couleur) ; null si motif libre. */
export function tagGroup(tag: string, t: NoteTemplates): keyof NoteTemplates | null {
  const k = (Object.keys(t) as (keyof NoteTemplates)[]).find((g) => t[g].some((x) => x.toLowerCase() === tag.toLowerCase()));
  return k ?? null;
}

/** Nombre de leads par motif, du plus fréquent au moins fréquent. */
export function countTags(items: { tags: string[] }[]): { tag: string; count: number }[] {
  const m = new Map<string, number>();
  for (const i of items) for (const t of new Set(i.tags)) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "fr"));
}
