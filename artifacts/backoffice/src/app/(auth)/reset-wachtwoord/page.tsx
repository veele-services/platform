"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { completePasswordReset } from "@/app/actions/auth";
import { evaluatePasswordStrength } from "@/lib/password-strength";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";

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
  const [state, formAction, pending] = useActionState(completePasswordReset, undefined);

  const strength = evaluatePasswordStrength(password);
  const passwordsMatch = !confirmPassword || password === confirmPassword;
  const PasswordIcon = showPassword ? EyeOff : Eye;
  const ConfirmPasswordIcon = showConfirmPassword ? EyeOff : Eye;

  useEffect(() => {
    if (state?.success) {
      router.push("/login?message=Wachtwoord+succesvol+gewijzigd.+U+kunt+nu+inloggen.");
    }
  }, [router, state?.success]);

  return (
    <div
      className="w-full max-w-sm mx-4"
      style={{
        backgroundColor: "#FFFFFF",
        borderRadius: "12px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 24px rgba(8,29,58,0.10)",
        padding: "36px 32px 40px",
      }}
    >
      <div className="flex flex-col items-center mb-8">
        <div className="flex flex-col items-center leading-none mb-5">
          <span
            className="font-bold tracking-widest"
            style={{
              fontFamily: "var(--font-poppins), Poppins, sans-serif",
              fontSize: "20px",
              color: "#081D3A",
            }}
          >
            VEELE
          </span>
          <span
            className="uppercase tracking-[0.22em]"
            style={{
              fontFamily: "var(--font-inter), Inter, sans-serif",
              fontSize: "9px",
              color: "#00B7B3",
              marginTop: "3px",
            }}
          >
            Services
          </span>
        </div>

        <h1
          className="font-semibold"
          style={{
            fontFamily: "var(--font-poppins), Poppins, sans-serif",
            fontSize: "17px",
            color: "#081D3A",
            letterSpacing: "-0.01em",
          }}
        >
          Nieuw wachtwoord instellen
        </h1>
        <p
          className="mt-1 text-center"
          style={{
            fontFamily: "var(--font-inter), Inter, sans-serif",
            fontSize: "13px",
            color: "#64748B",
          }}
        >
          Kies een sterk wachtwoord van minimaal 8 tekens.
        </p>
      </div>

      <form action={formAction} className="space-y-5" noValidate>
        {state?.error && (
          <div
            className="flex items-start gap-2.5 rounded-lg px-3.5 py-3"
            style={{ backgroundColor: "#FEF2F2", border: "1px solid #FECACA" }}
            role="alert"
          >
            <AlertCircle
              className="flex-shrink-0 mt-0.5"
              style={{ width: "15px", height: "15px", color: "#EF4444" }}
            />
            <p
              style={{
                fontFamily: "var(--font-inter), Inter, sans-serif",
                fontSize: "13px",
                color: "#B91C1C",
                lineHeight: "1.4",
              }}
            >
              {state.error}
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            style={{
              fontFamily: "var(--font-inter), Inter, sans-serif",
              fontSize: "13px",
              fontWeight: 500,
              color: "#081D3A",
            }}
          >
            Nieuw wachtwoord
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              autoFocus
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
              placeholder="Minimaal 8 tekens"
              className="w-full rounded-md border px-3 py-2 text-sm outline-none disabled:opacity-60"
              style={{ borderColor: "#CBD5E1", paddingRight: "42px" }}
            />
            <button
              type="button"
              aria-label={showPassword ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
              onClick={() => setShowPassword((value) => !value)}
              disabled={pending}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 transition-colors hover:text-slate-800 disabled:opacity-50"
            >
              <PasswordIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2">
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, index) => (
                <span
                  key={index}
                  className="h-1.5 flex-1 rounded-full"
                  style={{ backgroundColor: index < strength.score ? strengthColor(strength.score) : "#E2E8F0" }}
                />
              ))}
            </div>
            <p className="mt-1 text-xs" style={{ color: strengthColor(strength.score) }}>
              Sterkte: {strength.label}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="confirm-password"
            style={{
              fontFamily: "var(--font-inter), Inter, sans-serif",
              fontSize: "13px",
              fontWeight: 500,
              color: "#081D3A",
            }}
          >
            Wachtwoord bevestigen
          </label>
          <div className="relative">
            <input
              id="confirm-password"
              name="passwordTwo"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={pending}
              placeholder="Herhaal nieuw wachtwoord"
              className="w-full rounded-md border px-3 py-2 text-sm outline-none disabled:opacity-60"
              style={{ borderColor: passwordsMatch ? "#CBD5E1" : "#DC2626", paddingRight: "42px" }}
            />
            <button
              type="button"
              aria-label={showConfirmPassword ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
              onClick={() => setShowConfirmPassword((value) => !value)}
              disabled={pending}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 transition-colors hover:text-slate-800 disabled:opacity-50"
            >
              <ConfirmPasswordIcon className="h-4 w-4" />
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
          disabled={pending || !password || !confirmPassword || !strength.isMedium || password !== confirmPassword}
          className="w-full flex items-center justify-center gap-2 h-10 rounded-lg font-semibold text-white transition-all"
          style={{
            fontFamily: "var(--font-inter), Inter, sans-serif",
            fontSize: "14px",
            backgroundColor:
              pending || !password || !confirmPassword || !strength.isMedium || password !== confirmPassword
                ? "#94A3B8"
                : "#00B7B3",
            cursor:
              pending || !password || !confirmPassword || !strength.isMedium || password !== confirmPassword
                ? "not-allowed"
                : "pointer",
            letterSpacing: "0.01em",
          }}
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {pending ? "Opslaan..." : "Wachtwoord opslaan"}
        </button>

        <Link
          href="/login"
          className="block text-center text-sm"
          style={{ color: "#64748B" }}
        >
          Annuleren - terug naar inloggen
        </Link>
      </form>
    </div>
  );
}