"use client";

import { useActionState, useEffect, useRef } from "react";
import { acceptPersonnelInvitation } from "./actions";
import type { AuthState } from "@/app/login/actions";

export function InviteForm({ tenantSlug }: { tenantSlug: string }) {
  const tokenInput = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(acceptPersonnelInvitation, {} as AuthState);
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token_hash");
    if (token && tokenInput.current) {
      tokenInput.current.value = token;
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);
  return <form action={action} className="auth-form">
    <input type="hidden" name="tenantSlug" value={tenantSlug}/><input ref={tokenInput} type="hidden" name="tokenHash"/>
    {state.error && <p className="auth-message error" role="alert">{state.error}</p>}
    <button className="primary-button full" disabled={pending}>{pending ? "Activeren…" : "Uitnodiging accepteren"}</button>
    <p className="form-note">Is de link verlopen of al gebruikt? Vraag je beheerder om de uitnodiging opnieuw te versturen.</p>
  </form>;
}
