"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Mail, Send, Server, Trash2 } from "lucide-react";
import { sendTestMailSettings, updateMailSettings } from "@/app/actions/settings";
import type { OrgSettings } from "@/app/actions/settings";
import { SettingsStickySaveBar } from "@/components/settings/SettingsStickySaveBar";

interface Props {
  settings: OrgSettings | null;
  canWrite: boolean;
}

type Encryption = "none" | "starttls" | "tls";

const ENCRYPTION_OPTIONS: Array<{ value: Encryption; label: string; hint: string }> = [
  { value: "starttls", label: "STARTTLS", hint: "Meestal poort 587" },
  { value: "tls", label: "TLS", hint: "Meestal poort 465" },
  { value: "none", label: "Geen", hint: "Alleen intern of test" },
];

export function MailSettingsView({ settings, canWrite }: Props) {
  const [isPending, startTransition] = useTransition();
  const [smtpEnabled, setSmtpEnabled] = useState(settings?.smtpEnabled ?? false);
  const [smtpHost, setSmtpHost] = useState(settings?.smtpHost ?? "");
  const [smtpPort, setSmtpPort] = useState(String(settings?.smtpPort ?? 587));
  const [smtpEncryption, setSmtpEncryption] = useState<Encryption>(settings?.smtpEncryption ?? "starttls");
  const [smtpUsername, setSmtpUsername] = useState(settings?.smtpUsername ?? "");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [passwordConfigured, setPasswordConfigured] = useState(settings?.smtpPasswordConfigured ?? false);
  const [clearPassword, setClearPassword] = useState(false);
  const [smtpFromName, setSmtpFromName] = useState(settings?.smtpFromName ?? settings?.naam ?? "Veele Services");
  const [smtpFromEmail, setSmtpFromEmail] = useState(settings?.smtpFromEmail ?? "");
  const [smtpReplyTo, setSmtpReplyTo] = useState(settings?.smtpReplyTo ?? "");
  const [testEmail, setTestEmail] = useState(settings?.emailAfzender ?? settings?.smtpFromEmail ?? "");
  const [testTemplate, setTestTemplate] = useState<"basic" | "temporary_password">("temporary_password");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const disabled = !canWrite || isPending;

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    setError(null);

    const parsedPort = smtpPort.trim() ? Number(smtpPort) : null;

    startTransition(async () => {
      const result = await updateMailSettings({
        smtpEnabled,
        smtpHost: smtpHost.trim() || null,
        smtpPort: parsedPort && Number.isFinite(parsedPort) ? parsedPort : null,
        smtpEncryption,
        smtpUsername: smtpUsername.trim() || null,
        smtpPassword: smtpPassword.trim() || null,
        clearPassword,
        smtpFromName: smtpFromName.trim() || null,
        smtpFromEmail: smtpFromEmail.trim() || null,
        smtpReplyTo: smtpReplyTo.trim() || null,
      });

      if (result.success) {
        setSaved(true);
        if (clearPassword) {
          setPasswordConfigured(false);
        } else if (smtpPassword.trim()) {
          setPasswordConfigured(true);
        }
        setSmtpPassword("");
        setClearPassword(false);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.message ?? "Opslaan mislukt.");
      }
    });
  }

  function handleTest() {
    setTestStatus("sending");
    setTestMessage(null);

    void (async () => {
      const result = await sendTestMailSettings(testEmail, testTemplate);
      if (result.success) {
        setTestStatus("ok");
        setTestMessage("Testmail verzonden.");
      } else {
        setTestStatus("error");
        setTestMessage(result.message ?? "Testmail verzenden mislukt.");
      }
      setTimeout(() => setTestStatus("idle"), 5000);
    })();
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="veele-card space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: "#E0FAFB", color: "#075E5D" }}
            >
              <Mail className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>SMTP e-mailtransport</p>
              <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "#64748B" }}>
                Wanneer SMTP actief is gebruikt de backoffice deze instellingen voor platform e-mail.
                Staat SMTP uit, dan blijft de bestaande Resend-configuratie via omgevingsvariabelen de fallback.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={smtpEnabled}
            disabled={disabled}
            onClick={() => setSmtpEnabled((value) => !value)}
            className="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50"
            style={{ backgroundColor: smtpEnabled ? "#081D3A" : "#CBD5E1" }}
          >
            <span
              className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
              style={{ transform: smtpEnabled ? "translateX(20px)" : "translateX(0)" }}
            />
          </button>
        </div>

        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{
            borderColor: smtpEnabled ? "#99F6E4" : "#E2E8F0",
            backgroundColor: smtpEnabled ? "#F0FDFA" : "#F8FAFC",
            color: smtpEnabled ? "#0F766E" : "#64748B",
          }}
        >
          {smtpEnabled
            ? "SMTP staat aan. Host, poort en afzender zijn verplicht voordat e-mail kan worden verzonden."
            : "SMTP staat uit. Het platform gebruikt de centrale platform e-mailprovider wanneer die actief is."}
        </div>
      </div>

      <div className="veele-card space-y-4">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4" style={{ color: "#64748B" }} strokeWidth={1.75} />
          <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>Serververbinding</p>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_140px_180px]">
          <Field label="SMTP-host" htmlFor="smtpHost" required={smtpEnabled}>
            <input
              id="smtpHost"
              type="text"
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              disabled={disabled}
              className="veele-input w-full"
              placeholder="smtp.provider.nl"
            />
          </Field>

          <Field label="Poort" htmlFor="smtpPort" required={smtpEnabled}>
            <input
              id="smtpPort"
              type="number"
              min={1}
              max={65535}
              value={smtpPort}
              onChange={(e) => setSmtpPort(e.target.value)}
              disabled={disabled}
              className="veele-input w-full"
              placeholder="587"
            />
          </Field>

          <Field label="Beveiliging" htmlFor="smtpEncryption">
            <select
              id="smtpEncryption"
              value={smtpEncryption}
              onChange={(e) => setSmtpEncryption(e.target.value as Encryption)}
              disabled={disabled}
              className="veele-input w-full"
            >
              {ENCRYPTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} - {option.hint}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <div className="veele-card space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" style={{ color: "#64748B" }} strokeWidth={1.75} />
          <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>Authenticatie</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Gebruikersnaam" htmlFor="smtpUsername">
            <input
              id="smtpUsername"
              type="text"
              value={smtpUsername}
              onChange={(e) => setSmtpUsername(e.target.value)}
              disabled={disabled}
              className="veele-input w-full"
              placeholder="account@provider.nl"
              autoComplete="off"
            />
          </Field>

          <Field label={passwordConfigured ? "Nieuw wachtwoord" : "Wachtwoord"} htmlFor="smtpPassword">
            <input
              id="smtpPassword"
              type="password"
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
              disabled={disabled || clearPassword}
              className="veele-input w-full"
              placeholder={passwordConfigured ? "Leeg laten om huidig wachtwoord te behouden" : "SMTP-wachtwoord"}
              autoComplete="new-password"
            />
          </Field>
        </div>

        {passwordConfigured && (
          <label className="inline-flex items-center gap-2 text-xs" style={{ color: "#475569" }}>
            <input
              type="checkbox"
              checked={clearPassword}
              onChange={(e) => setClearPassword(e.target.checked)}
              disabled={disabled}
              className="h-4 w-4 rounded border-slate-300"
            />
            <Trash2 className="h-3.5 w-3.5" />
            Opgeslagen wachtwoord verwijderen
          </label>
        )}
      </div>

      <div className="veele-card space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4" style={{ color: "#64748B" }} strokeWidth={1.75} />
          <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>Afzender</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Afzendernaam" htmlFor="smtpFromName">
            <input
              id="smtpFromName"
              type="text"
              value={smtpFromName}
              onChange={(e) => setSmtpFromName(e.target.value)}
              disabled={disabled}
              className="veele-input w-full"
              placeholder="Veele Services"
            />
          </Field>

          <Field label="Afzender e-mailadres" htmlFor="smtpFromEmail" required={smtpEnabled}>
            <input
              id="smtpFromEmail"
              type="email"
              value={smtpFromEmail}
              onChange={(e) => setSmtpFromEmail(e.target.value)}
              disabled={disabled}
              className="veele-input w-full"
              placeholder="noreply@veeleservices.nl"
            />
          </Field>
        </div>

        <Field label="Reply-to e-mailadres" htmlFor="smtpReplyTo">
          <input
            id="smtpReplyTo"
            type="email"
            value={smtpReplyTo}
            onChange={(e) => setSmtpReplyTo(e.target.value)}
            disabled={disabled}
            className="veele-input w-full"
            placeholder="info@veeleservices.nl"
          />
        </Field>
      </div>

      <div className="veele-card space-y-4">
        <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>Testmail</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto]">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            disabled={!canWrite || testStatus === "sending"}
            className="veele-input flex-1"
            placeholder="test@veeleservices.nl"
          />
          <select
            value={testTemplate}
            onChange={(e) => setTestTemplate(e.target.value as "basic" | "temporary_password")}
            disabled={!canWrite || testStatus === "sending"}
            className="veele-input"
          >
            <option value="temporary_password">Tijdelijk wachtwoord</option>
            <option value="basic">Basis SMTP-test</option>
          </select>
          <button
            type="button"
            onClick={handleTest}
            disabled={!canWrite || testStatus === "sending"}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: "#081D3A" }}
          >
            <Send className="h-4 w-4" />
            {testStatus === "sending" ? "Versturen..." : "Test versturen"}
          </button>
        </div>
        {testMessage && (
          <p
            className="inline-flex items-center gap-1.5 text-sm"
            style={{ color: testStatus === "error" ? "#DC2626" : "#059669" }}
          >
            {testStatus === "error" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {testMessage}
          </p>
        )}
      </div>

      <SettingsStickySaveBar
        canWrite={canWrite}
        pending={isPending}
        saved={saved}
        error={error}
        submitLabel="Mailinstellingen opslaan"
      />
    </form>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium" style={{ color: "#374151" }}>
        {label}{required && <span className="ml-0.5" style={{ color: "#DC2626" }}>*</span>}
      </label>
      {children}
    </div>
  );
}
