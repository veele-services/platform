"use client";

import { useRef } from "react";
import { useActionState } from "react";
import { signIn } from "@/actions/auth";
import { Zap } from "lucide-react";

// ─── Dev accounts (only rendered in development) ──────────────────────────────

const DEV_ACCOUNTS = [
  { label: "Medewerker",  email: "medewerker@test.nl",  password: "Test1234!", bg: "#081D3A", color: "#fff" },
  { label: "Teamlead",    email: "teamlead@test.nl",    password: "Test1234!", bg: "#0E7490", color: "#fff" },
  { label: "Flex",        email: "flex@test.nl",        password: "Test1234!", bg: "#475569", color: "#fff" },
];

// ─────────────────────────────────────────────────────────────────────────────

const initialState = undefined;

export function LoginForm() {
  const [, formAction, isPending] = useActionState(
    async (_: unknown, formData: FormData) => {
      await signIn(formData);
    },
    initialState,
  );

  const formRef     = useRef<HTMLFormElement>(null);
  const emailRef    = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function fillAndSubmit(email: string, password: string) {
    if (emailRef.current)    emailRef.current.value    = email;
    if (passwordRef.current) passwordRef.current.value = password;
    formRef.current?.requestSubmit();
  }

  const isDev = process.env.NODE_ENV === "development";

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium mb-1.5"
          style={{ color: "var(--color-primary)" }}
        >
          E-mailadres
        </label>
        <input
          ref={emailRef}
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
          ref={passwordRef}
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

      <div className="text-center">
        <a
          href="/personeel/wachtwoord-vergeten"
          className="text-sm"
          style={{ color: "#64748B" }}
        >
          Wachtwoord vergeten?
        </a>
      </div>

      {/* ── DEV only: quick-access buttons ────────────────────────────── */}
      {isDev && (
        <div
          className="rounded-xl p-3 space-y-2"
          style={{ background: "#FFF7ED", border: "1px dashed #FCD34D" }}
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#92400E" }}>
            <Zap className="h-3 w-3" />
            DEV — Snel inloggen
          </p>
          <div className="flex flex-col gap-1.5">
            {DEV_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                disabled={isPending}
                onClick={() => fillAndSubmit(a.email, a.password)}
                className="w-full rounded-lg px-3 py-2 text-xs font-medium text-left transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ background: a.bg, color: a.color }}
              >
                {a.label}
                <span className="ml-2 opacity-60">{a.email}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
