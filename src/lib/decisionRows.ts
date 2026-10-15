// Lignes de la section Buy Decisions : un lead = un ASIN, évalué sur sa meilleure offre fournisseur.
// Les valeurs vérifiées en Weekly Review remplacent les valeurs importées de la Sheet.
import { buyScore, type DecisionMetrics } from "./decision";
import { NO_TAX, pick, preliminaryProfit, type TaxConfig } from "./profit";
import type { OfferView, ProductView } from "./queries";

export type DecisionRow = DecisionMetrics & {
  productId: string;
  asin: string;
  name: string;
  amazonUrl: string | null;
  supplierName: string | null;
  supplierUrl: string | null;
  supplierKey: string;
  offerCount: number;
  amazonPrice: number | null;
  costPrice: number | null;
  fees: number | null;
  calcIssue: string | null;
  /** Taxes retranchées du profit (selon le réglage) */
  taxes: number | null;
  score: number | null;
  /** Nombre de valeurs vérifiées utilisées (prix Amazon, coût, frais) */
  verifiedCount: number;
  /** Fournisseur en rupture (vérification manuelle ou Sheet OUT OF STOCK) */
  unavailable: boolean;
  restricted: boolean;
  reviewStatus: string;
  goalWeek: string | null;
  countsTowardGoal: boolean;
  firstSeenAt: string;
  present: boolean;
};

function evaluate(p: ProductView, o: OfferView, tax: TaxConfig) {
  const s = pick(p.verifiedSalePrice, o.amazonPrice);
  const c = pick(o.verifiedCostPrice, o.costPrice);
  const f = pick(p.verifiedFbaFee, o.fbaFee);
  const currency = c.origin === "verified" ? "CAD" : o.currency;
  const r = preliminaryProfit({ salePrice: s.value, costPrice: c.value, fbaFee: f.value, estimatedSales: o.estimatedSales, currency }, tax);
  const metrics: DecisionMetrics = { profit: r.profit, roi: r.roi, margin: r.margin, monthlyProfit: r.monthlyProfit, estimatedSales: o.estimatedSales };
  return {
    offer: o,
    metrics,
    issue: r.issue,
    taxes: r.taxes,
    score: buyScore(metrics),
    amazonPrice: s.value,
    costPrice: c.value,
    fees: f.value,
    verifiedCount: [s, c, f].filter((x) => x.origin === "verified").length,
    unavailable: o.verifiedAvailability === "OUT_OF_STOCK" || (o.verifiedAvailability !== "IN_STOCK" && o.sources.includes("OUT_OF_STOCK") && o.stockStatus !== "IN_STOCK"),
  };
}

export function toDecisionRows(products: ProductView[], tax: TaxConfig = NO_TAX): DecisionRow[] {
  return products
    .filter((p) => p.offers.length > 0)
    .map((p) => {
      // Meilleure offre : disponible d'abord, puis meilleur score
      const best = p.offers
        .map((o) => evaluate(p, o, tax))
        .sort((a, b) => Number(a.unavailable) - Number(b.unavailable) || (b.score ?? -1) - (a.score ?? -1))[0];
      return {
        ...best.metrics,
        productId: p.id,
        asin: p.asin,
        name: p.name,
        amazonUrl: p.amazonUrl,
        supplierName: best.offer.supplierName,
        supplierUrl: best.offer.supplierUrl,
        supplierKey: best.offer.supplierKey,
        offerCount: p.offers.length,
        amazonPrice: best.amazonPrice,
        costPrice: best.costPrice,
        fees: best.fees,
        calcIssue: best.issue,
        taxes: best.taxes,
        score: best.score,
        verifiedCount: best.verifiedCount,
        unavailable: best.unavailable,
        restricted: p.restriction === "GATED" || p.restriction === "APPROVAL_PENDING",
        reviewStatus: p.reviewStatus,
        goalWeek: p.goalWeek,
        countsTowardGoal: p.countsTowardGoal,
        firstSeenAt: p.firstSeenAt,
        present: p.present,
      };
    });
}
