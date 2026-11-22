// Mise à jour des leads depuis Keepa (tâche planifiée Railway, toutes les 15 minutes) : `npm run keepa:cron`
// Dépense les jetons Keepa disponibles ; les leads restants passent au prochain passage.
import { prisma } from "../src/lib/prisma";
import { runKeepa } from "../src/lib/keepaSync";

runKeepa({ trigger: process.argv.includes("--cron") ? "CRON" : "CLI" })
  .then(async (r) => {
    console.log(JSON.stringify(r));
    await prisma.$disconnect();
    process.exit(r.status === "FAILED" ? 1 : 0);
  })
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
