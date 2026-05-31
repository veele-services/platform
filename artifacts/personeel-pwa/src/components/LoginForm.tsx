"use client";

import { useActionState } from "react";
import { signIn } from "@/actions/auth";

const initialState = undefined;

export function LoginForm() {
  const [, formAction, isPending] = useActionState(
    async (_: unknown, formData: FormData) => {
      await signIn(formData);
    },
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium mb-1.5"
          style={{ color: "var(--color-primary)" }}
        >
          E-mailadres
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="jouw@email.nl"
          className="w-full rounded-xl border px-4 py-3.5 text-base outline-none transition-colors"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "#fff",
            color: "var(--color-primary)",
          }}
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium mb-1.5"
          style={{ color: "var(--color-primary)" }}
        >
          Wachtwoord
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className="w-full rounded-xl border px-4 py-3.5 text-base outline-none transition-colors"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "#fff",
            color: "var(--color-primary)",
          }}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl px-4 py-4 text-base font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-60 mt-2"
        style={{ backgroundColor: "var(--color-accent)" }}
      >
        {isPending ? "Inloggen…" : "Inloggen"}
      </button>
    </form>
  );
}
