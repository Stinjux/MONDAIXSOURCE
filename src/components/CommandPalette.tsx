"use client";
// Palette de commandes (⌘K / Ctrl+K, ou « / ») : aller à un lead, un commerce ou une page,
// et lancer les actions courantes, sans quitter le clavier.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CornerDownLeft, PanelLeftClose, RefreshCw, Rows4, Search, Store } from "lucide-react";
import { runManualSync } from "@/app/(app)/actions";
import { REVIEW_LABELS, type ReviewStatus } from "@/lib/labels";
import { ProductImage } from "./ProductImage";
import { NAV_SECTIONS } from "./Sidebar";
import { readUi, setUi } from "./uiPrefs";
import { cn } from "./ui";

type Lead = { asin: string; name: string; reviewStatus: string; store: string | null };
type StoreHit = { key: string; name: string };
type Entry = { id: string; group: string; label: string; hint?: string; icon: React.ReactNode; run: () => void };

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stores, setStores] = useState<StoreHit[]>([]);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setLeads([]);
    setStores([]);
    setStatus(null);
  }, []);

  // Ouverture : ⌘K / Ctrl+K partout, « / » hors d'un champ, ou bouton « Rechercher » du menu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
      if ((e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        e.stopPropagation();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mondaix:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mondaix:palette", onOpen);
    };
  }, []);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  // Recherche des leads et commerces (après une courte pause de frappe)
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setLeads([]);
      setStores([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { leads: Lead[]; stores: StoreHit[] };
        setLeads(data.leads);
        setStores(data.stores);
      } catch {
        /* recherche annulée ou hors ligne */
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  const entries = useMemo<Entry[]>(() => {
    const term = q.trim().toLowerCase();
    const match = (s: string) => !term || s.toLowerCase().includes(term);
    const ui = typeof window === "undefined" ? null : readUi();
    const pages = NAV_SECTIONS.flatMap((s) => s.items).filter((i) => match(i.label));
    const actions: Entry[] = [
      {
        id: "sync",
        group: "Actions",
        label: "Synchroniser les Sheets",
        icon: <RefreshCw size={15} />,
        run: async () => {
          setStatus("Synchronisation en cours…");
          const res = await runManualSync();
          setStatus(res.ok ? "Synchronisation terminée" : res.error ?? "Synchronisation en échec");
          router.refresh();
        },
      },
      {
        id: "density",
        group: "Actions",
        label: ui?.density === "compact" ? "Affichage confortable" : "Affichage compact",
        icon: <Rows4 size={15} />,
        run: () => {
          setUi({ density: readUi().density === "compact" ? "comfort" : "compact" });
          close();
        },
      },
      {
        id: "rail",
        group: "Actions",
        label: ui?.sidebar === "rail" ? "Déplier le menu" : "Réduire le menu",
        icon: <PanelLeftClose size={15} />,
        run: () => {
          setUi({ sidebar: readUi().sidebar === "rail" ? "full" : "rail" });
          close();
        },
      },
    ].filter((a) => match(a.label));
    return [
      ...leads.map((l) => ({
        id: `lead-${l.asin}`,
        group: "Leads",
        label: l.name,
        hint: [l.asin, l.store, REVIEW_LABELS[l.reviewStatus as ReviewStatus]].filter(Boolean).join(" · "),
        icon: <ProductImage asin={l.asin} size={28} />,
        run: () => go(`/leads/${l.asin}`),
      })),
      ...stores.map((s) => ({ id: `store-${s.key}`, group: "Commerces", label: s.name, icon: <Store size={15} />, run: () => go(`/suppliers?f=${encodeURIComponent(s.key)}`) })),
      ...pages.map((p) => ({ id: `page-${p.href}`, group: "Pages", label: p.label, icon: <p.icon size={15} />, run: () => go(p.href) })),
      ...actions,
    ];
  }, [q, leads, stores, go, close, router]);

  useEffect(() => setActive(0), [q, leads.length, stores.length]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(entries.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      entries[active]?.run();
    }
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Recherche et commandes">
      <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Fermer" onClick={close} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-md border border-line bg-surface shadow-[0_24px_60px_-20px_rgb(11_31_58/0.5)]" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={17} className="shrink-0 text-ink-3" />
          <input
            ref={inputRef}
            className="h-12 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
            placeholder="Rechercher un produit, un ASIN, un commerce, une page…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Rechercher"
            aria-activedescendant={entries[active] ? `cmd-${entries[active].id}` : undefined}
          />
          <kbd className="rounded-sm border border-line px-1.5 text-[10px] text-ink-3">Échap</kbd>
        </div>
        <ul className="max-h-[55vh] overflow-y-auto py-1.5" role="listbox">
          {entries.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-3">Aucun résultat</li>}
          {entries.map((e, i) => {
            const header = e.group !== lastGroup;
            lastGroup = e.group;
            return (
              <li key={e.id}>
                {header && <div className="px-4 pt-2.5 pb-1 text-[10px] font-semibold tracking-[0.12em] text-ink-3 uppercase">{e.group}</div>}
                <button
                  id={`cmd-${e.id}`}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => e.run()}
                  className={cn("flex w-full items-center gap-3 px-4 py-2 text-left", i === active ? "bg-accent-soft" : "")}
                >
                  <span className={cn("grid size-7 shrink-0 place-items-center", i === active ? "text-accent" : "text-ink-3")}>{e.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", i === active ? "font-medium text-ink" : "text-ink")}>{e.label}</span>
                    {e.hint && <span className="block truncate text-[11px] text-ink-3">{e.hint}</span>}
                  </span>
                  {i === active && <CornerDownLeft size={14} className="shrink-0 text-ink-3" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between border-t border-line bg-surface-2 px-4 py-2 text-[11px] text-ink-3">
          <span>{status ?? (q.trim().length < 2 ? "Tapez au moins 2 caractères pour chercher vos leads" : `${leads.length} lead${leads.length > 1 ? "s" : ""} trouvé${leads.length > 1 ? "s" : ""}`)}</span>
          <span className="flex items-center gap-2">
            <span>↑↓ naviguer</span>
            <span className="flex items-center gap-1">
              <ArrowRight size={11} /> Entrée ouvrir
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
