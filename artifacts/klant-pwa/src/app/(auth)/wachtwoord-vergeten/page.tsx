"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { requestPasswordResetCode } from "@/actions/auth";

export default function WachtwoordVergetenPage() {
  const router = useRouter();
  const [email,   setEmail]   = useState("");
  const [code,    setCode]    = useState("");
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function normalizedEmail(): string {
    return email.trim().toLowerCase();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await requestPasswordResetCode(normalizedEmail());
      if (!result.success) {
        setError(result.message ?? "Er is een fout opgetreden. Controleer uw e-mailadres en probeer het opnieuw.");
        return;
      }

      setSent(true);
    });
  }

  function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const supabase = createClient();
      const { data, error: verifyError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail(),
        password: code.trim(),
      });

      if (verifyError || data.user?.app_metadata?.force_password_change !== true) {
        setError("De herstelcode is ongeldig of verlopen. Vraag eventueel een nieuwe code aan.");
        return;
      }

      const expiresAt = data.user.app_metadata?.temporary_password_expires_at;
      if (typeof expiresAt === "string" && new Date(expiresAt).getTime() <= Date.now()) {
        await supabase.auth.signOut();
        setError("De herstelcode is verlopen. Vraag een nieuwe code aan.");
        return;
      }

      router.push("/reset-wachtwoord?force=1");
      router.refresh();
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
              Vul uw e-mailadres in voor een herstelcode
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-lg">
            {sent ? (
              <form onSubmit={handleVerifyCode} className="space-y-4" noValidate>
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{ backgroundColor: "#F0FDF4", color: "#15803D" }}
                >
                  Controleer uw inbox. Vul de herstelcode hieronder in om een nieuw wachtwoord te kiezen.
                </div>

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
                    htmlFor="code"
                    className="block text-sm font-medium mb-1.5"
                    style={{ color: "var(--color-primary)" }}
                  >
                    Herstelcode
                  </label>
                  <input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    autoFocus
                    disabled={pending}
                    placeholder="Code uit e-mail"
                    className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors disabled:opacity-60"
                    style={{
                      borderColor: "var(--color-border)",
                      color: "var(--color-primary)",
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={pending || !code.trim()}
                  className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-accent)" }}
                >
                  {pending ? "Controleren..." : "Code controleren"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSent(false);
                    setCode("");
                    setError(null);
                  }}
                  className="block w-full text-center text-sm font-medium"
                  style={{ color: "var(--color-accent)" }}
                >
                  Andere e-mail gebruiken
                </button>
              </form>
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
                    placeholder="uw@emailadres.nl"
                    className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors disabled:opacity-60"
                    style={{
                      borderColor: "var(--color-border)",
                      color: "var(--color-primary)",
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={pending || !email}
                  className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-accent)" }}
                >
                  {pending ? "Bezig..." : "Herstelcode versturen"}
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
