"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, CalendarCheck, Copy, History, KanbanSquare, LayoutDashboard, LogOut, Menu, PackageCheck, PackageX, RefreshCw, Settings, ShoppingCart, Store, Table2, X } from "lucide-react";
import { logout } from "@/app/(app)/actions";
import { cn } from "./ui";

type Counts = { duplicates: number; review: number; backInStock: number; reconfirm: number };

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "All Leads", icon: Table2 },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/suppliers", label: "Fournisseurs", icon: Store },
  { href: "/decisions", label: "Buy Decisions", icon: ShoppingCart },
  { href: "/reconfirm", label: "À reconfirmer", icon: RefreshCw, count: "reconfirm" as const },
  { href: "/purchased", label: "Acheté", icon: PackageCheck },
  { href: "/out-of-stock", label: "Out of Stock", icon: PackageX, count: "backInStock" as const },
  { href: "/duplicates", label: "Duplicate Alerts", icon: Copy, count: "duplicates" as const },
  { href: "/weekly-review", label: "Weekly Review", icon: CalendarCheck, count: "review" as const },
  { href: "/analytics", label: "Analytics & Productivity", icon: BarChart3 },
  { href: "/imports", label: "Import History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <span className="grid size-9 place-items-center rounded-sm border border-white/30 font-serif text-base font-semibold text-white">M</span>
      <span className="leading-tight">
        <span className="block font-serif text-[15px] font-semibold tracking-[0.12em] text-white">MONDAIX</span>
        <span className="block text-[10px] font-medium tracking-[0.28em] text-nav-ink">SOURCE · AMAZON.CA</span>
      </span>
    </Link>
  );
}

function NavLinks({ counts, onNavigate }: { counts: Counts; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Navigation principale">
      {NAV.map(({ href, label, icon: Icon, count }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        const n = count ? counts[count] : 0;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 border-l-[3px] py-2 pr-2.5 pl-2 text-sm transition",
              active ? "border-white bg-nav-2 font-medium text-white" : "border-transparent text-nav-ink hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon size={17} className={active ? "text-white" : "text-nav-ink/80 group-hover:text-white"} />
            <span className="flex-1 truncate">{label}</span>
            {n > 0 && (
              <span
                className="min-w-5 rounded-sm bg-white/15 px-1.5 text-center text-[11px] leading-5 font-semibold tabular-nums text-white"
              >
                {n}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function Footer() {
  return (
    <form action={logout} className="border-t border-nav-line pt-3">
      <button type="submit" className="flex w-full items-center gap-3 px-2.5 py-2 text-sm text-nav-ink transition hover:bg-white/5 hover:text-white">
        <LogOut size={16} /> Déconnexion
      </button>
    </form>
  );
}

export function Sidebar({ counts }: { counts: Counts }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      {/* Bureau */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 border-r border-nav-line bg-nav px-3 py-5 lg:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto">
          <NavLinks counts={counts} />
        </div>
        <Footer />
      </aside>

      {/* Mobile */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-nav-line bg-nav px-4 py-3 lg:hidden">
        <Brand />
        <button type="button" className="btn px-2.5 text-white hover:bg-white/10" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
          <Menu size={18} />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 border-r border-nav-line bg-nav px-3 py-5">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" className="btn px-2.5 text-white hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Fermer le menu">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavLinks counts={counts} onNavigate={() => setOpen(false)} />
            </div>
            <Footer />
          </aside>
        </div>
      )}
    </>
  );
}
