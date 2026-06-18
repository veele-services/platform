"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { completePasswordReset } from "@/actions/auth";
import { evaluatePasswordStrength } from "@/lib/password-strength";

function strengthColor(score: number): string {
  if (score >= 4) return "#16A34A";
  if (score >= 3) return "#0E7490";
  if (score >= 2) return "#F59E0B";
  return "#DC2626";
}

export default function ResetWachtwoordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [state, formAction, pending] = useActionState(completePasswordReset, undefined);

  const strength = evaluatePasswordStrength(password);
  const passwordsMatch = !confirmPassword || password === confirmPassword;

  useEffect(() => {
    if (state?.success) {
      router.push("/login?message=Wachtwoord+succesvol+gewijzigd");
    }
  }, [router, state?.success]);

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
            <h1 className="text-2xl font-bold text-white">Wachtwoord wijzigen</h1>
            <p className="mt-1 text-sm" style={{ color: "#94A3B8" }}>
              Kies een medium of sterker wachtwoord voor uw account
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-lg">
            <form action={formAction} className="space-y-4" noValidate>
              {state?.error && (
                <div
                  className="rounded-xl px-4 py-3 text-sm font-medium"
                  style={{ backgroundColor: "rgba(239,68,68,0.10)", color: "#B91C1C" }}
                >
                  {state.error}
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
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  autoFocus
                  minLength={10}
                  disabled={pending}
                  placeholder="Minimaal medium sterk"
                  className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors disabled:opacity-60"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-primary)",
                  }}
                />
                <div className="mt-2">
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <span
                        key={index}
                        className="h-1.5 flex-1 rounded-full"
                        style={{
                          backgroundColor:
                            index < strength.score ? strengthColor(strength.score) : "#E2E8F0",
                        }}
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-xs" style={{ color: strengthColor(strength.score) }}>
                    Sterkte: {strength.label}
                  </p>
                </div>
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
                  name="passwordTwo"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={pending}
                  placeholder="Herhaal nieuw wachtwoord"
                  className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors disabled:opacity-60"
                  style={{
                    borderColor: passwordsMatch ? "var(--color-border)" : "#DC2626",
                    color: "var(--color-primary)",
                  }}
                />
                {!passwordsMatch && (
                  <p className="mt-1 text-xs font-medium" style={{ color: "#DC2626" }}>
                    Wachtwoorden komen niet overeen.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={
                  pending ||
                  !password ||
                  !confirmPassword ||
                  !strength.isMedium ||
                  password !== confirmPassword
                }
                className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                style={{ backgroundColor: "var(--color-accent)" }}
              >
                {pending ? "Opslaan..." : "Wachtwoord opslaan"}
              </button>

            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
