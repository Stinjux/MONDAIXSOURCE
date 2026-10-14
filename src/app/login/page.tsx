import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Connexion" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAdmin()) redirect("/");
  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(ellipse_at_top,#3987e526,transparent_60%)] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface/90 p-7 shadow-2xl shadow-black/40 backdrop-blur">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-accent to-[#6250d6] text-lg font-bold text-white">M</span>
          <div>
            <div className="text-base font-semibold tracking-[0.14em]">MONDAIX SOURCE</div>
            <div className="text-xs text-ink-3">Sourcing Amazon FBA · Amazon.ca</div>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
