import Link from "next/link";
import { CheckCircle2, Copy, Layers, Repeat } from "lucide-react";
import { AckButton } from "@/components/AckButton";
import { Asin, Badge, Card, DuplicateBadges, EmptyState, Kpi, PageHeader, ReviewBadge, SourceBadges, Supplier, cn } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { cad } from "@/lib/format";
import { loadProducts, type ProductView } from "@/lib/queries";

export const metadata = { title: "Duplicate Alerts" };

const TYPES = {
  all: { label: "Tous", test: (p: ProductView) => p.dup.any },
  exact: { label: "Doublons exacts", test: (p: ProductView) => p.dup.exactOfferIds.length > 0 },
  cross: { label: "Entre les 2 Sheets", test: (p: ProductView) => p.dup.crossSheet },
  multi: { label: "Plusieurs fournisseurs", test: (p: ProductView) => p.dup.multiSupplier },
} as const;
type TypeKey = keyof typeof TYPES;

export default async function DuplicatesPage({ searchParams }: { searchParams: Promise<{ type?: string; show?: string }> }) {
  const params = await searchParams;
  const type: TypeKey = params.type && params.type in TYPES ? (params.type as TypeKey) : "all";
  const showAll = params.show === "all";
  const { products } = await loadProducts();
  const dups = products.filter((p) => p.dup.any);
  const list = dups
    .filter(TYPES[type].test)
    .filter((p) => showAll || p.duplicateAlert)
    .sort((a, b) => Number(b.duplicateAlert) - Number(a.duplicateAlert) || (b.lastDuplicateAt ?? "").localeCompare(a.lastDuplicateAt ?? ""));
  const href = (t: TypeKey, show = showAll) => `/duplicates?type=${t}${show ? "&show=all" : ""}`;

  return (
    <>
      <PageHeader
        title="Duplicate Alerts"
        description="Chaque fournisseur et chaque occurrence sont conservés ; un produit n'est compté qu'une fois dans les objectifs."
      />
      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Alertes actives" value={dups.filter((p) => p.duplicateAlert).length} hint="non examinées" icon={<Copy size={16} />} tone="warning" />
        <Kpi label="Doublons exacts" value={dups.filter(TYPES.exact.test).length} hint="même ASIN, même fournisseur" icon={<Copy size={16} />} tone="critical" />
        <Kpi label="Entre les 2 Sheets" value={dups.filter(TYPES.cross.test).length} hint="LEADS + OUT OF STOCK" icon={<Repeat size={16} />} tone="accent" />
        <Kpi label="Plusieurs fournisseurs" value={dups.filter(TYPES.multi.test).length} hint="doublons potentiels" icon={<Layers size={16} />} tone="accent" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {(Object.keys(TYPES) as TypeKey[]).map((k) => (
          <Link key={k} href={href(k)} className={cn("rounded-full px-3 py-1 text-xs transition", type === k ? "bg-accent-soft text-ink ring-1 ring-accent/40" : "text-ink-2 hover:bg-surface-2")}>
            {TYPES[k].label}
          </Link>
        ))}
        <Link href={href(type, !showAll)} className="ml-auto text-xs text-accent hover:underline">
          {showAll ? "Masquer les alertes examinées" : "Afficher aussi les alertes examinées"}
        </Link>
      </div>

      {list.length === 0 ? (
        <Card>
          <EmptyState title="Aucune alerte" icon={<CheckCircle2 size={22} />}>
            {showAll ? "Aucun doublon de ce type." : "Toutes les alertes de ce type ont été examinées."}
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((p) => (
            <Card key={p.id} className={p.duplicateAlert ? "border-serious/40" : undefined} padded={false}>
              <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/leads/${p.asin}`} className="truncate font-medium hover:text-accent hover:underline">{p.name}</Link>
                    <Asin asin={p.asin} url={p.amazonUrl} />
                    <ReviewBadge status={p.reviewStatus} />
                    {!p.duplicateAlert && <Badge tone="good" icon={<CheckCircle2 size={11} />}>Examiné</Badge>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
                    <DuplicateBadges dup={p.dup} />
                    <span>{p.occurrences} occurrences</span>
                    <span>Première découverte : {formatDate(p.firstSeenAt)}</span>
                    <span>Dernière : {formatDate(p.lastSeenAt)}</span>
                    {p.countsTowardGoal && p.goalWeek && <span>Compté une seule fois (semaine du {formatDate(p.goalWeek + "T12:00:00")})</span>}
                  </div>
                </div>
                {p.duplicateAlert && <AckButton kind="duplicate" id={p.id} />}
              </div>
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Fournisseur</th>
                      <th>Sources</th>
                      <th className="text-right">Occurrences</th>
                      <th className="text-right">Coût</th>
                      <th className="text-right">Prix Amazon (BB 90 j)</th>
                      <th className="text-right">Profit prélim.</th>
                      <th>Première découverte</th>
                      <th>Dernière</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.offers.map((o) => (
                      <tr key={o.id}>
                        <td className="max-w-64 truncate">
                          <Supplier name={o.supplierName} url={o.supplierUrl} fallback={o.supplierKey} />
                          {p.dup.exactOfferIds.includes(o.id) && <span className="ml-2"><Badge tone="critical">Doublon exact</Badge></span>}
                        </td>
                        <td><SourceBadges sources={o.sources} /></td>
                        <td className="text-right tabular-nums">{o.occurrences}</td>
                        <td className="text-right tabular-nums">{cad(o.costPrice)}</td>
                        <td className="text-right tabular-nums">{cad(o.amazonPrice)}</td>
                        <td className="text-right tabular-nums">{o.profit.issue ? <span className="text-ink-3">n/d</span> : cad(o.profit.profit)}</td>
                        <td className="text-ink-2">{formatDate(o.firstSeenAt)}</td>
                        <td className="text-ink-2">{formatDate(o.lastSeenAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
