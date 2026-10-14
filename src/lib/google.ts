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

/** Lit toutes les lignes d'une Sheet (valeurs formatées, comme affichées). */
export async function readSheet(source: SheetSource): Promise<string[][]> {
  const { id, range, idVar } = sheetConfig(source);
  if (!id) throw new Error(`${idVar} manquant dans les variables Railway`);
  const auth = new google.auth.GoogleAuth({ credentials: credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  const api = google.sheets({ version: "v4", auth });
  try {
    const response = await api.spreadsheets.values.get({ spreadsheetId: id, range, valueRenderOption: "FORMATTED_VALUE" });
    return (response.data.values ?? []).map((row) => row.map((c) => (c == null ? "" : String(c))));
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
      throw new Error(`Plage invalide pour ${source} (« ${range} ») : vérifiez le nom de l'onglet`);
    }
    throw e;
  }
}
