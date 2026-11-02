import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Connexion" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAdmin()) redirect("/");
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
        <LoginForm />
        </div>
      </div>
    </main>
  );
}
