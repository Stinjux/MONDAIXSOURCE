"use client";
import { useEffect, useRef, useState } from "react";
import { Package } from "lucide-react";
import { cn } from "./ui";

/**
 * Vignette du produit, chargée directement depuis les images d'Amazon à partir de l'ASIN
 * (aucune clé API). Amazon renvoie un pixel transparent quand l'image n'existe pas :
 * on affiche alors une icône.
 */
export function ProductImage({ asin, size = 40, className }: { asin: string; size?: number; className?: string }) {
  const [missing, setMissing] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // Image déjà chargée avant que la page soit interactive : onLoad n'a pas été reçu
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth < 2) setMissing(true);
  }, [asin]);
  const box = { width: size, height: size };
  if (missing || !/^[A-Z0-9]{10}$/.test(asin)) {
    return (
      <span style={box} className={cn("grid shrink-0 place-items-center rounded-md border border-line bg-surface-3 text-ink-3", className)} aria-hidden>
        <Package size={Math.round(size * 0.45)} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- image externe, pas d'optimisation Next nécessaire
    <img
      ref={ref}
      src={`https://m.media-amazon.com/images/P/${asin}.01._SL${Math.min(500, Math.round(size * 2))}_.jpg`}
      alt=""
      style={box}
      loading="lazy"
      referrerPolicy="no-referrer"
      onLoad={(e) => e.currentTarget.naturalWidth < 2 && setMissing(true)}
      onError={() => setMissing(true)}
      className={cn("shrink-0 rounded-md border border-line bg-white object-contain p-0.5", className)}
    />
  );
}
