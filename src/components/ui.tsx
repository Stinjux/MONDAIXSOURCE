// Composants d'interface sans état (utilisables côté serveur et client).
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, CircleSlash, Clock, Copy, Eye, HelpCircle, Layers, Repeat, XCircle } from "lucide-react";
import { REVIEW_LABELS, SOURCE_LABELS, type ReviewStatus } from "@/lib/labels";
import { STOCK_LABELS, type StockStatus } from "@/lib/stock";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium tracking-wide text-accent uppercase">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className, title, action, padded = true }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; padded?: boolean }) {
  return (
    <section className={cn("rounded-xl border border-line bg-surface shadow-[0_1px_0_0_#ffffff08_inset]", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {action}
        </div>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, hint, icon, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "default" | "good" | "warning" | "critical" | "accent" }) {
  const toneClass = { default: "text-ink-3", good: "text-good", warning: "text-warning", critical: "text-critical", accent: "text-accent" }[tone];
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-2">{label}</span>
        {icon && <span className={toneClass}>{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-ink tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

export function Progress({ value, max, className, tone = "accent", label }: { value: number; max: number; className?: string; tone?: "accent" | "good"; label: string }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", tone === "good" ? "bg-good" : "bg-accent")} style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

type BadgeTone = "neutral" | "accent" | "good" | "warning" | "serious" | "critical";
const BADGE: Record<BadgeTone, string> = {
  neutral: "border-line-strong/70 bg-surface-3/60 text-ink-2",
  accent: "border-accent/40 bg-accent/10 text-[#8fbcf2]",
  good: "border-good/40 bg-good/10 text-[#5fd35f]",
  warning: "border-warning/40 bg-warning/10 text-warning",
  serious: "border-serious/40 bg-serious/10 text-serious",
  critical: "border-critical/50 bg-critical/10 text-[#f08080]",
};

export function Badge({ children, tone = "neutral", icon, title }: { children: ReactNode; tone?: BadgeTone; icon?: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap", BADGE[tone])}>
      {icon}
      {children}
    </span>
  );
}

const REVIEW_TONE: Record<ReviewStatus, BadgeTone> = { TO_REVIEW: "warning", IN_PROGRESS: "accent", VALIDATED: "good", REJECTED: "critical", FOLLOW_UP: "serious" };
const REVIEW_ICON: Record<ReviewStatus, ReactNode> = {
  TO_REVIEW: <CircleDashed size={11} />,
  IN_PROGRESS: <Clock size={11} />,
  VALIDATED: <CheckCircle2 size={11} />,
  REJECTED: <XCircle size={11} />,
  FOLLOW_UP: <Eye size={11} />,
};

export function ReviewBadge({ status }: { status: string }) {
  const s = (status in REVIEW_LABELS ? status : "TO_REVIEW") as ReviewStatus;
  return (
    <Badge tone={REVIEW_TONE[s]} icon={REVIEW_ICON[s]}>
      {REVIEW_LABELS[s]}
    </Badge>
  );
}

const STOCK_TONE: Record<StockStatus, BadgeTone> = { IN_STOCK: "good", OUT_OF_STOCK: "critical", CHECK_FAILED: "serious", UNVERIFIED: "warning", UNKNOWN: "neutral" };
const STOCK_ICON: Record<StockStatus, ReactNode> = {
  IN_STOCK: <CheckCircle2 size={11} />,
  OUT_OF_STOCK: <CircleSlash size={11} />,
  CHECK_FAILED: <AlertTriangle size={11} />,
  UNVERIFIED: <HelpCircle size={11} />,
  UNKNOWN: <HelpCircle size={11} />,
};

export function StockBadge({ status }: { status: string }) {
  const s = (status in STOCK_LABELS ? status : "UNKNOWN") as StockStatus;
  return (
    <Badge tone={STOCK_TONE[s]} icon={STOCK_ICON[s]}>
      {STOCK_LABELS[s]}
    </Badge>
  );
}

export function SourceBadges({ sources }: { sources: string[] }) {
  return (
    <span className="inline-flex gap-1">
      {sources.map((s) => (
        <Badge key={s} tone={s === "LEADS" ? "accent" : "neutral"}>
          {SOURCE_LABELS[s] ?? s}
        </Badge>
      ))}
    </span>
  );
}

export function DuplicateBadges({ dup, compact }: { dup: { exactOfferIds: string[]; crossSheet: boolean; multiSupplier: boolean }; compact?: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {dup.exactOfferIds.length > 0 && (
        <Badge tone="critical" icon={<Copy size={11} />} title="Même ASIN chez le même fournisseur, plusieurs lignes">
          {compact ? "Exact" : "Doublon exact"}
        </Badge>
      )}
      {dup.crossSheet && (
        <Badge tone="serious" icon={<Repeat size={11} />} title="Présent dans LEADS et OUT OF STOCK">
          {compact ? "2 Sheets" : "Dans les 2 Sheets"}
        </Badge>
      )}
      {dup.multiSupplier && (
        <Badge tone="warning" icon={<Layers size={11} />} title="Même ASIN chez plusieurs fournisseurs">
          {compact ? "Multi-fourn." : "Plusieurs fournisseurs"}
        </Badge>
      )}
    </span>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="text-ink-3">{icon}</div>}
      <div className="text-sm font-medium text-ink">{title}</div>
      {children && <div className="max-w-md text-sm text-ink-3">{children}</div>}
    </div>
  );
}

/** Étiquette « Estimé » / « Vérifié » pour distinguer les valeurs importées des valeurs contrôlées. */
export function OriginTag({ origin }: { origin: "verified" | "imported" | "missing" }) {
  if (origin === "missing") return null;
  return origin === "verified" ? (
    <span className="ml-1 rounded bg-good/15 px-1 text-[10px] font-semibold text-[#5fd35f] uppercase">vérifié</span>
  ) : (
    <span className="ml-1 rounded bg-surface-3 px-1 text-[10px] font-semibold text-ink-3 uppercase">importé</span>
  );
}

export function Asin({ asin, url }: { asin: string; url?: string | null }) {
  const href = url || `https://www.amazon.ca/dp/${asin}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-accent hover:underline">
      {asin}
    </a>
  );
}

export function Supplier({ name, url, fallback }: { name?: string | null; url?: string | null; fallback?: string }) {
  const label = name || fallback || "—";
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="link">
      {label}
    </a>
  ) : (
    <span className="text-ink-2">{label}</span>
  );
}
