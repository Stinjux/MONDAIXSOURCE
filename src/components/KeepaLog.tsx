"use client";
// Journal Keepa : chaque lead, sa dernière analyse par l'API Keepa (date et heure), ce que Keepa a
// renvoyé, et où il en est aujourd'hui. Filtres, recherche, passages récents.
import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, CircleSlash, Clock, Search, SearchX, TrendingDown } from "lucide-react";
import { formatAgo, formatDateTime } from "@/lib/dates";
import { cad, num } from "@/lib/format";
import { KEEPA_STATE_LABELS, type KeepaLeadState, type KeepaResult } from "@/lib/keepaLog";
import { ProductImage } from "./ProductImage";
import { Badge, EmptyState, cn } from "./ui";

export type KeepaLogRow = {
  asin: string;
  name: string;
  state: KeepaLeadState;
  result: KeepaResult;
  checkedAt: string | null;
  /** Date des données affichées (dernière analyse qui en a renvoyé) */
  dataAt: string | null;
  analyses: number;
  buyBox: number | null;
  buyBoxAvg90: number | null;
  priceDrop: number | null;
  outReason: string | null;
};
export type KeepaRunRow = { id: string; startedAt: string; trigger: string | null; status: string; requested: number; updated: number; noData: number; details: string | null };

type Filter = KeepaLeadState | "ALL";
const ICON: Record<KeepaLeadState, React.ReactNode> = {
  TODAY: <CheckCircle2 size={15} className="text-good" />,
  PENDING: <Clock size={15} className="text-warning" />,
  NEVER: <SearchX size={15} className="text-ink-3" />,
  WEEKLY: <CalendarClock size={15} className="text-ink-3" />,
  OUT: <CircleSlash size={15} className="text-ink-3" />,
};
const TRIGGER: Record<string, string> = { AUTO: "Automatique", CRON: "Tâche planifiée", MANUAL: "Bouton", CLI: "Commande" };

export function KeepaLog({ rows, runs, configured }: { rows: KeepaLogRow[]; runs: KeepaRunRow[]; configured: boolean }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const counts = useMemo(() => {
    const c: Record<KeepaLeadState, number> = { TODAY: 0, PENDING: 0, NEVER: 0, WEEKLY: 0, OUT: 0 };
    for (const r of rows) c[r.state]++;
    return c;
  }, [rows]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => (filter === "ALL" || r.state === filter) && (!q || `${r.asin} ${r.name}`.toLowerCase().includes(q)))
      .sort((a, b) => (b.checkedAt ?? "").localeCompare(a.checkedAt ?? "") || a.name.localeCompare(b.name, "fr"));
  }, [rows, filter, query]);
  const active = counts.TODAY + counts.PENDING + counts.NEVER + counts.WEEKLY;

  return (
    <div className="flex flex-col gap-4">
      {!configured && (
        <p className="rounded-md border border-warning/40 bg-warning/[0.08] px-4 py-2.5 text-sm text-ink">
          <code className="font-mono text-xs">KEEPA_API_KEY</code> n&apos;est pas configurée sur ce service : aucune analyse automatique pour l&apos;instant.
        </p>
      )}

      {/* Chiffres clés, cliquables pour filtrer */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" role="radiogroup" aria-label="Filtrer par état">
        {(["TODAY", "PENDING", "NEVER", "WEEKLY", "OUT"] as KeepaLeadState[]).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={filter === s}
            onClick={() => setFilter(filter === s ? "ALL" : s)}
            className={cn("rounded-md border bg-surface px-4 py-3 text-left transition", filter === s ? "border-accent ring-1 ring-accent/30" : "border-line hover:border-line-strong")}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-ink-2 uppercase">
              {ICON[s]} {KEEPA_STATE_LABELS[s]}
            </span>
            <span className="mt-1 block font-serif text-[28px] leading-tight font-semibold tabular-nums text-ink">{counts[s]}</span>
            <span className="text-[11px] text-ink-3">
              {s === "TODAY"
                ? `sur ${active} lead${active > 1 ? "s" : ""} suivi${active > 1 ? "s" : ""}`
                : s === "PENDING"
                  ? "repassent aujourd'hui"
                  : s === "NEVER"
                    ? "passent en premier"
                    : s === "WEEKLY"
                      ? "analysés une fois par semaine (Keepa Alert)"
                      : "achetés : plus analysés"}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-line bg-surface p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input className="field pl-9" placeholder="Rechercher un lead (nom ou ASIN)" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher" />
        </div>
        {filter !== "ALL" && (
          <button type="button" className="btn-ghost text-xs" onClick={() => setFilter("ALL")}>
            {KEEPA_STATE_LABELS[filter]} · tout afficher
          </button>
        )}
        <span className="text-xs text-ink-3 tabular-nums">
          {visible.length} lead{visible.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="overflow-hidden rounded-md border border-line bg-surface">
        {visible.length === 0 ? (
          <EmptyState title="Aucun lead dans cette sélection" icon={<SearchX size={22} />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Dernière analyse Keepa</th>
                  <th>Résultat</th>
                  <th className="text-right">Buy Box · moy. 90 j</th>
                  <th className="text-right">Analyses</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.asin}>
                    <td className="max-w-96">
                      <div className="flex items-center gap-2.5">
                        <ProductImage asin={r.asin} size={36} />
                        <div className="min-w-0">
                          <Link href={`/leads/${r.asin}`} className="block truncate font-medium text-ink hover:text-accent hover:underline" title={r.name}>
                            {r.name}
                          </Link>
                          <span className="font-mono text-xs text-ink-3">{r.asin}</span>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      {r.checkedAt ? (
                        <>
                          <span className="block text-ink">{formatDateTime(r.checkedAt)}</span>
                          <span className="text-[11px] text-ink-3">{formatAgo(r.checkedAt)}</span>
                        </>
                      ) : (
                        <span className="text-ink-3">Jamais</span>
                      )}
                    </td>
                    <td>
                      {r.result === "DATA" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-good">
                          <CheckCircle2 size={12} /> Données reçues
                        </span>
                      ) : r.result === "NO_DATA" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-warning" title="Keepa n'a pas de données pour cet ASIN sur Amazon.ca">
                          <SearchX size={12} /> Aucune donnée chez Keepa
                        </span>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                      {r.priceDrop != null && r.result === "DATA" && (
                        <span className="mt-0.5 block">
                          <Badge tone="serious" icon={<TrendingDown size={10} />}>Prix en baisse −{r.priceDrop} %</Badge>
                        </span>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap tabular-nums">
                      {r.buyBox != null || r.buyBoxAvg90 != null ? (
                        r.result === "NO_DATA" && r.dataAt ? (
                          // Valeurs d'une analyse précédente : en gris, avec leur date
                          <span className="text-ink-3" title="Dernières données connues (analyse précédente)">
                            {cad(r.buyBox)} · {cad(r.buyBoxAvg90)}
                            <span className="block text-[11px]">données du {formatDateTime(r.dataAt)}</span>
                          </span>
                        ) : (
                          <>
                            {cad(r.buyBox)} <span className="text-ink-3">· {cad(r.buyBoxAvg90)}</span>
                          </>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-right tabular-nums">{num(r.analyses)}</td>
                    <td>
                      <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
                        {ICON[r.state]} {KEEPA_STATE_LABELS[r.state]}
                      </span>
                      {r.outReason && <span className="block text-[11px] text-ink-3">{r.outReason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Passages récents */}
      <section className="overflow-hidden rounded-md border border-line bg-surface" aria-label="Passages récents">
        <h2 className="border-b border-line px-4 py-3 text-[12px] font-semibold tracking-[0.1em] text-ink-2 uppercase">Passages récents</h2>
        {runs.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink-3">Aucun passage enregistré.</p>
        ) : (
          <table className="table-base text-xs">
            <thead>
              <tr>
                <th>Date</th>
                <th>Déclenché par</th>
                <th className="text-right">Interrogés</th>
                <th className="text-right">Avec données</th>
                <th className="text-right">Sans données</th>
                <th>Détail</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-ink-2">{formatDateTime(r.startedAt)}</td>
                  <td>{TRIGGER[r.trigger ?? ""] ?? r.trigger ?? "—"}</td>
                  <td className="text-right tabular-nums">{r.requested}</td>
                  <td className="text-right tabular-nums text-good">{r.updated}</td>
                  <td className="text-right tabular-nums">{r.noData || "—"}</td>
                  <td className={cn("max-w-96 truncate", r.status === "FAILED" ? "text-critical" : "text-ink-3")} title={r.details ?? undefined}>
                    {r.status === "FAILED" ? `Échec : ${r.details ?? ""}` : (r.details ?? "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
