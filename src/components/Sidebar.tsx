"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, CalendarCheck, Copy, History, KanbanSquare, LayoutDashboard, LogOut, Menu, PackageCheck, PackageX, Settings, ShoppingCart, Table2, X } from "lucide-react";
import { logout } from "@/app/(app)/actions";
import { cn } from "./ui";

type Counts = { duplicates: number; review: number; backInStock: number };

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "All Leads", icon: Table2 },
  { href: "/decisions", label: "Buy Decisions", icon: ShoppingCart },
  { href: "/purchases", label: "Achat · Rejeté · À définir", icon: KanbanSquare },
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
      <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-[#6250d6] text-sm font-bold text-white shadow-lg shadow-accent/20">M</span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold tracking-[0.14em] text-ink">MONDAIX</span>
        <span className="block text-[10px] font-medium tracking-[0.3em] text-ink-3">SOURCE · AMAZON.CA</span>
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
              "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition",
              active ? "bg-accent-soft text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon size={17} className={active ? "text-accent" : "text-ink-3 group-hover:text-ink-2"} />
            <span className="flex-1 truncate">{label}</span>
            {n > 0 && (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold tabular-nums",
                  count === "backInStock" ? "bg-good/20 text-[#5fd35f]" : count === "duplicates" ? "bg-serious/20 text-serious" : "bg-warning/15 text-warning",
                )}
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
    <form action={logout} className="border-t border-line pt-3">
      <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-ink-3 transition hover:bg-surface-2 hover:text-ink">
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 border-r border-line bg-[#0c1220] px-3 py-5 lg:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto">
          <NavLinks counts={counts} />
        </div>
        <Footer />
      </aside>

      {/* Mobile */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-[#0c1220]/95 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <button type="button" className="btn-ghost px-2.5" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
          <Menu size={18} />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 border-r border-line bg-[#0c1220] px-3 py-5">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" className="btn-ghost px-2.5" onClick={() => setOpen(false)} aria-label="Fermer le menu">
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
