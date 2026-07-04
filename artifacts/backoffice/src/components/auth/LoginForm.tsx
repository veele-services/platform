"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signIn, type AuthFormState } from "@/app/actions/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Eye, EyeOff, Loader2, Zap } from "lucide-react";

// ─── Dev accounts (only rendered in development) ──────────────────────────────

const DEV_ACCOUNTS = [
  { label: "Management",    email: "admin@veele.nl",       password: "Test1234!", bg: "#081D3A", color: "#fff" },
  { label: "Planner",       email: "planner@veele.nl",     password: "Test1234!", bg: "#0E7490", color: "#fff" },
  { label: "Administratie", email: "admin2@veele.nl",      password: "Test1234!", bg: "#475569", color: "#fff" },
];

// ─── Submit button ────────────────────────────────────────────────────────────

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;

  return (
    <button
      type="submit"
      disabled={isDisabled}
      className="w-full flex items-center justify-center gap-2 h-10 rounded-lg font-semibold text-white transition-all"
      style={{
        fontFamily: "var(--font-inter), Inter, sans-serif",
        fontSize: "14px",
        backgroundColor: isDisabled ? "#94A3B8" : "#00B7B3",
        cursor: isDisabled ? "not-allowed" : "pointer",
        letterSpacing: "0.01em",
      }}
    >
      {pending && <Loader2 className="w-4 h-4 animate-spin" />}
      {pending ? "Bezig met inloggen..." : "Inloggen"}
    </button>
  );
}

const INITIAL_STATE: AuthFormState = { error: null };

interface LoginFormProps {
  supabaseConfigured: boolean;
  successMessage?: string;
  nextPath?: string;
}

export function LoginForm({ supabaseConfigured, successMessage, nextPath = "/" }: LoginFormProps) {
  const [state, formAction] = useActionState(signIn, INITIAL_STATE);
  const [showPassword, setShowPassword] = useState(false);

  const formRef    = useRef<HTMLFormElement>(null);
  const emailRef   = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function fillAndSubmit(email: string, password: string) {
    if (emailRef.current)    emailRef.current.value    = email;
    if (passwordRef.current) passwordRef.current.value = password;
    formRef.current?.requestSubmit();
  }

  const isDev = process.env.NODE_ENV === "development";
  const PasswordIcon = showPassword ? EyeOff : Eye;

  return (
    <form ref={formRef} action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={nextPath} />

      {successMessage && (
        <div
          className="flex items-start gap-2.5 rounded-lg px-3.5 py-3"
          style={{ backgroundColor: "#F0FDF4", border: "1px solid #BBF7D0" }}
          role="status"
        >
          <p
            style={{
              fontFamily: "var(--font-inter), Inter, sans-serif",
              fontSize: "13px",
              color: "#15803D",
              lineHeight: "1.4",
            }}
          >
            {successMessage}
          </p>
        </div>
      )}

      {state.error && (
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
        <Label
          htmlFor="email"
          style={{
            fontFamily: "var(--font-inter), Inter, sans-serif",
            fontSize: "13px",
            fontWeight: 500,
            color: "#081D3A",
          }}
        >
          E-mailadres
        </Label>
        <Input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          disabled={!supabaseConfigured}
          placeholder="jij@bedrijf.nl"
          style={{ fontSize: "14px" }}
        />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="password"
          style={{
            fontFamily: "var(--font-inter), Inter, sans-serif",
            fontSize: "13px",
            fontWeight: 500,
            color: "#081D3A",
          }}
        >
          Wachtwoord
        </Label>
        <div className="relative">
          <Input
            ref={passwordRef}
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            disabled={!supabaseConfigured}
            placeholder="••••••••"
            style={{ fontSize: "14px", paddingRight: "42px" }}
          />
          <button
            type="button"
            aria-label={showPassword ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
            onClick={() => setShowPassword((value) => !value)}
            disabled={!supabaseConfigured}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 transition-colors hover:text-slate-800 disabled:opacity-50"
          >
            <PasswordIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <SubmitButton disabled={!supabaseConfigured} />

      <div className="text-center">
        <Link
          href="/wachtwoord-vergeten"
          className="text-sm transition-colors hover:underline"
          style={{ color: "#64748B" }}
        >
          Wachtwoord vergeten?
        </Link>
      </div>

      {/* ── DEV only: quick-access buttons ────────────────────────────── */}
      {isDev && (
        <div
          className="rounded-lg p-3 space-y-2"
          style={{ background: "#FFF7ED", border: "1px dashed #FCD34D" }}
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#92400E" }}>
            <Zap className="h-3 w-3" />
            DEV - Snel inloggen
          </p>
          <div className="flex flex-col gap-1.5">
            {DEV_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => fillAndSubmit(a.email, a.password)}
                className="w-full rounded-md px-3 py-2 text-xs font-medium text-left transition-opacity hover:opacity-80"
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
