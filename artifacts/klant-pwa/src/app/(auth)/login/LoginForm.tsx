"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
    </form>
  );
}
