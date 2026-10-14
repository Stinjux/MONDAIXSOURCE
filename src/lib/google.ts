import { google } from "googleapis";
import type { SheetSource } from "./normalize";

const DEFAULT_RANGE: Record<SheetSource, string> = { LEADS: "A:J", OUT_OF_STOCK: "A:P" };

const unquote = (v: string | undefined) => v?.trim().replace(/^(["'])(.*)\1$/, "$2").trim() || undefined;

/**
 * ID d'une Google Sheet. Accepte l'ID seul ou l'URL complète collée par erreur
 * (https://docs.google.com/spreadsheets/d/<ID>/edit#gid=0).
 */
export function parseSheetId(value: string | undefined): string | undefined {
  const v = unquote(value);
  if (!v) return undefined;
  const fromUrl = v.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (fromUrl) return fromUrl[1];
  return v.replace(/[/?#].*$/, "");
}

export function sheetConfig(source: SheetSource) {
  const prefix = source === "LEADS" ? "LEADS" : "OOS";
  return {
    id: parseSheetId(process.env[`${prefix}_SHEET_ID`]),
    range: unquote(process.env[`${prefix}_SHEET_RANGE`]) || DEFAULT_RANGE[source],
    idVar: `${prefix}_SHEET_ID`,
  };
}

function credentials() {
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  if (!encoded) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 manquant dans les variables Railway");
  let json: { client_email?: string; private_key?: string };
  try {
    const text = encoded.startsWith("{") ? encoded : Buffer.from(encoded, "base64").toString("utf8");
    json = JSON.parse(text);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 illisible : encodez le fichier JSON du compte de service en base64");
  }
  if (!json.client_email || !json.private_key) throw new Error("Clé de compte de service incomplète (client_email / private_key)");
  return { ...json, private_key: json.private_key.replace(/\\n/g, "\n") };
}

const quoteTab = (title: string) => `'${title.replace(/'/g, "''")}'`;
const looseName = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();

/**
 * Corrige une plage dont l'onglet n'existe pas, à partir des onglets réels du fichier :
 * même nom à la casse / aux accents / aux espaces près, ou onglet unique.
 * Retourne null si le choix serait ambigu.
 */
export function resolveRange(range: string, tabs: string[]): string | null {
  const bang = range.lastIndexOf("!");
  const cols = bang >= 0 ? range.slice(bang + 1) : range;
  const wanted = bang >= 0 ? range.slice(0, bang).replace(/^'(.*)'$/, "$1").replace(/''/g, "'") : "";
  const match = wanted ? tabs.find((t) => looseName(t) === looseName(wanted)) : undefined;
  if (match) return `${quoteTab(match)}!${cols}`;
  if (tabs.length === 1) return `${quoteTab(tabs[0])}!${cols}`;
  return null;
}

/** Lit toutes les lignes d'une Sheet (valeurs formatées, comme affichées). */
export async function readSheet(source: SheetSource): Promise<string[][]> {
  const { id, range, idVar } = sheetConfig(source);
  if (!id) throw new Error(`${idVar} manquant dans les variables Railway`);
  const auth = new google.auth.GoogleAuth({ credentials: credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  const api = google.sheets({ version: "v4", auth });
  const read = async (r: string) => {
    const response = await api.spreadsheets.values.get({ spreadsheetId: id, range: r, valueRenderOption: "FORMATTED_VALUE" });
    return (response.data.values ?? []).map((row) => row.map((c) => (c == null ? "" : String(c))));
  };
  try {
    return await read(range);
  } catch (e) {
    const status = (e as { code?: number }).code;
    if (status === 403) throw new Error(`Accès refusé à la Sheet ${source} : partagez-la en lecture avec le client_email du compte de service`);
    if (status === 404)
      throw new Error(
        `Sheet ${source} introuvable (ID « ${id} ») : vérifiez ${idVar}. Si le fichier est un Excel (.xlsx) importé dans Drive, ouvrez-le puis Fichier → Enregistrer au format Google Sheets et utilisez l'ID du nouveau fichier.`,
      );
    if (status === 400) {
      const msg = String((e as { message?: string }).message ?? "");
      if (/not supported for this document/i.test(msg))
        throw new Error(`Le fichier ${source} est un Excel (.xlsx), pas une Google Sheet : ouvrez-le puis Fichier → Enregistrer au format Google Sheets, et utilisez l'ID du nouveau fichier.`);
      // Onglet introuvable : on lit les onglets réels du fichier pour corriger ou guider.
      const meta = await api.spreadsheets.get({ spreadsheetId: id, fields: "sheets.properties.title" });
      const tabs = (meta.data.sheets ?? []).map((sh) => sh.properties?.title ?? "").filter(Boolean);
      const fixed = resolveRange(range, tabs);
      if (fixed && fixed !== range) return await read(fixed);
      const cols = range.slice(range.lastIndexOf("!") + 1);
      const rangeVar = source === "LEADS" ? "LEADS_SHEET_RANGE" : "OOS_SHEET_RANGE";
      throw new Error(
        `Onglet introuvable pour ${source} (« ${range} »). Onglets de ce fichier : ${tabs.map((t) => `« ${t} »`).join(", ")}. ` +
          `Mettez par exemple ${rangeVar} = ${quoteTab(tabs[0] ?? "Feuille 1")}!${cols}`,
      );
    }
    throw e;
  }
}
