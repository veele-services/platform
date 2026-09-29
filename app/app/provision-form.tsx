"use client";

import { useActionState } from "react";
import { Building2 } from "lucide-react";
import { provisionTenant, type ProvisionState } from "./actions";

export function ProvisionForm({ email }: { email: string | null }) {
  const [state, action, pending] = useActionState(provisionTenant, {} as ProvisionState);
  return (
    <main className="auth-page">
      <section className="auth-card tenant-onboarding">
        <span className="product-brand">Fieldgrid</span>
        <span className="eyebrow">EERSTE TENANT</span>
        <h1>Maak je werkomgeving</h1>
        <p>De tenant wordt leeg en zonder hardcoded merkgegevens aangemaakt. Je kunt branding, medewerkers, taken en klanten daarna zelf invullen.</p>
        <form action={action} className="auth-form">
          <label><span>Naam van de tenant</span><span className="auth-input"><Building2 size={18}/><input name="name" required minLength={2} autoFocus /></span></label>
          <label><span>Technische slug</span><span className="auth-input"><input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="mijn-organisatie" /></span></label>
          {state.error && <p className="auth-message error" role="alert">{state.error}</p>}
          <button className="primary-button full" disabled={pending}>{pending ? "Aanmaken…" : "Tenant aanmaken"}</button>
        </form>
        <small>Platformbeheerder: {email ?? "onbekend"}</small>
      </section>
    </main>
  );
}
