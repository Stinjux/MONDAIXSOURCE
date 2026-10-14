import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { config, envStatus } from "@/lib/config";
import { TIME_ZONE } from "@/lib/dates";
import { sheetConfig } from "@/lib/google";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  const env = envStatus();
  const leads = sheetConfig("LEADS");
  const oos = sheetConfig("OUT_OF_STOCK");
  return (
    <>
      <PageHeader title="Settings" description="Configuration lue depuis les variables d'environnement Railway. Les valeurs secrètes ne sont jamais affichées ni envoyées au navigateur." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Variables d'environnement" padded={false}>
          <ul className="divide-y divide-line">
            {env.map((v) => (
              <li key={v.name} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <code className="font-mono text-xs text-ink">{v.name}</code>
                {v.set ? (
                  <span className="flex items-center gap-1.5 text-xs text-[#5fd35f]"><CheckCircle2 size={14} /> Configurée</span>
                ) : v.required ? (
                  <span className="flex items-center gap-1.5 text-xs text-[#f08080]"><XCircle size={14} /> Manquante (requise)</span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-ink-3"><CircleDashed size={14} /> Optionnelle — défaut utilisé</span>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Paramètres actifs">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
              <dt className="text-ink-3">Objectif hebdomadaire</dt><dd>{config.weeklyGoal} nouveaux leads uniques <span className="text-ink-3">(WEEKLY_LEAD_GOAL)</span></dd>
              <dt className="text-ink-3">Semaine</dt><dd>Lundi 00:00 → dimanche 23:59, {TIME_ZONE} (heure du Québec)</dd>
              <dt className="text-ink-3">Marché / devise</dt><dd>Amazon.ca · CAD</dd>
              <dt className="text-ink-3">Plage LEADS</dt><dd><code className="font-mono text-xs">{leads.range}</code> (colonnes A à J)</dd>
              <dt className="text-ink-3">Plage OUT OF STOCK</dt><dd><code className="font-mono text-xs">{oos.range}</code> (colonnes A à P)</dd>
              <dt className="text-ink-3">Dates ambiguës</dt><dd>{config.dateOrder === "DMY" ? "JJ/MM/AAAA" : "MM/JJ/AAAA"} <span className="text-ink-3">(SHEET_DATE_ORDER)</span></dd>
              <dt className="text-ink-3">Revérification OOS</dt><dd>après {config.recheckDays} jours <span className="text-ink-3">(OOS_RECHECK_DAYS)</span></dd>
            </dl>
          </Card>

          <Card title="Synchronisation automatique">
            <p className="text-sm text-ink-2">Tâche planifiée Railway (service Cron) avec les mêmes variables, commande :</p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-page p-3 font-mono text-xs text-ink">npm run sync:cron</pre>
            <p className="mt-3 text-sm text-ink-2">Ou appel HTTP depuis un ordonnanceur externe :</p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-page p-3 font-mono text-xs text-ink">{`curl -X POST https://<votre-app>.up.railway.app/api/sync \\
  -H "Authorization: Bearer $SYNC_SECRET"`}</pre>
          </Card>

          <Card title="Rappel de la Weekly Review">
            <p className="text-sm text-ink-2">
              Créez une tâche planifiée Railway le dimanche (ex. <code className="font-mono text-xs">0 13 * * 0</code> = 9 h HAE / 8 h HNE, Railway utilise l&apos;UTC) avec la commande
              <code className="mx-1 font-mono text-xs">npm run reminder</code>. Le rappel est envoyé au webhook <code className="font-mono text-xs">REMINDER_WEBHOOK_URL</code> (Slack, Discord ou ntfy) s&apos;il est configuré.
            </p>
          </Card>

          <Card title="Estimations de rentabilité">
            <p className="text-sm text-ink-2">
              Profit préliminaire = Sale Price − Cost Price − FBA Fee. ROI = profit / coût. Marge = profit / prix de vente. Profit mensuel = profit × ventes estimées.
              Les commissions Amazon (si non incluses), le transport, la préparation, le stockage et les taxes non récupérables ne sont pas encore déduits.
              Aucun calcul n&apos;est fait sur un coût dans une autre devise que le CAD.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
