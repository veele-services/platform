"use client";

import { useActionState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { completeRequiredPasswordChange, signOut } from "@/actions/auth";

export default function RequiredPasswordChangePage() {
  const [state, action, pending] = useActionState(
    completeRequiredPasswordChange,
    undefined,
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-muted)] px-4 py-8">
      <section className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-[0_20px_60px_rgba(8,29,58,0.14)] sm:p-8">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-[var(--color-accent-accessible)]">
          <ShieldCheck size={28} />
        </span>
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--color-accent-accessible)]">
          Veilige eerste login
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--color-primary)]">
          Kies een nieuw wachtwoord
        </h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
          Het tijdelijke wachtwoord moet worden vervangen voordat u met de
          onboarding verder kunt.
        </p>
        <form action={action} className="mt-7 space-y-4">
          <PasswordField name="password" label="Nieuw wachtwoord" />
          <PasswordField name="passwordTwo" label="Herhaal nieuw wachtwoord" />
          <p className="text-xs font-semibold leading-5 text-slate-500">
            Gebruik minimaal 8 tekens en combineer hoofdletters, kleine letters,
            cijfers of symbolen.
          </p>
          {state?.error ? (
            <p
              role="alert"
              className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700"
            >
              {state.error}
            </p>
          ) : null}
          <button
            disabled={pending}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-accent)] px-5 py-3 font-semibold text-white disabled:opacity-60"
          >
            <KeyRound size={19} />
            {pending ? "Opslaan…" : "Wachtwoord wijzigen"}
          </button>
        </form>
        <form action={signOut} className="mt-3">
          <button className="min-h-11 w-full rounded-2xl px-4 text-sm font-semibold text-slate-600">
            Uitloggen
          </button>
        </form>
      </section>
    </main>
  );
}

function PasswordField({ name, label }: { name: string; label: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-[var(--color-primary)]">
        {label}
      </span>
      <input
        name={name}
        type="password"
        required
        autoComplete="new-password"
        className="min-h-12 w-full rounded-2xl border border-slate-200 px-4 text-base font-semibold outline-none focus:border-[var(--color-accent)] focus:ring-4 focus:ring-teal-100"
      />
    </label>
  );
}
