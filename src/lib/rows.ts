// Conversion des produits en lignes de tableau : une ligne par ASIN, ses fournisseurs regroupés dessous.
import type { LeadRow, SupplierRow } from "@/components/LeadsTable";
import type { ProductView } from "./queries";

export function toLeadRows(products: ProductView[]): LeadRow[] {
  return products.map((p) => {
    const suppliers: SupplierRow[] = p.offers.map((o) => ({
      offerId: o.id,
      supplierName: o.supplierName,
      supplierUrl: o.supplierUrl,
      supplierKey: o.supplierKey,
      salePrice: o.amazonPrice,
      costPrice: o.costPrice,
      fbaFee: o.fbaFee,
      estimatedSales: o.estimatedSales,
      currency: o.currency,
      profit: o.profit.profit,
      roi: o.profit.roi,
      margin: o.profit.margin,
      monthlyProfit: o.profit.monthlyProfit,
      calcIssue: o.profit.issue,
      sources: o.sources,
      present: o.present,
      occurrences: o.occurrences,
      firstSeenAt: o.firstSeenAt,
      lastSeenAt: o.lastSeenAt,
      stockStatus: o.stockStatus,
      exactDuplicate: p.dup.exactOfferIds.includes(o.id),
    }));
    // Meilleure offre en tête, puis les autres par ROI décroissant
    const bestId = p.best?.id;
    suppliers.sort((a, b) => Number(b.offerId === bestId) - Number(a.offerId === bestId) || (b.roi ?? -Infinity) - (a.roi ?? -Infinity));
    const best = suppliers[0] ?? null;
    return {
      productId: p.id,
      asin: p.asin,
      name: p.name,
      amazonUrl: p.amazonUrl,
      suppliers,
      best,
      salePrice: best?.salePrice ?? null,
      costPrice: best?.costPrice ?? null,
      profit: best?.profit ?? null,
      roi: best?.roi ?? null,
      margin: best?.margin ?? null,
      monthlyProfit: best?.monthlyProfit ?? null,
      estimatedSales: best?.estimatedSales ?? null,
      sources: p.sources,
      present: p.present,
      occurrences: p.occurrences,
      supplierCount: suppliers.length,
      firstSeenAt: p.firstSeenAt,
      lastSeenAt: p.lastSeenAt,
      goalWeek: p.goalWeek,
      countsTowardGoal: p.countsTowardGoal,
      reviewStatus: p.reviewStatus,
      dup: { exactOfferIds: p.dup.exactOfferIds, crossSheet: p.dup.crossSheet, multiSupplier: p.dup.multiSupplier },
    };
  });
}
