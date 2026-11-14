// Synchronisation de la Sheet COMMANDES -> table SupplierOrder.
//
// Garanties (comme pour LEADS / OUT OF STOCK) :
//  * Idempotente : relancer sans changement dans la Sheet ne crée rien.
//  * Insensible au tri : une ligne est identifiée par son contenu, pas par son numéro.
//  * Ne modifie ni ne supprime jamais une commande enregistrée : une ligne retirée (ou corrigée)
//    passe à present = false ; la version corrigée est ajoutée comme nouvelle commande.

import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultDb } from "../prisma";
import { readSheet, sheetConfig } from "../google";
import { config } from "../config";
import { parseSheetDate, type DateOrder } from "../dates";
import { QC_TAX_RATE, cell, isBlank, isOrderHeader, parseOrderRow, type OrderRow } from "../orders";
import type { SyncResult, Trigger } from "./engine";

export type OrdersSyncOptions = { trigger?: Trigger; read?: () => Promise<string[][]>; now?: Date; db?: PrismaClient; dateOrder?: DateOrder };

/** La Sheet COMMANDES est facultative : synchronisée seulement si ORDERS_SHEET_ID est configurée. */
export const ordersConfigured = () => !!sheetConfig("ORDERS").id;

/**
 * Identité d'une ligne : son contenu (colonnes A à E), pas sa position. Plusieurs lignes identiques
 * sont distinguées par leur rang.
 */
export function orderKeys(rows: string[][]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const content = [0, 1, 2, 3, 4].map((i) => cell(r, i).replace(/\s+/g, " ").toLowerCase()).join("␟");
    const hash = createHash("sha256").update(content).digest("hex").slice(0, 32);
    const n = (seen.get(hash) ?? 0) + 1;
    seen.set(hash, n);
    return `${hash}:${n}`;
  });
}

export async function syncOrders(opts: OrdersSyncOptions = {}): Promise<SyncResult> {
  const db = opts.db ?? defaultDb;
  const now = opts.now ?? new Date();
  const dateOrder = opts.dateOrder ?? config.dateOrder;
  const read = opts.read ?? (() => readSheet("ORDERS"));
  const counters = { rowsRead: 0, imported: 0, duplicates: 0, updated: 0, unchanged: 0, errors: 0, warnings: 0, missing: 0 };
  const issues: { sheetRow: number; severity: "ERROR" | "WARNING"; message: string; raw?: string[] }[] = [];
  const run = await db.importRun.create({ data: { source: "ORDERS", status: "RUNNING", trigger: opts.trigger ?? "CLI", startedAt: now } });
  try {
    const rows = await read();
    const m = sheetConfig("ORDERS").range.split("!").pop()!.match(/^[A-Z]*(\d+)/i);
    const firstRow = m ? Number(m[1]) : 1;

    const data = rows.map((r, i) => ({ r, sheetRow: i + firstRow })).filter(({ r }) => !isBlank(r) && !isOrderHeader(r));
    const keys = orderKeys(data.map((d) => d.r));
    const valid: { key: string; row: OrderRow; raw: string[] }[] = [];
    data.forEach(({ r, sheetRow }, i) => {
      counters.rowsRead++;
      const res = parseOrderRow(r, sheetRow);
      if (!res.ok) {
        counters.errors++;
        issues.push({ sheetRow, severity: "ERROR", message: res.error, raw: r });
        return;
      }
      for (const w of res.warnings) {
        counters.warnings++;
        issues.push({ sheetRow, severity: "WARNING", message: w });
      }
      valid.push({ key: keys[i], row: res.row, raw: r });
    });

    const existing = new Map((await db.supplierOrder.findMany({ select: { rowKey: true, present: true } })).map((o) => [o.rowKey, o]));
    const fresh = valid.filter((v) => !existing.has(v.key));
    for (const v of fresh) {
      const orderedAt = v.row.orderedText ? parseSheetDate(v.row.orderedText, { order: dateOrder, now }) : null;
      if (v.row.orderedText && !orderedAt) {
        counters.warnings++;
        issues.push({ sheetRow: v.row.sheetRow, severity: "WARNING", message: `Date de commande illisible ou future « ${v.row.orderedText} » : date d'import utilisée` });
      }
      await db.supplierOrder.create({
        data: {
          rowKey: v.key, sheetRow: v.row.sheetRow, supplierText: v.row.supplierText, supplierKey: v.row.supplierKey, supplierName: v.row.supplierName,
          supplierUrl: v.row.supplierUrl, totalPaid: v.row.totalPaid, quantity: v.row.quantity, orderedAt, orderedText: v.row.orderedText,
          emailUrl: v.row.emailUrl, taxRate: QC_TAX_RATE, firstImportedAt: now, lastImportedAt: now, firstRunId: run.id, raw: v.raw,
        },
      });
      counters.imported++;
    }
    const seen = valid.filter((v) => existing.has(v.key)).map((v) => v.key);
    counters.unchanged = seen.filter((k) => existing.get(k)!.present).length;
    counters.updated = seen.length - counters.unchanged; // lignes revenues dans la Sheet
    if (seen.length) await db.supplierOrder.updateMany({ where: { rowKey: { in: seen } }, data: { present: true, lastImportedAt: now } });
    // Lignes disparues : marquées absentes, jamais supprimées (sauf Sheet vide : rien n'est marqué)
    if (valid.length) {
      const keep = new Set(valid.map((v) => v.key));
      const gone = [...existing].filter(([k, o]) => o.present && !keep.has(k)).map(([k]) => k);
      if (gone.length) await db.supplierOrder.updateMany({ where: { rowKey: { in: gone } }, data: { present: false } });
      counters.missing = gone.length;
    }

    if (issues.length) await db.importIssue.createMany({ data: issues.map((i) => ({ runId: run.id, source: "ORDERS", sheetRow: i.sheetRow, severity: i.severity, message: i.message, raw: i.raw ?? undefined })) });
    await db.importRun.update({ where: { id: run.id }, data: { ...counters, status: "SUCCESS", finishedAt: new Date() } });
    return { source: "ORDERS", runId: run.id, status: "SUCCESS", ...counters };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    await db.importRun.update({ where: { id: run.id }, data: { ...counters, status: "FAILED", details: message, finishedAt: new Date() } });
    return { source: "ORDERS", runId: run.id, status: "FAILED", ...counters, message };
  }
}
