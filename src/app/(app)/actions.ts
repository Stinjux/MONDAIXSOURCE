"use server";
// Actions serveur du dashboard. Chaque action vérifie la session administrateur
// et journalise les modifications manuelles dans ChangeLog.
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { isAdmin, SESSION_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncAll, type SyncResult } from "@/lib/sync/engine";
import { CHECKLIST, REVIEW_STATUSES, RESTRICTIONS } from "@/lib/labels";
import { setTaxConfig } from "@/lib/settings";
import { loadProducts } from "@/lib/queries";
import { toDecisionRows } from "@/lib/decisionRows";
import { preliminaryProfit } from "@/lib/profit";

async function guard() {
  if (!(await isAdmin())) throw new Error("Session expirée : reconnectez-vous");
}

const refresh = () => revalidatePath("/", "layout");

const money = z.number().finite().min(0).max(1_000_000).nullable();

const reviewSchema = z.object({
  productId: z.string().min(1),
  status: z.enum(REVIEW_STATUSES),
  notes: z.string().max(5000).nullable(),
  checklist: z.object(Object.fromEntries(CHECKLIST.map((c) => [c.key, z.boolean().optional()])) as Record<string, z.ZodOptional<z.ZodBoolean>>),
  verifiedSalePrice: money,
  verifiedFbaFee: money,
  restriction: z.enum(RESTRICTIONS),
  offers: z
    .array(
      z.object({
        id: z.string().min(1),
        verifiedCostPrice: money,
        verifiedAvailability: z.enum(["IN_STOCK", "OUT_OF_STOCK"]).nullable(),
      }),
    )
    .max(50),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

type ActionResult = { ok: true } | { ok: false; error: string };

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

export async function saveReview(input: ReviewInput): Promise<ActionResult> {
  try {
    await guard();
    const data = reviewSchema.parse(input);
    const now = new Date();
    const product = await prisma.product.findUnique({ where: { id: data.productId }, include: { offers: true } });
    if (!product) return { ok: false, error: "Lead introuvable" };

    const before = {
      reviewStatus: product.reviewStatus,
      reviewNotes: product.reviewNotes,
      reviewChecklist: product.reviewChecklist,
      verifiedSalePrice: product.verifiedSalePrice,
      verifiedFbaFee: product.verifiedFbaFee,
      restriction: product.restriction,
    };
    const after = {
      reviewStatus: data.status,
      reviewNotes: data.notes?.trim() || null,
      reviewChecklist: data.checklist,
      verifiedSalePrice: data.verifiedSalePrice,
      verifiedFbaFee: data.verifiedFbaFee,
      restriction: data.restriction,
    };
    const amazonVerified =
      before.verifiedSalePrice !== after.verifiedSalePrice || before.verifiedFbaFee !== after.verifiedFbaFee || before.restriction !== after.restriction;

    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.product.update({
        where: { id: product.id },
        data: {
          ...after,
          reviewChecklist: json(after.reviewChecklist),
          reviewedAt: before.reviewStatus !== after.reviewStatus ? (after.reviewStatus === "TO_REVIEW" ? null : now) : undefined,
          verifiedAt: amazonVerified ? now : undefined,
        },
      }),
      prisma.changeLog.create({ data: { entity: "Product", entityId: product.id, action: "REVIEW", before: json(before), after: json(after) } }),
    ];

    for (const o of data.offers) {
      const offer = product.offers.find((x) => x.id === o.id);
      if (!offer) continue;
      if (offer.verifiedCostPrice === o.verifiedCostPrice && offer.verifiedAvailability === o.verifiedAvailability) continue;
      ops.push(
        prisma.supplierOffer.update({ where: { id: offer.id }, data: { verifiedCostPrice: o.verifiedCostPrice, verifiedAvailability: o.verifiedAvailability, verifiedAt: now } }),
        prisma.changeLog.create({
          data: {
            entity: "SupplierOffer",
            entityId: offer.id,
            action: "VERIFY",
            before: json({ verifiedCostPrice: offer.verifiedCostPrice, verifiedAvailability: offer.verifiedAvailability }),
            after: json({ verifiedCostPrice: o.verifiedCostPrice, verifiedAvailability: o.verifiedAvailability }),
          },
        }),
      );
      if (o.verifiedAvailability && o.verifiedAvailability !== offer.verifiedAvailability) {
        ops.push(prisma.stockCheck.create({ data: { offerId: offer.id, origin: "MANUAL", status: o.verifiedAvailability, checkedAt: now, detail: "Vérification manuelle (Weekly Review)" } }));
      }
    }
    await prisma.$transaction(ops);
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? "Données invalides" : e instanceof Error ? e.message : "Erreur" };
  }
}

export async function setReviewStatus(productId: string, status: string): Promise<ActionResult> {
  try {
    await guard();
    const parsed = z.enum(REVIEW_STATUSES).parse(status);
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { reviewStatus: true } });
    if (!product) return { ok: false, error: "Lead introuvable" };
    if (product.reviewStatus === parsed) return { ok: true };
    await prisma.$transaction([
      prisma.product.update({ where: { id: productId }, data: { reviewStatus: parsed, reviewedAt: parsed === "TO_REVIEW" ? null : new Date() } }),
      prisma.changeLog.create({ data: { entity: "Product", entityId: productId, action: "REVIEW_STATUS", before: { reviewStatus: product.reviewStatus }, after: { reviewStatus: parsed } } }),
    ]);
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur" };
  }
}

export async function acknowledgeDuplicate(productId: string): Promise<ActionResult> {
  await guard();
  await prisma.$transaction([
    prisma.product.update({ where: { id: productId }, data: { duplicateAckAt: new Date() } }),
    prisma.changeLog.create({ data: { entity: "Product", entityId: productId, action: "DUPLICATE_ACK" } }),
  ]);
  refresh();
  return { ok: true };
}

export async function acknowledgeBackInStock(offerId: string): Promise<ActionResult> {
  await guard();
  await prisma.$transaction([
    prisma.supplierOffer.update({ where: { id: offerId }, data: { backInStockAckAt: new Date() } }),
    prisma.changeLog.create({ data: { entity: "SupplierOffer", entityId: offerId, action: "BACK_IN_STOCK_ACK" } }),
  ]);
  refresh();
  return { ok: true };
}

export async function runManualSync(): Promise<{ ok: boolean; results?: SyncResult[]; error?: string }> {
  try {
    await guard();
    const results = await syncAll({ trigger: "MANUAL" });
    refresh();
    return { ok: results.every((r) => r.status === "SUCCESS"), results };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Synchronisation impossible" };
  }
}

const taxSchema = z.object({ mode: z.enum(["NONE", "REGISTERED", "NOT_REGISTERED"]), rate: z.number().finite().min(0).max(50) });

export async function saveTaxSettings(input: z.infer<typeof taxSchema>): Promise<ActionResult> {
  try {
    await guard();
    const data = taxSchema.parse(input);
    const saved = await setTaxConfig(data);
    await prisma.changeLog.create({ data: { entity: "AppSetting", entityId: "profit.tax", action: "UPDATE", after: saved } });
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? "Valeurs invalides" : e instanceof Error ? e.message : "Erreur" };
  }
}

const purchaseSchema = z.object({
  note: z.string().max(500).nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(100_000),
        /** Coût unitaire payé (CAD) ; null = coût du lead */
        unitCost: z.number().finite().min(0).max(1_000_000).nullable(),
      }),
    )
    .min(1)
    .max(500),
});
export type PurchaseInput = z.infer<typeof purchaseSchema>;

/**
 * Confirme le panier : crée une commande avec les valeurs figées (recalculées côté serveur),
 * et place les produits dans la liste « Achat » (statut « Revu et validé »).
 */
export async function confirmPurchase(input: PurchaseInput): Promise<{ ok: true; purchaseId: string } | { ok: false; error: string }> {
  try {
    await guard();
    const data = purchaseSchema.parse(input);
    const { products, tax } = await loadProducts();
    const rows = new Map(toDecisionRows(products, tax).map((r) => [r.productId, r]));
    const lines: Prisma.PurchaseItemCreateWithoutPurchaseInput[] & { productId: string; quantity: number; unitCost: number; unitProfit: number | null }[] = [];
    for (const item of data.items) {
      const row = rows.get(item.productId);
      if (!row) return { ok: false, error: "Un produit du panier est introuvable : rechargez la page." };
      const unitCost = item.unitCost ?? row.costPrice;
      if (unitCost == null) return { ok: false, error: `Coût unitaire manquant pour ${row.asin} : saisissez-le dans le panier.` };
      // Coût saisi = CAD ; coût du lead dans une autre devise = profit non calculé
      const foreign = item.unitCost == null && !!row.calcIssue?.startsWith("Devise");
      const p = foreign ? null : preliminaryProfit({ salePrice: row.amazonPrice, costPrice: unitCost, fbaFee: row.fees }, tax);
      lines.push({
        productId: row.productId,
        asin: row.asin,
        name: row.name,
        supplierName: row.supplierName,
        supplierUrl: row.supplierUrl,
        quantity: item.quantity,
        unitCost,
        amazonPrice: row.amazonPrice,
        fees: row.fees,
        taxes: p?.taxes ?? null,
        unitProfit: p?.profit ?? null,
        roi: p?.roi ?? null,
        margin: p?.margin ?? null,
      });
    }
    const totalCost = lines.reduce((n, l) => n + l.unitCost * l.quantity, 0);
    const profits = lines.map((l) => (l.unitProfit == null ? null : l.unitProfit * l.quantity));
    const totalProfit = profits.every((x) => x != null) ? profits.reduce((n, x) => n + (x as number), 0) : null;
    const toValidate = products.filter((p) => lines.some((l) => l.productId === p.id) && p.reviewStatus !== "VALIDATED");

    const purchase = await prisma.$transaction(async (tx) => {
      const created = await tx.purchase.create({
        data: {
          note: data.note?.trim() || null,
          totalCost,
          totalProfit,
          totalUnits: lines.reduce((n, l) => n + l.quantity, 0),
          items: { create: lines },
        },
      });
      for (const p of toValidate) {
        await tx.product.update({ where: { id: p.id }, data: { reviewStatus: "VALIDATED", reviewedAt: new Date() } });
        await tx.changeLog.create({ data: { entity: "Product", entityId: p.id, action: "REVIEW_STATUS", before: { reviewStatus: p.reviewStatus }, after: { reviewStatus: "VALIDATED", via: "purchase" } } });
      }
      await tx.changeLog.create({ data: { entity: "Purchase", entityId: created.id, action: "CREATE", after: json({ items: lines.length, totalCost, totalProfit }) } });
      return created;
    });
    refresh();
    return { ok: true, purchaseId: purchase.id };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? "Panier invalide" : e instanceof Error ? e.message : "Erreur" };
  }
}

/** Annule une commande (conservée dans l'historique, exclue des totaux et de l'export par défaut). */
export async function cancelPurchase(id: string, cancel = true): Promise<ActionResult> {
  try {
    await guard();
    await prisma.$transaction([
      prisma.purchase.update({ where: { id }, data: { cancelledAt: cancel ? new Date() : null } }),
      prisma.changeLog.create({ data: { entity: "Purchase", entityId: id, action: cancel ? "CANCEL" : "RESTORE" } }),
    ]);
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur" };
  }
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
