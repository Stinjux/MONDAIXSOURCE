// Sauvegardes complètes de la base : toutes les tables, lues dans un instantané cohérent,
// stockées en JSON compressé dans la table DataBackup. La liste des tables est lue dans la
// base elle-même : une table ajoutée plus tard est sauvegardée sans modifier ce fichier.
// La restauration n'écrit que dans une base VIDE : elle n'écrase jamais de données.
import { gunzipSync, gzipSync } from "node:zlib";
import type { PrismaClient } from "@prisma/client";

export type BackupReason = "DEPLOY" | "DAILY" | "MANUAL";
export const BACKUP_REASON_LABELS: Record<BackupReason, string> = { DEPLOY: "Déploiement", DAILY: "Quotidienne", MANUAL: "Manuelle" };

const BACKUP_TABLE = "DataBackup";
/** Sauvegardes quotidiennes conservées (les sauvegardes de déploiement et manuelles sont toutes gardées). */
export const DAILY_KEEP = 90;
const DAY_MS = 24 * 3600 * 1000;

export type Dump = { format: "mondaix-backup"; version: 1; createdAt: string; tables: Record<string, Record<string, unknown>[]> };

type Db = Pick<PrismaClient, "$queryRaw" | "$queryRawUnsafe" | "$executeRawUnsafe" | "$transaction" | "dataBackup">;

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function tableNames(db: Pick<PrismaClient, "$queryRaw">): Promise<string[]> {
  const rows = await db.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
    ORDER BY table_name`;
  return rows.map((r) => r.table_name).filter((t) => t !== BACKUP_TABLE && !t.startsWith("_prisma"));
}

export async function backupTableExists(db: Pick<PrismaClient, "$queryRaw">): Promise<boolean> {
  const rows = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ${BACKUP_TABLE}`;
  return Number(rows[0]?.n ?? 0) > 0;
}

/** Copie de toutes les tables, lue dans une seule transaction (instantané cohérent). */
export async function dumpDatabase(db: Db, now = new Date()): Promise<Dump> {
  const tables = await db.$transaction(
    async (tx) => {
      const out: Dump["tables"] = {};
      for (const t of await tableNames(tx)) {
        const [row] = await tx.$queryRawUnsafe<{ rows: Record<string, unknown>[] }[]>(`SELECT coalesce(json_agg(t), '[]'::json) AS rows FROM ${quote(t)} t`);
        out[t] = row.rows;
      }
      return out;
    },
    { isolationLevel: "RepeatableRead", timeout: 300_000, maxWait: 30_000 },
  );
  return { format: "mondaix-backup", version: 1, createdAt: now.toISOString(), tables };
}

export const encodeDump = (dump: Dump): Buffer => gzipSync(JSON.stringify(dump));

export function decodeDump(data: Uint8Array): Dump {
  const dump = JSON.parse(gunzipSync(data).toString("utf8")) as Dump;
  if (dump?.format !== "mondaix-backup" || typeof dump.tables !== "object") throw new Error("Fichier de sauvegarde MONDAIX invalide");
  return dump;
}

export const rowCounts = (dump: Dump) => Object.fromEntries(Object.entries(dump.tables).map(([t, rows]) => [t, rows.length]));

/** Crée et enregistre une sauvegarde. Les sauvegardes quotidiennes au-delà de DAILY_KEEP sont retirées (jamais les autres). */
export async function createBackup(db: Db, reason: BackupReason, now = new Date()) {
  const dump = await dumpDatabase(db, now);
  const data = encodeDump(dump);
  const backup = await db.dataBackup.create({
    data: { reason, createdAt: now, tables: rowCounts(dump), sizeBytes: data.length, data: new Uint8Array(data) },
    select: { id: true, createdAt: true, reason: true, tables: true, sizeBytes: true },
  });
  if (reason === "DAILY") {
    const old = await db.dataBackup.findMany({ where: { reason: "DAILY" }, orderBy: { createdAt: "desc" }, skip: DAILY_KEEP, select: { id: true } });
    if (old.length) await db.dataBackup.deleteMany({ where: { id: { in: old.map((b) => b.id) } } });
  }
  return backup;
}

/** Sauvegarde quotidienne : seulement si aucune sauvegarde n'a été faite depuis 23 h. */
export async function ensureDailyBackup(db: Db, now = new Date()) {
  if (!(await backupTableExists(db))) return null; // schéma pas encore déployé
  const recent = await db.dataBackup.findFirst({ where: { createdAt: { gt: new Date(now.getTime() - DAY_MS + 3600_000) } }, select: { id: true } });
  return recent ? null : createBackup(db, "DAILY", now);
}

/** Ordre d'insertion : les tables référencées par une clé étrangère d'abord. */
async function insertOrder(db: Pick<PrismaClient, "$queryRaw">, tables: string[]): Promise<string[]> {
  const fks = await db.$queryRaw<{ child: string; parent: string }[]>`
    SELECT tc.table_name AS child, ccu.table_name AS parent
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = current_schema()`;
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (t: string, path: Set<string>) => {
    if (seen.has(t) || path.has(t)) return;
    path.add(t);
    for (const fk of fks) if (fk.child === t && fk.parent !== t && tables.includes(fk.parent)) visit(fk.parent, path);
    seen.add(t);
    order.push(t);
  };
  for (const t of tables) visit(t, new Set());
  return order;
}

/**
 * Restaure une sauvegarde dans une base dont le schéma est déjà créé (`prisma db push`) et
 * dont toutes les tables sont vides. Refuse sinon : aucune donnée existante n'est écrasée.
 * Une colonne ajoutée après la sauvegarde reçoit sa valeur par défaut.
 */
export async function restoreDatabase(db: Db, dump: Dump) {
  const existing = await tableNames(db);
  const unknown = Object.keys(dump.tables).filter((t) => !existing.includes(t) && dump.tables[t].length > 0);
  if (unknown.length) throw new Error(`Tables absentes du schéma : ${unknown.join(", ")} — lancez d'abord « npx prisma db push »`);
  const tables = Object.keys(dump.tables).filter((t) => existing.includes(t));
  for (const t of existing) {
    const [row] = await db.$queryRawUnsafe<{ any: boolean }[]>(`SELECT EXISTS (SELECT 1 FROM ${quote(t)}) AS any`);
    if (row.any) throw new Error(`La table ${t} contient déjà des données : la restauration se fait uniquement dans une base vide`);
  }
  const order = await insertOrder(db, tables);
  await db.$transaction(
    async (tx) => {
      for (const t of order) {
        const rows = dump.tables[t];
        if (!rows.length) continue;
        const cols = await tx.$queryRaw<{ column_name: string }[]>`
          SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ${t}`;
        const present = new Set(rows.flatMap((r) => Object.keys(r)));
        const list = cols.map((c) => c.column_name).filter((c) => present.has(c)).map(quote).join(", ");
        await tx.$executeRawUnsafe(`INSERT INTO ${quote(t)} (${list}) SELECT ${list} FROM json_populate_recordset(NULL::${quote(t)}, $1::json)`, JSON.stringify(rows));
      }
    },
    { timeout: 600_000, maxWait: 30_000 },
  );
  return rowCounts(dump);
}
