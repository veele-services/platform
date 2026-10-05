"use client";

import { useActionState, useEffect, useState } from "react";
import { ArrowRight, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { STAFF_OTP_COOLDOWN_SECONDS } from "@/lib/auth/staff-login";
import { signIn, staffOtp, type AuthState, type StaffOtpState } from "./actions";

const initialState: AuthState = {};

const initialOtpState: StaffOtpState = { step: "email" };

function StaffLoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(staffOtp, initialOtpState);
  const [clock, setClock] = useState(0);
  useEffect(() => {
    if (state.step !== "code" || !state.requestedAt) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state.requestedAt, state.step]);
  const cooldown = state.requestedAt
    ? Math.max(0, Math.ceil((state.requestedAt + STAFF_OTP_COOLDOWN_SECONDS * 1000 - (clock || state.requestedAt)) / 1000))
    : 0;

  if (state.step === "code") {
    const destination = state.next ?? next ?? "/staff";
    return (
      <form action={action} className="auth-form">
        <input type="hidden" name="email" value={state.email ?? ""} />
        <input type="hidden" name="next" value={destination} />
        {state.notice && <p className="auth-message success" role="status">{state.notice}</p>}
        <p className="staff-login-recipient">Code verstuurd naar <strong>{state.email}</strong></p>
        <label>
          <span>Inlogcode</span>
          <span className="auth-input"><ShieldCheck size={18} /><input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoFocus aria-describedby="staff-code-help" /></span>
          <small id="staff-code-help">Vul de zescijferige code uit de e-mail in.</small>
        </label>
        {state.error && <p className="auth-message error" role="alert">{state.error}</p>}
        <button className="primary-button full" name="intent" value="verify" disabled={pending}>
          {pending ? "Controleren…" : "Code controleren"} <ArrowRight size={17} />
        </button>
        <button className="auth-text-button" name="intent" value="request" formNoValidate disabled={pending || cooldown > 0}>
          {cooldown > 0 ? `Nieuwe code aanvragen (${cooldown}s)` : "Nieuwe code aanvragen"}
        </button>
        <a href={`/login?next=${encodeURIComponent(destination)}`}>Ander e-mailadres gebruiken</a>
      </form>
    );
  }

  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="next" value={next ?? "/staff"} />
      <label>
        <span>E-mailadres</span>
        <span className="auth-input"><Mail size={18} /><input name="email" type="email" autoComplete="email" required autoFocus /></span>
      </label>
      {state.error && <p className="auth-message error" role="alert">{state.error}</p>}
      <button className="primary-button full" name="intent" value="request" disabled={pending}>
        {pending ? "Code versturen…" : "Inlogcode versturen"} <ArrowRight size={17} />
      </button>
    </form>
  );
}

function PasswordLoginForm({ next }: { next?: string }) {
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

export function LoginForm({ next, staffLogin = false }: { next?: string; staffLogin?: boolean }) {
  return staffLogin ? <StaffLoginForm next={next} /> : <PasswordLoginForm next={next} />;
}
