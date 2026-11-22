// Exécuté une fois au démarrage du serveur : lance la mise à jour Keepa automatique (si KEEPA_API_KEY existe).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startKeepaScheduler } = await import("./lib/keepaScheduler");
  startKeepaScheduler();
}
