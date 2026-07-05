import Link from "next/link";
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  Mail,
  Megaphone,
  MessageSquareText,
  Send,
  Smartphone,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import {
  createPlatformNotificationDispatch,
  listPlatformNotificationCenter,
  type PlatformNotificationCenter,
  type PlatformNotificationDispatchRow,
  type PlatformNotificationTenantRecipientPreview,
} from "@/app/actions/platform-notifications";

export const metadata = {
  title: "Meldingen",
};

const AUDIENCE_LABELS: Record<string, string> = {
  platform_users: "Alle platformgebruikers",
  tenant_owners: "Specifieke tenant owners",
  tenants_by_plan: "Tenants per plan",
  tenants_by_module: "Tenants met module",
  tenants_with_readiness_issue: "Tenants met readiness issue",
};

const TEMPLATE_LABELS: Record<string, string> = {
  maintenance: "Onderhoud",
  incident: "Storing",
  onboarding_reminder: "Onboarding reminder",
  domain_dns_reminder: "Domain DNS reminder",
  subscription_warning: "Subscription warning",
};

const CHANNEL_LABELS: Record<string, string> = {
  in_app: "In-app",
  email: "E-mail",
  push: "Push later",
};

async function createDispatchFormAction(formData: FormData): Promise<void> {
  "use server";
  await createPlatformNotificationDispatch(formData);
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusChipClass(status: string): string {
  if (status === "queued" || status === "sent") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "scheduled") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "canceled") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function readinessChipClass(status: string): string {
  if (status === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">{value}</p>
    </div>
  );
}

function TemplateGuide({ dashboard }: { dashboard: PlatformNotificationCenter }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-normal text-slate-950">Templates</h2>
        <p className="mt-1 text-sm text-slate-500">Standaardteksten voor onderhoud, storing, onboarding, domein-DNS en subscription waarschuwingen.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-5">
        {dashboard.templates.map((template) => (
          <article key={template.key} className="rounded border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-950">{template.label}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{template.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function TenantOwnerRow({ owner }: { owner: PlatformNotificationTenantRecipientPreview }) {
  return (
    <label className="grid gap-3 rounded border border-slate-200 bg-white p-3 sm:grid-cols-[auto_minmax(0,1fr)_170px] sm:items-center">
      <input type="checkbox" name="tenantIds" value={owner.tenantId} className="h-4 w-4 rounded border-slate-300" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-slate-950">{owner.tenantName}</span>
        <span className="block truncate text-xs text-slate-500">{owner.tenantSlug} - {owner.ownerEmail}</span>
      </span>
      <span className={`w-fit rounded border px-2 py-1 text-xs font-medium ${readinessChipClass(owner.readinessStatus)}`}>
        {owner.readinessStatus}
      </span>
    </label>
  );
}

function CreateNotificationForm({ dashboard }: { dashboard: PlatformNotificationCenter }) {
  const defaultTemplate = dashboard.templates[0];

  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-normal text-slate-950">Nieuwe melding</h2>
        <p className="mt-1 text-sm text-slate-500">Selecteer altijd een doelgroep uit platformdata; losse ontvangerlijsten zijn bewust niet toegestaan.</p>
      </div>

      <form action={createDispatchFormAction} className="grid gap-5">
        <div className="grid gap-3 lg:grid-cols-[220px_260px_1fr]">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Template
            <select name="templateKey" defaultValue={defaultTemplate.key} className="h-10 rounded border border-slate-300 bg-white px-3 text-sm">
              {dashboard.templates.map((template) => (
                <option key={template.key} value={template.key}>
                  {template.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Doelgroep
            <select name="audienceType" defaultValue="platform_users" className="h-10 rounded border border-slate-300 bg-white px-3 text-sm">
              {Object.entries(AUDIENCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Titel
            <input name="title" defaultValue={defaultTemplate.title} maxLength={180} className="h-10 rounded border border-slate-300 px-3 text-sm" />
          </label>
        </div>

        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Bericht
          <textarea name="body" defaultValue={defaultTemplate.body} rows={4} maxLength={5000} className="rounded border border-slate-300 px-3 py-2 text-sm" />
        </label>

        <div className="grid gap-3 lg:grid-cols-3">
          <fieldset className="rounded border border-slate-200 bg-slate-50 p-3">
            <legend className="px-1 text-sm font-semibold text-slate-700">Kanalen</legend>
            <div className="mt-2 grid gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="channels" value="in_app" defaultChecked className="h-4 w-4 rounded border-slate-300" />
                In-app
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="channels" value="email" className="h-4 w-4 rounded border-slate-300" />
                E-mail
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="channels" value="push" className="h-4 w-4 rounded border-slate-300" />
                Push later
              </label>
            </div>
          </fieldset>

          <fieldset className="rounded border border-slate-200 bg-slate-50 p-3">
            <legend className="px-1 text-sm font-semibold text-slate-700">Verzendschema</legend>
            <div className="mt-2 grid gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" name="scheduleType" value="immediate" defaultChecked className="h-4 w-4 border-slate-300" />
                Direct
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" name="scheduleType" value="scheduled" className="h-4 w-4 border-slate-300" />
                Gepland
              </label>
              <input name="scheduledAt" type="datetime-local" className="h-10 rounded border border-slate-300 bg-white px-3 text-sm" />
            </div>
          </fieldset>

          <div className="grid gap-3 rounded border border-slate-200 bg-slate-50 p-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Planselectie
              <select name="planKey" defaultValue="" className="h-10 rounded border border-slate-300 bg-white px-3 text-sm">
                <option value="">Kies bij doelgroep per plan</option>
                {dashboard.plans.map((plan) => (
                  <option key={plan.key} value={plan.key}>
                    {plan.name} ({plan.recipientCount})
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Moduleselectie
              <select name="moduleKey" defaultValue="" className="h-10 rounded border border-slate-300 bg-white px-3 text-sm">
                <option value="">Kies bij doelgroep per module</option>
                {dashboard.modules.map((module) => (
                  <option key={module.key} value={module.key}>
                    {module.name} ({module.recipientCount})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <section className="rounded border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-950">Specifieke tenant owners</h3>
              <p className="text-sm text-slate-500">Gebruik deze selectie alleen bij doelgroep “Specifieke tenant owners”.</p>
            </div>
            <span className="w-fit rounded border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600">
              {dashboard.tenantOwners.length} owner ontvangers
            </span>
          </div>
          <div className="grid max-h-[420px] gap-2 overflow-y-auto pr-1">
            {dashboard.tenantOwners.map((owner) => (
              <TenantOwnerRow key={`${owner.tenantId}:${owner.ownerEmail}`} owner={owner} />
            ))}
            {dashboard.tenantOwners.length === 0 && (
              <p className="rounded border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                Geen tenant owners gevonden.
              </p>
            )}
          </div>
        </section>

        <div className="flex justify-end">
          <button type="submit" className="inline-flex h-10 items-center gap-2 rounded bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800">
            <Send className="h-4 w-4" />
            Melding klaarzetten
          </button>
        </div>
      </form>
    </section>
  );
}

function AudiencePreview({ dashboard }: { dashboard: PlatformNotificationCenter }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-normal text-slate-950">Ontvangerselectie zichtbaar</h2>
        <p className="mt-1 text-sm text-slate-500">Aantallen en concrete tenant-owner targets worden server-side uit platformdata opgebouwd.</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-950">Platformgebruikers</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{dashboard.platformUsers.length}</p>
          <p className="mt-2 text-xs text-slate-500">Actieve platform users, op user-id snapshot.</p>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-950">Readiness issues</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{dashboard.readinessIssueOwners.length}</p>
          <p className="mt-2 text-xs text-slate-500">Tenant owners met blocked of warning readiness.</p>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-950">Tenant owners</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{dashboard.tenantOwners.length}</p>
          <p className="mt-2 text-xs text-slate-500">Alleen owner invites met pending, sent of accepted status.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-950">Tenants per plan</h3>
          <div className="grid gap-2">
            {dashboard.plans.map((plan) => (
              <div key={plan.key} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium text-slate-700">{plan.name}</span>
                <span className="text-slate-500">{plan.recipientCount} owner ontvanger(s)</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-950">Tenants per module</h3>
          <div className="grid max-h-[290px] gap-2 overflow-y-auto pr-1">
            {dashboard.modules.map((module) => (
              <div key={module.key} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium text-slate-700">{module.name}</span>
                <span className="text-slate-500">{module.recipientCount} owner ontvanger(s)</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DispatchCard({ dispatch }: { dispatch: PlatformNotificationDispatchRow }) {
  return (
    <article className="rounded border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded border px-2 py-1 text-xs font-medium ${statusChipClass(dispatch.status)}`}>
              {dispatch.status}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
              {TEMPLATE_LABELS[dispatch.templateKey] ?? dispatch.templateKey}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
              {AUDIENCE_LABELS[dispatch.audienceType] ?? dispatch.audienceType}
            </span>
          </div>
          <p className="mt-2 break-words text-base font-semibold text-slate-950">{dispatch.title}</p>
          <p className="mt-1 text-sm text-slate-500">
            {dispatch.scheduleType === "scheduled" ? `Gepland ${formatDate(dispatch.scheduledAt)}` : `Klaargezet ${formatDate(dispatch.queuedAt)}`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 sm:grid-cols-3 lg:min-w-[430px]">
          <div className="rounded bg-slate-50 px-3 py-2">
            <p className="text-xs uppercase text-slate-500">Tenants</p>
            <p className="mt-1 font-medium text-slate-950">{dispatch.tenantCount}</p>
          </div>
          <div className="rounded bg-slate-50 px-3 py-2">
            <p className="text-xs uppercase text-slate-500">Ontvangers</p>
            <p className="mt-1 font-medium text-slate-950">{dispatch.recipientCount}</p>
          </div>
          <div className="rounded bg-slate-50 px-3 py-2">
            <p className="text-xs uppercase text-slate-500">Kanalen</p>
            <p className="mt-1 truncate font-medium text-slate-950">{dispatch.channels.map((channel) => CHANNEL_LABELS[channel] ?? channel).join(", ")}</p>
          </div>
        </div>
      </div>
    </article>
  );
}

export default async function PlatformNotificationsPage() {
  const dashboard = await listPlatformNotificationCenter();

  return (
    <main className="platform-page mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4">
        <Link href="/platform" className="text-sm text-slate-500 underline-offset-2 hover:underline">
          Platformbeheer
        </Link>
        <div>
          <p className="text-sm font-medium text-slate-500">Fieldgrid communicatie</p>
          <h1 className="text-3xl font-semibold tracking-normal text-slate-950">Meldingen</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gerichte platformmeldingen naar platformgebruikers en tenant owners, met zichtbare selectie en auditbare dispatch.
          </p>
          <p className="mt-2 text-xs text-slate-400">Gegenereerd: {formatDate(dashboard.generatedAt)}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Stat label="Dispatches" value={dashboard.stats.totalDispatches} icon={Megaphone} />
        <Stat label="Queued" value={dashboard.stats.queued} icon={Send} />
        <Stat label="Gepland" value={dashboard.stats.scheduled} icon={CalendarClock} />
        <Stat label="Ontvangers" value={dashboard.stats.recipients} icon={UsersRound} />
        <Stat label="Tenant owners" value={dashboard.stats.tenantOwners} icon={Mail} />
        <Stat label="Readiness issues" value={dashboard.stats.readinessIssues} icon={Bell} />
      </div>

      <CreateNotificationForm dashboard={dashboard} />
      <AudiencePreview dashboard={dashboard} />
      <TemplateGuide dashboard={dashboard} />

      <section className="grid gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">Verzendhistorie</h2>
            <p className="mt-1 text-sm text-slate-500">Laatste 50 platform-notificaties met doelgroep, planning, kanalen en ontvangersnapshot.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1"><MessageSquareText className="h-3 w-3" /> In-app</span>
            <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1"><Mail className="h-3 w-3" /> E-mail</span>
            <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1"><Smartphone className="h-3 w-3" /> Push later</span>
          </div>
        </div>
        {dashboard.dispatches.map((dispatch) => (
          <DispatchCard key={dispatch.id} dispatch={dispatch} />
        ))}
        {dashboard.dispatches.length === 0 && (
          <p className="platform-empty-state text-sm">
            Nog geen platformmeldingen klaargezet.
          </p>
        )}
      </section>

      <section className="rounded border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
          <div>
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">Cross-tenant guard</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Ontvangers worden per dispatch server-side gematerialiseerd met tenant-id, tenantnaam, slug en owner-invite snapshot. Platformgebruikers krijgen geen tenant-id, tenant owners krijgen nooit vrije handmatige e-mailtargets.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
