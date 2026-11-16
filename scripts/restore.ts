// Restauration d'une sauvegarde téléchargée (Settings → Sauvegardes) dans une base VIDE :
//   DATABASE_URL=<nouvelle base> npx prisma db push
//   DATABASE_URL=<nouvelle base> npm run restore -- mondaix-sauvegarde-….json.gz
// Le script refuse d'écrire dans une base qui contient déjà des données.
import { readFileSync } from "node:fs";
import { decodeDump, restoreDatabase } from "../src/lib/backup";
import { prisma } from "../src/lib/prisma";

const file = process.argv[2];
if (!file) {
  console.error("Usage : npm run restore -- <fichier .json.gz>");
  process.exit(1);
}

restoreDatabase(prisma, decodeDump(readFileSync(file)))
  .then(async (counts) => {
    for (const [t, n] of Object.entries(counts)) console.log(`${t.padEnd(16)} ${n}`);
    console.log("Restauration terminée.");
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Restauration refusée :", e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
