import { ChevronDown, History } from "lucide-react";
import { SyncButton } from "@/components/SyncButton";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { RUN_STATUS_LABELS, SOURCE_LABELS, TRIGGER_LABELS } from "@/lib/labels";
import { latestRuns } from "@/lib/queries";

export const metadata = { title: "Import History" };

const STATUS_TONE = { SUCCESS: "good", FAILED: "critical", RUNNING: "accent", SKIPPED: "neutral", LEGACY: "neutral" } as const;

function duration(start: string, end: string | null) {
  if (!end) return "—";
  const s = (new Date(end).getTime() - new Date(start).getTime()) / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.round(s / 60)} min`;
}

export default async function ImportsPage() {
  const runs = await latestRuns(60);
  return (
    <>
      <PageHeader
        title="Import History"
        description="Chaque synchronisation est journalisée avec ses lignes invalides et avertissements. Les données ne sont jamais supprimées automatiquement."
        actions={<SyncButton />}
      />
      {runs.length === 0 ? (
        <Card>
          <EmptyState title="Aucune synchronisation" icon={<History size={22} />}>Lancez une première synchronisation pour importer LEADS et OUT OF STOCK.</EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {runs.map((r) => (
            <details key={r.id} className="group rounded-xl border border-line bg-surface open:border-line-strong">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className="w-40 text-sm text-ink">{formatDateTime(r.startedAt)}</span>
                <Badge tone={r.source === "LEADS" ? "accent" : "neutral"}>{SOURCE_LABELS[r.source] ?? r.source}</Badge>
                <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>{RUN_STATUS_LABELS[r.status] ?? r.status}</Badge>
                <span className="text-xs text-ink-3">{r.trigger ? TRIGGER_LABELS[r.trigger] ?? r.trigger : "—"}</span>
                <span className="flex flex-1 flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2 tabular-nums">
                  <span><b className="text-ink">{r.rowsRead}</b> lignes lues</span>
                  <span><b className="text-ink">{r.imported}</b> nouveaux</span>
                  <span><b className="text-ink">{r.duplicates}</b> doublons</span>
                  <span><b className="text-ink">{r.updated}</b> mis à jour</span>
                  <span><b className="text-ink">{r.unchanged}</b> inchangés</span>
                  {r.missing > 0 && <span><b className="text-warning">{r.missing}</b> retirés de la Sheet</span>}
                  {r.errors > 0 && <span><b className="text-[#f08080]">{r.errors}</b> invalides</span>}
                  {r.warnings > 0 && <span><b className="text-warning">{r.warnings}</b> avertissements</span>}
                </span>
                <span className="text-xs text-ink-3">{duration(r.startedAt, r.finishedAt)}</span>
                <ChevronDown size={16} className="text-ink-3 transition group-open:rotate-180" />
              </summary>
              <div className="border-t border-line px-4 py-3 text-sm">
                {r.details && <p className={`mb-2 ${r.status === "FAILED" ? "text-[#f08080]" : "text-ink-2"}`}>{r.details}</p>}
                {r.issues.length ? (
                  <ul className="flex flex-col gap-1.5">
                    {r.issues.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-start gap-2 text-xs">
                        <Badge tone={i.severity === "ERROR" ? "critical" : "warning"}>{i.severity === "ERROR" ? "Invalide" : "Avertissement"}</Badge>
                        <span className="w-16 text-ink-3 tabular-nums">{i.sheetRow ? `Ligne ${i.sheetRow}` : "—"}</span>
                        <span className="flex-1 text-ink-2">{i.message}</span>
                        {Array.isArray(i.raw) && <code className="max-w-full truncate rounded bg-page px-1.5 py-0.5 font-mono text-[11px] text-ink-3">{(i.raw as string[]).slice(0, 4).join(" | ")}</code>}
                      </li>
                    ))}
                    {r.errors + r.warnings > r.issues.length && <li className="text-xs text-ink-3">… {r.errors + r.warnings - r.issues.length} autres non affichés</li>}
                  </ul>
                ) : (
                  !r.details && <p className="text-xs text-ink-3">Aucune ligne invalide ni avertissement.</p>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
