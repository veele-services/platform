"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signIn, type AuthFormState } from "@/app/actions/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2 } from "lucide-react";

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
      {pending ? "Bezig met inloggen…" : "Inloggen"}
    </button>
  );
}

const INITIAL_STATE: AuthFormState = { error: null };

interface LoginFormProps {
  supabaseConfigured: boolean;
  successMessage?: string;
}

export function LoginForm({ supabaseConfigured, successMessage }: LoginFormProps) {
  const [state, formAction] = useActionState(signIn, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-5" noValidate>
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
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={!supabaseConfigured}
          placeholder="••••••••"
          style={{ fontSize: "14px" }}
        />
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
    </form>
  );
}
