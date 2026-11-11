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
import { setNoteTemplates, setTaxConfig } from "@/lib/settings";
import { cleanTags, type NoteTemplates } from "@/lib/noteTemplates";
import { DOC_KINDS } from "@/lib/documents";
import { loadProducts } from "@/lib/queries";
import { toDecisionRows } from "@/lib/decisionRows";
import { preliminaryProfit } from "@/lib/profit";
import { createBackup } from "@/lib/backup";
import { FRESH_DAYS } from "@/lib/freshness";

async function guard() {
  if (!(await isAdmin())) throw new Error("Session expirée : reconnectez-vous");
}

const refresh = () => revalidatePath("/", "layout");

const money = z.number().finite().min(0).max(1_000_000).nullable();

const reviewSchema = z.object({
  productId: z.string().min(1),
  status: z.enum(REVIEW_STATUSES),
  notes: z.string().max(5000).nullable(),
  /** Motifs (modèles de notes) ; absent = inchangés */
  tags: z.array(z.string().max(40)).max(20).optional(),
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
      reviewTags: product.reviewTags,
      reviewChecklist: product.reviewChecklist,
      verifiedSalePrice: product.verifiedSalePrice,
      verifiedFbaFee: product.verifiedFbaFee,
      restriction: product.restriction,
    };
    const after = {
      reviewStatus: data.status,
      reviewNotes: data.notes?.trim() || null,
      reviewTags: data.tags ? cleanTags(data.tags) : product.reviewTags,
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

/** Note et motifs d'un lead (modèles de notes) ; journalisé, comme toute modification de revue. */
export async function saveLeadNotes(productId: string, notes: string | null, tags: string[]): Promise<ActionResult> {
  try {
    await guard();
    const nextNotes = z.string().max(5000).nullable().parse(notes)?.trim() || null;
    const nextTags = cleanTags(tags);
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { reviewNotes: true, reviewTags: true } });
    if (!product) return { ok: false, error: "Lead introuvable" };
    if (product.reviewNotes === nextNotes && JSON.stringify(product.reviewTags) === JSON.stringify(nextTags)) return { ok: true };
    await prisma.$transaction([
      prisma.product.update({ where: { id: productId }, data: { reviewNotes: nextNotes, reviewTags: nextTags } }),
      prisma.changeLog.create({
        data: { entity: "Product", entityId: productId, action: "REVIEW", before: json({ reviewNotes: product.reviewNotes, reviewTags: product.reviewTags }), after: json({ reviewNotes: nextNotes, reviewTags: nextTags }) },
      }),
    ]);
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? "Note trop longue" : e instanceof Error ? e.message : "Erreur" };
  }
}

export async function saveNoteTemplates(templates: NoteTemplates): Promise<ActionResult> {
  try {
    await guard();
    await setNoteTemplates(templates);
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur" };
  }
}

/** Change le statut de plusieurs leads (actions groupées) ; renvoie l'ancien statut de chacun pour pouvoir annuler. */
export async function setReviewStatusMany(ids: string[], status: string): Promise<{ ok: true; changed: { id: string; before: string }[] } | { ok: false; error: string }> {
  try {
    await guard();
    const parsed = z.enum(REVIEW_STATUSES).parse(status);
    const list = z.array(z.string().min(1)).min(1).max(500).parse(ids);
    const products = await prisma.product.findMany({ where: { id: { in: list } }, select: { id: true, reviewStatus: true } });
    const changed = products.filter((p) => p.reviewStatus !== parsed).map((p) => ({ id: p.id, before: p.reviewStatus }));
    if (changed.length) {
      const now = new Date();
      await prisma.$transaction([
        prisma.product.updateMany({ where: { id: { in: changed.map((c) => c.id) } }, data: { reviewStatus: parsed, reviewedAt: parsed === "TO_REVIEW" ? null : now } }),
        prisma.changeLog.createMany({
          data: changed.map((c) => ({ entity: "Product", entityId: c.id, action: "REVIEW_STATUS", before: { reviewStatus: c.before }, after: { reviewStatus: parsed, via: "bulk" } })),
        }),
      ]);
    }
    refresh();
    return { ok: true, changed };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? "Sélection invalide" : e instanceof Error ? e.message : "Erreur" };
  }
}

// --- Section COGS : documents et achats saisis à la main ---

const refreshCogs = () => revalidatePath("/cogs", "layout");

/** Archive (ou rétablit) un document : il n'est jamais supprimé. */
export async function archiveDocument(id: string, archived = true): Promise<ActionResult> {
  try {
    await guard();
    const doc = await prisma.productDocument.findUnique({ where: { id }, select: { archivedAt: true } });
    if (!doc) return { ok: false, error: "Document introuvable" };
    const archivedAt = archived ? new Date() : null;
    await prisma.$transaction([
      prisma.productDocument.update({ where: { id }, data: { archivedAt } }),
      prisma.changeLog.create({ data: { entity: "ProductDocument", entityId: id, action: archived ? "CANCEL" : "RESTORE", before: json({ archivedAt: doc.archivedAt }), after: json({ archivedAt }) } }),
    ]);
    refreshCogs();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur" };
  }
}

const docUpdateSchema = z.object({ kind: z.enum(DOC_KINDS).optional(), purchaseId: z.string().min(1).nullable().optional(), note: z.string().max(500).nullable().optional() });

export async function updateDocument(id: string, patch: z.input<typeof docUpdateSchema>): Promise<ActionResult> {
  try {
    await guard();
    const data = docUpdateSchema.parse(patch);
    const doc = await prisma.productDocument.findUnique({ where: { id }, select: { kind: true, purchaseId: true, note: true } });
    if (!doc) return { ok: false, error: "Document introuvable" };
    await prisma.$transaction([
      prisma.productDocument.update({ where: { id }, data: { ...data, note: data.note === undefined ? undefined : data.note?.trim() || null } }),
      prisma.changeLog.create({ data: { entity: "ProductDocument", entityId: id, action: "UPDATE", before: json(doc), after: json(data) } }),
    ]);
    refreshCogs();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? "Données invalides" : e instanceof Error ? e.message : "Erreur" };
  }
}

const manualPurchaseSchema = z.object({
  asin: z.string().regex(/^[A-Z0-9]{10}$/i),
  orderedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.number().int().min(1).max(100_000),
  unitCost: z.number().finite().min(0).max(1_000_000),
  supplierName: z.string().max(120).nullable(),
  note: z.string().max(500).nullable(),
});

/** Achat saisi à la main (hors panier) : enregistré comme une commande, marquée « MANUAL ». */
export async function addManualPurchase(input: z.input<typeof manualPurchaseSchema>): Promise<ActionResult> {
  try {
    await guard();
    const data = manualPurchaseSchema.parse(input);
    const asin = data.asin.toUpperCase();
    const product = await prisma.product.findUnique({ where: { asin }, select: { id: true, name: true } });
    const known = await prisma.purchaseItem.findFirst({ where: { asin }, select: { name: true } });
    const name = product?.name ?? known?.name;
    if (!name) return { ok: false, error: "ASIN inconnu dans MONDAIX" };
    const orderedAt = new Date(`${data.orderedAt}T12:00:00`);
    const totalCost = Math.round(data.quantity * data.unitCost * 100) / 100;
    const created = await prisma.purchase.create({
      data: {
        createdAt: orderedAt,
        source: "MANUAL",
        note: data.note?.trim() || null,
        totalCost,
        totalUnits: data.quantity,
        items: { create: [{ productId: product?.id ?? null, asin, name, supplierName: data.supplierName?.trim() || null, quantity: data.quantity, unitCost: data.unitCost }] },
      },
    });
    await prisma.changeLog.create({ data: { entity: "Purchase", entityId: created.id, action: "CREATE", after: json({ source: "MANUAL", asin, quantity: data.quantity, unitCost: data.unitCost, totalCost }) } });
    refreshCogs();
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? "Achat invalide : vérifiez la date, la quantité et le coût" : e instanceof Error ? e.message : "Erreur" };
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

const optMoney = money.optional();
const reconfirmSchema = z.object({
  productId: z.string().min(1),
  /** Champ absent = valeur inchangée */
  verifiedSalePrice: optMoney,
  verifiedFbaFee: optMoney,
  offers: z
    .array(z.object({ id: z.string().min(1), verifiedCostPrice: optMoney, verifiedAvailability: z.enum(["IN_STOCK", "OUT_OF_STOCK"]).nullable().optional() }))
    .max(50)
    .default([]),
});
export type ReconfirmInput = z.input<typeof reconfirmSchema>;

/**
 * Reconfirme un lead (écran « À reconfirmer ») : ses données repartent pour 30 jours.
 * Sans changement, seule la date de reconfirmation est enregistrée ; les valeurs modifiées
 * sont stockées comme valeurs vérifiées (les valeurs importées restent intactes).
 */
export async function reconfirmLead(input: ReconfirmInput): Promise<ActionResult> {
  try {
    await guard();
    const data = reconfirmSchema.parse(input);
    const now = new Date();
    const product = await prisma.product.findUnique({ where: { id: data.productId }, include: { offers: true } });
    if (!product) return { ok: false, error: "Lead introuvable" };

    const changed: Partial<Record<"verifiedSalePrice" | "verifiedFbaFee", number | null>> = {};
    if (data.verifiedSalePrice !== undefined && data.verifiedSalePrice !== product.verifiedSalePrice) changed.verifiedSalePrice = data.verifiedSalePrice;
    if (data.verifiedFbaFee !== undefined && data.verifiedFbaFee !== product.verifiedFbaFee) changed.verifiedFbaFee = data.verifiedFbaFee;
    const before = Object.fromEntries((Object.keys(changed) as (keyof typeof changed)[]).map((k) => [k, product[k]]));

    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.product.update({ where: { id: product.id }, data: { ...changed, confirmedAt: now, verifiedAt: Object.keys(changed).length ? now : undefined } }),
      prisma.changeLog.create({ data: { entity: "Product", entityId: product.id, action: "CONFIRM", before: json({ ...before, confirmedAt: product.confirmedAt }), after: json({ ...changed, confirmedAt: now }) } }),
    ];
    for (const o of data.offers) {
      const offer = product.offers.find((x) => x.id === o.id);
      if (!offer) continue;
      const cost = o.verifiedCostPrice !== undefined && o.verifiedCostPrice !== offer.verifiedCostPrice ? o.verifiedCostPrice : undefined;
      const availability = o.verifiedAvailability !== undefined && o.verifiedAvailability !== offer.verifiedAvailability ? o.verifiedAvailability : undefined;
      if (cost === undefined && availability === undefined) continue;
      const after = { verifiedCostPrice: cost === undefined ? offer.verifiedCostPrice : cost, verifiedAvailability: availability === undefined ? offer.verifiedAvailability : availability };
      ops.push(
        prisma.supplierOffer.update({ where: { id: offer.id }, data: { ...after, verifiedAt: now } }),
        prisma.changeLog.create({
          data: { entity: "SupplierOffer", entityId: offer.id, action: "VERIFY", before: json({ verifiedCostPrice: offer.verifiedCostPrice, verifiedAvailability: offer.verifiedAvailability }), after: json(after) },
        }),
      );
      if (availability) ops.push(prisma.stockCheck.create({ data: { offerId: offer.id, origin: "MANUAL", status: availability, checkedAt: now, detail: "Reconfirmation" } }));
    }
    await prisma.$transaction(ops);
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? "Données invalides" : e instanceof Error ? e.message : "Erreur" };
  }
}

export async function createManualBackup(): Promise<ActionResult> {
  try {
    await guard();
    await createBackup(prisma, "MANUAL");
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sauvegarde impossible" };
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
      if (row.fresh.state === "STALE") return { ok: false, error: `${row.asin} : données de plus de ${FRESH_DAYS} jours, reconfirmez-le avant d'acheter.` };
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
