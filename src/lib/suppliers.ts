// Section « Fournisseurs » : chaque produit regroupé par fournisseur (magasin), avec la
// rentabilité de l'offre chez ce fournisseur et l'étape du lead dans le Pipeline. Fonctions pures, testées.
import { evaluateOffer, type DecisionRow } from "./decisionRows";
import { brandOf } from "./duplicates";
import type { FreshnessState } from "./freshness";
import { supplierBrand } from "./normalize";
import { STAGES, stageOf, type Stage } from "./pipeline";
import { storeDomain, storeName } from "./stores";
import { NO_TAX, type TaxConfig } from "./profit";
import type { ProductView } from "./queries";

export type SupplierProduct = {
  productId: string;
  asin: string;
  name: string;
  supplierUrl: string | null;
  cost: number | null;
  roi: number | null;
  profit: number | null;
  monthlyProfit: number | null;
  /** Rupture chez ce fournisseur */
  unavailable: boolean;
  /** Ce fournisseur est la meilleure offre du lead */
  best: boolean;
  stage: Stage;
  reviewStatus: string;
  fresh: FreshnessState;
};

export type SupplierGroup = {
  key: string;
  name: string;
  domain: string | null;
  products: SupplierProduct[];
  stats: {
    products: number;
    toReview: number;
    ready: number;
    rejected: number;
    unavailable: number;
    avgRoi: number | null;
    bought: { units: number; spend: number };
    /** Nombre de produits par étape du Pipeline */
    stages: Record<Stage, number>;
  };
};

export type PurchasedLine = { supplierName: string | null; supplierUrl: string | null; quantity: number; unitCost: number };

const hostOf = (url: string | null) => {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

export function groupBySupplier(
  products: ProductView[],
  rows: DecisionRow[],
  tax: TaxConfig = NO_TAX,
  purchased: Map<string, unknown> = new Map(),
  purchases: PurchasedLine[] = [],
): SupplierGroup[] {
  const rowById = new Map(rows.map((r) => [r.productId, r]));
  type Acc = { names: Map<string, number>; domain: string | null; products: SupplierProduct[] };
  // Nom lisible du commerce (« Canadian Tire »), le plus fréquent parmi ses offres
  const groups = new Map<string, Acc>();

  for (const p of products) {
    const row = rowById.get(p.id);
    for (const o of p.offers) {
      const key = o.supplierKey === "unknown" ? "unknown" : brandOf(o) || "unknown";
      const g: Acc = groups.get(key) ?? { names: new Map(), domain: null, products: [] };
      groups.set(key, g);
      const label = storeName(o);
      g.names.set(label, (g.names.get(label) ?? 0) + 1);
      g.domain ??= storeDomain(o) ?? hostOf(o.supplierUrl);
      const e = evaluateOffer(p, o, tax);
      g.products.push({
        productId: p.id,
        asin: p.asin,
        name: p.name,
        supplierUrl: o.supplierUrl,
        cost: e.costPrice,
        roi: e.metrics.roi,
        profit: e.metrics.profit,
        monthlyProfit: e.metrics.monthlyProfit,
        unavailable: e.unavailable,
        best: row ? row.supplierKey === o.supplierKey : false,
        stage: stageOf({ reviewStatus: p.reviewStatus, purchased: purchased.has(p.id), unavailable: row?.unavailable ?? e.unavailable, fresh: row?.fresh.state ?? "STALE" }),
        reviewStatus: p.reviewStatus,
        fresh: row?.fresh.state ?? "STALE",
      });
    }
  }

  const bought = new Map<string, { units: number; spend: number }>();
  for (const l of purchases) {
    const key = supplierBrand(l.supplierUrl || l.supplierName) || "unknown";
    const b = bought.get(key) ?? { units: 0, spend: 0 };
    bought.set(key, { units: b.units + l.quantity, spend: b.spend + l.quantity * l.unitCost });
  }

  return [...groups]
    .map(([key, g]) => {
      const names = [...g.names].sort((a, b) => b[1] - a[1]);
      const list = g.products.sort((a, b) => (b.roi ?? -Infinity) - (a.roi ?? -Infinity));
      const rois = list.filter((x) => x.stage !== "REJECTED" && x.roi != null).map((x) => x.roi as number);
      return {
        key,
        name: key === "unknown" ? "Fournisseur inconnu" : (names[0]?.[0] ?? key),
        domain: g.domain,
        products: list,
        stats: {
          products: list.length,
          toReview: list.filter((x) => x.stage === "NEW" || x.stage === "ANALYSIS").length,
          ready: list.filter((x) => x.stage === "READY").length,
          rejected: list.filter((x) => x.stage === "REJECTED").length,
          unavailable: list.filter((x) => x.unavailable).length,
          avgRoi: rois.length ? rois.reduce((n, x) => n + x, 0) / rois.length : null,
          bought: bought.get(key) ?? { units: 0, spend: 0 },
          stages: Object.fromEntries(STAGES.map((st) => [st, list.filter((x) => x.stage === st).length])) as Record<Stage, number>,
        },
      };
    })
    .sort((a, b) => Number(a.key === "unknown") - Number(b.key === "unknown") || b.stats.products - b.stats.rejected - (a.stats.products - a.stats.rejected) || b.stats.products - a.stats.products || a.name.localeCompare(b.name, "fr"));
}
