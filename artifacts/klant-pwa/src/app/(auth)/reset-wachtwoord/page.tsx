"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { evaluatePasswordStrength } from "@/lib/password-strength";
import { Eye, EyeOff } from "lucide-react";

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [state, setState] = useState<{ success?: boolean; error?: string } | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  const strength = evaluatePasswordStrength(password);
  const passwordsMatch = !confirmPassword || password === confirmPassword;
  const PasswordIcon = showPassword ? EyeOff : Eye;
  const ConfirmPasswordIcon = showConfirmPassword ? EyeOff : Eye;

  useEffect(() => {
    if (state?.success) {
      router.push("/login?message=Wachtwoord+succesvol+gewijzigd");
    }
  }, [router, state?.success]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState(undefined);

    startTransition(async () => {
      try {
        const response = await fetch("/klant/api/auth/password-reset/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ password, passwordTwo: confirmPassword }),
        });
        const payload = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
        if (!response.ok || payload?.error) {
          setState({
            error: payload?.error ?? "Wachtwoord opslaan mislukt. Vraag zo nodig een nieuwe reset aan.",
          });
          return;
        }
        setState({ success: true });
      } catch {
        setState({ error: "Wachtwoord opslaan mislukt. Controleer uw verbinding en probeer opnieuw." });
      }
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
              style={{ backgroundColor: "var(--color-accent-accessible)" }}
            >
              <span className="text-2xl font-bold text-white">V</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Wachtwoord wijzigen</h1>
            <p className="mt-1 text-sm" style={{ color: "#94A3B8" }}>
              Kies een sterk wachtwoord van minimaal 8 tekens
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-lg">
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    autoFocus
                    minLength={8}
                    disabled={pending}
                    placeholder="Minimaal 8 tekens"
                    className="w-full rounded-xl border px-4 py-3 pr-12 text-sm outline-none transition-colors disabled:opacity-60"
                    style={{
                      borderColor: "var(--color-border)",
                      color: "var(--color-primary)",
                    }}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
                    onClick={() => setShowPassword((value) => !value)}
                    disabled={pending}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 transition-colors hover:text-slate-800 disabled:opacity-50"
                  >
                    <PasswordIcon className="h-5 w-5" />
                  </button>
                </div>
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
                <div className="relative">
                  <input
                    id="confirm-password"
                    name="passwordTwo"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    disabled={pending}
                    placeholder="Herhaal nieuw wachtwoord"
                    className="w-full rounded-xl border px-4 py-3 pr-12 text-sm outline-none transition-colors disabled:opacity-60"
                    style={{
                      borderColor: passwordsMatch ? "var(--color-border)" : "#DC2626",
                      color: "var(--color-primary)",
                    }}
                  />
                  <button
                    type="button"
                    aria-label={showConfirmPassword ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
                    onClick={() => setShowConfirmPassword((value) => !value)}
                    disabled={pending}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 transition-colors hover:text-slate-800 disabled:opacity-50"
                  >
                    <ConfirmPasswordIcon className="h-5 w-5" />
                  </button>
                </div>
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
                style={{ backgroundColor: "var(--color-accent-accessible)" }}
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
