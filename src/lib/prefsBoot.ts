// Réglages de travail partagés entre appareils (critères d'achat, filtres, tri, panier, budget) :
// clé du navigateur et script appliqué avant l'affichage (utilisables côté serveur et navigateur).

export const PREFS_STORAGE_KEY = "mondaix.buyDecisions.v1";

/**
 * Script exécuté avant l'affichage : applique la version la plus récente (base ou navigateur).
 * Un panier enregistré dans ce navigateur avant la synchronisation est fusionné, jamais perdu.
 * `window.__mondaixPushPrefs` signale que la version du navigateur doit être envoyée à la base.
 */
export function prefsBootScript(server: { data: Record<string, unknown>; updatedAt: number } | null, key = PREFS_STORAGE_KEY) {
  const s = JSON.stringify(server).replace(/</g, "\\u003c");
  return `try{var k=${JSON.stringify(key)},s=${s},l=JSON.parse(localStorage.getItem(k)||"null");
if(l&&!l.updatedAt&&s&&s.data){var m=s.data,lc=l.cart||{};m.cart=m.cart||{};for(var id in lc){if(!m.cart[id])m.cart[id]=lc[id]}m.updatedAt=Date.now();localStorage.setItem(k,JSON.stringify(m));window.__mondaixPushPrefs=true}
else if(s&&s.data&&(!l||!(l.updatedAt>=s.updatedAt))){var d=s.data;d.updatedAt=s.updatedAt;localStorage.setItem(k,JSON.stringify(d))}
else if(l&&(!s||l.updatedAt>s.updatedAt)){window.__mondaixPushPrefs=true}}catch(e){}`;
}
