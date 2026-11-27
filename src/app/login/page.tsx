import { redirect } from "next/navigation";
import { isAdmin, partnerEnabled } from "@/lib/auth";
import { UserAvatar } from "@/components/ui";
import { getProfiles } from "@/lib/settings";
import { ROLE_LABELS, USER_KEYS, buildProfiles } from "@/lib/users";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Connexion" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ deconnecte?: string }> }) {
  if (await isAdmin()) redirect("/");
  const { deconnecte } = await searchParams;
  // Les deux comptes, pour savoir qui se connecte (noms par défaut si la base ne répond pas)
  const profiles = await getProfiles().catch(() => buildProfiles());
  const accounts = USER_KEYS.filter((u) => u === "owner" || partnerEnabled());
  return (
    <main className="grid min-h-screen place-items-center bg-page px-4">
      <div className="w-full max-w-sm overflow-hidden rounded-md border border-line bg-surface shadow-[0_8px_24px_-12px_rgb(19_35_58/0.25)]">
        <div className="flex items-center gap-3 bg-nav px-7 py-5">
          <span className="grid size-10 place-items-center rounded-sm border border-white/30 font-serif text-lg font-semibold text-white">M</span>
          <div>
            <div className="font-serif text-base font-semibold tracking-[0.12em] text-white">MONDAIX SOURCE</div>
            <div className="text-xs text-nav-ink">Sourcing Amazon FBA · Amazon.ca</div>
          </div>
        </div>
        <div className="p-7">
          {deconnecte && (
            <p role="status" className="mb-4 rounded-sm border border-good/40 bg-good/[0.07] px-3 py-2 text-sm text-ink">
              Vous êtes déconnecté. Entrez votre mot de passe, ou celui de l&apos;autre compte, pour vous reconnecter.
            </p>
          )}
          <ul className="mb-5 flex flex-col gap-2" aria-label="Comptes">
            {accounts.map((u) => (
              <li key={u} className="flex items-center gap-2.5 rounded-sm border border-line px-3 py-2">
                <UserAvatar profile={profiles[u]} size={28} />
                <span className="leading-tight">
                  <span className="block text-sm font-semibold text-ink">{profiles[u].name}</span>
                  <span className="block text-[10px] tracking-[0.12em] text-ink-3 uppercase">{ROLE_LABELS[u]}</span>
                </span>
              </li>
            ))}
          </ul>
          <LoginForm />
          {accounts.length > 1 && <p className="mt-3 text-[11px] text-ink-3">Chacun son mot de passe : l&apos;app reconnaît le compte et enregistre chaque action à son nom.</p>}
        </div>
      </div>
    </main>
  );
}
