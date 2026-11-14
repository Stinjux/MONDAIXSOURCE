// Lecture des commandes importées de la Sheet COMMANDES (serveur).
import { prisma } from "./prisma";
import { orderAmounts, type OrderView } from "./orders";

/** Commandes présentes dans la Sheet (les lignes retirées restent en base mais ne comptent plus). */
export async function loadOrders(opts: { includeRemoved?: boolean } = {}): Promise<(OrderView & { present: boolean })[]> {
  const rows = await prisma.supplierOrder.findMany({
    where: opts.includeRemoved ? {} : { present: true },
    orderBy: [{ orderedAt: "desc" }, { firstImportedAt: "desc" }],
  });
  return rows.map((o) => ({
    id: o.id,
    sheetRow: o.sheetRow,
    supplierText: o.supplierText,
    supplierKey: o.supplierKey,
    supplierName: o.supplierName,
    supplierUrl: o.supplierUrl,
    totalPaid: o.totalPaid,
    quantity: o.quantity,
    orderedAt: (o.orderedAt ?? o.firstImportedAt).toISOString(),
    dateFromSheet: !!o.orderedAt,
    orderedText: o.orderedText,
    emailUrl: o.emailUrl,
    taxRate: o.taxRate,
    present: o.present,
    ...orderAmounts(o),
  }));
}
