import { google } from "googleapis";
import type { SheetSource } from "./normalize";

const DEFAULT_RANGE: Record<SheetSource, string> = { LEADS: "A:J", OUT_OF_STOCK: "A:P" };

export function sheetConfig(source: SheetSource) {
  const prefix = source === "LEADS" ? "LEADS" : "OOS";
  return {
    id: process.env[`${prefix}_SHEET_ID`]?.trim(),
    range: process.env[`${prefix}_SHEET_RANGE`]?.trim() || DEFAULT_RANGE[source],
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
    if (status === 404) throw new Error(`Sheet ${source} introuvable : vérifiez ${idVar}`);
    if (status === 400) throw new Error(`Plage invalide pour ${source} (« ${range} ») : vérifiez le nom de l'onglet`);
    throw e;
  }
}
