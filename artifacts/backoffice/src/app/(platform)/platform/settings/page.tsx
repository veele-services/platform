import {
  getPlatformSettingsDashboard,
  requestPlatformSettingChange,
  sendPlatformEmailTestAction,
  updatePlatformEmailProviderSettings,
  updatePlatformSmtpSettings,
  type PlatformSettingRow,
  type PlatformSettingsCategory,
  type PlatformSettingsStatus,
  type PlatformSmtpSettings,
} from "@/app/actions/platform-settings";
import { getPlatformThemeSettings } from "@/app/actions/theme-settings";
import { ResolvedFeatureHelp } from "@/components/knowledgebase/ResolvedFeatureHelp";
import {
  PlatformEmailProviderForm,
  type PlatformEmailProviderFormState,
} from "@/components/platform/PlatformEmailProviderForm";
import { BrandThemeForm } from "@/components/theme/BrandThemeForm";
import type { PlatformEmailProviderAdminView } from "@workspace/db/email-service";

export const metadata = {
  title: "Platforminstellingen",
};

const STATUS_LABELS: Record<PlatformSettingsStatus, string> = {
  ok: "Groen",
  warning: "Aandacht",
  manual: "Handmatig",
};

const CATEGORY_LABELS: Record<PlatformSettingsCategory, string> = {
  routing: "Routing",
  support: "Support",
  domains: "Domeinen",
  mail: "Mail",
  branding: "Branding",
  operations: "Operations",
};

async function requestPlatformSettingChangeAction(formData: FormData): Promise<void> {
  "use server";
  await requestPlatformSettingChange(formData);
}

async function updatePlatformSmtpSettingsAction(formData: FormData): Promise<void> {
  "use server";
  await updatePlatformSmtpSettings(formData);
}

async function updatePlatformEmailProviderSettingsAction(formData: FormData): Promise<PlatformEmailProviderFormState> {
  "use server";
  const result = await updatePlatformEmailProviderSettings(formData);
  return result.success
    ? { success: true, message: "Platform e-mailprovider opgeslagen." }
    : { success: false, message: result.message };
}

async function sendPlatformEmailTestFormAction(formData: FormData): Promise<void> {
  "use server";
  await sendPlatformEmailTestAction(formData);
}

function statusClass(status: PlatformSettingsStatus): string {
  switch (status) {
    case "ok":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "manual":
      return "border-sky-200 bg-sky-50 text-sky-900";
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function SettingCard({ setting }: { setting: PlatformSettingRow }) {
  return (
    <article className="rounded border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-slate-500">{CATEGORY_LABELS[setting.category]}</p>
          <h2 className="mt-1 text-base font-semibold tracking-normal text-slate-950">{setting.label}</h2>
        </div>
        <span className={`w-fit rounded border px-2 py-1 text-xs font-semibold ${statusClass(setting.status)}`}>
          {STATUS_LABELS[setting.status]}
        </span>
      </div>
      <dl className="mt-4 grid gap-2 text-sm">
        <div className="rounded bg-slate-50 px-3 py-2">
          <dt className="text-xs font-medium uppercase text-slate-500">Waarde</dt>
          <dd className="mt-1 break-words font-medium text-slate-950">{setting.value}</dd>
        </div>
        <div className="rounded bg-slate-50 px-3 py-2">
          <dt className="text-xs font-medium uppercase text-slate-500">Bron</dt>
          <dd className="mt-1 break-words font-medium text-slate-950">{setting.source}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-slate-600">{setting.detail}</p>
      <p className="mt-2 text-sm font-medium text-slate-800">{setting.nextAction}</p>
    </article>
  );
}

function providerLabel(providerType: PlatformEmailProviderAdminView["providerType"]): string {
  return providerType === "resend_api" ? "Resend API" : "SMTP";
}

function EmailProviderSettingsPanel({ providers }: { providers: PlatformEmailProviderAdminView[] }) {
  const activeProvider = providers.find((provider) => provider.isActive);

  return (
    <section className="rounded border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Platformbrede e-mail</p>
          <h2 className="mt-1 text-lg font-semibold tracking-normal text-slate-950">E-mailprovider</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Kies Resend API of SMTP als centrale transportlaag voor alle uitnodigingen, wachtwoordmails, notificaties, facturen,
            rapportages en systeemmails. Secrets worden encrypted opgeslagen en alleen gemasked getoond.
          </p>
        </div>
        <span className={`w-fit rounded border px-2 py-1 text-xs font-semibold ${activeProvider ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-sky-200 bg-sky-50 text-sky-900"}`}>
          {activeProvider ? `${providerLabel(activeProvider.providerType)} actief` : "Niet geconfigureerd"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {providers.map((provider) => (
          <PlatformEmailProviderForm
            key={provider.providerType}
            provider={provider}
            action={updatePlatformEmailProviderSettingsAction}
          />
        ))}
      </div>

      <form action={sendPlatformEmailTestFormAction} className="mt-5 grid gap-3 rounded border border-cyan-100 bg-cyan-50 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Testmail ontvanger
          <input name="testEmail" type="email" required placeholder="admin@fieldgrid.nl" className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950" />
        </label>
        <button type="submit" className="min-h-11 rounded bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">
          Testmail versturen
        </button>
      </form>
    </section>
  );
}

function SmtpSettingsPanel({ smtp }: { smtp: PlatformSmtpSettings }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Platformbrede mail</p>
          <h2 className="mt-1 text-lg font-semibold tracking-normal text-slate-950">SMTP instellingen</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Deze configuratie geldt platformbreed voor systeemmails, uitnodigingen en notificaties. Wachtwoorden worden alleen
            overschreven wanneer u een nieuw wachtwoord invult of wissen aanvinkt.
          </p>
        </div>
        <span className={`w-fit rounded border px-2 py-1 text-xs font-semibold ${smtp.smtpEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-sky-200 bg-sky-50 text-sky-900"}`}>
          {smtp.smtpEnabled ? "Actief" : "Uit"}
        </span>
      </div>

      <form action={updatePlatformSmtpSettingsAction} className="mt-5 grid gap-4">
        <div className="flex flex-col gap-3 rounded border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">SMTP transport gebruiken</p>
            <p className="text-sm text-slate-600">Laat uit staan wanneer Resend of een latere SendGrid-koppeling tijdelijk de fallback is.</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
            <input name="smtpEnabled" type="checkbox" defaultChecked={smtp.smtpEnabled} className="h-4 w-4 rounded border-slate-300 text-cyan-600" />
            Actief
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium text-slate-700 lg:col-span-2">
            SMTP host
            <input
              name="smtpHost"
              defaultValue={smtp.smtpHost}
              placeholder="smtp.sendgrid.net"
              className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Poort
            <input
              name="smtpPort"
              type="number"
              min={1}
              max={65535}
              defaultValue={smtp.smtpPort ?? ""}
              placeholder="587"
              className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Beveiliging
            <select name="smtpEncryption" defaultValue={smtp.smtpEncryption} className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950">
              <option value="starttls">STARTTLS</option>
              <option value="tls">TLS</option>
              <option value="none">Geen</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Gebruikersnaam
            <input
              name="smtpUsername"
              defaultValue={smtp.smtpUsername}
              placeholder="apikey"
              className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Wachtwoord
            <input
              name="smtpPassword"
              type="password"
              placeholder={smtp.smtpPasswordConfigured ? "Ingesteld, leeg laten om te behouden" : "Nog niet ingesteld"}
              className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            />
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Afzendernaam
            <input
              name="smtpFromName"
              defaultValue={smtp.smtpFromName}
              placeholder="Fieldgrid"
              className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Afzender e-mail
            <input
              name="smtpFromEmail"
              type="email"
              defaultValue={smtp.smtpFromEmail}
              placeholder="noreply@fieldgrid.nl"
              className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Reply-to
            <input
              name="smtpReplyTo"
              type="email"
              defaultValue={smtp.smtpReplyTo}
              placeholder="support@fieldgrid.nl"
              className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            />
          </label>
        </div>

        <div className="grid gap-3 rounded border border-cyan-100 bg-cyan-50 p-4 text-sm text-slate-700 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <p className="font-semibold text-slate-950">Mail roadmap</p>
            <p className="mt-1">
              SendGrid wordt later als beheerde koppeling toegevoegd. Tenants krijgen standaard afzenders volgens{" "}
              <span className="font-semibold">{smtp.defaultTenantFromPattern}</span>. Eigen maildomeinen blijven alleen voor
              Enterprise en worden door platform support gekoppeld.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
            <input name="clearPassword" type="checkbox" className="h-4 w-4 rounded border-slate-300 text-cyan-600" />
            Wachtwoord wissen
          </label>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="min-h-11 rounded bg-cyan-600 px-4 text-sm font-semibold text-white hover:bg-cyan-700">
            SMTP opslaan
          </button>
        </div>
      </form>
    </section>
  );
}

export default async function PlatformSettingsPage() {
  const [dashboard, themeSettings] = await Promise.all([
    getPlatformSettingsDashboard(),
    getPlatformThemeSettings(),
  ]);

  return (
    <main className="platform-page min-h-full bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-2 border-b border-slate-200 pb-5">
          <p className="text-sm font-medium text-slate-500">Fieldgrid platform</p>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-normal text-slate-950">Instellingen</h1>
            <ResolvedFeatureHelp surface="platform" featureKey="platform.settings" moduleKey="knowledgebase" />
          </div>
          <p className="max-w-3xl text-sm text-slate-600">
            Platformhosts, support TTL default, custom domain DNS target, Caddy ask mode, SMTP/system mail, default branding
            en smoke targets op een plek. Wijzigingen lopen via auditbare wijzigverzoeken.
          </p>
          <p className="text-xs text-slate-500">Laatste snapshot: {formatDate(dashboard.generatedAt)}</p>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          <Stat label="Groen" value={dashboard.summary.ok} />
          <Stat label="Aandacht" value={dashboard.summary.warning} />
          <Stat label="Handmatig" value={dashboard.summary.manual} />
        </section>

        <EmailProviderSettingsPanel providers={dashboard.emailProviders} />

        <BrandThemeForm
          mode="platform"
          theme={themeSettings.theme}
          useCustomTheme={themeSettings.useCustomTheme}
          canWrite
        />

        <section className="grid gap-4 lg:grid-cols-2">
          {dashboard.settings.map((setting) => (
            <SettingCard key={setting.id} setting={setting} />
          ))}
        </section>

        <section className="rounded border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">Wijzigverzoek</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Instellingen die uit GitHub environments, Caddy of VPS-configuratie komen worden niet direct vanuit de UI overschreven.
            Dit formulier legt het voorstel vast in de platform audit.
          </p>
          <form action={requestPlatformSettingChangeAction} className="mt-4 grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Instelling
              <select name="settingKey" required className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950">
                {dashboard.changeRequestOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Voorgestelde waarde
              <input
                name="proposedValue"
                required
                placeholder="Nieuwe waarde of gewenste richting"
                className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Reden
              <input
                name="reason"
                required
                minLength={8}
                placeholder="Waarom is deze wijziging nodig?"
                className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
            <button type="submit" className="mt-auto min-h-11 rounded bg-cyan-600 px-4 text-sm font-semibold text-white hover:bg-cyan-700">
              Vastleggen
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
