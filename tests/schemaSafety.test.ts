import test from "node:test";
import assert from "node:assert/strict";
import { destructiveStatements } from "../src/lib/schemaSafety";

test("schéma : les ajouts sont acceptés", () => {
  const sql = `-- CreateTable
CREATE TABLE "DataBackup" ("id" TEXT NOT NULL, "reason" TEXT NOT NULL, CONSTRAINT "DataBackup_pkey" PRIMARY KEY ("id"));

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "aiSummary" TEXT,
ADD COLUMN "aiScore" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "DataBackup_createdAt_idx" ON "DataBackup"("createdAt");
`;
  assert.deepEqual(destructiveStatements(sql), []);
});

test("schéma : suppressions, changements de type et colonnes obligatoires refusés", () => {
  const sql = `-- AlterTable
ALTER TABLE "Purchase" DROP COLUMN "note";

-- AlterTable
ALTER TABLE "Purchase" ALTER COLUMN "totalUnits" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "amazonUrl" SET NOT NULL;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "category" TEXT NOT NULL;

-- DropTable
DROP TABLE "StockCheck";
`;
  assert.deepEqual(
    destructiveStatements(sql).map((f) => f.reason),
    [
      "suppression d'une colonne (un renommage est aussi une suppression)",
      "changement de type d'une colonne",
      "colonne existante rendue obligatoire",
      "nouvelle colonne obligatoire sans valeur par défaut",
      "suppression d'une table",
    ],
  );
});
