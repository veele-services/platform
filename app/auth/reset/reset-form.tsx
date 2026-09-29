"use client";

import { useActionState } from "react";
import { updatePassword, type AuthState } from "@/app/login/actions";

export function ResetForm({ next = "/app" }: { next?: "/app" | "/staff" }) {
  const [state, action, pending] = useActionState(updatePassword, {} as AuthState);
  return <form action={action} className="auth-form"><input type="hidden" name="next" value={next}/><label><span>Nieuw wachtwoord</span><span className="auth-input"><input name="password" type="password" minLength={10} autoComplete="new-password" required autoFocus /></span></label>{state.error && <p className="auth-message error" role="alert">{state.error}</p>}<button className="primary-button full" disabled={pending}>{pending ? "Opslaan…" : "Wachtwoord opslaan"}</button></form>;
}
