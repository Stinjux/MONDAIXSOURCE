// Chargement des données de la section COGS (serveur uniquement).
import "server-only";
import { prisma } from "./prisma";
import { cogsByProduct, type CogsLine } from "./cogs";

export async function loadCogsLines(asin?: string): Promise<CogsLine[]> {
  const items = await prisma.purchaseItem.findMany({
    where: asin ? { asin } : undefined,
    include: { purchase: { select: { id: true, createdAt: true, cancelledAt: true, source: true, note: true } } },
    orderBy: { purchase: { createdAt: "desc" } },
  });
  return items.map((i) => ({
    purchaseId: i.purchase.id,
    asin: i.asin,
    name: i.name,
    quantity: i.quantity,
    unitCost: i.unitCost,
    supplierName: i.supplierName,
    supplierUrl: i.supplierUrl,
    orderedAt: i.purchase.createdAt.toISOString(),
    cancelled: !!i.purchase.cancelledAt,
    source: i.purchase.source,
    note: i.purchase.note,
  }));
}

/** COGS de tous les produits achetés, avec le nombre de documents de chacun. */
export async function loadCogsOverview() {
  const [lines, docs] = await Promise.all([
    loadCogsLines(),
    prisma.productDocument.groupBy({ by: ["asin"], where: { archivedAt: null }, _count: { _all: true } }),
  ]);
  const docCount = new Map(docs.map((d) => [d.asin, d._count._all]));
  const products = cogsByProduct(lines).map((p) => ({ ...p, documents: docCount.get(p.asin) ?? 0 }));
  // Produits avec des documents mais sans achat enregistré
  const names = new Map((await prisma.product.findMany({ where: { asin: { in: docs.map((d) => d.asin) } }, select: { asin: true, name: true } })).map((p) => [p.asin, p.name]));
  for (const d of docs) {
    if (products.some((p) => p.asin === d.asin)) continue;
    products.push({ asin: d.asin, name: names.get(d.asin) ?? d.asin, units: 0, totalCost: 0, avgUnitCost: null, minUnitCost: null, maxUnitCost: null, orders: 0, firstAt: null, lastAt: null, suppliers: [], documents: d._count._all });
  }
  return products.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
}

export async function loadProductDocuments(asin: string) {
  const docs = await prisma.productDocument.findMany({ where: { asin }, orderBy: { uploadedAt: "desc" } });
  return docs.map((d) => ({ ...d, uploadedAt: d.uploadedAt.toISOString(), archivedAt: d.archivedAt?.toISOString() ?? null }));
}
