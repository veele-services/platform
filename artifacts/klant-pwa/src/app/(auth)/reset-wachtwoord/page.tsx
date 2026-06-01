"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ResetWachtwoordPage() {
  const router = useRouter();
  const [password,        setPassword]        = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error,           setError]           = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Wachtwoord moet minimaal 8 tekens bevatten.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Wachtwoorden komen niet overeen.");
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const { error: sbError } = await supabase.auth.updateUser({ password });

      if (sbError) {
        setError(
          sbError.message.includes("same password")
            ? "Het nieuwe wachtwoord mag niet gelijk zijn aan het huidige wachtwoord."
            : "Wachtwoord opslaan mislukt. De resetlink is mogelijk verlopen — vraag een nieuwe aan.",
        );
        return;
      }

      await supabase.auth.signOut();
      router.push("/login?message=Wachtwoord+succesvol+gewijzigd");
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
            <h1 className="text-2xl font-bold text-white">Nieuw wachtwoord</h1>
            <p className="mt-1 text-sm" style={{ color: "#94A3B8" }}>
              Kies een nieuw wachtwoord voor uw account
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-lg">
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
                  htmlFor="password"
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "var(--color-primary)" }}
                >
                  Nieuw wachtwoord
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  autoFocus
                  minLength={8}
                  disabled={pending}
                  placeholder="Minimaal 8 tekens"
                  className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors disabled:opacity-60"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-primary)",
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "var(--color-primary)" }}
                >
                  Wachtwoord bevestigen
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={pending}
                  placeholder="••••••••"
                  className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors disabled:opacity-60"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-primary)",
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={pending || !password || !confirmPassword}
                className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                style={{ backgroundColor: "var(--color-accent)" }}
              >
                {pending ? "Opslaan…" : "Wachtwoord opslaan"}
              </button>

              <Link
                href="/login"
                className="block text-center text-sm mt-1"
                style={{ color: "#64748B" }}
              >
                Annuleren — terug naar inloggen
              </Link>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
