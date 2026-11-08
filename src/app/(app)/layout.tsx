import { CommandPalette } from "@/components/CommandPalette";
import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/auth";
import { navCounts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const counts = await navCounts();
  return (
    <div className="min-h-screen">
      <Sidebar counts={counts} />
      <CommandPalette />
      <main className="transition-[padding] duration-200 lg:pl-[var(--sidebar-w)]">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
