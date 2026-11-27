"use client";
// Settings : noms affichés des deux comptes (« par Marc », avatars). Les mots de passe restent des
// variables Railway (ADMIN_PASSWORD, PARTNER_PASSWORD) et ne sont jamais affichés.
import { useState, useTransition } from "react";
import { saveProfileNames } from "@/app/(app)/actions";
import { buildProfiles, type UserKey } from "@/lib/users";
import { useUser } from "./UserContext";
import { UserAvatar } from "./ui";

export function UsersForm() {
  const { me, profiles, partnerEnabled } = useUser();
  const [names, setNames] = useState<Record<UserKey, string>>({ owner: profiles.owner.name, partner: profiles.partner.name });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const preview = buildProfiles(names);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveProfileNames(names);
          setMsg(res.ok ? { ok: true, text: "Noms enregistrés" } : { ok: false, text: res.error });
        });
      }}
    >
      {(["owner", "partner"] as UserKey[]).map((u) => (
        <div key={u} className="flex items-center gap-3">
          <UserAvatar profile={preview[u]} size={32} />
          <label className="flex-1 text-xs text-ink-2">
            {u === "owner" ? "Propriétaire · mot de passe ADMIN_PASSWORD" : "Partenaire · mot de passe PARTNER_PASSWORD"}
            {u === me && <span className="ml-1 font-semibold text-accent">(vous)</span>}
            <input className="field mt-0.5 py-1.5 text-sm" value={names[u]} maxLength={40} onChange={(e) => setNames((n) => ({ ...n, [u]: e.target.value }))} placeholder={u === "owner" ? "Justin" : "Hamza"} />
          </label>
          {u === "partner" && (
            <span className={partnerEnabled ? "text-xs font-medium text-good" : "text-xs text-ink-3"}>{partnerEnabled ? "Compte actif" : "Inactif"}</span>
          )}
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer les noms"}
        </button>
        {msg && <span className={msg.ok ? "text-xs text-good" : "text-xs text-critical"}>{msg.text}</span>}
      </div>
    </form>
  );
}
