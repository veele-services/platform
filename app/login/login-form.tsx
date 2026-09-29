"use client";

import { useActionState } from "react";
import { ArrowRight, KeyRound, Mail } from "lucide-react";
import { signIn, type AuthState } from "./actions";

const initialState: AuthState = {};

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signIn, initialState);
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="next" value={next ?? "/app"} />
      <label>
        <span>E-mailadres</span>
        <span className="auth-input"><Mail size={18} /><input name="email" type="email" autoComplete="email" required autoFocus /></span>
      </label>
      <label>
        <span>Wachtwoord</span>
        <span className="auth-input"><KeyRound size={18} /><input name="password" type="password" autoComplete="current-password" required /></span>
      </label>
      {state.error && <p className="auth-message error" role="alert">{state.error}</p>}
      <button className="primary-button full" disabled={pending}>
        {pending ? "Inloggen…" : "Inloggen"} <ArrowRight size={17} />
      </button>
      <a href="/auth/forgot">Wachtwoord vergeten?</a>
    </form>
  );
}
