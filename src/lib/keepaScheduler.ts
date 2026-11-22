// Mise à jour Keepa lancée par le site lui-même : toutes les 15 minutes, tant que KEEPA_API_KEY existe.
// Aucun service Railway supplémentaire n'est nécessaire. Le verrou en base empêche deux passages
// simultanés (plusieurs instances, ou la tâche planifiée facultative keepa:cron en plus).
import { runKeepa } from "./keepaSync";

const g = globalThis as unknown as { __mondaixKeepaTimer?: ReturnType<typeof setInterval> };

export function startKeepaScheduler() {
  if (g.__mondaixKeepaTimer) return;
  const minutes = Math.max(1, Number(process.env.KEEPA_INTERVAL_MINUTES) || 15);
  const tick = async () => {
    if (!process.env.KEEPA_API_KEY?.trim()) return;
    try {
      const r = await runKeepa({ trigger: "AUTO" });
      if (r.status !== "SKIPPED") console.log(`[keepa] ${r.status} : ${r.updated} lead(s) mis à jour, ${r.tokensLeft ?? "?"} jeton(s) restant(s)${r.message ? ` · ${r.message}` : ""}`);
    } catch (e) {
      console.error("[keepa] passage impossible :", e instanceof Error ? e.message : e);
    }
  };
  // Premier passage une minute après le démarrage, puis à intervalle régulier
  setTimeout(tick, 60_000).unref?.();
  g.__mondaixKeepaTimer = setInterval(tick, minutes * 60_000);
  g.__mondaixKeepaTimer.unref?.();
}
