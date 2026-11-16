// GET /api/search?q=… — recherche de la palette de commandes (⌘K) : leads par nom ou ASIN, et commerces.
// Accès : session administrateur.
import { requestAuthorized } from "@/lib/auth";
import { brandOf } from "@/lib/duplicates";
import { prisma } from "@/lib/prisma";
import { storeName } from "@/lib/stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requestAuthorized(request, "admin"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return Response.json({ leads: [], stores: [] });
  const [products, offers] = await Promise.all([
    prisma.product.findMany({
      where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { asin: { contains: q.toUpperCase() } }] },
      orderBy: { lastSeenAt: "desc" },
      take: 8,
      select: { asin: true, name: true, reviewStatus: true, offers: { take: 1, orderBy: { firstSeenAt: "asc" }, select: { supplierKey: true, supplierName: true, supplierUrl: true } } },
    }),
    prisma.supplierOffer.findMany({
      where: { OR: [{ supplierName: { contains: q, mode: "insensitive" } }, { supplierKey: { contains: q.toLowerCase() } }] },
      take: 60,
      select: { supplierKey: true, supplierName: true, supplierUrl: true },
    }),
  ]);
  const stores = new Map<string, string>();
  for (const o of offers) {
    const key = brandOf(o);
    if (key && !stores.has(key)) stores.set(key, storeName(o));
  }
  return Response.json({
    leads: products.map((p) => ({ asin: p.asin, name: p.name, reviewStatus: p.reviewStatus, store: p.offers[0] ? storeName(p.offers[0]) : null })),
    stores: [...stores].slice(0, 4).map(([key, name]) => ({ key, name })),
  });
}
