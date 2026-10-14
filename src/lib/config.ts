// Configuration serveur. Les secrets restent dans les variables Railway et ne sont jamais envoyés au navigateur.
import type { DateOrder } from "./dates";

const intEnv = (name: string, fallback: number) => {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const config = {
  /** Objectif de nouveaux leads uniques par semaine */
  get weeklyGoal() {
    return intEnv("WEEKLY_LEAD_GOAL", 50);
  },
  /** Ordre des dates ambiguës dans les Sheets (ex. 03/04/2026) : MDY (défaut Google Sheets US) ou DMY */
  get dateOrder(): DateOrder {
    return process.env.SHEET_DATE_ORDER?.toUpperCase() === "DMY" ? "DMY" : "MDY";
  },
  /** Nombre de jours après lesquels une vérification OUT OF STOCK est considérée périmée */
  get recheckDays() {
    return intEnv("OOS_RECHECK_DAYS", 7);
  },
};

/** Variables attendues et leur état (présente / absente) — jamais leur valeur. */
export function envStatus() {
  const names = [
    ["DATABASE_URL", true],
    ["ADMIN_PASSWORD", true],
    ["SYNC_SECRET", true],
    ["GOOGLE_SERVICE_ACCOUNT_JSON_BASE64", true],
    ["LEADS_SHEET_ID", true],
    ["LEADS_SHEET_RANGE", false],
    ["OOS_SHEET_ID", true],
    ["OOS_SHEET_RANGE", false],
    ["REMINDER_WEBHOOK_URL", false],
    ["WEEKLY_LEAD_GOAL", false],
    ["SHEET_DATE_ORDER", false],
    ["OOS_RECHECK_DAYS", false],
  ] as const;
  return names.map(([name, required]) => ({ name, required, set: !!process.env[name]?.trim() }));
}
