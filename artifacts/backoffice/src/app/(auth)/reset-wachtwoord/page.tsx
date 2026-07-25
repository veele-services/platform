"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { completePasswordReset } from "@/app/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { evaluatePasswordStrength } from "@/lib/password-strength";

function strengthClass(score: number): string {
  if (score >= 4) return "bg-emerald-600";
  if (score >= 3) return "bg-cyan-700";
  if (score >= 2) return "bg-amber-500";
  return "bg-red-600";
}

function strengthTextClass(score: number): string {
  if (score >= 4) return "text-emerald-700";
  if (score >= 3) return "text-cyan-800";
  if (score >= 2) return "text-amber-700";
  return "text-red-700";
}

function safeNextPath(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/";
  }
  return value;
}

export default function ResetWachtwoordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [isActivation, setIsActivation] = useState(false);
  const [nextPath, setNextPath] = useState("/");
  const [state, formAction, pending] = useActionState(
    completePasswordReset,
    undefined,
  );

  const strength = evaluatePasswordStrength(password);
  const passwordsMatch = !confirmPassword || password === confirmPassword;
  const PasswordIcon = showPassword ? EyeOff : Eye;
  const ConfirmPasswordIcon = showConfirmPassword ? EyeOff : Eye;
  const activationNameMissing = isActivation && !fullName.trim();
  const canSubmit =
    !pending &&
    !activationNameMissing &&
    (!isActivation || fullName.trim().length >= 2) &&
    Boolean(password && confirmPassword) &&
    strength.isMedium &&
    password === confirmPassword;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextPath(safeNextPath(params.get("next")));
    setIsActivation(params.get("doel") === "activatie");
  }, []);

  useEffect(() => {
    if (!state?.success) return;
    const params = new URLSearchParams({
      message: isActivation
        ? "Account geactiveerd. U kunt nu inloggen."
        : "Wachtwoord gewijzigd. U kunt nu inloggen.",
      next: state.next ?? nextPath,
    });
    router.push(`/login?${params.toString()}`);
  }, [isActivation, nextPath, router, state?.next, state?.success]);

  return (
    <main className="w-full max-w-md px-4 py-6 sm:px-0">
      <section className="rounded-[var(--radius-panel)] border border-border bg-card p-5 shadow-lg sm:p-8">
        <header className="mb-7 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <KeyRound className="size-5" aria-hidden="true" />
          </span>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Fieldgrid
          </p>
          <h1 className="mt-2 font-heading text-2xl font-semibold text-foreground">
            {isActivation ? "Account activeren" : "Nieuw wachtwoord instellen"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {isActivation
              ? "Vul uw volledige naam in en kies een sterk wachtwoord."
              : "Kies een sterk, uniek wachtwoord van minimaal acht tekens."}
          </p>
        </header>

        <form action={formAction} className="space-y-5" noValidate>
          <input type="hidden" name="next" value={nextPath} />

          {state?.error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          {isActivation && (
            <div className="space-y-1.5">
              <Label htmlFor="full-name">Volledige naam</Label>
              <Input
                id="full-name"
                name="fullName"
                type="text"
                autoComplete="name"
                autoFocus
                required
                minLength={2}
                maxLength={120}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                disabled={pending}
                placeholder="Voor- en achternaam"
                className="min-h-11"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="password">Nieuw wachtwoord</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                autoFocus={!isActivation}
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={pending}
                placeholder="Minimaal 8 tekens"
                className="min-h-11 pr-12"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={
                  showPassword ? "Wachtwoord verbergen" : "Wachtwoord tonen"
                }
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
                disabled={pending}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <PasswordIcon aria-hidden="true" />
              </Button>
            </div>
            {password && (
              <div aria-live="polite" className="pt-1">
                <div className="flex gap-1" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <span
                      key={index}
                      className={`h-1.5 flex-1 rounded-full ${
                        index < strength.score
                          ? strengthClass(strength.score)
                          : "bg-slate-200"
                      }`}
                    />
                  ))}
                </div>
                <p
                  className={`mt-1 text-xs font-medium ${strengthTextClass(strength.score)}`}
                >
                  Wachtwoordsterkte: {strength.label}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Wachtwoord bevestigen</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                name="passwordTwo"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={pending}
                aria-invalid={!passwordsMatch}
                aria-describedby={
                  !passwordsMatch ? "password-match-error" : undefined
                }
                placeholder="Herhaal nieuw wachtwoord"
                className="min-h-11 pr-12"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={
                  showConfirmPassword
                    ? "Wachtwoord verbergen"
                    : "Wachtwoord tonen"
                }
                aria-pressed={showConfirmPassword}
                onClick={() => setShowConfirmPassword((value) => !value)}
                disabled={pending}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <ConfirmPasswordIcon aria-hidden="true" />
              </Button>
            </div>
            {!passwordsMatch && (
              <p
                id="password-match-error"
                role="alert"
                className="text-xs font-medium text-red-700"
              >
                De wachtwoorden komen niet overeen.
              </p>
            )}
          </div>

          <Button type="submit" disabled={!canSubmit} className="w-full">
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {pending
              ? "Veilig opslaan…"
              : isActivation
                ? "Account activeren"
                : "Wachtwoord opslaan"}
          </Button>

          <Button asChild type="button" variant="ghost" className="w-full">
            <Link href="/login">Annuleren en terug naar inloggen</Link>
          </Button>
        </form>
      </section>
    </main>
  );
}
