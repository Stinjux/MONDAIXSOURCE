// Sauvegarde complète de la base : `npm run backup` (manuelle) ou `npm run backup -- --reason DEPLOY`.
// Lancée avant chaque démarrage d'une nouvelle version (commande de pré-déploiement Railway).
import { createBackup, type BackupReason } from "../src/lib/backup";
import { prisma } from "../src/lib/prisma";

const i = process.argv.indexOf("--reason");
const reason = (i > 0 ? process.argv[i + 1] : "MANUAL") as BackupReason;

createBackup(prisma, ["DEPLOY", "DAILY", "MANUAL"].includes(reason) ? reason : "MANUAL")
  .then(async (b) => {
    const rows = Object.values(b.tables as Record<string, number>).reduce((n, c) => n + c, 0);
    console.log(`Sauvegarde ${b.id} (${b.reason}) : ${rows} lignes, ${(b.sizeBytes / 1024).toFixed(0)} Ko`);
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Sauvegarde impossible :", e);
    await prisma.$disconnect();
    process.exit(1);
  });
