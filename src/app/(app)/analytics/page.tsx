import { Award, CalendarRange, CheckCircle2, TrendingUp } from "lucide-react";
import { ReviewOutcomeChart, SimpleBarChart, WeeklyLeadsChart, type WeeklyPoint } from "@/components/charts";
import { Card, Kpi, PageHeader } from "@/components/ui";
import { formatWeekRange, formatWeekShort, localWeekdayIndex, weekKey } from "@/lib/dates";
import { cad, num, pct } from "@/lib/format";
import { supplierBrand } from "@/lib/normalize";
import { history, loadProducts } from "@/lib/queries";

export const metadata = { title: "Analytics & Productivity" };

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const ROI_BUCKETS: [string, (r: number) => boolean][] = [
  ["< 0 %", (r) => r < 0],
  ["0–15 %", (r) => r >= 0 && r < 15],
  ["15–30 %", (r) => r >= 15 && r < 30],
  ["30–50 %", (r) => r >= 30 && r < 50],
  ["50–100 %", (r) => r >= 50 && r < 100],
  ["≥ 100 %", (r) => r >= 100],
];

export default async function AnalyticsPage() {
  const now = new Date();
  const { products, duplicateEvents } = await loadProducts(now);
  const hist = history(products, duplicateEvents, now, 12);
  const current = weekKey(now);
  const completed = hist.filter((h) => h.key !== current);
  const goal = hist[0]?.goal ?? 50;
  const points: WeeklyPoint[] = hist.map((h) => ({ label: formatWeekShort(h.key), found: h.found, validated: h.validated, rejected: h.rejected, followUp: h.followUp, pending: h.toReview + h.inProgress }));

  const pipeline = products.filter((p) => p.countsTowardGoal);
  const recent = pipeline.filter((p) => p.goalWeek && p.goalWeek >= hist[0].key);
  const avg = completed.length ? completed.reduce((n, h) => n + h.found, 0) / completed.length : 0;
  const best = [...hist].sort((a, b) => b.found - a.found)[0];
  const reached = completed.filter((h) => h.found >= h.goal).length;
  const decided = recent.filter((p) => ["VALIDATED", "REJECTED", "FOLLOW_UP"].includes(p.reviewStatus));
  const validationRate = decided.length ? (decided.filter((p) => p.reviewStatus === "VALIDATED").length / decided.length) * 100 : null;

  const byWeekday = WEEKDAYS.map((label, i) => ({ label, value: recent.filter((p) => localWeekdayIndex(new Date(p.firstSeenAt)) === i).length }));
  const rois = pipeline.map((p) => p.best?.profit.roi).filter((r): r is number => r != null);
  const roiDist = ROI_BUCKETS.map(([label, test]) => ({ label, value: rois.filter(test).length }));

  const suppliers = new Map<string, { name: string; offers: number; rois: number[]; validated: number; monthly: number[] }>();
  for (const p of pipeline)
    for (const o of p.offers) {
      const key = supplierBrand(o.supplierUrl || o.supplierName || "") || o.supplierKey;
      const s = suppliers.get(key) ?? { name: o.supplierName || key, offers: 0, rois: [], validated: 0, monthly: [] };
      s.offers++;
      if (o.profit.roi != null) s.rois.push(o.profit.roi);
      if (o.profit.monthlyProfit != null) s.monthly.push(o.profit.monthlyProfit);
      if (p.reviewStatus === "VALIDATED") s.validated++;
      suppliers.set(key, s);
    }
  const supplierRows = [...suppliers.values()].sort((a, b) => b.offers - a.offers).slice(0, 15);
  const median = (xs: number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };

  return (
    <>
      <PageHeader title="Analytics & Productivity" description="12 dernières semaines (lundi → dimanche, heure du Québec). Rentabilités = estimations préliminaires importées." />
      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Moyenne hebdomadaire" value={num(avg)} hint={`semaines terminées · objectif ${goal}`} icon={<TrendingUp size={16} />} tone="accent" />
        <Kpi label="Meilleure semaine" value={best?.found ?? 0} hint={best ? formatWeekRange(best.key) : "—"} icon={<Award size={16} />} tone="good" />
        <Kpi label="Objectif atteint" value={`${reached} / ${completed.length}`} hint="semaines terminées" icon={<CalendarRange size={16} />} tone="accent" />
        <Kpi label="Taux de validation" value={pct(validationRate, 0)} hint="parmi les leads revus (12 sem.)" icon={<CheckCircle2 size={16} />} tone="good" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Leads uniques par semaine vs objectif">
          <WeeklyLeadsChart data={points} goal={goal} />
        </Card>
        <Card title="Décisions de revue par semaine">
          <ReviewOutcomeChart data={points} />
        </Card>
        <Card title="Productivité par jour de découverte">
          <SimpleBarChart data={byWeekday} name="Leads trouvés" />
          <p className="mt-2 text-xs text-ink-3">Jour de la date d&apos;export (ou d&apos;import) des nouveaux leads, 12 dernières semaines.</p>
        </Card>
        <Card title="Distribution du ROI préliminaire">
          <SimpleBarChart data={roiDist} name="Leads" />
          <p className="mt-2 text-xs text-ink-3">Meilleure offre de chaque lead du pipeline ({rois.length} calculables sur {pipeline.length}).</p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Historique hebdomadaire" padded={false}>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Semaine</th>
                  <th className="text-right">Leads</th>
                  <th className="text-right">% objectif</th>
                  <th className="text-right">Validés</th>
                  <th className="text-right">Rejetés</th>
                  <th className="text-right">Non revus</th>
                  <th className="text-right">Doublons</th>
                </tr>
              </thead>
              <tbody>
                {[...hist].reverse().map((h) => (
                  <tr key={h.key}>
                    <td className="text-ink-2">{formatWeekRange(h.key)}{h.key === current && <span className="ml-2 text-xs text-accent">en cours</span>}</td>
                    <td className="text-right font-medium tabular-nums">{h.found}</td>
                    <td className={`text-right tabular-nums ${h.found >= h.goal ? "text-[#5fd35f]" : ""}`}>{Math.round((h.found / h.goal) * 100)} %</td>
                    <td className="text-right tabular-nums">{h.validated}</td>
                    <td className="text-right tabular-nums">{h.rejected}</td>
                    <td className="text-right tabular-nums">{h.toReview + h.inProgress}</td>
                    <td className="text-right tabular-nums text-ink-2">{h.duplicates}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Par fournisseur (pipeline LEADS)" padded={false}>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Fournisseur</th>
                  <th className="text-right">Offres</th>
                  <th className="text-right">ROI médian*</th>
                  <th className="text-right">Profit mensuel médian*</th>
                  <th className="text-right">Validés</th>
                </tr>
              </thead>
              <tbody>
                {supplierRows.map((s) => (
                  <tr key={s.name}>
                    <td className="max-w-56 truncate">{s.name}</td>
                    <td className="text-right tabular-nums">{s.offers}</td>
                    <td className="text-right tabular-nums">{pct(median(s.rois), 0)}</td>
                    <td className="text-right tabular-nums">{cad(median(s.monthly))}</td>
                    <td className="text-right tabular-nums">{s.validated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!supplierRows.length && <p className="px-4 py-6 text-center text-sm text-ink-3">Aucune donnée.</p>}
          </div>
        </Card>
      </div>
    </>
  );
}
