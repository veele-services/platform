"use client";

import { AlertTriangle, KeyRound, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import {
  lockObjectSecurityAction,
  readObjectSecurityRecordsAction,
  requestObjectSecurityOtpAction,
  verifyObjectSecurityOtpAction,
} from "@/app/actions/object-security";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UnlockedObjectSecurityRecord } from "@workspace/db";

const CATEGORY_LABELS: Record<string, string> = {
  access_instructions: "Toegangsinstructies",
  key_location: "Sleutellocatie",
  key_code: "Sleutelcode",
  alarm_procedure: "Alarmprocedure",
  alarm_code: "Alarmcode",
  entrance: "Ingang",
  badge_instructions: "Badge-instructies",
  key_management: "Sleutelbeheer",
  opening_procedure: "Openingsprocedure",
  closing_procedure: "Sluitprocedure",
  security_contact: "Beveiligingscontact",
  emergency_procedure: "Noodprocedure",
  confidential_route: "Vertrouwelijke route",
  temporary_access: "Tijdelijke toegang",
};

function displayValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(displayValue).join(", ");
  return "Afgeschermde waarde";
}

export function ObjectSecurityTab({
  objectId,
  maskedEmail,
  otpTtlMinutes,
}: {
  objectId: string;
  maskedEmail: string;
  otpTtlMinutes: number;
}) {
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [records, setRecords] = useState<UnlockedObjectSecurityRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isUnlocked || !expiresAt) return;
    const delay = Math.max(0, new Date(expiresAt).getTime() - Date.now());
    const timeout = window.setTimeout(() => {
      setIsUnlocked(false);
      setExpiresAt(null);
      setRecords([]);
      setCode("");
      setMessage("De ontgrendeling is verlopen.");
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [expiresAt, isUnlocked]);

  useEffect(() => {
    if (!isUnlocked) return;
    const lockForHiddenPage = () => {
      if (document.visibilityState !== "hidden") return;
      setIsUnlocked(false);
      setExpiresAt(null);
      setRecords([]);
      setChallengeId(null);
      setCode("");
      void lockObjectSecurityAction({ objectId });
    };
    document.addEventListener("visibilitychange", lockForHiddenPage);
    window.addEventListener("pagehide", lockForHiddenPage);
    return () => {
      document.removeEventListener("visibilitychange", lockForHiddenPage);
      window.removeEventListener("pagehide", lockForHiddenPage);
    };
  }, [isUnlocked, objectId]);

  useEffect(() => {
    const lockForRecordChange = () => {
      setIsUnlocked(false);
      setExpiresAt(null);
      setRecords([]);
      setChallengeId(null);
      setCode("");
      setError(null);
      setMessage("De informatie is gewijzigd en daarom direct opnieuw vergrendeld.");
    };
    window.addEventListener("fieldgrid:object-security-changed", lockForRecordChange);
    return () => window.removeEventListener("fieldgrid:object-security-changed", lockForRecordChange);
  }, []);

  function requestCode() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await requestObjectSecurityOtpAction(objectId);
        if (!result.ok || !result.challengeId) {
          setError(result.message);
          return;
        }
        setChallengeId(result.challengeId);
        setCode("");
        setMessage(`${result.message} Naar ${result.maskedEmail ?? maskedEmail}.`);
      } catch {
        setError("De aanvullende verificatie is niet beschikbaar. Controleer uw sessie en geverifieerde zakelijke e-mailadres.");
      }
    });
  }

  function verifyCode() {
    if (!challengeId) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const verified = await verifyObjectSecurityOtpAction({ objectId, challengeId, code });
        if (!verified.ok) {
          setError(verified.message);
          return;
        }
        const loaded = await readObjectSecurityRecordsAction({ objectId });
        if (!loaded.ok) {
          setError(loaded.message);
          return;
        }
        setIsUnlocked(true);
        setExpiresAt(loaded.expiresAt ?? verified.expiresAt ?? null);
        setRecords(loaded.records);
        setCode("");
        setMessage(loaded.message);
      } catch {
        setIsUnlocked(false);
        setRecords([]);
        setError("Ontgrendelen is niet gelukt. Controleer uw verbinding en probeer opnieuw.");
      }
    });
  }

  function lockNow() {
    setIsUnlocked(false);
    setExpiresAt(null);
    setRecords([]);
    setChallengeId(null);
    setCode("");
    setError(null);
    setMessage("De afgeschermde informatie is vergrendeld.");
    startTransition(() => lockObjectSecurityAction({ objectId }));
  }

  if (isUnlocked) {
    return (
      <div className="space-y-4" data-object-security-state="unlocked">
        <Alert>
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Vertrouwelijk · tijdelijk ontgrendeld</AlertTitle>
          <AlertDescription>
            Iedere weergave wordt opnieuw gecontroleerd en vastgelegd. Kopieer deze informatie niet naar notities of documenten.
          </AlertDescription>
        </Alert>

        <div className="flex justify-end">
          <Button type="button" variant="outline" className="min-h-11" onClick={lockNow} disabled={isPending}>
            <LockKeyhole className="mr-2 h-4 w-4" aria-hidden="true" />
            Nu vergrendelen
          </Button>
        </div>

        {records.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Geen actieve instructies</CardTitle>
              <CardDescription>Voor dit object zijn geen goedgekeurde beveiligingsinstructies actief.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {records.map((record) => (
              <Card key={record.id}>
                <CardHeader>
                  <CardDescription>{CATEGORY_LABELS[record.category] ?? "Beveiligingsinstructie"}</CardDescription>
                  <CardTitle className="text-base">{record.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-3">
                    {Object.entries(record.payload).map(([key, value]) => (
                      <div key={key}>
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{key.replaceAll("_", " ")}</dt>
                        <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">{displayValue(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card data-object-security-state="locked">
      <CardHeader>
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted">
          <LockKeyhole className="h-5 w-5 text-foreground" aria-hidden="true" />
        </div>
        <CardTitle>Toegang en veiligheid</CardTitle>
        <CardDescription>
          Dit onderdeel is afzonderlijk afgeschermd. De inhoud wordt pas na een expliciete controle en een eenmalige code opgehaald.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Alert>
          <Mail className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Aanvullende verificatie</AlertTitle>
          <AlertDescription>
            De zes-cijferige code gaat naar {maskedEmail} en is {otpTtlMinutes} minuten geldig.
          </AlertDescription>
        </Alert>

        {challengeId ? (
          <div className="max-w-sm space-y-3">
            <div className="space-y-2">
              <Label htmlFor="object-security-code">Beveiligingscode</Label>
              <Input
                id="object-security-code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/gu, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                className="min-h-11 font-mono text-lg tracking-[0.3em]"
                aria-describedby="object-security-code-help"
              />
              <p id="object-security-code-help" className="text-xs text-muted-foreground">
                De code is eenmalig. Na vijf onjuiste pogingen wordt de aanvraag geblokkeerd.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" className="min-h-11" onClick={verifyCode} disabled={isPending || code.length !== 6}>
                <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
                {isPending ? "Controleren…" : "Controleren en openen"}
              </Button>
              <Button type="button" variant="outline" className="min-h-11" onClick={requestCode} disabled={isPending}>
                Nieuwe code
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" className="min-h-11" onClick={requestCode} disabled={isPending}>
            <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
            {isPending ? "Code aanvragen…" : "Code per e-mail aanvragen"}
          </Button>
        )}

        {message ? <p role="status" className="text-sm text-foreground">{message}</p> : null}
        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Ontgrendelen niet gelukt</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
