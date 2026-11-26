// Keepa Alert (serveur) : sections du compte connecté, selon SES critères d'achat et SES alertes vues.
import "server-only";
import { prisma } from "./prisma";
import { parseFilters } from "./decisionFilters";
import { priceDrop } from "./keepa";
import { keepaAlerts, needsFullHistory, type KeepaAlert } from "./keepaAlerts";
import { loadProducts, purchasedProducts, type KeepaView } from "./queries";
import { getSharedPrefs } from "./settings";
import type { UserKey } from "./users";

type SnapRow = {
  productId: string; capturedAt: Date; buyBox: number | null; buyBoxAvg90: number | null; amazonPrice: number | null; amazonSelling: boolean; newOffers: number | null;
  fbaOffers: number | null; salesRank: number | null; salesRankAvg90: number | null; monthlySold: number | null; fbaFee: number | null; referralPct: number | null;
};
const toView = (k: SnapRow): KeepaView => ({ ...k, capturedAt: k.capturedAt.toISOString(), priceDrop: priceDrop(k) });

/** Analyse Keepa précédente (avant la dernière) de chaque lead. */
async function previousKeepa(): Promise<Map<string, KeepaView[]>> {
  const rows = await prisma.$queryRaw<SnapRow[]>`SELECT "productId", "capturedAt", "buyBox", "buyBoxAvg90", "amazonPrice", "amazonSelling", "newOffers", "fbaOffers", "salesRank", "salesRankAvg90", "monthlySold", "fbaFee", "referralPct"
    FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY "productId" ORDER BY "capturedAt" DESC) AS rn FROM "KeepaSnapshot") s WHERE rn = 2`;
  return new Map(rows.map((k) => [k.productId, [toView(k)]]));
}

/** Toutes les analyses avant la dernière de ces leads, la plus récente d'abord (lecture seule). */
async function fullHistory(productIds: string[]): Promise<Map<string, KeepaView[]>> {
  const out = new Map<string, KeepaView[]>();
  if (!productIds.length) return out;
  const rows = await prisma.keepaSnapshot.findMany({ where: { productId: { in: productIds } }, orderBy: [{ productId: "asc" }, { capturedAt: "desc" }] });
  for (const k of rows) {
    const list = out.get(k.productId) ?? [];
    list.push(toView(k));
    out.set(k.productId, list);
  }
  for (const [id, list] of out) out.set(id, list.slice(1)); // sans la dernière
  return out;
}

/** Critères d'achat et alertes vues du compte (ses réglages de travail). */
async function userSettings(me: UserKey) {
  const prefs = await getSharedPrefs(me);
  const data = (prefs?.data ?? {}) as Record<string, unknown>;
  // « keepaAlertsDismissed » : nom d'origine du réglage (alertes ignorées), gardé pour les alertes vues
  const seen = data.keepaAlertsDismissed && typeof data.keepaAlertsDismissed === "object" ? (data.keepaAlertsDismissed as Record<string, string>) : {};
  return { thresholds: parseFilters(data).thresholds, seen, updatedAt: prefs?.updatedAt ?? 0 };
}

export async function loadKeepaAlerts(me: UserKey, now = new Date()): Promise<{ alerts: KeepaAlert[]; thresholds: ReturnType<typeof parseFilters>["thresholds"] }> {
  const [{ products, tax }, previous, purchased, settings] = await Promise.all([loadProducts(now), previousKeepa(), purchasedProducts(), userSettings(me)]);
  const base = { thresholds: settings.thresholds, tax, purchased: new Set(purchased.keys()), seen: settings.seen, now };
  let alerts = keepaAlerts({ ...base, products, history: previous });
  // « Bon depuis » : l'historique complet, seulement pour les leads bons à toutes les analyses déjà lues
  const deeper = alerts.filter((a) => needsFullHistory(a, previous)).map((a) => a.productId);
  if (deeper.length) {
    const history = await fullHistory(deeper);
    const ids = new Set(deeper);
    const redone = new Map(keepaAlerts({ ...base, products: products.filter((p) => ids.has(p.id)), history }).map((a) => [a.productId, a]));
    alerts = alerts.map((a) => redone.get(a.productId) ?? a);
  }
  return { alerts, thresholds: settings.thresholds };
}

// Compteur du menu (New good pas encore vus) : recalculé seulement si une analyse Keepa ou les réglages
// du compte ont changé (ou toutes les 5 minutes), pour ne pas ralentir chaque page.
const cache = new Map<UserKey, { key: string; at: number; count: number }>();
export async function keepaAlertCount(me: UserKey): Promise<number> {
  const [latest, settings] = await Promise.all([prisma.keepaSnapshot.aggregate({ _max: { capturedAt: true } }), userSettings(me)]);
  if (!latest._max.capturedAt) return 0;
  const key = `${latest._max.capturedAt.toISOString()}|${settings.updatedAt}`;
  const hit = cache.get(me);
  if (hit && hit.key === key && Date.now() - hit.at < 5 * 60_000) return hit.count;
  // Le compteur n'a besoin que des groupes, pas de la date « bon depuis » : pas d'historique complet
  const [{ products, tax }, previous, purchased] = await Promise.all([loadProducts(), previousKeepa(), purchasedProducts()]);
  const alerts = keepaAlerts({ products, history: previous, thresholds: settings.thresholds, tax, purchased: new Set(purchased.keys()), seen: settings.seen });
  const count = alerts.filter((a) => a.group === "NEW_GOOD" && !a.seen).length;
  cache.set(me, { key, at: Date.now(), count });
  return count;
}
