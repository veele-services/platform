"use client";

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
      {pending ? "Signing in…" : "Sign In"}
    </button>
  );
}

const INITIAL_STATE: AuthFormState = { error: null };

interface LoginFormProps {
  supabaseConfigured: boolean;
}

export function LoginForm({ supabaseConfigured }: LoginFormProps) {
  const [state, formAction] = useActionState(signIn, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-5" noValidate>
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
          Email address
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          disabled={!supabaseConfigured}
          placeholder="you@company.com"
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
          Password
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
    </form>
  );
}
