"use client";

import { useActionState } from "react";
import { requestPasswordReset, type AuthState } from "@/app/login/actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, {} as AuthState);
  return (
    <form action={action} className="auth-form">
      <label><span>E-mailadres</span><span className="auth-input"><input name="email" type="email" required autoFocus /></span></label>
      {state.error && <p className="auth-message error" role="alert">{state.error}</p>}
      {state.success && <p className="auth-message success" role="status">{state.success}</p>}
      <button className="primary-button full" disabled={pending}>{pending ? "Versturen…" : "Stuur herstelmail"}</button>
      <a href="/login">Terug naar inloggen</a>
    </form>
  );
}
