// Synchronisation en ligne de commande (tâche planifiée Railway) : `npm run sync`
import { syncAll } from "../src/lib/sync/engine";
import { prisma } from "../src/lib/prisma";
import { ensureDailyBackup } from "../src/lib/backup";

syncAll({ trigger: process.argv.includes("--cron") ? "CRON" : "CLI" })
  .then(async (results) => {
    console.log(JSON.stringify(results, null, 2));
    // Une sauvegarde par jour, faite par la tâche planifiée
    let backupFailed = false;
    if (process.argv.includes("--cron")) {
      try {
        const b = await ensureDailyBackup(prisma);
        if (b) console.log(`Sauvegarde quotidienne ${b.id} (${(b.sizeBytes / 1024).toFixed(0)} Ko)`);
      } catch (e) {
        backupFailed = true;
        console.error("Sauvegarde quotidienne impossible :", e);
      }
    }
    await prisma.$disconnect();
    process.exit(results.some((r) => r.status === "FAILED") || backupFailed ? 1 : 0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
