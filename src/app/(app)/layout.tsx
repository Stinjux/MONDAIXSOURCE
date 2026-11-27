import { CommandPalette } from "@/components/CommandPalette";
import { Sidebar } from "@/components/Sidebar";
import { partnerEnabled, requireAdmin } from "@/lib/auth";
import { UserProvider } from "@/components/UserContext";
import { navCounts } from "@/lib/queries";
import { getProfiles, getSharedPrefs } from "@/lib/settings";
import { PrefsSync } from "@/components/PrefsSync";
import { prefsBootScript, prefsStorageKeyFor } from "@/lib/prefsBoot";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAdmin();
  const [counts, prefs, profiles] = await Promise.all([navCounts(new Date(), me), getSharedPrefs(me), getProfiles()]);
  const user = { me, profiles, partnerEnabled: partnerEnabled() };
  return (
    <UserProvider value={user}>
      <div className="min-h-screen">
        {/* Réglages de travail du compte connecté : la version la plus récente (base ou navigateur) est appliquée avant l'affichage */}
        <script dangerouslySetInnerHTML={{ __html: prefsBootScript(prefs, prefsStorageKeyFor(me)) }} />
        <PrefsSync />
        <Sidebar counts={counts} />
        <CommandPalette />
        <main className="transition-[padding] duration-200 lg:pl-[var(--sidebar-w)]">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </UserProvider>
  );
}
