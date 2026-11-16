"use client";
// Compte connecté et profils des deux comptes, pour afficher « par X » partout dans l'interface.
import { createContext, useContext } from "react";
import { buildProfiles, type Profiles, type UserKey } from "@/lib/users";

export type UserInfo = { me: UserKey; profiles: Profiles; partnerEnabled: boolean };
const Ctx = createContext<UserInfo>({ me: "owner", profiles: buildProfiles(), partnerEnabled: false });

export function UserProvider({ value, children }: { value: UserInfo; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useUser = () => useContext(Ctx);
