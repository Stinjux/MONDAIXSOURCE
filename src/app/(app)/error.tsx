"use client";
// Erreur pendant l'affichage d'une page : message clair et bouton « Réessayer », sans perdre le menu.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  useEffect(() => {
    console.error(error);
  }, [error]);
  // Réessayer : recharger les données du serveur, puis réafficher la page
  const retry = () =>
    start(() => {
      router.refresh();
      reset();
    });
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-md border border-line bg-surface p-6 text-center">
      <AlertTriangle size={28} className="mx-auto text-critical" />
      <h1 className="mt-3 font-serif text-2xl font-semibold text-ink">Cette page n&apos;a pas pu s&apos;afficher</h1>
      <p className="mt-2 text-sm text-ink-2">
        Le serveur ou la base de données ne répond pas pour le moment. Vos données ne sont ni perdues ni modifiées : réessayez dans quelques instants.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button type="button" className="btn-primary" onClick={retry} disabled={pending}>
          <RefreshCw size={15} className={pending ? "animate-spin" : ""} /> {pending ? "Nouvel essai…" : "Réessayer"}
        </button>
        <Link href="/" className="btn-ghost">
          Retour au Dashboard
        </Link>
      </div>
      {error.digest && <p className="mt-4 font-mono text-[11px] text-ink-3">Référence : {error.digest}</p>}
    </div>
  );
}
