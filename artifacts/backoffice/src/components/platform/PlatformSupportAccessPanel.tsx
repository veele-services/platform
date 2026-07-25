"use client";

import {
  FormEvent,
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import type {
  PlatformUserRow,
  SupportAccessGrantRow,
} from "@/app/actions/platform";
import type { ActionResult } from "@/app/actions/customers";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type DurationPreset = "30" | "60" | "240" | "end_of_day" | "custom";

const DURATION_OPTIONS: Array<{ value: DurationPreset; label: string }> = [
  { value: "30", label: "30 minuten" },
  { value: "60", label: "1 uur" },
  { value: "240", label: "4 uur" },
  { value: "end_of_day", label: "Tot einde werkdag" },
  { value: "custom", label: "Zelf eindtijd kiezen" },
];

const PERMISSION_LABELS: Record<string, string> = {
  "dashboard:read": "Dashboard bekijken",
  "customers:read": "Klanten bekijken",
  "objects:read": "Objecten bekijken",
  "personnel:read": "Personeel bekijken",
  "assignments:read": "Opdrachten bekijken",
  "planning:read": "Planning bekijken",
  "reports:read": "Rapportages bekijken",
  "documents:read": "Documenten bekijken",
  "invoices:read": "Facturen bekijken",
  "quotes:read": "Offertes bekijken",
  "payments:read": "Betalingen bekijken",
  "customer_payment_batches:read": "Betaalbatches bekijken",
  "tickets:read": "Tickets bekijken",
  "news:read": "Nieuws bekijken",
  "notifications:read": "Meldingen bekijken",
  "settings:read": "Instellingen bekijken",
  "task_codes:read": "Taakcodes bekijken",
};

function dateTimeLocal(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function expiryForPreset(preset: DurationPreset): string {
  const now = new Date();
  if (preset === "end_of_day") {
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 0, 0);
    return dateTimeLocal(endOfDay);
  }
  const minutes = Number(preset);
  if (Number.isFinite(minutes))
    return dateTimeLocal(new Date(now.getTime() + minutes * 60_000));
  return dateTimeLocal(new Date(now.getTime() + 60 * 60_000));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function userLabel(user: PlatformUserRow): string {
  const role =
    user.role === "owner"
      ? "Platformeigenaar"
      : user.role === "admin"
        ? "Platformbeheerder"
        : "Support";
  return `${role} · ${user.email ?? user.userId}`;
}

function RevokeSupportAccess({
  grant,
  action,
}: {
  grant: SupportAccessGrantRow;
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (_previous: ActionResult, formData: FormData) => action(formData),
    { success: false, message: "" } as ActionResult,
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);

  return (
    <div className="grid gap-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pending}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {pending ? "Intrekken…" : "Toegang intrekken"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <form action={formAction}>
            <input type="hidden" name="grantId" value={grant.id} />
            <AlertDialogHeader>
              <AlertDialogTitle>
                Supporttoegang direct intrekken?
              </AlertDialogTitle>
              <AlertDialogDescription>
                De toegang tot {grant.tenantName} stopt onmiddellijk. Deze
                intrekking wordt met gebruiker, reden en tijdstip vastgelegd in
                de beveiligingslog.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-6">
              <AlertDialogCancel disabled={pending}>
                Annuleren
              </AlertDialogCancel>
              <AlertDialogAction
                type="submit"
                disabled={pending}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                Ja, toegang intrekken
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
      {!state.success && state.message && (
        <p role="alert" className="max-w-56 text-xs text-red-700">
          {state.message}
        </p>
      )}
    </div>
  );
}

export function PlatformSupportAccessPanel({
  tenant,
  platformUsers,
  grants,
  permissionKeys,
  createAction,
  revokeAction,
  enterAction,
}: {
  tenant: { id: string; name: string };
  platformUsers: PlatformUserRow[];
  grants: SupportAccessGrantRow[];
  permissionKeys: readonly string[];
  createAction: (formData: FormData) => Promise<ActionResult>;
  revokeAction: (formData: FormData) => Promise<ActionResult>;
  enterAction: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Amsterdam";
  const [platformUserId, setPlatformUserId] = useState("");
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState<DurationPreset>("60");
  const [expiresAt, setExpiresAt] = useState(() => expiryForPreset("60"));
  const [permissions, setPermissions] = useState<string[]>(["dashboard:read"]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [state, createGrant, pending] = useActionState(
    async (_previous: ActionResult, formData: FormData) =>
      createAction(formData),
    { success: false, message: "" } as ActionResult,
  );

  const selectedUser = useMemo(
    () => platformUsers.find((user) => user.id === platformUserId) ?? null,
    [platformUserId, platformUsers],
  );

  useEffect(() => {
    if (!state.success) return;
    setConfirmOpen(false);
    setReason("");
    router.refresh();
  }, [router, state.success]);

  function changeDuration(value: string) {
    const preset = value as DurationPreset;
    setDuration(preset);
    if (preset !== "custom") setExpiresAt(expiryForPreset(preset));
  }

  function togglePermission(permission: string, checked: boolean) {
    setPermissions((current) =>
      checked
        ? Array.from(new Set([...current, permission]))
        : current.filter((candidate) => candidate !== permission),
    );
  }

  function reviewGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!platformUserId) {
      setClientError("Kies eerst een platformgebruiker.");
      return;
    }
    if (reason.trim().length < 8) {
      setClientError("Beschrijf de reden in minimaal 8 tekens.");
      return;
    }
    if (permissions.length === 0) {
      setClientError("Kies minimaal één toegestane handeling.");
      return;
    }
    if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
      setClientError("Kies een eindtijd in de toekomst.");
      return;
    }
    setClientError(null);
    setConfirmOpen(true);
  }

  function confirmGrant() {
    const formData = new FormData();
    formData.set("tenantId", tenant.id);
    formData.set("platformUserId", platformUserId);
    formData.set("reason", reason.trim());
    formData.set("scope", "tenant");
    formData.set("startsAt", dateTimeLocal(new Date()));
    formData.set("expiresAt", expiresAt);
    for (const permission of permissions)
      formData.append("permissions", permission);
    startTransition(() => createGrant(formData));
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.2fr)]">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold text-slate-950">
          Tijdelijke supporttoegang
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Geef alleen de minimale inzagerechten die nodig zijn voor deze
          supportvraag.
        </p>

        <form onSubmit={reviewGrant} className="mt-5 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="support-user">Platformgebruiker</Label>
            <Select value={platformUserId} onValueChange={setPlatformUserId}>
              <SelectTrigger id="support-user">
                <SelectValue placeholder="Kies een gebruiker" />
              </SelectTrigger>
              <SelectContent>
                {platformUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {userLabel(user)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="support-reason">Reden</Label>
            <Input
              id="support-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={8}
              maxLength={500}
              required
              placeholder="Bijvoorbeeld: ondersteuning bij domeinverificatie"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="support-duration">Duur</Label>
            <Select value={duration} onValueChange={changeDuration}>
              <SelectTrigger id="support-duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="support-expiry">Eindtijd</Label>
            <Input
              id="support-expiry"
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => {
                setDuration("custom");
                setExpiresAt(event.target.value);
              }}
              required
            />
            <p className="text-xs text-slate-500">Tijdzone: {timezone}</p>
          </div>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium text-slate-700">
              Toegestane handelingen
            </legend>
            <div className="grid max-h-64 gap-1 overflow-y-auto rounded-md border border-slate-200 p-2">
              {permissionKeys.map((permission) => {
                const id = `support-permission-${permission.replace(/[^a-z0-9]/gi, "-")}`;
                return (
                  <div
                    key={permission}
                    className="flex min-h-11 items-center gap-3 rounded px-2 hover:bg-slate-50"
                  >
                    <Checkbox
                      id={id}
                      checked={permissions.includes(permission)}
                      onCheckedChange={(checked) =>
                        togglePermission(permission, checked === true)
                      }
                    />
                    <Label
                      htmlFor={id}
                      className="flex-1 cursor-pointer font-normal"
                    >
                      {PERMISSION_LABELS[permission] ?? permission}
                    </Label>
                  </div>
                );
              })}
            </div>
          </fieldset>

          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <span className="font-semibold">Auditwaarschuwing:</span> gebruiker,
            organisatie, reden, rechten, begin- en eindtijd worden vastgelegd.
            Alle handelingen in supportmodus blijven herleidbaar.
          </div>

          {(clientError || (!state.success && state.message)) && (
            <p
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {clientError ?? (!state.success ? state.message : "")}
            </p>
          )}
          {state.success && (
            <p
              role="status"
              className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Supporttoegang is vastgelegd.
            </p>
          )}

          <Button type="submit" disabled={pending}>
            <ShieldAlert aria-hidden="true" />
            Toegang controleren
          </Button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold text-slate-950">
          Bestaande supporttoegang
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Open actieve supportmodus of trek toegang direct en controleerbaar in.
        </p>
        <div className="mt-5 grid gap-3">
          {grants.map((grant) => (
            <article
              key={grant.id}
              className="rounded-lg border border-slate-200 p-4 text-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-950">
                    {grant.status === "active"
                      ? "Actief"
                      : grant.status === "scheduled"
                        ? "Gepland"
                        : grant.status === "expired"
                          ? "Verlopen"
                          : "Ingetrokken"}
                  </p>
                  <p className="mt-1 break-words text-slate-600">
                    {grant.reason}
                  </p>
                  <dl className="mt-3 grid gap-1 text-xs text-slate-500">
                    <div>
                      <dt className="inline font-medium">Gebruiker: </dt>
                      <dd className="inline">
                        {userLabel(
                          platformUsers.find(
                            (user) => user.id === grant.platformUserId,
                          ) ?? {
                            id: grant.platformUserId,
                            userId: grant.platformUserId,
                            email: null,
                            role: "support",
                            status: "inactive",
                            createdAt: grant.createdAt,
                            lastSeenAt: null,
                            lastSignInAt: null,
                            authStatus: "unknown",
                            mfaStatus: "later",
                          },
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Eindtijd: </dt>
                      <dd className="inline">{formatDate(grant.expiresAt)}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Rechten: </dt>
                      <dd className="inline">{grant.permissionKeys.length}</dd>
                    </div>
                  </dl>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {grant.status === "active" && (
                    <form action={enterAction}>
                      <input type="hidden" name="tenantId" value={tenant.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Supportmodus openen
                      </Button>
                    </form>
                  )}
                  {!grant.revokedAt && grant.status !== "expired" && (
                    <RevokeSupportAccess grant={grant} action={revokeAction} />
                  )}
                </div>
              </div>
            </article>
          ))}
          {grants.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500">
              Er is nog geen supporttoegang voor deze organisatie.
            </div>
          )}
        </div>
      </section>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supporttoegang verlenen?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="grid gap-3 text-left">
                <p>
                  Controleer deze tijdelijke toegang voordat je haar vastlegt:
                </p>
                <dl className="grid gap-2 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                  <div>
                    <dt className="font-medium">Organisatie</dt>
                    <dd>{tenant.name}</dd>
                  </div>
                  <div>
                    <dt className="font-medium">Gebruiker</dt>
                    <dd>
                      {selectedUser
                        ? userLabel(selectedUser)
                        : "Geen gebruiker geselecteerd"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium">Reden</dt>
                    <dd>{reason}</dd>
                  </div>
                  <div>
                    <dt className="font-medium">Eindtijd</dt>
                    <dd>
                      {expiresAt
                        ? `${formatDate(new Date(expiresAt).toISOString())} · ${timezone}`
                        : "-"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium">Rechten</dt>
                    <dd>{permissions.length} alleen-lezenrechten</dd>
                  </div>
                </dl>
                <p>
                  Deze toekenning en het latere gebruik worden opgenomen in de
                  beveiligingslog.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Terug</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={confirmGrant}
              disabled={pending}
            >
              {pending && (
                <Loader2 className="animate-spin" aria-hidden="true" />
              )}
              {pending ? "Vastleggen…" : "Toegang verlenen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
