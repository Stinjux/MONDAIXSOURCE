// Ancien « Mode décision » : désormais la vue « Un par un » de Buy Decisions (les anciens liens restent valides).
import { redirect } from "next/navigation";

export default async function DecidePage({ searchParams }: { searchParams: Promise<{ asin?: string }> }) {
  const { asin } = await searchParams;
  redirect(asin ? `/decisions?asin=${encodeURIComponent(asin)}` : "/decisions");
}
