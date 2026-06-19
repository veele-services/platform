"use client";

import { useActionState } from "react";
import { changeMyPassword } from "@/actions/auth";
import { KeyRound, CheckCircle2 } from "lucide-react";

type State = { success?: boolean; error?: string } | undefined;

export function PasswordChangeForm() {
  const [state, formAction, isPending] = useActionState(changeMyPassword, undefined);

  if (state?.success) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl p-3"
        style={{ backgroundColor: "#F0FDF4" }}
      >
        <CheckCircle2 size={16} style={{ color: "#16A34A" }} />
        <p className="text-sm font-medium" style={{ color: "#166534" }}>
          Wachtwoord succesvol gewijzigd
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label
          htmlFor="pwd-new"
          className="block text-sm font-medium mb-1"
          style={{ color: "var(--color-primary)" }}
        >
          Nieuw wachtwoord
        </label>
        <input
          id="pwd-new"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          placeholder="Minimaal medium sterk"
          className="w-full rounded-xl border px-4 py-3 text-base outline-none"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        />
      </div>

      <div>
        <label
          htmlFor="pwd-confirm"
          className="block text-sm font-medium mb-1"
          style={{ color: "var(--color-primary)" }}
        >
          Bevestig wachtwoord
        </label>
        <input
          id="pwd-confirm"
          name="passwordTwo"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          placeholder="Herhaal nieuw wachtwoord"
          className="w-full rounded-xl border px-4 py-3 text-base outline-none"
          style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
        />
      </div>

      {state?.error && (
        <p
          className="rounded-xl px-3 py-2.5 text-sm font-medium"
          style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
        style={{ backgroundColor: "var(--color-accent)" }}
      >
        <KeyRound size={15} />
        {isPending ? "Opslaan…" : "Wachtwoord wijzigen"}
      </button>
    </form>
  );
}
