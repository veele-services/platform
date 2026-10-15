"use client";
import { useActionState, useEffect, useRef } from "react";
import { verifyAccountEmail, type VerificationState } from "./actions";

export function VerifyForm() {
  const token = useRef<HTMLInputElement>(null), type = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(verifyAccountEmail, {} as VerificationState);
  useEffect(() => {
    const readFragment = () => {
      const values = new URLSearchParams(window.location.hash.slice(1));
      if (token.current && type.current && values.has("token_hash")) {
        token.current.value = values.get("token_hash") ?? "";
        type.current.value = values.get("type") ?? "";
        window.history.replaceState(null, "", window.location.pathname);
      }
    };
    readFragment();
    window.addEventListener("hashchange", readFragment);
    return () => window.removeEventListener("hashchange", readFragment);
  }, []);
  return <form className="auth-form" action={action}>
    <input type="hidden" name="tokenHash" ref={token}/><input type="hidden" name="type" ref={type}/>
    {state.error && <p className="auth-message error" role="alert">{state.error}</p>}
    {state.message ? <p className="auth-message" role="status">{state.message} <a href="/login">Naar inloggen</a></p> : <button className="primary-button full" disabled={pending}>{pending ? "Bevestigen…" : "Bevestigen en doorgaan"}</button>}
    <p className="form-note">Heb je dit niet aangevraagd? Sluit deze pagina. Alleen het openen van de link bevestigt nog niets.</p>
  </form>;
}
