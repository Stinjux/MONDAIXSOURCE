// Keepa Alert (serveur) : alertes du compte connecté, selon SES critères d'achat et SES alertes ignorées.
import "server-only";
import { prisma } from "./prisma";
import { parseFilters } from "./decisionFilters";
import { priceDrop } from "./keepa";
import { keepaAlerts, type KeepaAlert } from "./keepaAlerts";
import { loadProducts, purchasedProducts, type KeepaView } from "./queries";
import { getSharedPrefs } from "./settings";
import type { UserKey } from "./users";

/** Analyse Keepa précédente (avant la dernière) de chaque lead. */
async function previousKeepa(): Promise<Map<string, KeepaView>> {
  const rows = await prisma.$queryRaw<
    {
      productId: string; capturedAt: Date; buyBox: number | null; buyBoxAvg90: number | null; amazonPrice: number | null; amazonSelling: boolean; newOffers: number | null;
      fbaOffers: number | null; salesRank: number | null; salesRankAvg90: number | null; monthlySold: number | null; fbaFee: number | null; referralPct: number | null;
    }[]
  >`SELECT "productId", "capturedAt", "buyBox", "buyBoxAvg90", "amazonPrice", "amazonSelling", "newOffers", "fbaOffers", "salesRank", "salesRankAvg90", "monthlySold", "fbaFee", "referralPct"
    FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY "productId" ORDER BY "capturedAt" DESC) AS rn FROM "KeepaSnapshot") s WHERE rn = 2`;
  return new Map(rows.map((k) => [k.productId, { ...k, capturedAt: k.capturedAt.toISOString(), priceDrop: priceDrop(k) }]));
}

/** Critères d'achat et alertes ignorées du compte (ses réglages de travail). */
async function userSettings(me: UserKey) {
  const prefs = await getSharedPrefs(me);
  const data = (prefs?.data ?? {}) as Record<string, unknown>;
  const dismissed = data.keepaAlertsDismissed && typeof data.keepaAlertsDismissed === "object" ? (data.keepaAlertsDismissed as Record<string, string>) : {};
  return { thresholds: parseFilters(data).thresholds, dismissed, updatedAt: prefs?.updatedAt ?? 0 };
}

export async function loadKeepaAlerts(me: UserKey, now = new Date()): Promise<{ alerts: KeepaAlert[]; thresholds: ReturnType<typeof parseFilters>["thresholds"] }> {
  const [{ products, tax }, previous, purchased, settings] = await Promise.all([loadProducts(now), previousKeepa(), purchasedProducts(), userSettings(me)]);
  const alerts = keepaAlerts({
    products,
    previous,
    thresholds: settings.thresholds,
    tax,
    purchased: new Set(purchased.keys()),
    dismissed: settings.dismissed,
    now,
  });
  return { alerts, thresholds: settings.thresholds };
}

// Compteur du menu : recalculé seulement si une analyse Keepa ou les réglages du compte ont changé
// (ou toutes les 5 minutes), pour ne pas ralentir chaque page.
const cache = new Map<UserKey, { key: string; at: number; count: number }>();
export async function keepaAlertCount(me: UserKey): Promise<number> {
  const [latest, settings] = await Promise.all([prisma.keepaSnapshot.aggregate({ _max: { capturedAt: true } }), userSettings(me)]);
  if (!latest._max.capturedAt) return 0;
  const key = `${latest._max.capturedAt.toISOString()}|${settings.updatedAt}`;
  const hit = cache.get(me);
  if (hit && hit.key === key && Date.now() - hit.at < 5 * 60_000) return hit.count;
  const { alerts } = await loadKeepaAlerts(me);
  cache.set(me, { key, at: Date.now(), count: alerts.length });
  return alerts.length;
}
