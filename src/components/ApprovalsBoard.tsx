"use client";
// Page « Achats à deux » : les décisions d'achat des deux comptes, croisées. Un achat n'est confirmé
// que lorsque les deux l'ont approuvé ; en cas de désaccord il est « À discuter ».
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Handshake, Hourglass, MessageSquareWarning, ShoppingCart, XCircle } from "lucide-react";
import { bucketFor, type BuyBucket, type BuyStatus } from "@/lib/buyApproval";
import { evaluateRow, inScope } from "@/lib/decisionFilters";
import type { DecisionRow } from "@/lib/decisionRows";
import { cad, num, pct } from "@/lib/format";
import { otherUser } from "@/lib/users";
import { BuyVotePanel } from "./BuyVotePanel";
import { QuickFilters, readSaved, useDecisionFilters, writeSaved } from "./DecisionFilters";
import { ProductImage } from "./ProductImage";
import { useUser } from "./UserContext";
import { ByUser, EmptyState, Supplier, cn } from "./ui";

type Tab = Exclude<BuyBucket, null>;

export function ApprovalsBoard({ rows, statuses, currentWeek }: { rows: DecisionRow[]; statuses: Record<string, BuyStatus>; currentWeek: string }) {
  const { me, profiles, partnerEnabled } = useUser();
  const other = profiles[otherUser(me)];
  const { filters, update } = useDecisionFilters();
  const [tab, setTab] = useState<Tab>("TO_APPROVE");
  const [cart, setCart] = useState<Record<string, { qty: number }>>({});
  useEffect(() => setCart((readSaved().cart ?? {}) as Record<string, { qty: number }>), []);

  const TABS: { key: Tab; label: string; hint: string; icon: React.ReactNode }[] = [
    { key: "TO_APPROVE", label: "À approuver", hint: `Proposés par ${other.name}, en attente de votre décision`, icon: <Handshake size={15} /> },
    { key: "DISCUSS", label: "À discuter", hint: "L'un approuve, l'autre refuse", icon: <MessageSquareWarning size={15} /> },
    { key: "WAITING", label: `En attente de ${other.name}`, hint: `Vous les avez approuvés ; ${other.name} doit encore décider`, icon: <Hourglass size={15} /> },
    { key: "APPROVED", label: "Approuvés à deux", hint: "Prêts pour le panier", icon: <CheckCircle2 size={15} /> },
    { key: "DECLINED", label: "Refusés", hint: "Achat refusé, sans approbation", icon: <XCircle size={15} /> },
  ];

  const items = useMemo(
    () =>
      rows
        .filter((r) => statuses[r.productId])
        .map((r) => ({ row: evaluateRow(r, filters.thresholds), status: statuses[r.productId] }))
        .filter(({ row }) => inScope(row, { ...filters, includeUnavailable: true }, currentWeek))
        .map((x) => ({ ...x, bucket: bucketFor(x.status, me) as Tab })),
    [rows, statuses, filters, currentWeek, me],
  );
  const counts = Object.fromEntries(TABS.map((t) => [t.key, items.filter((i) => i.bucket === t.key).length])) as Record<Tab, number>;
  const visible = items
    .filter((i) => i.bucket === tab)
    .sort((a, b) => {
      const at = (s: BuyStatus) => Object.values(s.latest).map((v) => v!.at).sort().at(-1) ?? "";
      return at(b.status).localeCompare(at(a.status));
    });

  const addToCart = (ids: string[]) => {
    const next = { ...((readSaved().cart ?? {}) as Record<string, { qty: number }>) };
    for (const id of ids) {
      const q = statuses[id]?.quantity ?? 1;
      next[id] = { ...next[id], qty: Math.max(next[id]?.qty ?? 0, q) };
    }
    writeSaved({ cart: next });
    setCart(next);
  };
  const approvedNotInCart = visible.filter((i) => tab === "APPROVED" && !cart[i.row.productId]).map((i) => i.row.productId);

  if (!partnerEnabled) {
    return (
      <div className="rounded-md border border-line bg-surface">
        <EmptyState title="Un seul compte pour l'instant" icon={<Handshake size={22} />}>
          Ajoutez la variable Railway <code className="font-mono text-xs">PARTNER_PASSWORD</code> au service web pour créer le compte de votre partenaire. Chaque achat devra alors être approuvé par vous deux.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <QuickFilters filters={filters} update={update} />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" role="tablist" aria-label="Décisions d'achat">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex flex-col items-start gap-1 rounded-md border bg-surface px-3 py-2.5 text-left transition",
              tab === t.key ? "border-accent bg-accent-soft ring-1 ring-accent/30" : "border-line hover:border-line-strong",
            )}
          >
            <span className={cn("flex w-full items-center gap-1.5 text-sm font-semibold", tab === t.key ? "text-accent" : "text-ink")}>
              {t.icon} <span className="truncate">{t.label}</span>
              <span className={cn("ml-auto rounded-sm px-1.5 text-xs tabular-nums", (t.key === "TO_APPROVE" || t.key === "DISCUSS") && counts[t.key] ? "bg-accent text-white" : "bg-surface-3 text-ink-2")}>{counts[t.key]}</span>
            </span>
            <span className="text-[11px] leading-snug text-ink-3">{t.hint}</span>
          </button>
        ))}
      </div>

      {tab === "APPROVED" && approvedNotInCart.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-good/40 bg-good/[0.06] px-4 py-2.5 text-sm">
          <CheckCircle2 size={16} className="text-good" />
          <span className="text-ink">
            {approvedNotInCart.length} achat{approvedNotInCart.length > 1 ? "s" : ""} approuvé{approvedNotInCart.length > 1 ? "s" : ""} par vous deux pas encore au panier.
          </span>
          <button type="button" className="btn-primary ml-auto" onClick={() => addToCart(approvedNotInCart)}>
            <ShoppingCart size={15} /> Tout ajouter au panier
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-md border border-line bg-surface">
          <EmptyState title="Rien ici pour l'instant" icon={<CheckCircle2 size={22} />}>
            {TABS.find((t) => t.key === tab)!.hint}. Les filtres de la barre « Afficher seulement » s&apos;appliquent aussi.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {visible.map(({ row: r, status }) => (
            <li key={r.productId} className="grid gap-3 rounded-md border border-line bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex gap-3">
                  <ProductImage asin={r.asin} size={64} />
                  <div className="min-w-0">
                    <Link href={`/leads/${r.asin}`} className="line-clamp-2 text-sm font-semibold text-ink hover:text-accent hover:underline">
                      {r.name}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
                      <span className="font-mono">{r.asin}</span>
                      {r.supplierName && <Supplier name={r.supplierName} url={r.supplierUrl} product={r.name} />}
                    </div>
                  </div>
                </div>
                <dl className="grid grid-cols-4 gap-2 rounded-sm bg-page px-2.5 py-2 text-center">
                  {[
                    ["ROI", pct(r.roi, 0), "ROI"],
                    ["Profit", cad(r.profit), "Profit par unité"],
                    ["Ventes", num(r.estimatedSales), "Ventes estimées par mois"],
                    ["Coût", cad(r.costPrice), "Coût par unité"],
                  ].map(([k, v, t]) => (
                    <div key={k} title={t}>
                      <dt className="text-[10px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{k}</dt>
                      <dd className="text-sm font-semibold tabular-nums text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {status.quantity != null && <span className="text-ink-2">Quantité proposée : <b className="text-ink tabular-nums">{status.quantity}</b></span>}
                  {tab === "APPROVED" &&
                    (cart[r.productId] ? (
                      <span className="inline-flex items-center gap-1 text-good">
                        <ShoppingCart size={12} /> Au panier ({cart[r.productId].qty})
                      </span>
                    ) : (
                      <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => addToCart([r.productId])}>
                        <ShoppingCart size={12} /> Ajouter au panier
                      </button>
                    ))}
                  <Link href={`/decisions?asin=${r.asin}`} className="ml-auto text-accent hover:underline">
                    Ouvrir la décision
                  </Link>
                </div>
                {Object.values(status.latest)
                  .filter((v) => v!.vote === "BUY")
                  .sort((a, b) => a!.at.localeCompare(b!.at))
                  .slice(0, 1)
                  .map((v) => (
                    <ByUser key={v!.user} profile={profiles[v!.user]} prefix="Proposé par" />
                  ))}
              </div>
              <BuyVotePanel productId={r.productId} status={status} defaultQty={status.quantity ?? 1} compact />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
