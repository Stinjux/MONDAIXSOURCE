// Interprétation de la disponibilité fournisseur (colonnes N « Disponibilité », O « Dernière vérification »).
// Règle : un produit n'est déclaré IN_STOCK que si la Sheet l'indique ET qu'une date de vérification valide existe.

import { parseSheetDate, type DateOrder } from "./dates";

export type StockStatus = "IN_STOCK" | "OUT_OF_STOCK" | "CHECK_FAILED" | "UNVERIFIED" | "UNKNOWN";

const clean = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const FAILED = /(erreur|error|echec|echoue|fail|impossible|bloque|blocked|captcha|timeout|introuvable|not found|404)/;
const OUT = /(rupture|out of stock|out-of-stock|indisponible|unavailable|epuise|sold out|soldout|\boos\b|non disponible|not available|pas disponible|pas en stock|backorder|^out$|^non$|^no$|^false$|^0$)/;
const IN = /(en stock|in stock|in-stock|disponible|available|^oui$|^yes$|^in$|^true$|^ok$|retour en stock)/;

export function classifyAvailability(text: string | null | undefined): Exclude<StockStatus, "UNVERIFIED"> {
  const v = clean(text ?? "");
  if (!v) return "UNKNOWN";
  if (FAILED.test(v)) return "CHECK_FAILED";
  if (OUT.test(v)) return "OUT_OF_STOCK";
  if (IN.test(v)) return "IN_STOCK";
  return "UNKNOWN";
}

export function stockFromSheet(
  availability: string | null | undefined,
  lastChecked: string | null | undefined,
  opts: { order?: DateOrder; now?: Date } = {},
): { status: StockStatus; checkedAt: Date | null } {
  const checkedAt = parseSheetDate(lastChecked, opts);
  const status = classifyAvailability(availability);
  if (status === "IN_STOCK" && !checkedAt) return { status: "UNVERIFIED", checkedAt };
  return { status, checkedAt };
}

/** Une nouvelle vérification est nécessaire si le statut est incertain ou si la dernière date dépasse `days` jours. */
export function needsRecheck(status: string, checkedAt: Date | string | null | undefined, now: Date, days: number): boolean {
  if (status === "CHECK_FAILED" || status === "UNKNOWN" || status === "UNVERIFIED") return true;
  if (!checkedAt) return true;
  return now.getTime() - new Date(checkedAt).getTime() > days * 86_400_000;
}

export const STOCK_LABELS: Record<StockStatus, string> = {
  IN_STOCK: "En stock (vérifié)",
  OUT_OF_STOCK: "Rupture",
  CHECK_FAILED: "Vérification échouée",
  UNVERIFIED: "Non vérifié",
  UNKNOWN: "Inconnu",
};
