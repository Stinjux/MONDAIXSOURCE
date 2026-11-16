// Section « Fournisseurs » : chaque produit regroupé par fournisseur (magasin), avec la
// rentabilité de l'offre chez ce fournisseur et l'étape du lead dans le Pipeline. Fonctions pures, testées.
import { evaluateOffer, type DecisionRow } from "./decisionRows";
import { brandOf } from "./duplicates";
import type { FreshnessState } from "./freshness";
import { supplierBrand } from "./normalize";
import { STAGES, stageOf, type Stage } from "./pipeline";
import { knownStoreDomain, storeDomain, storeName } from "./stores";
import { NO_TAX, type TaxConfig } from "./profit";
import type { ProductView } from "./queries";
import { ordersTotals, type OrderView } from "./orders";

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
  /** Commandes chez ce fournisseur, les plus récentes d'abord */
  orders: OrderView[];
  stats: {
    products: number;
    toReview: number;
    ready: number;
    rejected: number;
    unavailable: number;
    avgRoi: number | null;
    bought: { units: number; spend: number };
    /** Commandes passées chez ce fournisseur (Sheet COMMANDES) ; null si aucune */
    ordered: ReturnType<typeof ordersTotals> & { lastAt: string | null } | null;
    /** Nombre de produits par étape du Pipeline */
    stages: Record<Stage, number>;
  };
};

/**
 * Rattache le commerce d'une commande (« canadiantire ») à un fournisseur déjà connu : même marque,
 * ou nom plus long / plus court de la même marque (« costcowholesale » → « costco »).
 */
export function matchSupplierKey(key: string, known: string[]): string | null {
  if (!key || key === "unknown") return null;
  if (known.includes(key)) return key;
  const near = known.filter((k) => k !== "unknown" && Math.min(k.length, key.length) >= 4 && (key.startsWith(k) || k.startsWith(key)));
  return near.sort((a, b) => b.length - a.length)[0] ?? null;
}

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
  orders: OrderView[] = [],
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

  // Commandes (Sheet COMMANDES) : rattachées au fournisseur connu, sinon fournisseur à part
  const ordersBy = new Map<string, OrderView[]>();
  const known = [...groups.keys()];
  for (const o of orders) {
    const key = matchSupplierKey(o.supplierKey, known) ?? o.supplierKey;
    ordersBy.set(key, [...(ordersBy.get(key) ?? []), o]);
    if (!groups.has(key)) {
      groups.set(key, { names: new Map(), domain: null, products: [] });
      known.push(key);
    }
    const g = groups.get(key)!;
    if (!g.products.length) g.names.set(o.supplierName, (g.names.get(o.supplierName) ?? 0) + 1);
    g.domain ??= storeDomain({ supplierUrl: o.supplierUrl }) ?? knownStoreDomain(o.supplierKey);
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
        orders: (ordersBy.get(key) ?? []).sort((a, b) => b.orderedAt.localeCompare(a.orderedAt)),
        stats: {
          products: list.length,
          toReview: list.filter((x) => x.stage === "NEW" || x.stage === "ANALYSIS").length,
          ready: list.filter((x) => x.stage === "READY").length,
          rejected: list.filter((x) => x.stage === "REJECTED").length,
          unavailable: list.filter((x) => x.unavailable).length,
          avgRoi: rois.length ? rois.reduce((n, x) => n + x, 0) / rois.length : null,
          bought: bought.get(key) ?? { units: 0, spend: 0 },
          ordered: ordersBy.has(key) ? { ...ordersTotals(ordersBy.get(key)!), lastAt: ordersBy.get(key)!.map((o) => o.orderedAt).sort().at(-1) ?? null } : null,
          stages: Object.fromEntries(STAGES.map((st) => [st, list.filter((x) => x.stage === st).length])) as Record<Stage, number>,
        },
      };
    })
    .sort((a, b) => Number(a.key === "unknown") - Number(b.key === "unknown") || b.stats.products - b.stats.rejected - (a.stats.products - a.stats.rejected) || b.stats.products - a.stats.products || a.name.localeCompare(b.name, "fr"));
}
