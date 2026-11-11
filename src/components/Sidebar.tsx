"use client";
// Menu latéral : sections, réductible en barre d'icônes (grand écran), recherche ⌘K et densité.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, CalendarCheck, ChevronsLeft, ChevronsRight, Copy, History, KanbanSquare, LayoutDashboard, LogOut, Menu, PackageX, Receipt, RefreshCw, Rows3, Rows4,
  Search, Settings, ShoppingBasket, ShoppingCart, Store, Table2, X,
} from "lucide-react";
import { logout } from "@/app/(app)/actions";
import { cn } from "./ui";
import { readUi, setUi, type UiPrefs } from "./uiPrefs";

type Counts = { duplicates: number; review: number; backInStock: number; reconfirm: number };
type Item = { href: string; label: string; icon: typeof LayoutDashboard; count?: keyof Counts };

export const NAV_SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "Sourcing",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
      { href: "/decisions", label: "Buy Decisions", icon: ShoppingCart },
      { href: "/purchased", label: "Panier potentiel", icon: ShoppingBasket },
      { href: "/weekly-review", label: "Weekly Review", icon: CalendarCheck, count: "review" },
      { href: "/reconfirm", label: "À reconfirmer", icon: RefreshCw, count: "reconfirm" },
    ],
  },
  {
    title: "Catalogue",
    items: [
      { href: "/leads", label: "All Leads", icon: Table2 },
      { href: "/suppliers", label: "Fournisseurs", icon: Store },
      { href: "/out-of-stock", label: "Out of Stock", icon: PackageX, count: "backInStock" },
      { href: "/duplicates", label: "Duplicate Alerts", icon: Copy, count: "duplicates" },
    ],
  },
  {
    title: "Inventaire",
    items: [
      { href: "/cogs", label: "COGS & factures", icon: Receipt },
    ],
  },
  {
    title: "Suivi",
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/imports", label: "Import History", icon: History },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

const openPalette = () => window.dispatchEvent(new Event("mondaix:palette"));

function Brand() {
  return (
    <Link href="/" className="rail-center flex items-center gap-2.5 px-2" title="MONDAIX SOURCE">
      <span className="grid size-9 shrink-0 place-items-center rounded-sm border border-white/30 font-serif text-base font-semibold text-white">M</span>
      <span className="rail-hide leading-tight">
        <span className="block font-serif text-[15px] font-semibold tracking-[0.12em] text-white">MONDAIX</span>
        <span className="block text-[10px] font-medium tracking-[0.28em] text-nav-ink">SOURCE · AMAZON.CA</span>
      </span>
    </Link>
  );
}

function SearchButton() {
  return (
    <button
      type="button"
      onClick={openPalette}
      title="Rechercher (⌘K / Ctrl+K)"
      className="rail-center flex w-full items-center gap-2 rounded-sm border border-white/15 bg-white/5 px-2.5 py-2 text-left text-sm text-nav-ink transition hover:border-white/30 hover:text-white"
    >
      <Search size={15} className="shrink-0" />
      <span className="rail-hide flex-1">Rechercher…</span>
      <kbd className="rail-hide rounded-sm border border-white/20 px-1 font-sans text-[10px]">⌘K</kbd>
    </button>
  );
}

function NavLinks({ counts, onNavigate }: { counts: Counts; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-4" aria-label="Navigation principale">
      {NAV_SECTIONS.map((section) => (
        <div key={section.title}>
          <div className="rail-hide mb-1 px-2.5 text-[10px] font-semibold tracking-[0.16em] text-nav-ink/60 uppercase">{section.title}</div>
          <div className="rail-only mx-3 mb-1 border-t border-nav-line" aria-hidden />
          <div className="flex flex-col gap-0.5">
            {section.items.map(({ href, label, icon: Icon, count }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              const n = count ? counts[count] : 0;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  title={label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rail-center group relative flex items-center gap-3 border-l-[3px] py-2 pr-2.5 pl-2 text-sm transition",
                    active ? "border-white bg-nav-2 font-medium text-white" : "border-transparent text-nav-ink hover:bg-white/5 hover:text-white",
                  )}
                >
                  <Icon size={17} className={cn("shrink-0", active ? "text-white" : "text-nav-ink/80 group-hover:text-white")} />
                  <span className="rail-hide flex-1 truncate">{label}</span>
                  {n > 0 && (
                    <>
                      <span className="rail-hide min-w-5 rounded-sm bg-white/15 px-1.5 text-center text-[11px] leading-5 font-semibold tabular-nums text-white">{n}</span>
                      <span className="rail-only absolute top-1 right-2 size-2 rounded-full bg-[#f5b942]" aria-label={`${n} en attente`} />
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Footer({ ui, onToggleRail }: { ui: UiPrefs; onToggleRail?: () => void }) {
  const compact = ui.density === "compact";
  const row = "rail-center flex w-full items-center gap-3 px-2.5 py-2 text-sm text-nav-ink transition hover:bg-white/5 hover:text-white";
  return (
    <div className="flex flex-col border-t border-nav-line pt-2">
      <button type="button" className={row} onClick={() => setUi({ density: compact ? "comfort" : "compact" })} title={compact ? "Affichage confortable" : "Affichage compact"}>
        {compact ? <Rows3 size={16} className="shrink-0" /> : <Rows4 size={16} className="shrink-0" />}
        <span className="rail-hide">{compact ? "Affichage confortable" : "Affichage compact"}</span>
      </button>
      {onToggleRail && (
        <button type="button" className={row} onClick={onToggleRail} title={ui.sidebar === "rail" ? "Déplier le menu" : "Réduire le menu"}>
          {ui.sidebar === "rail" ? <ChevronsRight size={16} className="shrink-0" /> : <ChevronsLeft size={16} className="shrink-0" />}
          <span className="rail-hide">Réduire le menu</span>
        </button>
      )}
      <form action={logout}>
        <button type="submit" className={row} title="Déconnexion">
          <LogOut size={16} className="shrink-0" /> <span className="rail-hide">Déconnexion</span>
        </button>
      </form>
    </div>
  );
}

export function Sidebar({ counts }: { counts: Counts }) {
  const [open, setOpen] = useState(false);
  const [ui, setUiState] = useState<UiPrefs>({ sidebar: "full", density: "comfort" });
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    setUiState(readUi());
    const onUi = (e: Event) => setUiState((e as CustomEvent<UiPrefs>).detail);
    window.addEventListener("mondaix:ui", onUi);
    return () => window.removeEventListener("mondaix:ui", onUi);
  }, []);

  return (
    <>
      {/* Bureau */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] flex-col gap-5 overflow-hidden border-r border-nav-line bg-nav px-2.5 py-5 transition-[width] duration-200 lg:flex">
        <Brand />
        <SearchButton />
        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          <NavLinks counts={counts} />
        </div>
        <Footer ui={ui} onToggleRail={() => setUi({ sidebar: ui.sidebar === "rail" ? "full" : "rail" })} />
      </aside>

      {/* Mobile */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-nav-line bg-nav px-4 py-3 lg:hidden">
        <Brand />
        <span className="flex gap-1">
          <button type="button" className="btn px-2.5 text-white hover:bg-white/10" onClick={openPalette} aria-label="Rechercher">
            <Search size={18} />
          </button>
          <button type="button" className="btn px-2.5 text-white hover:bg-white/10" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
            <Menu size={18} />
          </button>
        </span>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-5 border-r border-nav-line bg-nav px-3 py-5">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" className="btn px-2.5 text-white hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Fermer le menu">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavLinks counts={counts} onNavigate={() => setOpen(false)} />
            </div>
            <Footer ui={ui} />
          </aside>
        </div>
      )}
    </>
  );
}
