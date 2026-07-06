"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  KeyRound,
  Mail,
  Send,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { sendTestMailSettings, updateMailSettings } from "@/app/actions/settings";
import type { OrgSettings } from "@/app/actions/settings";
import { SettingsStickySaveBar } from "@/components/settings/SettingsStickySaveBar";

interface Props {
  settings: OrgSettings | null;
  canWrite: boolean;
}

type Encryption = "none" | "starttls" | "tls";
type Transport = "platform" | "smtp" | "api";
type ApiProvider = "resend";

const ENCRYPTION_OPTIONS: Array<{ value: Encryption; label: string; hint: string }> = [
  { value: "starttls", label: "STARTTLS", hint: "Meestal poort 587" },
  { value: "tls", label: "TLS", hint: "Meestal poort 465" },
  { value: "none", label: "Geen", hint: "Alleen intern of test" },
];

export function MailSettingsView({ settings, canWrite }: Props) {
  const [isPending, startTransition] = useTransition();
  const [emailTransport, setEmailTransport] = useState<Transport>(
    settings?.emailTransport ?? (settings?.smtpEnabled ? "smtp" : "platform"),
  );
  const [emailApiProvider, setEmailApiProvider] = useState<ApiProvider>(settings?.emailApiProvider ?? "resend");
  const [emailApiKey, setEmailApiKey] = useState("");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(settings?.emailApiKeyConfigured ?? false);
  const [clearApiKey, setClearApiKey] = useState(false);
  const [emailApiSendingDomain, setEmailApiSendingDomain] = useState(settings?.emailApiSendingDomain ?? "");
  const [smtpHost, setSmtpHost] = useState(settings?.smtpHost ?? "");
  const [smtpPort, setSmtpPort] = useState(String(settings?.smtpPort ?? 587));
  const [smtpEncryption, setSmtpEncryption] = useState<Encryption>(settings?.smtpEncryption ?? "starttls");
  const [smtpUsername, setSmtpUsername] = useState(settings?.smtpUsername ?? "");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [passwordConfigured, setPasswordConfigured] = useState(settings?.smtpPasswordConfigured ?? false);
  const [clearPassword, setClearPassword] = useState(false);
  const [smtpFromName, setSmtpFromName] = useState(settings?.smtpFromName ?? settings?.naam ?? "Fieldgrid");
  const [smtpFromEmail, setSmtpFromEmail] = useState(settings?.smtpFromEmail ?? "");
  const [smtpReplyTo, setSmtpReplyTo] = useState(settings?.smtpReplyTo ?? "");
  const [testEmail, setTestEmail] = useState(settings?.emailAfzender ?? settings?.smtpFromEmail ?? "");
  const [testTemplate, setTestTemplate] = useState<"basic" | "temporary_password">("temporary_password");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const disabled = !canWrite || isPending;
  const smtpEnabled = emailTransport === "smtp";
  const apiEnabled = emailTransport === "api";
  const senderRequired = smtpEnabled || apiEnabled;

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    setError(null);

    const parsedPort = smtpPort.trim() ? Number(smtpPort) : null;

    startTransition(async () => {
      const result = await updateMailSettings({
        emailTransport,
        emailApiProvider,
        emailApiKey: emailApiKey.trim() || null,
        clearApiKey,
        emailApiSendingDomain: emailApiSendingDomain.trim() || null,
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
        if (clearApiKey) {
          setApiKeyConfigured(false);
        } else if (emailApiKey.trim()) {
          setApiKeyConfigured(true);
        }
        setSmtpPassword("");
        setEmailApiKey("");
        setClearPassword(false);
        setClearApiKey(false);
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
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: "#E0FAFB", color: "#075E5D" }}
          >
            <Mail className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>
              E-mailtransport
            </p>
            <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "#64748B" }}>
              Kies of deze tenant de centrale platformprovider gebruikt, eigen SMTP gebruikt of via een API-provider
              verstuurt.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <TransportOption
            value="platform"
            current={emailTransport}
            title="Platform standaard"
            description="Gebruik de globale Fieldgrid mailprovider."
            icon={<ShieldCheck className="h-4 w-4" />}
            disabled={disabled}
            onSelect={setEmailTransport}
          />
          <TransportOption
            value="smtp"
            current={emailTransport}
            title="SMTP"
            description="Gebruik eigen SMTP-host, poort en account."
            icon={<Server className="h-4 w-4" />}
            disabled={disabled}
            onSelect={setEmailTransport}
          />
          <TransportOption
            value="api"
            current={emailTransport}
            title="API"
            description="Gebruik een API-provider. Nu beschikbaar: Resend."
            icon={<Cloud className="h-4 w-4" />}
            disabled={disabled}
            onSelect={setEmailTransport}
          />
        </div>

        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{
            borderColor: apiEnabled ? "#BFDBFE" : smtpEnabled ? "#99F6E4" : "#E2E8F0",
            backgroundColor: apiEnabled ? "#EFF6FF" : smtpEnabled ? "#F0FDFA" : "#F8FAFC",
            color: apiEnabled ? "#1D4ED8" : smtpEnabled ? "#0F766E" : "#64748B",
          }}
        >
          {emailTransport === "platform" &&
            "Deze tenant gebruikt de centrale platformprovider. Eigen SMTP/API-instellingen blijven bewaard maar zijn niet actief."}
          {emailTransport === "smtp" &&
            "SMTP is actief. Host, poort en afzender zijn verplicht voordat e-mail kan worden verzonden."}
          {emailTransport === "api" &&
            "API-mail is actief. Resend provider, API key en afzenderadres zijn verplicht."}
        </div>
      </div>

      {apiEnabled && (
        <div className="veele-card space-y-4">
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4" style={{ color: "#64748B" }} strokeWidth={1.75} />
            <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>
              API-provider
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-[240px_1fr]">
            <Field label="Provider" htmlFor="emailApiProvider" required>
              <select
                id="emailApiProvider"
                value={emailApiProvider}
                onChange={(e) => setEmailApiProvider(e.target.value as ApiProvider)}
                disabled={disabled}
                className="veele-input w-full"
              >
                <option value="resend">Resend</option>
              </select>
            </Field>

            <Field label={apiKeyConfigured ? "Nieuwe API key" : "API key"} htmlFor="emailApiKey" required={!apiKeyConfigured}>
              <input
                id="emailApiKey"
                type="password"
                value={emailApiKey}
                onChange={(e) => setEmailApiKey(e.target.value)}
                disabled={disabled || clearApiKey}
                className="veele-input w-full"
                placeholder={apiKeyConfigured ? `${settings?.emailApiKeyMasked ?? "Opgeslagen key"} - leeg laten om te behouden` : "re_..."}
                autoComplete="new-password"
              />
            </Field>
          </div>

          <Field label="Sending domain" htmlFor="emailApiSendingDomain">
            <input
              id="emailApiSendingDomain"
              type="text"
              value={emailApiSendingDomain}
              onChange={(e) => setEmailApiSendingDomain(e.target.value)}
              disabled={disabled}
              className="veele-input w-full"
              placeholder="mail.tenant.nl of slug.fieldgrid.nl"
            />
          </Field>

          <p className="text-xs leading-relaxed" style={{ color: "#64748B" }}>
            De API key wordt versleuteld opgeslagen en nooit volledig teruggetoond. Laat het veld leeg om de
            opgeslagen key te behouden.
          </p>

          {apiKeyConfigured && (
            <label className="inline-flex items-center gap-2 text-xs" style={{ color: "#475569" }}>
              <input
                type="checkbox"
                checked={clearApiKey}
                onChange={(e) => setClearApiKey(e.target.checked)}
                disabled={disabled}
                className="h-4 w-4 rounded border-slate-300"
              />
              <Trash2 className="h-3.5 w-3.5" />
              Opgeslagen API key verwijderen
            </label>
          )}
        </div>
      )}

      {smtpEnabled && (
        <div className="veele-card space-y-4">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4" style={{ color: "#64748B" }} strokeWidth={1.75} />
            <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>
              Serververbinding
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_140px_180px]">
            <Field label="SMTP-host" htmlFor="smtpHost" required>
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

            <Field label="Poort" htmlFor="smtpPort" required>
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
      )}

      {smtpEnabled && (
        <div className="veele-card space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" style={{ color: "#64748B" }} strokeWidth={1.75} />
            <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>
              SMTP-authenticatie
            </p>
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
      )}

      <div className="veele-card space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4" style={{ color: "#64748B" }} strokeWidth={1.75} />
          <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>
            Afzender
          </p>
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
              placeholder={settings?.naam ?? "Fieldgrid"}
            />
          </Field>

          <Field label="Afzender e-mailadres" htmlFor="smtpFromEmail" required={senderRequired}>
            <input
              id="smtpFromEmail"
              type="email"
              value={smtpFromEmail}
              onChange={(e) => setSmtpFromEmail(e.target.value)}
              disabled={disabled}
              className="veele-input w-full"
              placeholder="noreply@tenant.nl"
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
            placeholder="info@tenant.nl"
          />
        </Field>
      </div>

      <div className="veele-card space-y-4">
        <p className="text-sm font-semibold" style={{ color: "#081D3A" }}>
          Testmail
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto]">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            disabled={!canWrite || testStatus === "sending"}
            className="veele-input flex-1"
            placeholder="test@tenant.nl"
          />
          <select
            value={testTemplate}
            onChange={(e) => setTestTemplate(e.target.value as "basic" | "temporary_password")}
            disabled={!canWrite || testStatus === "sending"}
            className="veele-input"
          >
            <option value="temporary_password">Tijdelijk wachtwoord</option>
            <option value="basic">Basis testmail</option>
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

function TransportOption({
  value,
  current,
  title,
  description,
  icon,
  disabled,
  onSelect,
}: {
  value: Transport;
  current: Transport;
  title: string;
  description: string;
  icon: React.ReactNode;
  disabled: boolean;
  onSelect: (value: Transport) => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(value)}
      className="rounded-lg border p-3 text-left transition disabled:opacity-60"
      style={{
        borderColor: active ? "#00B7B3" : "#E2E8F0",
        backgroundColor: active ? "#ECFEFF" : "#FFFFFF",
        color: "#081D3A",
      }}
    >
      <span className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-md"
          style={{ backgroundColor: active ? "#CCFBF1" : "#F1F5F9", color: active ? "#0F766E" : "#64748B" }}
        >
          {icon}
        </span>
        {title}
      </span>
      <span className="block text-xs leading-relaxed" style={{ color: "#64748B" }}>
        {description}
      </span>
    </button>
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
        {label}
        {required && (
          <span className="ml-0.5" style={{ color: "#DC2626" }}>
            *
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
