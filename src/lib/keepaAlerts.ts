// Keepa Alert : chaque lead analysé par Keepa (sauf les achetés), jugé selon VOS critères (chaque compte a
// les siens), rangé en trois sections. Fonctions pures, testées.
//
//  * NEW_GOOD   : répond à vos critères à la dernière analyse Keepa, ne les respectait pas juste avant
//                 (analyse Keepa précédente, ou la Sheet si c'est la première). Reste « New good » jusqu'à
//                 la prochaine analyse : s'il est toujours bon, il passe « Still good ».
//  * STILL_GOOD : répond à vos critères à la dernière analyse ET à celle d'avant ; « bon depuis » = première
//                 analyse de la série ininterrompue d'analyses bonnes.
//  * BELOW      : tous les autres (pas encore dans vos critères), avec ce qui manque et l'évolution.
//
// Les valeurs vérifiées à la main passent avant Keepa et la Sheet, comme partout dans l'app ; le coût
// fournisseur actuel sert pour toutes les analyses (seul le côté Amazon change d'une analyse à l'autre).
import type { Thresholds, Verdict } from "./decision";
import { evaluateRow } from "./decisionFilters";
import { toDecisionRows, type DecisionRow, type KeepaBrief } from "./decisionRows";
import { keepaSalePrice, keepaTotalFees } from "./keepa";
import { NO_TAX, type TaxConfig } from "./profit";
import type { KeepaView, ProductView } from "./queries";
import type { UserKey } from "./users";

export type AlertGroup = "NEW_GOOD" | "STILL_GOOD" | "BELOW";
export const ALERT_GROUPS: AlertGroup[] = ["NEW_GOOD", "STILL_GOOD", "BELOW"];

export type AlertSide = { price: number | null; roi: number | null; profit: number | null; monthlyProfit: number | null; sales: number | null; verdict: Verdict };

export type KeepaAlert = {
  productId: string;
  asin: string;
  name: string;
  group: AlertGroup;
  reviewStatus: string;
  rejectedBy: UserKey | null;
  rejectedAt: string | null;
  supplierName: string | null;
  supplierUrl: string | null;
  costPrice: number | null;
  /** Date de la dernière analyse Keepa (prix « maintenant ») */
  keepaAt: string;
  /** Bon selon vos critères depuis cette analyse (NEW_GOOD : la dernière ; STILL_GOOD : début de la série) */
  goodSince: string | null;
  /** STILL_GOOD : bon à toutes ses analyses Keepa ET déjà bon selon la Sheet avant la première */
  goodBeforeKeepa: boolean;
  /** Avant : analyse Keepa précédente (date) ou valeurs de la Sheet (null) */
  beforeFrom: string | null;
  before: AlertSide;
  now: AlertSide;
  /** Ce qui manque pour répondre à vos critères (BELOW) */
  reasons: string[];
  /** Profit mensuel par rapport à avant : en hausse, en baisse, stable, ou inconnu */
  trend: "UP" | "DOWN" | "SAME" | null;
  /** NEW_GOOD marqué « vu » pour cette analyse : ne compte plus dans le menu */
  seen: boolean;
  /** Avertissements Keepa (Buy Box en chute, Amazon vendeur) */
  keepa: KeepaBrief | null;
};

/** Le lead tel qu'il était avec une autre analyse Keepa (ou avec la Sheet seule si `k` est null). */
export function beforeView(p: ProductView, k: KeepaView | null): ProductView {
  return {
    ...p,
    keepa: k,
    offers: p.offers.map((o) => {
      const sheetPrice = o.buyBox90 ?? o.salePrice;
      const price = (k ? keepaSalePrice(k) : null) ?? sheetPrice;
      return {
        ...o,
        amazonPrice: price,
        fbaFee: (k ? keepaTotalFees(k, price) : null) ?? o.sheetFbaFee,
        estimatedSales: k?.monthlySold ?? o.sheetEstimatedSales,
      };
    }),
  };
}

const side = (r: DecisionRow, t: Thresholds): AlertSide & { reasons: string[] } => {
  const e = evaluateRow(r, t);
  return { price: r.amazonPrice, roi: r.roi, profit: r.profit, monthlyProfit: r.monthlyProfit, sales: r.estimatedSales, verdict: e.verdict, reasons: e.reasons };
};

function trendOf(before: AlertSide, now: AlertSide): KeepaAlert["trend"] {
  const b = before.monthlyProfit ?? before.profit;
  const n = now.monthlyProfit ?? now.profit;
  if (b == null || n == null) return null;
  if (Math.abs(n - b) < 0.5) return "SAME";
  return n > b ? "UP" : "DOWN";
}

export function keepaAlerts(input: {
  products: ProductView[];
  /** Analyses Keepa de chaque lead AVANT la dernière, la plus récente d'abord (au moins la précédente ;
   *  l'historique complet pour dater précisément « bon depuis ») */
  history: Map<string, KeepaView[]>;
  thresholds: Thresholds;
  tax?: TaxConfig;
  /** Leads achetés : jamais dans Keepa Alert */
  purchased: Set<string>;
  /** NEW_GOOD marqués vus : productId → date de l'analyse Keepa vue */
  seen?: Record<string, string>;
  now?: Date;
}): KeepaAlert[] {
  const { products, history, thresholds, purchased, seen = {} } = input;
  const tax = input.tax ?? NO_TAX;
  const now = input.now ?? new Date();
  const candidates = products.filter((p) => p.keepa && p.offers.length && !purchased.has(p.id));
  const current = new Map(toDecisionRows(candidates, tax, now).map((r) => [r.productId, r]));
  const evalWith = (p: ProductView, k: KeepaView | null) => side(toDecisionRows([beforeView(p, k)], tax, now)[0], thresholds);

  const out: KeepaAlert[] = [];
  for (const p of candidates) {
    const row = current.get(p.id);
    if (!row) continue;
    const { reasons, ...nowSide } = side(row, thresholds);
    const past = history.get(p.id) ?? [];
    const prev = past[0] ?? null;
    const beforeEval = evalWith(p, prev);
    const beforeSide: AlertSide = { price: beforeEval.price, roi: beforeEval.roi, profit: beforeEval.profit, monthlyProfit: beforeEval.monthlyProfit, sales: beforeEval.sales, verdict: beforeEval.verdict };
    const keepaAt = p.keepa!.capturedAt;

    let group: AlertGroup = "BELOW";
    let goodSince: string | null = null;
    let goodBeforeKeepa = false;
    if (nowSide.verdict === "BUY") {
      if (beforeSide.verdict !== "BUY") {
        group = "NEW_GOOD";
        goodSince = keepaAt;
      } else {
        group = "STILL_GOOD";
        // Remonte les analyses tant qu'elles étaient bonnes
        goodSince = prev ? prev.capturedAt : keepaAt;
        let broken = false;
        for (let i = 1; prev && i < past.length; i++) {
          if (evalWith(p, past[i]).verdict !== "BUY") {
            broken = true;
            break;
          }
          goodSince = past[i].capturedAt;
        }
        // Toutes les analyses connues sont bonnes : était-il déjà bon selon la Sheet ?
        goodBeforeKeepa = !prev || (!broken && evalWith(p, null).verdict === "BUY");
      }
    }

    const rejected = p.reviewStatus === "REJECTED";
    out.push({
      productId: p.id,
      asin: p.asin,
      name: p.name,
      group,
      reviewStatus: p.reviewStatus,
      rejectedBy: rejected ? p.reviewedBy : null,
      rejectedAt: rejected ? p.reviewedAt : null,
      supplierName: row.supplierName,
      supplierUrl: row.supplierUrl,
      costPrice: row.costPrice,
      keepaAt,
      goodSince,
      goodBeforeKeepa,
      beforeFrom: prev?.capturedAt ?? null,
      before: beforeSide,
      now: nowSide,
      reasons: group === "BELOW" ? reasons : [],
      trend: trendOf(beforeSide, nowSide),
      seen: group === "NEW_GOOD" && seen[p.id] === keepaAt,
      keepa: row.keepa,
    });
  }
  const mp = (a: KeepaAlert) => a.now.monthlyProfit ?? a.now.profit ?? -Infinity;
  return out.sort((a, b) => {
    if (a.group !== b.group) return ALERT_GROUPS.indexOf(a.group) - ALERT_GROUPS.indexOf(b.group);
    if (a.group === "NEW_GOOD") return Number(a.seen) - Number(b.seen) || b.keepaAt.localeCompare(a.keepaAt) || mp(b) - mp(a);
    if (a.group === "BELOW") return Number(b.trend === "UP") - Number(a.trend === "UP") || mp(b) - mp(a);
    return mp(b) - mp(a);
  });
}

/** STILL_GOOD dont la série remonte jusqu'à la plus ancienne analyse fournie : l'historique complet peut la dater plus tôt. */
export function needsFullHistory(a: KeepaAlert, history: Map<string, KeepaView[]>): boolean {
  if (a.group !== "STILL_GOOD") return false;
  const past = history.get(a.productId) ?? [];
  return past.length > 0 && a.goodSince === past[past.length - 1].capturedAt;
}

/** Nombre de jours (calendaires, arrondis vers le bas) depuis une date. */
export function daysSince(iso: string, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}
