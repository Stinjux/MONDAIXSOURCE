// Détecte, dans le SQL généré par `prisma migrate diff`, les changements de schéma qui
// effaceraient ou altéreraient des données déjà stockées (fonction pure, testée).

const RULES: { pattern: RegExp; reason: string }[] = [
  { pattern: /^DROP TABLE/i, reason: "suppression d'une table" },
  { pattern: /DROP COLUMN/i, reason: "suppression d'une colonne (un renommage est aussi une suppression)" },
  { pattern: /ALTER COLUMN .* (SET DATA )?TYPE/i, reason: "changement de type d'une colonne" },
  { pattern: /ALTER COLUMN .* SET NOT NULL/i, reason: "colonne existante rendue obligatoire" },
  { pattern: /^DROP TYPE/i, reason: "suppression d'un type (valeurs d'énumération)" },
  { pattern: /^ALTER TYPE .* RENAME/i, reason: "modification d'une énumération" },
  { pattern: /^TRUNCATE|^DELETE FROM/i, reason: "suppression de lignes" },
];

/** Instructions destructrices trouvées, avec la raison. Tableau vide = changement sûr. */
export function destructiveStatements(sql: string): { statement: string; reason: string }[] {
  const out: { statement: string; reason: string }[] = [];
  for (const raw of sql.split(/;\s*\n/)) {
    const statement = raw.replace(/^\s*--.*$/gm, "").replace(/\s+/g, " ").trim();
    if (!statement) continue;
    const rule = RULES.find((r) => r.pattern.test(statement));
    if (rule) out.push({ statement, reason: rule.reason });
    // Nouvelle colonne obligatoire sans valeur par défaut : impossible sur une table remplie
    else if (/ADD COLUMN .* NOT NULL/i.test(statement) && !/DEFAULT/i.test(statement))
      out.push({ statement, reason: "nouvelle colonne obligatoire sans valeur par défaut" });
  }
  return out;
}
