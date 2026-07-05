import {
  getPlatformSettingsDashboard,
  requestPlatformSettingChange,
  type PlatformSettingRow,
  type PlatformSettingsCategory,
  type PlatformSettingsStatus,
} from "@/app/actions/platform-settings";

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

export default async function PlatformSettingsPage() {
  const dashboard = await getPlatformSettingsDashboard();

  return (
    <main className="min-h-full bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-2 border-b border-slate-200 pb-5">
          <p className="text-sm font-medium text-slate-500">Fieldgrid platform</p>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950">Instellingen</h1>
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
