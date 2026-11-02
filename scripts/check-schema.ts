// Garde-fou : refuse toute modification de prisma/schema.prisma qui effacerait des données.
// Compare le schéma actuel à des versions précédentes (git) :
//   npm run check:schema                 → compare à la branche distante suivie et au dernier commit
//   npm run check:schema -- <commit>     → compare à ce commit (utilisé par la CI)
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { destructiveStatements } from "../src/lib/schemaSafety";

const SCHEMA = "prisma/schema.prisma";
const given = process.argv[2] && !/^0+$/.test(process.argv[2]) ? process.argv[2] : null;
const refs = given ? [given, "HEAD~1"] : ["@{upstream}", "HEAD"];

const bases = new Map<string, string>(); // contenu du schéma → référence
for (const ref of refs) {
  try {
    const content = execFileSync("git", ["show", `${ref}:${SCHEMA}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    if (!bases.has(content)) bases.set(content, ref);
    if (given) break; // le commit donné suffit ; HEAD~1 seulement s'il est introuvable
  } catch {
    // référence absente (nouvelle branche, historique court) : on essaie la suivante
  }
}
if (!bases.size) {
  console.log("Aucune version précédente du schéma trouvée : vérification ignorée.");
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), "mondaix-schema-"));
let refused = false;
for (const [previous, base] of bases) {
  const file = join(dir, "previous.prisma");
  writeFileSync(file, previous);
  const sql = execFileSync("npx", ["prisma", "migrate", "diff", "--from-schema-datamodel", file, "--to-schema-datamodel", SCHEMA, "--script"], { encoding: "utf8" });
  const found = destructiveStatements(sql);
  if (found.length) {
    refused = true;
    console.error(`Modification du schéma REFUSÉE (comparé à ${base}) : elle effacerait ou altérerait des données existantes.\n`);
    for (const f of found) console.error(`  • ${f.reason}\n    ${f.statement}\n`);
  } else console.log(`Schéma sûr (comparé à ${base}) : aucune donnée existante ne peut être effacée.`);
}
if (refused) {
  console.error("Ajoutez plutôt une nouvelle colonne facultative (ou avec valeur par défaut) et gardez l'ancienne.");
  process.exit(1);
}
