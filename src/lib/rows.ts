// Conversion des produits en lignes de tableau (une ligne par offre fournisseur).
import type { LeadRow } from "@/components/LeadsTable";
import type { ProductView } from "./queries";

export function toLeadRows(products: ProductView[]): LeadRow[] {
  return products.flatMap((p) =>
    p.offers.map((o) => ({
      offerId: o.id,
      productId: p.id,
      asin: p.asin,
      name: p.name,
      amazonUrl: p.amazonUrl,
      supplierName: o.supplierName,
      supplierUrl: o.supplierUrl,
      supplierKey: o.supplierKey,
      salePrice: o.salePrice,
      costPrice: o.costPrice,
      fbaFee: o.fbaFee,
      estimatedSales: o.estimatedSales,
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
      goalWeek: p.goalWeek,
      countsTowardGoal: p.countsTowardGoal,
      reviewStatus: p.reviewStatus,
      stockStatus: o.stockStatus,
      dup: { exactOfferIds: p.dup.exactOfferIds, crossSheet: p.dup.crossSheet, multiSupplier: p.dup.multiSupplier },
    })),
  );
}
