"use client";
import { useActionState } from "react";
import { Lock } from "lucide-react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="password" className="text-xs font-medium text-ink-2">
        Mot de passe administrateur
      </label>
      <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus className="field" />
      {state?.error && (
        <p role="alert" className="rounded-lg border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-[#f08080]">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary mt-1 w-full">
        <Lock size={15} /> {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
