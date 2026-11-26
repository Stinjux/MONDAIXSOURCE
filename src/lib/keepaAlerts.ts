// Keepa Alert : les leads qui n'étaient pas acceptés (rejetés, ou sous vos critères) et que la Buy Box
// Keepa rend maintenant intéressants selon VOS critères (chaque compte a les siens). Fonctions pures, testées.
//
// « Avant » = l'avis du lead avec l'analyse Keepa précédente, ou avec les valeurs de la Sheet si c'est sa
// première analyse. « Maintenant » = l'avis avec la dernière analyse Keepa. Les valeurs vérifiées à la
// main passent avant les deux, comme partout dans l'app.
import type { Thresholds, Verdict } from "./decision";
import { evaluateRow } from "./decisionFilters";
import { toDecisionRows, type DecisionRow } from "./decisionRows";
import { keepaSalePrice, keepaTotalFees } from "./keepa";
import { NO_TAX, type TaxConfig } from "./profit";
import type { KeepaView, ProductView } from "./queries";
import type { UserKey } from "./users";

export type AlertSide = { price: number | null; roi: number | null; profit: number | null; monthlyProfit: number | null; sales: number | null; verdict: Verdict };

export type KeepaAlert = {
  productId: string;
  asin: string;
  name: string;
  /** REJECTED : vous l'aviez rejeté · CRITERIA : il ne respectait pas vos critères */
  reason: "REJECTED" | "CRITERIA";
  rejectedBy: UserKey | null;
  rejectedAt: string | null;
  supplierName: string | null;
  supplierUrl: string | null;
  costPrice: number | null;
  /** Date de l'analyse Keepa qui déclenche l'alerte (sert aussi à « Ignorer » jusqu'à la suivante) */
  keepaAt: string;
  /** Avant : analyse Keepa précédente (date) ou valeurs de la Sheet (null) */
  beforeFrom: string | null;
  before: AlertSide;
  now: AlertSide;
};

/** Le lead tel qu'il était avant sa dernière analyse Keepa (analyse précédente, sinon la Sheet). */
export function beforeView(p: ProductView, prev: KeepaView | null): ProductView {
  return {
    ...p,
    keepa: prev,
    offers: p.offers.map((o) => {
      const sheetPrice = o.buyBox90 ?? o.salePrice;
      const price = (prev ? keepaSalePrice(prev) : null) ?? sheetPrice;
      return {
        ...o,
        amazonPrice: price,
        fbaFee: (prev ? keepaTotalFees(prev, price) : null) ?? o.sheetFbaFee,
        estimatedSales: prev?.monthlySold ?? o.sheetEstimatedSales,
      };
    }),
  };
}

const side = (r: DecisionRow, t: Thresholds): AlertSide => ({
  price: r.amazonPrice,
  roi: r.roi,
  profit: r.profit,
  monthlyProfit: r.monthlyProfit,
  sales: r.estimatedSales,
  verdict: evaluateRow(r, t).verdict,
});

export function keepaAlerts(input: {
  products: ProductView[];
  /** Analyse Keepa précédente de chaque lead (avant la dernière) */
  previous: Map<string, KeepaView>;
  thresholds: Thresholds;
  tax?: TaxConfig;
  /** Leads achetés : jamais en alerte */
  purchased: Set<string>;
  /** Alertes ignorées : productId → date de l'analyse Keepa ignorée */
  dismissed?: Record<string, string>;
  now?: Date;
}): KeepaAlert[] {
  const { products, previous, thresholds, purchased, dismissed = {} } = input;
  const tax = input.tax ?? NO_TAX;
  const now = input.now ?? new Date();
  const candidates = products.filter((p) => p.keepa && p.offers.length && !purchased.has(p.id) && dismissed[p.id] !== p.keepa.capturedAt);
  const current = new Map(toDecisionRows(candidates, tax, now).map((r) => [r.productId, r]));
  const out: KeepaAlert[] = [];
  for (const p of candidates) {
    const row = current.get(p.id);
    if (!row) continue;
    const nowSide = side(row, thresholds);
    if (nowSide.verdict !== "BUY") continue;
    const prev = previous.get(p.id) ?? null;
    const beforeRow = toDecisionRows([beforeView(p, prev)], tax, now)[0];
    const beforeSide = side(beforeRow, thresholds);
    const rejected = p.reviewStatus === "REJECTED";
    if (!rejected && beforeSide.verdict === "BUY") continue;
    out.push({
      productId: p.id,
      asin: p.asin,
      name: p.name,
      reason: rejected ? "REJECTED" : "CRITERIA",
      rejectedBy: rejected ? p.reviewedBy : null,
      rejectedAt: rejected ? p.reviewedAt : null,
      supplierName: row.supplierName,
      supplierUrl: row.supplierUrl,
      costPrice: row.costPrice,
      keepaAt: p.keepa!.capturedAt,
      beforeFrom: prev?.capturedAt ?? null,
      before: beforeSide,
      now: nowSide,
    });
  }
  // Les plus récentes d'abord, puis le meilleur profit mensuel
  return out.sort((a, b) => b.keepaAt.localeCompare(a.keepaAt) || (b.now.monthlyProfit ?? 0) - (a.now.monthlyProfit ?? 0));
}
