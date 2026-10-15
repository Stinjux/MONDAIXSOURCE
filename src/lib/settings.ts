// Réglages modifiables depuis le dashboard (stockés en base, table AppSetting).
import "server-only";
import { prisma } from "./prisma";
import { DEFAULT_TAX, NO_TAX, type TaxConfig, type TaxMode } from "./profit";

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
