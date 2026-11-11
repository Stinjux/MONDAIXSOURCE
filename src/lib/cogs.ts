// COGS (coût des marchandises achetées) par produit, à partir des achats réels saisis dans la
// section COGS (le panier potentiel de Buy Decisions n'en fait pas partie). Fonctions pures, testées.
import { storeName } from "./stores";

export type CogsLine = {
  purchaseId: string;
  asin: string;
  name: string;
  quantity: number;
  unitCost: number;
  supplierName: string | null;
  supplierUrl: string | null;
  orderedAt: string;
  cancelled: boolean;
  source: string;
  orderNumber?: string | null;
  note: string | null;
};

export type CogsProduct = {
  asin: string;
  name: string;
  units: number;
  totalCost: number;
  /** Coût moyen pondéré par unité */
  avgUnitCost: number | null;
  minUnitCost: number | null;
  maxUnitCost: number | null;
  orders: number;
  firstAt: string | null;
  lastAt: string | null;
  suppliers: { name: string | null; url: string | null }[];
};

/** Regroupe les lignes d'achat par ASIN ; les commandes annulées ne comptent pas. */
export function cogsByProduct(lines: CogsLine[]): CogsProduct[] {
  const by = new Map<string, CogsLine[]>();
  for (const l of lines) by.set(l.asin, [...(by.get(l.asin) ?? []), l]);
  return [...by].map(([asin, all]) => {
    const live = all.filter((l) => !l.cancelled);
    const units = live.reduce((n, l) => n + l.quantity, 0);
    const totalCost = Math.round(live.reduce((n, l) => n + l.quantity * l.unitCost, 0) * 100) / 100;
    const costs = live.map((l) => l.unitCost);
    const dates = live.map((l) => l.orderedAt).sort();
    // Un fournisseur par commerce (« Walmart » saisi à la main = walmart.ca), en gardant un lien s'il y en a un
    const byStore = new Map<string, { name: string | null; url: string | null }>();
    for (const l of live) {
      if (!l.supplierName && !l.supplierUrl) continue;
      const name = storeName({ supplierName: l.supplierName, supplierUrl: l.supplierUrl });
      const prev = byStore.get(name.toLowerCase());
      if (!prev || (!prev.url && l.supplierUrl)) byStore.set(name.toLowerCase(), { name, url: l.supplierUrl ?? prev?.url ?? null });
    }
    const suppliers = [...byStore.values()];
    return {
      asin,
      name: all[0].name,
      units,
      totalCost,
      avgUnitCost: units ? Math.round((totalCost / units) * 100) / 100 : null,
      minUnitCost: costs.length ? Math.min(...costs) : null,
      maxUnitCost: costs.length ? Math.max(...costs) : null,
      orders: new Set(live.map((l) => l.purchaseId)).size,
      firstAt: dates[0] ?? null,
      lastAt: dates[dates.length - 1] ?? null,
      suppliers,
    };
  });
}
