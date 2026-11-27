import { redirect } from "next/navigation";

// Section « À reconfirmer » retirée : un lead de plus de 30 jours se reconfirme directement dans
// Buy Decisions (vue Un par un). Les anciens liens sont redirigés, le lead demandé en premier.
export default async function ReconfirmPage({ searchParams }: { searchParams: Promise<{ asin?: string }> }) {
  const { asin } = await searchParams;
  redirect(asin ? `/decisions?asin=${encodeURIComponent(asin)}` : "/decisions");
}
