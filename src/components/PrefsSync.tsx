"use client";
// Synchronisation des réglages de travail (critères, filtres, panier, budget) avec la base.
// À l'ouverture, la version la plus récente a déjà été appliquée par le script de app/(app)/layout.tsx ;
// ce composant envoie la version du navigateur quand c'est elle la plus récente.
import { useEffect } from "react";
import { pushSaved } from "./DecisionFilters";

export function PrefsSync() {
  useEffect(() => {
    const w = window as unknown as { __mondaixPushPrefs?: boolean };
    if (w.__mondaixPushPrefs) {
      w.__mondaixPushPrefs = false;
      pushSaved();
    }
  }, []);
  return null;
}
