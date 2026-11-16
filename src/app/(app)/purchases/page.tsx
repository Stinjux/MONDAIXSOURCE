// Ancienne page « Achat · Rejeté · À définir », remplacée par le Pipeline (les anciens liens restent valides).
import { redirect } from "next/navigation";
import { STAGE_INFO, stageFromSlug } from "@/lib/pipeline";

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const stage = stageFromSlug((await searchParams).vue);
  redirect(stage ? `/pipeline?vue=${STAGE_INFO[stage].slug}` : "/pipeline");
}
