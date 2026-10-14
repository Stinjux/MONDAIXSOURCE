// Rappel de la Weekly Review (tâche planifiée Railway, ex. dimanche 9 h) : `npm run reminder`
import { sendReminder } from "../src/lib/reminder";
import { prisma } from "../src/lib/prisma";

sendReminder()
  .then(async (r) => {
    console.log(r.text);
    console.log(r.sent ? "Rappel envoyé." : `Rappel non envoyé : ${"reason" in r ? r.reason : ""}`);
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
