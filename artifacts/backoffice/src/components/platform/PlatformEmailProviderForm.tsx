"use client";

import { CheckboxAdapter } from "@/components/ui/checkbox-adapter";
import { SelectAdapter } from "@/components/ui/select-adapter";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { PlatformEmailProviderAdminView } from "@workspace/db/email-service";

export type PlatformEmailProviderFormState = {
  success: boolean;
  message?: string;
} | null;

type Props = {
  provider: PlatformEmailProviderAdminView;
  action: (formData: FormData) => Promise<PlatformEmailProviderFormState>;
};

function providerLabel(
  providerType: PlatformEmailProviderAdminView["providerType"],
): string {
  if (providerType === "sendgrid_api") return "SendGrid API";
  if (providerType === "resend_api") return "Resend API";
  return "SMTP";
}

function SubmitButton({ label, pending }: { label: string; pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded bg-cyan-600 px-4 text-sm font-semibold text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-cyan-300"
    >
      {pending && (
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      )}
      {pending ? "Opslaan..." : label}
    </button>
  );
}

export function PlatformEmailProviderForm({ provider, action }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<PlatformEmailProviderFormState>(null);
  const [isPending, startTransition] = useTransition();
  const label = providerLabel(provider.providerType);

  function clearSecretFields() {
    const form = formRef.current;
    const sendgridApiKey = form?.elements.namedItem("sendgridApiKey");
    const clearSendGridApiKey = form?.elements.namedItem(
      "clearSendGridApiKey",
    );
    const resendApiKey = form?.elements.namedItem("resendApiKey");
    const smtpPassword = form?.elements.namedItem("smtpPassword");
    const clearSmtpPassword = form?.elements.namedItem("clearSmtpPassword");

    if (sendgridApiKey instanceof HTMLInputElement) sendgridApiKey.value = "";
    if (clearSendGridApiKey instanceof HTMLInputElement)
      clearSendGridApiKey.checked = false;
    if (resendApiKey instanceof HTMLInputElement) resendApiKey.value = "";
    if (smtpPassword instanceof HTMLInputElement) smtpPassword.value = "";
    if (clearSmtpPassword instanceof HTMLInputElement)
      clearSmtpPassword.checked = false;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setState(null);
    startTransition(async () => {
      const result = await action(formData);
      setState(result);
      if (result?.success) {
        clearSecretFields();
        router.refresh();
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="grid gap-4 rounded border border-slate-200 bg-slate-50 p-4"
    >
      <input type="hidden" name="providerType" value={provider.providerType} />
      <input type="hidden" name="name" value={label} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">{label}</p>
          <p className="mt-1 text-xs text-slate-500">
            {provider.configured
              ? `Secret ${provider.maskedSecret ?? "geconfigureerd"}`
              : "Nog geen secret opgeslagen"}
            {provider.lastTestedAt
              ? ` - Laatste test ${new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(provider.lastTestedAt))}`
              : ""}
          </p>
          {provider.lastTestError && (
            <p className="mt-1 text-xs text-rose-700">
              {provider.lastTestError}
            </p>
          )}
        </div>
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
          <CheckboxAdapter
            name="isActive"
            type="checkbox"
            defaultChecked={provider.isActive}
            className="h-4 w-4 rounded border-slate-300 text-cyan-600"
          />
          Actief
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          From name
          <input
            name="fromName"
            defaultValue={provider.fromName}
            placeholder="Fieldgrid"
            className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          From e-mail
          <input
            name="fromEmail"
            type="email"
            defaultValue={provider.fromEmail}
            placeholder="noreply@fieldgrid.nl"
            className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2">
          Reply-to e-mail
          <input
            name="replyToEmail"
            type="email"
            defaultValue={provider.replyToEmail}
            placeholder="support@fieldgrid.nl"
            className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950"
          />
        </label>
      </div>

      {provider.providerType === "sendgrid_api" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2">
            SendGrid API key
            <input
              name="sendgridApiKey"
              type="password"
              placeholder={
                provider.configured
                  ? `${provider.maskedSecret} - leeg laten om te behouden`
                  : "SG...."
              }
              className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950"
              autoComplete="new-password"
            />
            <span className="text-xs font-normal text-slate-500">
              Gebruik een SendGrid Custom Access-key met alleen de permissie
              Mail Send.
            </span>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            API-regio
            <SelectAdapter
              name="sendgridApiRegion"
              defaultValue={provider.config.sendgridApiRegion}
              className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950"
            >
              <option value="global">Global</option>
              <option value="eu">EU regional</option>
            </SelectAdapter>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Sending domain
            <input
              name="sendingDomain"
              defaultValue={provider.config.sendingDomain}
              placeholder="fieldgrid.nl"
              className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950"
            />
          </label>
          <p className="text-xs text-slate-500 sm:col-span-2">
            Kies EU alleen voor een SendGrid EU-regional subuser. Het
            afzenderadres moet binnen het geauthenticeerde sending domain
            vallen.
          </p>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 sm:col-span-2">
            <CheckboxAdapter
              name="clearSendGridApiKey"
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-cyan-600"
            />
            Opgeslagen SendGrid API key verwijderen
          </label>
        </div>
      ) : provider.providerType === "resend_api" ? (
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Resend API key
            <input
              name="resendApiKey"
              type="password"
              placeholder={
                provider.configured
                  ? `${provider.maskedSecret} - leeg laten om te behouden`
                  : "re_..."
              }
              className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950"
              autoComplete="new-password"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Sending domain
            <input
              name="sendingDomain"
              defaultValue={provider.config.sendingDomain}
              placeholder="fieldgrid.nl"
              className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950"
            />
          </label>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2">
            SMTP host
            <input
              name="smtpHost"
              defaultValue={provider.config.smtpHost}
              placeholder="smtp.provider.nl"
              className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Poort
            <input
              name="smtpPort"
              type="number"
              min={1}
              max={65535}
              defaultValue={provider.config.smtpPort ?? ""}
              placeholder="587"
              className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Beveiliging
            <SelectAdapter
              name="smtpEncryption"
              defaultValue={provider.config.smtpEncryption}
              className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950"
            >
              <option value="starttls">STARTTLS</option>
              <option value="tls">TLS</option>
              <option value="none">Geen</option>
            </SelectAdapter>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Gebruikersnaam
            <input
              name="smtpUsername"
              defaultValue={provider.config.smtpUsername}
              placeholder="apikey"
              className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Wachtwoord
            <input
              name="smtpPassword"
              type="password"
              placeholder={
                provider.config.smtpPasswordConfigured
                  ? "Ingesteld, leeg laten om te behouden"
                  : "Nog niet ingesteld"
              }
              className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950"
              autoComplete="new-password"
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
            <CheckboxAdapter
              name="clearSmtpPassword"
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-cyan-600"
            />
            SMTP-wachtwoord wissen
          </label>
        </div>
      )}

      {state && (
        <p
          role={state.success ? "status" : "alert"}
          className={`inline-flex items-start gap-2 rounded border px-3 py-2 text-sm ${
            state.success
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {state.success ? (
            <CheckCircle2
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
          ) : (
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
          )}
          <span>
            {state.message ??
              (state.success
                ? "Platform e-mailprovider opgeslagen."
                : "Opslaan mislukt.")}
          </span>
        </p>
      )}

      <SubmitButton label={`${label} opslaan`} pending={isPending} />
    </form>
  );
}
