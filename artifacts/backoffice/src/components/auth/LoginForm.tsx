"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signIn, type AuthFormState } from "@/app/actions/auth";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Zap,
} from "lucide-react";

// ─── Dev accounts (only rendered in development) ──────────────────────────────

const DEV_ACCOUNTS = [
  { label: "Management", email: "admin@fieldgrid.nl", password: "Test1234!" },
  { label: "Planner", email: "planner@fieldgrid.nl", password: "Test1234!" },
  { label: "Administratie", email: "administratie@fieldgrid.nl", password: "Test1234!" },
];

// ─── Submit button ────────────────────────────────────────────────────────────

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;

  return (
    <Button
      type="submit"
      disabled={isDisabled}
      className="w-full"
      aria-busy={pending}
    >
      {pending && (
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
      )}
      {pending ? "Bezig met inloggen…" : "Inloggen"}
    </Button>
  );
}

const INITIAL_STATE: AuthFormState = { error: null };

interface LoginFormProps {
  supabaseConfigured: boolean;
  successMessage?: string;
  nextPath?: string;
}

export function LoginForm({
  supabaseConfigured,
  successMessage,
  nextPath = "/",
}: LoginFormProps) {
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
        <Alert className="border-primary/30 bg-primary/5" role="status">
          <CheckCircle2 className="size-4 text-primary" />
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">
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
          className="min-h-11"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">
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
            className="min-h-11 pr-12"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={showPassword ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
            onClick={() => setShowPassword((value) => !value)}
            disabled={!supabaseConfigured}
            className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <PasswordIcon className="size-4" />
          </Button>
        </div>
      </div>

      <SubmitButton disabled={!supabaseConfigured} />

      <div className="text-center">
        <Link
          href="/wachtwoord-vergeten"
          className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline"
        >
          Wachtwoord vergeten?
        </Link>
      </div>

      {/* ── DEV only: quick-access buttons ────────────────────────────── */}
      {isDev && (
        <div className="space-y-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
            <Zap className="h-3 w-3" />
            DEV - Snel inloggen
          </p>
          <div className="flex flex-col gap-1.5">
            {DEV_ACCOUNTS.map((a) => (
              <Button
                key={a.email}
                type="button"
                onClick={() => fillAndSubmit(a.email, a.password)}
                variant="outline"
                size="sm"
                className="w-full justify-start text-left"
              >
                {a.label}
                <span className="ml-2 opacity-60">{a.email}</span>
              </Button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
