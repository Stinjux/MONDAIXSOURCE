import test from "node:test";
import assert from "node:assert/strict";
import { PREFS_STORAGE_KEY, prefsBootScript } from "../src/lib/prefsBoot";

// Exécute le script de démarrage avec un stockage simulé ; renvoie le stockage et l'indicateur d'envoi
function boot(server: { data: Record<string, unknown>; updatedAt: number } | null, local: unknown) {
  const store = new Map<string, string>();
  if (local !== undefined) store.set(PREFS_STORAGE_KEY, JSON.stringify(local));
  const localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  const window: { __mondaixPushPrefs?: boolean } = {};
  new Function("localStorage", "window", prefsBootScript(server))(localStorage, window);
  return { saved: JSON.parse(store.get(PREFS_STORAGE_KEY) ?? "null"), push: !!window.__mondaixPushPrefs };
}

test("réglages : la base plus récente remplace le navigateur", () => {
  const r = boot({ data: { cart: { a: { qty: 2 } }, budget: "500" }, updatedAt: 2000 }, { cart: { b: { qty: 1 } }, updatedAt: 1000 });
  assert.deepEqual(r.saved, { cart: { a: { qty: 2 } }, budget: "500", updatedAt: 2000 });
  assert.equal(r.push, false);
});

test("réglages : le navigateur plus récent est envoyé à la base", () => {
  const r = boot({ data: { cart: {} }, updatedAt: 1000 }, { cart: { b: { qty: 1 } }, updatedAt: 3000 });
  assert.deepEqual(r.saved.cart, { b: { qty: 1 } });
  assert.equal(r.push, true);
  assert.equal(boot(null, { cart: { b: { qty: 1 } }, updatedAt: 5 }).push, true);
});

test("réglages : un ancien panier du navigateur est fusionné, jamais perdu", () => {
  const r = boot({ data: { cart: { a: { qty: 2 } }, strategy: "roi" }, updatedAt: 2000 }, { cart: { a: { qty: 9 }, b: { qty: 1 } }, strategy: "score" });
  assert.deepEqual(r.saved.cart, { a: { qty: 2 }, b: { qty: 1 } });
  assert.equal(r.saved.strategy, "roi");
  assert.equal(r.push, true);
  // Premier appareil : rien en base, panier local conservé et envoyé
  assert.deepEqual(boot(null, { cart: { c: { qty: 3 } } }).saved.cart, { c: { qty: 3 } });
  assert.equal(boot(null, undefined).saved, null);
});
