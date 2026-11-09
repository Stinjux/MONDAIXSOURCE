// Écrans « un lead à la fois » (reconfirmation et décision d'achat) : données d'un lead
// avec toutes ses offres, et recalcul en direct pendant la saisie. Fonctions pures, testées.
import { buyScore, type DecisionMetrics } from "./decision";
import type { DecisionRow } from "./decisionRows";
import { NO_TAX, pick, preliminaryProfit, type TaxConfig } from "./profit";
import type { ProductView } from "./queries";

export type Availability = "IN_STOCK" | "OUT_OF_STOCK";

export type FocusOffer = {
  id: string;
  supplier: string;
  url: string | null;
  importedAmazonPrice: number | null;
  importedFees: number | null;
  importedCost: number | null;
  verifiedCost: number | null;
  verifiedAvailability: Availability | null;
  /** En rupture d'après la Sheet OUT OF STOCK (hors vérification manuelle) */
  sheetUnavailable: boolean;
  currency: string;
  estimatedSales: number | null;
};

export type FocusLead = {
  productId: string;
  asin: string;
  name: string;
  amazonUrl: string;
  notes: string | null;
  tags: string[];
  reviewStatus: string;
  restricted: boolean;
  verifiedSalePrice: number | null;
  verifiedFbaFee: number | null;
  offers: FocusOffer[];
  row: DecisionRow;
  /** Dernier achat confirmé (non annulé) */
  purchased: { lastAt: string; units: number } | null;
};

/** Valeurs saisies à l'écran ; absent = inchangé. */
export type FocusEdits = {
  salePrice?: number | null;
  fees?: number | null;
  offers?: Record<string, { cost?: number | null; availability?: Availability | null }>;
};

export function toFocusLeads(products: ProductView[], rows: DecisionRow[], purchased: Map<string, { lastAt: string; units: number }> = new Map()): FocusLead[] {
  const byId = new Map(rows.map((r) => [r.productId, r]));
  return products.flatMap((p) => {
    const row = byId.get(p.id);
    if (!row) return [];
    return [
      {
        productId: p.id,
        asin: p.asin,
        name: p.name,
        amazonUrl: p.amazonUrl ?? `https://www.amazon.ca/dp/${p.asin}`,
        notes: p.reviewNotes,
        tags: p.reviewTags,
        reviewStatus: p.reviewStatus,
        restricted: row.restricted,
        verifiedSalePrice: p.verifiedSalePrice,
        verifiedFbaFee: p.verifiedFbaFee,
        offers: p.offers.map((o) => ({
          id: o.id,
          supplier: o.supplierName ?? o.supplierKey,
          url: o.supplierUrl,
          importedAmazonPrice: o.amazonPrice,
          importedFees: o.fbaFee,
          importedCost: o.costPrice,
          verifiedCost: o.verifiedCostPrice,
          verifiedAvailability: o.verifiedAvailability === "IN_STOCK" || o.verifiedAvailability === "OUT_OF_STOCK" ? o.verifiedAvailability : null,
          sheetUnavailable: o.sources.includes("OUT_OF_STOCK") && o.stockStatus !== "IN_STOCK",
          currency: o.currency,
          estimatedSales: o.estimatedSales,
        })),
        row,
        purchased: purchased.get(p.id) ?? null,
      },
    ];
  });
}

export type FocusOfferResult = {
  offer: FocusOffer;
  amazonPrice: number | null;
  fees: number | null;
  cost: number | null;
  availability: Availability | null;
  unavailable: boolean;
  metrics: DecisionMetrics;
  score: number | null;
  issue: string | null;
};

/** Recalcule chaque offre avec les valeurs saisies ; la meilleure (disponible d'abord, puis score) fait foi, comme dans Buy Decisions. */
export function evaluateFocus(lead: FocusLead, edits: FocusEdits = {}, tax: TaxConfig = NO_TAX) {
  const offers: FocusOfferResult[] = lead.offers.map((o) => {
    const e = edits.offers?.[o.id] ?? {};
    const amazonPrice = edits.salePrice !== undefined ? edits.salePrice : pick(lead.verifiedSalePrice, o.importedAmazonPrice).value;
    const fees = edits.fees !== undefined ? edits.fees : pick(lead.verifiedFbaFee, o.importedFees).value;
    const costPick = pick(o.verifiedCost, o.importedCost);
    const cost = e.cost !== undefined ? e.cost : costPick.value;
    const currency = e.cost !== undefined || costPick.origin === "verified" ? "CAD" : o.currency;
    const availability = e.availability !== undefined ? e.availability : o.verifiedAvailability;
    const unavailable = availability === "OUT_OF_STOCK" || (availability !== "IN_STOCK" && o.sheetUnavailable);
    const r = preliminaryProfit({ salePrice: amazonPrice, costPrice: cost, fbaFee: fees, estimatedSales: o.estimatedSales, currency }, tax);
    const metrics: DecisionMetrics = { profit: r.profit, roi: r.roi, margin: r.margin, monthlyProfit: r.monthlyProfit, estimatedSales: o.estimatedSales };
    return { offer: o, amazonPrice, fees, cost, availability, unavailable, metrics, score: buyScore(metrics), issue: r.issue };
  });
  const best = [...offers].sort((a, b) => Number(a.unavailable) - Number(b.unavailable) || (b.score ?? -1) - (a.score ?? -1))[0] ?? null;
  return { offers, best };
}

/** Champs réellement modifiés, prêts pour l'action serveur de reconfirmation. */
export function changedValues(lead: FocusLead, edits: FocusEdits) {
  const effSale = lead.row.amazonPrice;
  const effFees = lead.row.fees;
  const out: { verifiedSalePrice?: number | null; verifiedFbaFee?: number | null; offers: { id: string; verifiedCostPrice?: number | null; verifiedAvailability?: Availability | null }[] } = { offers: [] };
  if (edits.salePrice !== undefined && edits.salePrice !== effSale) out.verifiedSalePrice = edits.salePrice;
  if (edits.fees !== undefined && edits.fees !== effFees) out.verifiedFbaFee = edits.fees;
  for (const o of lead.offers) {
    const e = edits.offers?.[o.id];
    if (!e) continue;
    const item: (typeof out.offers)[number] = { id: o.id };
    if (e.cost !== undefined && e.cost !== (o.verifiedCost ?? o.importedCost)) item.verifiedCostPrice = e.cost;
    if (e.availability !== undefined && e.availability !== o.verifiedAvailability) item.verifiedAvailability = e.availability;
    if (Object.keys(item).length > 1) out.offers.push(item);
  }
  return out;
}

export const hasChanges = (c: ReturnType<typeof changedValues>) => c.verifiedSalePrice !== undefined || c.verifiedFbaFee !== undefined || c.offers.length > 0;
