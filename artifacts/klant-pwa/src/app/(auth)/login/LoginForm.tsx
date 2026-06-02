"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Zap } from "lucide-react";

// ─── Dev accounts (only rendered in development) ──────────────────────────────

const DEV_ACCOUNTS = [
  { label: "Klant A",  email: "klant@test.nl",   password: "Test1234!", bg: "#0E7490", color: "#fff" },
  { label: "Klant B",  email: "klant2@test.nl",  password: "Test1234!", bg: "#475569", color: "#fff" },
];

// ─────────────────────────────────────────────────────────────────────────────

export function LoginForm() {
  const router = useRouter();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email:    email.trim().toLowerCase(),
        password,
      });

      if (authError) {
        setError("Onjuist e-mailadres of wachtwoord.");
        return;
      }

      router.push("/klant");
      router.refresh();
    });
  }

  function fillAndSubmit(devEmail: string, devPassword: string) {
    setEmail(devEmail);
    setPassword(devPassword);
    // Submit after state update — use a microtask so React flushes state first
    setTimeout(() => formRef.current?.requestSubmit(), 0);
  }

  const isDev = process.env.NODE_ENV === "development";

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
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
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          disabled={pending}
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors focus:ring-2 disabled:opacity-60"
          style={{
            borderColor: "var(--color-border)",
            color:       "var(--color-primary)",
          }}
          placeholder="uw@emailadres.nl"
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
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          disabled={pending}
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors focus:ring-2 disabled:opacity-60"
          style={{
            borderColor: "var(--color-border)",
            color:       "var(--color-primary)",
          }}
          placeholder="••••••••"
        />
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--color-destructive)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !email || !password}
        className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        style={{ backgroundColor: "var(--color-accent)" }}
      >
        {pending ? "Bezig met inloggen…" : "Inloggen"}
      </button>

      <div className="text-center">
        <a
          href="/klant/wachtwoord-vergeten"
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
                disabled={pending}
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
