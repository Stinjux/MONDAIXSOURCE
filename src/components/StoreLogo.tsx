"use client";
import { useEffect, useRef, useState } from "react";
import { storeInitials } from "@/lib/stores";
import { cn } from "./ui";

// Couleurs sobres pour les initiales, choisies de façon stable d'après le nom
const TONES = ["bg-[#0b3d91]", "bg-[#1f5f8b]", "bg-[#2f4858]", "bg-[#5a4b81]", "bg-[#1b6b5a]", "bg-[#7a4a2a]", "bg-[#3b4a6b]"];
const toneOf = (name: string) => TONES[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % TONES.length];

/** Logo du commerce (icône de son site), ou ses initiales sur une pastille de couleur. */
export function StoreLogo({ name, domain, size = 32, className }: { name: string; domain: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // Icône déjà en échec avant que la page soit interactive : onError n'a pas été reçu
  useEffect(() => {
    if (ref.current?.complete && ref.current.naturalWidth < 2) setFailed(true);
  }, [domain]);
  const box = { width: size, height: size };
  if (!domain || failed) {
    return (
      <span style={{ ...box, fontSize: Math.round(size * 0.36) }} className={cn("grid shrink-0 place-items-center rounded-md font-semibold tracking-wide text-white", toneOf(name), className)} aria-hidden>
        {storeInitials(name)}
      </span>
    );
  }
  return (
    <span style={box} className={cn("grid shrink-0 place-items-center rounded-md border border-line bg-white", className)} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- icône externe */}
      <img
        ref={ref}
        src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
        alt=""
        width={Math.round(size * 0.6)}
        height={Math.round(size * 0.6)}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setFailed(true)}
        onLoad={(e) => e.currentTarget.naturalWidth < 2 && setFailed(true)}
      />
    </span>
  );
}
