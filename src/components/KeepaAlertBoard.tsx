"use client";
// Keepa Alert : leads rejetés ou sous vos critères que la Buy Box Keepa rend maintenant intéressants.
// Avant → maintenant, et trois actions : remettre en revue, ouvrir la décision, ignorer (jusqu'à la
// prochaine analyse Keepa de ce lead).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, BellRing, EyeOff, Gavel, RotateCcw } from "lucide-react";
import { setReviewStatus } from "@/app/(app)/actions";
import { VERDICT_LABELS, type Thresholds, type Verdict } from "@/lib/decision";
import { formatDate, formatDateTime } from "@/lib/dates";
import { cad, num, pct } from "@/lib/format";
import type { AlertSide, KeepaAlert } from "@/lib/keepaAlerts";
import { pushSaved, readSaved, writeSaved } from "./DecisionFilters";
import { ProductImage } from "./ProductImage";
import { useUser } from "./UserContext";
import { Badge, EmptyState, Supplier, cn } from "./ui";

const TONE: Record<Verdict, "good" | "warning" | "critical" | "neutral"> = { BUY: "good", CONSIDER: "warning", AVOID: "critical", INCOMPLETE: "neutral" };

const ROWS: { label: string; get: (s: AlertSide) => string; better?: (b: AlertSide, n: AlertSide) => boolean }[] = [
  { label: "Prix Amazon", get: (s) => cad(s.price) },
  { label: "ROI", get: (s) => pct(s.roi, 0), better: (b, n) => (n.roi ?? -Infinity) > (b.roi ?? -Infinity) },
  { label: "Profit / unité", get: (s) => cad(s.profit), better: (b, n) => (n.profit ?? -Infinity) > (b.profit ?? -Infinity) },
  { label: "Ventes / mois", get: (s) => num(s.sales) },
  { label: "Profit mensuel", get: (s) => cad(s.monthlyProfit), better: (b, n) => (n.monthlyProfit ?? -Infinity) > (b.monthlyProfit ?? -Infinity) },
];

export function KeepaAlertBoard({ alerts, thresholds, configured }: { alerts: KeepaAlert[]; thresholds: Thresholds; configured: boolean }) {
  const router = useRouter();
  const { profiles } = useUser();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const visible = alerts.filter((a) => !hidden.has(a.productId));

  const dismiss = (a: KeepaAlert) => {
    const prev = (readSaved().keepaAlertsDismissed ?? {}) as Record<string, string>;
    writeSaved({ keepaAlertsDismissed: { ...prev, [a.productId]: a.keepaAt } });
    pushSaved();
    setHidden((h) => new Set([...h, a.productId]));
    setTimeout(() => router.refresh(), 1200);
  };
  const reopen = (a: KeepaAlert) =>
    start(async () => {
      setError(null);
      const res = await setReviewStatus(a.productId, "TO_REVIEW");
      if (!res.ok) return setError(res.error);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-ink-2">
        Selon <b className="text-ink">vos critères</b> : ROI ≥ {thresholds.minRoi} %, profit ≥ {cad(thresholds.minProfit)}, marge ≥ {thresholds.minMargin} %, ventes ≥ {thresholds.minSales} / mois —{" "}
        <Link href="/decisions" className="link">modifier dans Buy Decisions (Classement et critères)</Link>.
        {!configured && <span className="block text-warning">KEEPA_API_KEY n&apos;est pas configurée : pas de nouvelle analyse Keepa pour l&apos;instant.</span>}
      </p>
      {error && <p className="text-sm text-critical">{error}</p>}

      {visible.length === 0 ? (
        <div className="rounded-md border border-line bg-surface">
          <EmptyState title="Aucune alerte" icon={<BellRing size={22} />}>
            Aucun lead rejeté ou sous vos critères n&apos;est devenu intéressant avec les dernières analyses Keepa. Les leads actifs sont analysés chaque jour, les rejetés chaque semaine.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {visible.map((a) => (
            <li key={a.productId} className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4">
              <div className="flex gap-3">
                <ProductImage asin={a.asin} size={64} />
                <div className="min-w-0 flex-1">
                  <Link href={`/leads/${a.asin}`} className="line-clamp-2 text-sm font-semibold text-ink hover:text-accent hover:underline">
                    {a.name}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
                    <span className="font-mono">{a.asin}</span>
                    {a.supplierName && <Supplier name={a.supplierName} url={a.supplierUrl} product={a.name} />}
                    {a.costPrice != null && <span>coût {cad(a.costPrice)}</span>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {a.reason === "REJECTED" ? (
                      <Badge tone="serious">
                        Rejeté{a.rejectedAt ? ` le ${formatDate(a.rejectedAt)}` : ""}
                        {a.rejectedBy ? ` par ${profiles[a.rejectedBy].name}` : ""}
                      </Badge>
                    ) : (
                      <Badge tone="warning">Sous vos critères avant</Badge>
                    )}
                    <span className="text-[11px] text-ink-3">Keepa · {formatDateTime(a.keepaAt)}</span>
                  </div>
                </div>
              </div>

              {/* Avant → maintenant */}
              <table className="table-base text-xs">
                <thead>
                  <tr>
                    <th />
                    <th className="text-right">Avant{a.beforeFrom ? ` (Keepa ${formatDate(a.beforeFrom)})` : " (Sheet)"}</th>
                    <th className="w-4" />
                    <th className="text-right">Maintenant</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r) => (
                    <tr key={r.label}>
                      <td className="text-ink-2">{r.label}</td>
                      <td className="text-right tabular-nums text-ink-3">{r.get(a.before)}</td>
                      <td className="text-ink-3">
                        <ArrowRight size={12} />
                      </td>
                      <td className={cn("text-right font-semibold tabular-nums", r.better?.(a.before, a.now) ? "text-good" : "text-ink")}>{r.get(a.now)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="text-ink-2">Avis</td>
                    <td className="text-right">
                      <Badge tone={TONE[a.before.verdict]}>{VERDICT_LABELS[a.before.verdict]}</Badge>
                    </td>
                    <td className="text-ink-3">
                      <ArrowRight size={12} />
                    </td>
                    <td className="text-right">
                      <Badge tone="good">{VERDICT_LABELS[a.now.verdict]}</Badge>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="flex flex-wrap gap-2">
                {a.reason === "REJECTED" && (
                  <button type="button" className="btn-primary" disabled={pending} onClick={() => reopen(a)} title="Remet le lead « À revoir » (enregistré à votre nom)">
                    <RotateCcw size={15} /> Remettre en revue
                  </button>
                )}
                <Link href={`/decisions?asin=${a.asin}`} className={a.reason === "REJECTED" ? "btn-ghost" : "btn-primary"}>
                  <Gavel size={15} /> Ouvrir la décision
                </Link>
                <button type="button" className="btn-ghost ml-auto" onClick={() => dismiss(a)} title="Masque cette alerte jusqu'à la prochaine analyse Keepa de ce lead">
                  <EyeOff size={15} /> Ignorer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
