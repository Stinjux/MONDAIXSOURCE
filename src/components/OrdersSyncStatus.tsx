// État de la Sheet COMMANDES : variable lue par l'app, dernière synchronisation, erreurs.
// Sert à comprendre pourquoi des commandes n'apparaissent pas.
import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { formatDateTime } from "@/lib/dates";
import { SyncButton } from "./SyncButton";
import { cn } from "./ui";

export type OrdersSyncInfo = {
  configured: boolean;
  idVar: string;
  range: string;
  rangeSet: boolean;
  lastRun: { status: string; startedAt: string; details: string | null; rowsRead: number; imported: number; errors: number; warnings: number; missing: number } | null;
  issues: { sheetRow: number | null; severity: string; message: string }[];
};

export function OrdersSyncStatus({ info, hasOrders }: { info: OrdersSyncInfo; hasOrders: boolean }) {
  const { configured, lastRun } = info;
  const failed = lastRun?.status === "FAILED";
  const problem = !configured || !lastRun || failed || (!hasOrders && !!lastRun);
  const tone = !configured || failed ? "critical" : problem || info.issues.length ? "warning" : "good";
  const Icon = tone === "critical" ? XCircle : tone === "warning" ? AlertTriangle : CheckCircle2;
  return (
    <section
      aria-label="État de la Sheet COMMANDES"
      className={cn("rounded-md border bg-surface p-4", tone === "critical" ? "border-critical/40" : tone === "warning" ? "border-warning/40" : "border-line")}
    >
      <div className="flex flex-wrap items-start gap-3">
        <Icon size={18} className={cn("mt-0.5 shrink-0", tone === "critical" ? "text-critical" : tone === "warning" ? "text-warning" : "text-good")} />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-ink">
            {!configured
              ? "L'app ne voit pas l'ID de la Sheet COMMANDES"
              : !lastRun
                ? "Sheet COMMANDES configurée, jamais synchronisée"
                : failed
                  ? "La dernière lecture de la Sheet COMMANDES a échoué"
                  : !hasOrders
                    ? "Sheet COMMANDES lue, mais aucune commande valide"
                    : "Sheet COMMANDES synchronisée"}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-ink-2">
            {!configured ? (
              <>
                <li>
                  Ajoutez la variable <code className="font-mono">ORDERS_SHEET_ID</code> au <b>service web</b> Railway (et au service de la tâche planifiée), puis appliquez le
                  redéploiement que Railway propose : une variable n&apos;est prise en compte qu&apos;au redéploiement.
                </li>
              </>
            ) : (
              <>
                <li>
                  Variable lue : <code className="font-mono">{info.idVar}</code> · plage{" "}
                  <code className="font-mono">{info.range}</code>
                  {!info.rangeSet && " (onglet « Commandes » s'il existe, sinon le premier onglet)"}
                </li>
                {lastRun ? (
                  <li>
                    Dernière lecture : {formatDateTime(lastRun.startedAt)} · {lastRun.rowsRead} ligne{lastRun.rowsRead > 1 ? "s" : ""} lue{lastRun.rowsRead > 1 ? "s" : ""}, {lastRun.imported} nouvelle
                    {lastRun.imported > 1 ? "s" : ""}
                    {lastRun.errors ? `, ${lastRun.errors} invalide${lastRun.errors > 1 ? "s" : ""}` : ""}
                    {lastRun.missing ? `, ${lastRun.missing} retirée${lastRun.missing > 1 ? "s" : ""}` : ""}
                  </li>
                ) : (
                  <li>Cliquez sur « Synchroniser les Sheets » : les commandes sont lues à chaque synchronisation (bouton ou tâche planifiée).</li>
                )}
                {failed && lastRun?.details && <li className="font-medium text-critical">{lastRun.details}</li>}
                {lastRun && !failed && lastRun.rowsRead === 0 && (
                  <li>Aucune ligne lue : vérifiez que l&apos;onglet lu contient bien vos commandes (colonnes A à E), ou précisez-le avec ORDERS_SHEET_RANGE (ex. Commandes!A:E).</li>
                )}
              </>
            )}
          </ul>
          {info.issues.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-ink-2 hover:text-ink">Lignes à corriger dans la Sheet ({info.issues.length})</summary>
              <ul className="mt-1 space-y-0.5 text-ink-2">
                {info.issues.map((i, n) => (
                  <li key={n} className="flex gap-1.5">
                    {i.severity === "ERROR" ? <XCircle size={12} className="mt-0.5 shrink-0 text-critical" /> : <CircleDashed size={12} className="mt-0.5 shrink-0 text-warning" />}
                    <span>
                      {i.sheetRow ? `Ligne ${i.sheetRow} : ` : ""}
                      {i.message}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        {configured && <SyncButton />}
      </div>
    </section>
  );
}
