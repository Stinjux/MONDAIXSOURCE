// Synchronisation en ligne de commande (tâche planifiée Railway) : `npm run sync`
import { syncAll } from "../src/lib/sync/engine";
import { prisma } from "../src/lib/prisma";

syncAll({ trigger: process.argv.includes("--cron") ? "CRON" : "CLI" })
  .then(async (results) => {
    console.log(JSON.stringify(results, null, 2));
    await prisma.$disconnect();
    process.exit(results.some((r) => r.status === "FAILED") ? 1 : 0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
