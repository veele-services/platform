"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import {
  requestPasswordResetCode,
  verifyPasswordResetCode,
} from "@/app/actions/auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function WachtwoordVergetenPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [purpose, setPurpose] = useState<"activation" | "password-reset">(
    "password-reset",
  );

  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("doel") === "activatie"
    ) {
      setPurpose("activation");
    }
  }, []);

  function normalizedEmail(): string {
    return email.trim().toLowerCase();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (purpose === "activation") {
      setSent(true);
      return;
    }

    startTransition(async () => {
      const result = await requestPasswordResetCode(normalizedEmail());
      if (!result.success) {
        setError(
          result.message ??
            "Er ging iets mis. Controleer uw e-mailadres en probeer het opnieuw.",
        );
        return;
      }
      setSent(true);
    });
  }

  function handleVerifyCode(event: FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await verifyPasswordResetCode({
        email: normalizedEmail(),
        code: code.trim(),
        purpose,
      });
      if (!result.success) {
        setError(
          result.state === "expired"
            ? "De herstelcode is verlopen. Vraag een nieuwe code aan."
            : result.state === "used"
              ? "Deze herstelcode is al gebruikt. Vraag een nieuwe code aan."
              : "De herstelcode is ongeldig. Controleer de code of vraag een nieuwe aan.",
        );
        return;
      }

      router.push(
        purpose === "activation"
          ? "/reset-wachtwoord?doel=activatie"
          : "/reset-wachtwoord",
      );
      router.refresh();
    });
  }

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
            {sent ? "Herstelcode invoeren" : "Wachtwoord vergeten"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {sent
              ? "Vul de code uit uw e-mail in om veilig een nieuw wachtwoord te kiezen."
              : "Vul uw e-mailadres in. Als het bekend is, ontvangt u een herstelcode."}
          </p>
        </header>

        {sent ? (
          <form onSubmit={handleVerifyCode} className="space-y-5" noValidate>
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
              <CheckCircle2 className="size-4 text-emerald-700" />
              <AlertTitle>Controleer uw inbox</AlertTitle>
              <AlertDescription>
                Gebruik de eenmalige herstelcode. Deel deze code met niemand.
              </AlertDescription>
            </Alert>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="code">Herstelcode</Label>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
                disabled={pending}
                placeholder="Code uit e-mail"
                className="min-h-11"
              />
            </div>

            <Button
              type="submit"
              disabled={pending || !code.trim()}
              className="w-full"
            >
              {pending && (
                <Loader2 className="animate-spin" aria-hidden="true" />
              )}
              {pending ? "Code controleren…" : "Code controleren"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setSent(false);
                setCode("");
                setError(null);
              }}
            >
              Ander e-mailadres gebruiken
            </Button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">E-mailadres</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={pending}
                placeholder="jij@bedrijf.nl"
                className="min-h-11"
              />
            </div>

            <Button
              type="submit"
              disabled={pending || !email.trim()}
              className="w-full"
            >
              {pending && (
                <Loader2 className="animate-spin" aria-hidden="true" />
              )}
              {pending ? "Herstelcode versturen…" : "Herstelcode versturen"}
            </Button>

            <Button asChild type="button" variant="ghost" className="w-full">
              <Link href="/login">Terug naar inloggen</Link>
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
