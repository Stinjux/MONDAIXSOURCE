// Commandes passées chez les fournisseurs (Sheet COMMANDES) : lecture d'une ligne, taxes du Québec,
// coût unitaire hors taxes et totaux par fournisseur. Fonctions pures, testées.
import { amount, supplierBrand } from "./normalize";
import { knownStoreDomain, storeDomain, storeName } from "./stores";

/** TPS 5 % + TVQ 9,975 % */
export const QC_TAX_RATE = 14.975;

export type OrderRow = {
  sheetRow: number;
  supplierText: string;
  supplierKey: string;
  supplierName: string;
  supplierUrl: string | null;
  totalPaid: number;
  quantity: number;
  orderedText: string | null;
  emailUrl: string | null;
};

export type OrderParse = { ok: true; row: OrderRow; warnings: string[] } | { ok: false; error: string };

export const cell = (r: (string | undefined)[], i: number) => (r[i] ?? "").toString().trim();
const isUrl = (v: string) => /^https?:\/\//i.test(v);

/** Ligne d'en-tête : « Fournisseur » en A, ou « Prix » / « Quantité » en B / C. */
export const isOrderHeader = (r: string[]) => /^fournisseur/i.test(cell(r, 0)) || (/prix/i.test(cell(r, 1)) && /quantit/i.test(cell(r, 2)));
export const isBlank = (r: string[]) => !r.some((c) => (c ?? "").toString().trim());

/** Commerce à partir de la colonne A (nom ou lien) : clé de marque commune avec la section Fournisseurs. */
export function orderSupplier(text: string): { key: string; name: string; url: string | null } {
  const t = text.trim();
  if (!t) return { key: "unknown", name: "Fournisseur non indiqué", url: null };
  const url = isUrl(t) ? t : null;
  const key = supplierBrand(t) || "unknown";
  return { key, name: storeName({ supplierName: url ? null : t, supplierUrl: url, supplierKey: url ? null : `store:${key}` }), url };
}

export function parseOrderRow(r: string[], sheetRow: number): OrderParse {
  const supplierText = cell(r, 0);
  const total = amount(cell(r, 1));
  const qtyText = cell(r, 2);
  const qty = amount(qtyText);
  if (total == null) return { ok: false, error: cell(r, 1) ? `Prix total illisible « ${cell(r, 1)} » (colonne B)` : "Prix total manquant (colonne B)" };
  if (total < 0) return { ok: false, error: `Prix total négatif « ${cell(r, 1)} » (colonne B)` };
  if (qty == null) return { ok: false, error: qtyText ? `Quantité illisible « ${qtyText} » (colonne C)` : "Quantité manquante (colonne C)" };
  if (!Number.isInteger(qty) || qty < 1) return { ok: false, error: `Quantité invalide « ${qtyText} » : nombre entier d'au moins 1 attendu (colonne C)` };
  const warnings: string[] = [];
  if (!supplierText) warnings.push("Fournisseur manquant (colonne A)");
  const orderedText = cell(r, 3) || null;
  if (!orderedText) warnings.push("Date de commande manquante (colonne D) : date d'import utilisée");
  const email = cell(r, 4) || null;
  const s = orderSupplier(supplierText);
  return {
    ok: true,
    warnings,
    row: { sheetRow, supplierText, supplierKey: s.key, supplierName: s.name, supplierUrl: s.url, totalPaid: total, quantity: qty, orderedText, emailUrl: email },
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Date de commande ambiguë (« 03/11/2026 » : 3 novembre ou 11 mars ?) : jour et mois tous deux ≤ 12
 * et différents. Elle est lue selon SHEET_DATE_ORDER ; un avertissement invite à écrire AAAA-MM-JJ.
 */
export function ambiguousDate(text: string | null): boolean {
  const m = (text ?? "").trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}\b/);
  return !!m && Number(m[1]) <= 12 && Number(m[2]) <= 12 && Number(m[1]) !== Number(m[2]);
}

/** Prix total taxes incluses → hors taxes, taxes et coût unitaire hors taxes. */
export function orderAmounts(o: { totalPaid: number; quantity: number; taxRate?: number }) {
  const rate = o.taxRate ?? QC_TAX_RATE;
  const beforeTax = o.totalPaid / (1 + rate / 100);
  return {
    beforeTax: round2(beforeTax),
    taxes: round2(o.totalPaid - beforeTax),
    unitCost: o.quantity > 0 ? round2(beforeTax / o.quantity) : null,
    unitPaid: o.quantity > 0 ? round2(o.totalPaid / o.quantity) : null,
  };
}

export type OrderView = {
  id: string;
  sheetRow: number;
  supplierText: string;
  supplierKey: string;
  supplierName: string;
  supplierUrl: string | null;
  totalPaid: number;
  quantity: number;
  /** Date de commande, sinon date d'import */
  orderedAt: string;
  dateFromSheet: boolean;
  orderedText: string | null;
  emailUrl: string | null;
  taxRate: number;
  beforeTax: number;
  taxes: number;
  unitCost: number | null;
};

export type OrderSupplier = {
  key: string;
  name: string;
  domain: string | null;
  orders: number;
  units: number;
  totalPaid: number;
  taxes: number;
  beforeTax: number;
  /** Coût moyen hors taxes par unité */
  avgUnitCost: number | null;
  lastAt: string | null;
  share: number;
};

/** Totaux par fournisseur, du plus gros montant au plus petit. */
export function ordersBySupplier(orders: OrderView[]): OrderSupplier[] {
  const total = orders.reduce((n, o) => n + o.totalPaid, 0);
  const by = new Map<string, OrderView[]>();
  for (const o of orders) by.set(o.supplierKey, [...(by.get(o.supplierKey) ?? []), o]);
  return [...by]
    .map(([key, list]) => {
      const names = new Map<string, number>();
      for (const o of list) names.set(o.supplierName, (names.get(o.supplierName) ?? 0) + 1);
      const units = list.reduce((n, o) => n + o.quantity, 0);
      const beforeTax = round2(list.reduce((n, o) => n + o.beforeTax, 0));
      const paid = round2(list.reduce((n, o) => n + o.totalPaid, 0));
      const url = list.find((o) => o.supplierUrl)?.supplierUrl ?? null;
      const name = [...names].sort((a, b) => b[1] - a[1])[0][0];
      return {
        key,
        name,
        domain: (url ? storeDomain({ supplierUrl: url }) : null) ?? knownStoreDomain(key),
        orders: list.length,
        units,
        totalPaid: paid,
        taxes: round2(list.reduce((n, o) => n + o.taxes, 0)),
        beforeTax,
        avgUnitCost: units ? round2(beforeTax / units) : null,
        lastAt: list.map((o) => o.orderedAt).sort().at(-1) ?? null,
        share: total ? (paid / total) * 100 : 0,
      };
    })
    .sort((a, b) => Number(a.key === "unknown") - Number(b.key === "unknown") || b.totalPaid - a.totalPaid);
}

/** Totaux généraux. */
export function ordersTotals(orders: OrderView[]) {
  const units = orders.reduce((n, o) => n + o.quantity, 0);
  const beforeTax = round2(orders.reduce((n, o) => n + o.beforeTax, 0));
  return {
    orders: orders.length,
    units,
    totalPaid: round2(orders.reduce((n, o) => n + o.totalPaid, 0)),
    taxes: round2(orders.reduce((n, o) => n + o.taxes, 0)),
    beforeTax,
    avgUnitCost: units ? round2(beforeTax / units) : null,
  };
}
