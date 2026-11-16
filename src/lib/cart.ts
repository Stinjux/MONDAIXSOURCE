// Panier d'achat : lecture d'ASIN collés et export CSV (fonctions pures, testées).

export type PastedLine = { asin: string; quantity: number };

const ASIN_IN_URL = /\/(?:dp|gp\/product|product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#\s]|$)/i;
const ASIN_TOKEN = /^[A-Z0-9]{10}$/;

/**
 * Lit un texte collé : une ligne par produit, ASIN (ou lien Amazon) suivi d'une quantité optionnelle.
 * Séparateurs acceptés : espace, tabulation (copie depuis Sheets), virgule, point-virgule, « x ».
 * Exemples : « B0ABC12345 5 », « B0ABC12345,5 », « B0ABC12345 x5 », « https://amazon.ca/dp/B0ABC12345 2 ».
 * Un même ASIN répété voit ses quantités additionnées. Les lignes illisibles sont retournées à part.
 */
export function parsePastedAsins(text: string): { lines: PastedLine[]; invalid: string[] } {
  const totals = new Map<string, number>();
  const invalid: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const fromUrl = line.match(ASIN_IN_URL)?.[1]?.toUpperCase();
    const rest = fromUrl ? line.replace(/\S*amazon\S*/i, " ") : line;
    const tokens = rest.split(/[\s,;\t]+/).filter(Boolean);
    let asin = fromUrl ?? null;
    let quantity: number | null = null;
    for (const t of tokens) {
      const up = t.toUpperCase();
      if (!asin && ASIN_TOKEN.test(up) && /[A-Z]/.test(up)) {
        asin = up;
        continue;
      }
      const q = t.match(/^x?(\d{1,6})x?$/i);
      if (q && quantity == null) quantity = Number(q[1]);
    }
    if (!asin) {
      invalid.push(line);
      continue;
    }
    const qty = quantity && quantity > 0 ? quantity : 1;
    totals.set(asin, (totals.get(asin) ?? 0) + qty);
  }
  return { lines: [...totals].map(([asin, quantity]) => ({ asin, quantity })), invalid };
}

/** CSV compatible Excel / Google Sheets (BOM UTF-8, séparateur virgule, guillemets échappés). */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    if (v == null) return "";
    const s = typeof v === "number" ? String(Math.round(v * 100) / 100) : v;
    return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}
