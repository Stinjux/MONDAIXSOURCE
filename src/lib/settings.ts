// Réglages modifiables depuis le dashboard (stockés en base, table AppSetting).
import "server-only";
import { prisma } from "./prisma";
import { DEFAULT_TAX, NO_TAX, type TaxConfig, type TaxMode } from "./profit";
import { parseTemplates, type NoteTemplates } from "./noteTemplates";
import { buildProfiles, type Profiles, type UserKey } from "./users";

const TAX_KEY = "profit.tax";
const MODES: TaxMode[] = ["NONE", "REGISTERED", "NOT_REGISTERED"];

export function parseTaxConfig(value: unknown): TaxConfig {
  if (!value || typeof value !== "object") return NO_TAX;
  const v = value as { mode?: unknown; rate?: unknown };
  const mode = MODES.includes(v.mode as TaxMode) ? (v.mode as TaxMode) : "NONE";
  const rate = typeof v.rate === "number" && Number.isFinite(v.rate) && v.rate >= 0 && v.rate <= 50 ? v.rate : 0;
  return { mode, rate };
}

export async function getTaxConfig(): Promise<TaxConfig> {
  const row = await prisma.appSetting.findUnique({ where: { key: TAX_KEY } });
  // Aucun réglage enregistré : méthode SellerAmp à 20 % (prudente)
  return row ? parseTaxConfig(row.value) : DEFAULT_TAX;
}

export async function setTaxConfig(config: TaxConfig) {
  const value = parseTaxConfig(config);
  await prisma.appSetting.upsert({ where: { key: TAX_KEY }, create: { key: TAX_KEY, value }, update: { value } });
  return value;
}

const TEMPLATES_KEY = "notes.templates";

/** Modèles de notes (motifs « Pour », « Contre », « À vérifier ») ; modèles par défaut si rien n'est enregistré. */
export async function getNoteTemplates(): Promise<NoteTemplates> {
  const row = await prisma.appSetting.findUnique({ where: { key: TEMPLATES_KEY } });
  return parseTemplates(row?.value);
}

export async function setNoteTemplates(templates: NoteTemplates) {
  const value = parseTemplates(templates);
  await prisma.appSetting.upsert({ where: { key: TEMPLATES_KEY }, create: { key: TEMPLATES_KEY, value }, update: { value } });
  return value;
}

// Réglages de travail de chaque personne (le propriétaire garde la clé d'origine)
const PREFS_KEY = "prefs.shared";
const prefsKey = (user: UserKey) => (user === "partner" ? `${PREFS_KEY}.partner` : PREFS_KEY);
const PREFS_MAX_BYTES = 200_000;
export type SharedPrefs = { data: Record<string, unknown>; updatedAt: number };

/** Réglages de travail partagés entre appareils : critères d'achat, filtres, tri, panier, budget. */
export async function getSharedPrefs(user: UserKey = "owner"): Promise<SharedPrefs | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: prefsKey(user) } });
  const v = row?.value as Partial<SharedPrefs> | undefined;
  return v && v.data && typeof v.data === "object" && typeof v.updatedAt === "number" ? { data: v.data, updatedAt: v.updatedAt } : null;
}

/** Enregistre les réglages si cette version est la plus récente (le dernier enregistrement gagne). */
export async function setSharedPrefs(data: unknown, updatedAt: number, user: UserKey = "owner"): Promise<boolean> {
  if (!data || typeof data !== "object" || Array.isArray(data) || !Number.isFinite(updatedAt)) throw new Error("Réglages invalides");
  if (JSON.stringify(data).length > PREFS_MAX_BYTES) throw new Error("Réglages trop volumineux");
  const current = await getSharedPrefs(user);
  if (current && current.updatedAt > updatedAt) return false;
  const value = JSON.parse(JSON.stringify({ data, updatedAt }));
  const key = prefsKey(user);
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  return true;
}

const USERS_KEY = "users.names";

/** Noms affichés des deux comptes (modifiables dans Settings). */
export async function getProfiles(): Promise<Profiles> {
  const row = await prisma.appSetting.findUnique({ where: { key: USERS_KEY } });
  return buildProfiles(row?.value as Partial<Record<UserKey, unknown>> | null);
}

export async function setProfileNames(names: Record<UserKey, string>) {
  const value = { owner: names.owner.trim().slice(0, 40), partner: names.partner.trim().slice(0, 40) };
  await prisma.appSetting.upsert({ where: { key: USERS_KEY }, create: { key: USERS_KEY, value }, update: { value } });
}
