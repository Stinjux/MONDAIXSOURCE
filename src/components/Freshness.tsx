import { CalendarClock, CheckCircle2, RefreshCw } from "lucide-react";
import { FRESHNESS_LABELS, freshnessText, type Freshness } from "@/lib/freshness";
import { Badge } from "./ui";

const TONE = { FRESH: "good", SOON: "warning", STALE: "critical" } as const;
const ICON = { FRESH: <CheckCircle2 size={10} />, SOON: <CalendarClock size={10} />, STALE: <RefreshCw size={10} /> };

/** Pastille de fraîcheur : à jour (vert), bientôt (orange), à reconfirmer (rouge). */
export function FreshnessPill({ fresh, compact }: { fresh: Freshness; compact?: boolean }) {
  const text = compact
    ? fresh.state === "STALE"
      ? "À reconfirmer"
      : fresh.ageDays === 0
        ? "Aujourd'hui"
        : `${fresh.ageDays} j`
    : FRESHNESS_LABELS[fresh.state];
  return (
    <Badge tone={TONE[fresh.state]} icon={ICON[fresh.state]} title={freshnessText(fresh)}>
      {text}
    </Badge>
  );
}
