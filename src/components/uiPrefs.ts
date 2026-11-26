// Préférences d'affichage (navigateur uniquement) : menu réduit, densité, catégories du menu pliées.
// Appliquées sur <html> avant l'affichage par le script de layout.tsx, pour éviter tout clignotement.
export type UiPrefs = { sidebar: "full" | "rail"; density: "comfort" | "compact"; navCollapsed: string[] };
export const UI_KEY = "mondaix.ui.v1";
export const DEFAULT_UI: UiPrefs = { sidebar: "full", density: "comfort", navCollapsed: [] };

export function readUi(): UiPrefs {
  try {
    const s = JSON.parse(localStorage.getItem(UI_KEY) ?? "{}");
    const collapsed = Array.isArray(s.navCollapsed) ? s.navCollapsed.filter((k: unknown): k is string => typeof k === "string" && /^[a-z0-9-]+$/.test(k)) : [];
    return { sidebar: s.sidebar === "rail" ? "rail" : "full", density: s.density === "compact" ? "compact" : "comfort", navCollapsed: collapsed };
  } catch {
    return DEFAULT_UI;
  }
}

export function setUi(patch: Partial<UiPrefs>) {
  const next = { ...readUi(), ...patch };
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(next));
  } catch {
    /* stockage indisponible : réglage valable pour cette page seulement */
  }
  document.documentElement.dataset.sidebar = next.sidebar;
  document.documentElement.dataset.density = next.density;
  document.documentElement.dataset.navCollapsed = next.navCollapsed.join(" ");
  window.dispatchEvent(new CustomEvent("mondaix:ui", { detail: next }));
  return next;
}

/** Script exécuté avant l'affichage (voir app/layout.tsx). */
export const UI_BOOT_SCRIPT = `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(UI_KEY)})||"{}");var d=document.documentElement;d.dataset.sidebar=s.sidebar==="rail"?"rail":"full";d.dataset.density=s.density==="compact"?"compact":"comfort";d.dataset.navCollapsed=Array.isArray(s.navCollapsed)?s.navCollapsed.join(" "):""}catch(e){}`;
