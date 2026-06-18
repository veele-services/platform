"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function WachtwoordVergetenPage() {
  const [email,   setEmail]   = useState("");
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const supabase   = createClient();
      const redirectTo = `${window.location.origin}/personeel/auth/confirm?type=recovery`;

      const { error: sbError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo },
      );

      if (sbError) {
        setError("Er is een fout opgetreden. Controleer je e-mailadres en probeer het opnieuw.");
        return;
      }

      setSent(true);
    });
  }

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ backgroundColor: "var(--color-primary)" }}
    >
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 text-center">
            <div
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              <span className="text-2xl font-bold text-white">V</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Wachtwoord vergeten</h1>
            <p className="mt-1 text-sm" style={{ color: "#94A3B8" }}>
              Vul je e-mailadres in voor een resetlink
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-lg">
            {sent ? (
              <div className="space-y-4">
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{ backgroundColor: "#F0FDF4", color: "#15803D" }}
                >
                  Controleer je inbox. Als dit e-mailadres bekend is, ontvang je binnen enkele minuten een resetlink.
                </div>
                <Link
                  href="/login"
                  className="block text-center text-sm font-medium"
                  style={{ color: "var(--color-accent)" }}
                >
                  Terug naar inloggen
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {error && (
                  <div
                    className="rounded-xl px-4 py-3 text-sm font-medium"
                    style={{ backgroundColor: "rgba(239,68,68,0.10)", color: "#B91C1C" }}
                  >
                    {error}
                  </div>
                )}

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
                    autoFocus
                    disabled={pending}
                    placeholder="jouw@email.nl"
                    className="w-full rounded-xl border px-4 py-3.5 text-base outline-none transition-colors disabled:opacity-60"
                    style={{
                      borderColor: "var(--color-border)",
                      backgroundColor: "#fff",
                      color: "var(--color-primary)",
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={pending || !email}
                  className="w-full rounded-xl px-4 py-4 text-base font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-60 mt-2"
                  style={{ backgroundColor: "var(--color-accent)" }}
                >
                  {pending ? "Bezig…" : "Resetlink versturen"}
                </button>

                <Link
                  href="/login"
                  className="block text-center text-sm mt-1"
                  style={{ color: "#64748B" }}
                >
                  Terug naar inloggen
                </Link>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
