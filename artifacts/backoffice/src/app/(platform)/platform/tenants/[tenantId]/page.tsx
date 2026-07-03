import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addPlatformTenantDomain,
  getPlatformTenantDetail,
  listPlatformPlans,
  listPlatformTenantDomains,
  listPlatformTenantModules,
  listPlatformTenantSectors,
  updatePlatformTenantDomain,
  updatePlatformTenantLifecycle,
  updatePlatformTenantModule,
  updatePlatformTenantPlan,
  updatePlatformTenantSector,
  updatePlatformTenantSectorPolicy,
} from "@/app/actions/platform-tenants";
import {
  createSupportAccessGrantFromForm,
  enterSupportMode,
  listPlatformUsers,
  listSupportAccessAuditLog,
  listSupportAccessGrants,
  revokeSupportAccessGrantFromForm,
  type SupportAccessGrantRow,
} from "@/app/actions/platform";

export const metadata = {
  title: "Tenantbeheer",
};

type Props = {
  params: Promise<{ tenantId: string }>;
};

async function updatePlatformTenantLifecycleFormAction(formData: FormData): Promise<void> {
  "use server";

  await updatePlatformTenantLifecycle(formData);
}

async function updatePlatformTenantPlanFormAction(formData: FormData): Promise<void> {
  "use server";

  await updatePlatformTenantPlan(formData);
}

async function addPlatformTenantDomainFormAction(formData: FormData): Promise<void> {
  "use server";

  await addPlatformTenantDomain(formData);
}

async function updatePlatformTenantDomainFormAction(formData: FormData): Promise<void> {
  "use server";

  await updatePlatformTenantDomain(formData);
}

async function updatePlatformTenantModuleFormAction(formData: FormData): Promise<void> {
  "use server";

  await updatePlatformTenantModule(formData);
}

async function updatePlatformTenantSectorPolicyFormAction(formData: FormData): Promise<void> {
  "use server";

  await updatePlatformTenantSectorPolicy(formData);
}

async function updatePlatformTenantSectorFormAction(formData: FormData): Promise<void> {
  "use server";

  await updatePlatformTenantSector(formData);
}

async function createSupportAccessGrantFormAction(formData: FormData): Promise<void> {
  "use server";

  await createSupportAccessGrantFromForm(formData);
}

async function enterSupportModeFormAction(formData: FormData): Promise<void> {
  "use server";

  await enterSupportMode(formData);
}

async function revokeSupportAccessGrantFormAction(formData: FormData): Promise<void> {
  "use server";

  await revokeSupportAccessGrantFromForm(formData);
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number): string {
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "FG";
}

function supportGrantStatus(grant: SupportAccessGrantRow): "Actief" | "Gepland" | "Verlopen" | "Ingetrokken" {
  const now = Date.now();
  if (grant.revokedAt) return "Ingetrokken";
  if (new Date(grant.startsAt).getTime() > now) return "Gepland";
  if (new Date(grant.expiresAt).getTime() <= now) return "Verlopen";
  return "Actief";
}

function Section({ title, children, helper }: { title: string; helper?: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-normal text-slate-950">{title}</h2>
        {helper && <p className="mt-1 text-sm text-slate-500">{helper}</p>}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

export default async function PlatformTenantDetailPage({ params }: Props) {
  const { tenantId } = await params;

  const [tenant, domains, modules, sectorsModel, plans, platformUsers, supportGrants, auditLog] = await Promise.all([
    getPlatformTenantDetail(tenantId),
    listPlatformTenantDomains(tenantId),
    listPlatformTenantModules(tenantId),
    listPlatformTenantSectors(tenantId),
    listPlatformPlans(),
    listPlatformUsers(),
    listSupportAccessGrants(),
    listSupportAccessAuditLog(tenantId),
  ]);

  if (!tenant) notFound();

  const tenantSupportGrants = supportGrants.filter((grant) => grant.tenantId === tenantId);
  const enabledSectors = sectorsModel.sectors.filter((sector) => sector.tenantEnabled);
  const usageRows = [
    ["Gebruikers", tenant.usage.users],
    ["Klanten", tenant.usage.customers],
    ["Objecten", tenant.usage.objects],
    ["Personeel", tenant.usage.personnel],
    ["Opdrachten", tenant.usage.assignments],
    ["Documenten", tenant.usage.documents],
    ["Storage", formatBytes(tenant.usage.storageBytes)],
    ["Domeinen", tenant.usage.domains],
    ["Actieve modules", tenant.usage.enabledModules],
    ["Actieve sectoren", tenant.usage.enabledSectors],
    ["Supportgrants", tenant.usage.activeSupportGrants],
  ] as const;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-5">
          <Link href="/platform" className="text-sm text-slate-500 underline-offset-2 hover:underline">
            Platformbeheer
          </Link>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Tenant</p>
              <h1 className="text-3xl font-semibold tracking-normal">{tenant.name}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {tenant.slug} · {tenant.status} · {tenant.planName} ({tenant.planSource})
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <form action={updatePlatformTenantLifecycleFormAction}>
                <input type="hidden" name="tenantId" value={tenant.id} />
                <input type="hidden" name="lifecycleAction" value="suspend" />
                <button type="submit" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                  Suspend
                </button>
              </form>
              <form action={updatePlatformTenantLifecycleFormAction}>
                <input type="hidden" name="tenantId" value={tenant.id} />
                <input type="hidden" name="lifecycleAction" value="reactivate" />
                <button type="submit" className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
                  Reactiveren
                </button>
              </form>
              <form action={updatePlatformTenantLifecycleFormAction}>
                <input type="hidden" name="tenantId" value={tenant.id} />
                <input type="hidden" name="lifecycleAction" value="archive" />
                <button type="submit" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">
                  Archiveren
                </button>
              </form>
            </div>
          </div>
        </header>

        <div className="grid gap-3 md:grid-cols-4 2xl:grid-cols-8">
          <Stat label="Gebruikers" value={tenant.usage.users} />
          <Stat label="Klanten" value={tenant.usage.customers} />
          <Stat label="Objecten" value={tenant.usage.objects} />
          <Stat label="Personeel" value={tenant.usage.personnel} />
          <Stat label="Opdrachten" value={tenant.usage.assignments} />
          <Stat label="Documenten" value={tenant.usage.documents} />
          <Stat label="Storage" value={formatBytes(tenant.usage.storageBytes)} />
          <Stat label="Supportgrants" value={tenant.usage.activeSupportGrants} />
        </div>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex flex-col gap-8">
            <Section title="Plan en lifecycle" helper="Wijzig het actieve pakket en controleer lifecycle timestamps.">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                <form action={updatePlatformTenantPlanFormAction} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <input type="hidden" name="tenantId" value={tenant.id} />
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Plan
                    <select name="planKey" defaultValue={tenant.planKey} className="rounded border border-slate-300 px-3 py-2 text-sm">
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.key}>
                          {plan.name}{plan.customRoles ? " · custom roles" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className="rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                    Plan opslaan
                  </button>
                </form>
                <dl className="rounded bg-slate-50 p-4 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-slate-500">Actief</dt><dd>{tenant.isActive ? "Ja" : "Nee"}</dd></div>
                  <div className="mt-2 flex justify-between gap-4"><dt className="text-slate-500">Aangemaakt</dt><dd>{formatDate(tenant.createdAt)}</dd></div>
                  <div className="mt-2 flex justify-between gap-4"><dt className="text-slate-500">Bijgewerkt</dt><dd>{formatDate(tenant.updatedAt)}</dd></div>
                  <div className="mt-2 flex justify-between gap-4"><dt className="text-slate-500">Suspended</dt><dd>{formatDate(tenant.suspendedAt)}</dd></div>
                  <div className="mt-2 flex justify-between gap-4"><dt className="text-slate-500">Archived</dt><dd>{formatDate(tenant.archivedAt)}</dd></div>
                </dl>
              </div>
            </Section>

            <Section title="Domeinen" helper="Host-first routing gebruikt alleen geverifieerde tenantdomeinen.">
              <form action={addPlatformTenantDomainFormAction} className="mb-4 grid gap-3 md:grid-cols-[1fr_140px_140px_110px_auto] md:items-end">
                <input type="hidden" name="tenantId" value={tenant.id} />
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Domein
                  <input name="domain" required placeholder="demo-a.fieldgrid.nl" className="rounded border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Type
                  <select name="type" defaultValue="custom" className="rounded border border-slate-300 px-3 py-2 text-sm">
                    <option value="subdomain">Subdomain</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Status
                  <select name="verificationStatus" defaultValue="pending" className="rounded border border-slate-300 px-3 py-2 text-sm">
                    <option value="pending">Pending</option>
                    <option value="verified">Verified</option>
                    <option value="failed">Failed</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
                  <input type="checkbox" name="isPrimary" /> Primair
                </label>
                <button type="submit" className="rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Toevoegen</button>
              </form>

              <div className="overflow-x-auto rounded border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                    <tr><th className="px-3 py-2">Domein</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Acties</th></tr>
                  </thead>
                  <tbody>
                    {domains.map((domain) => (
                      <tr key={domain.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium">{domain.domain}{domain.isPrimary ? " · primair" : ""}</td>
                        <td className="px-3 py-2 text-slate-600">{domain.type}</td>
                        <td className="px-3 py-2 text-slate-600">{domain.verificationStatus}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            {[
                              ["verify", "Verifieer"],
                              ["primary", "Primair"],
                              ["remove", "Verwijder"],
                            ].map(([action, label]) => (
                              <form key={action} action={updatePlatformTenantDomainFormAction}>
                                <input type="hidden" name="tenantId" value={tenant.id} />
                                <input type="hidden" name="domainId" value={domain.id} />
                                <input type="hidden" name="domainAction" value={action} />
                                <button type="submit" className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700">{label}</button>
                              </form>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="Modules" helper="Manual overrides winnen van plan/default. Dependency-validatie blokkeert onveilige toggles.">
              <div className="grid gap-3 lg:grid-cols-2">
                {modules.map((module) => (
                  <div key={module.id} className="rounded border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-950">{module.name}</h3>
                        <p className="mt-1 text-xs text-slate-500">{module.key} · {module.category}</p>
                      </div>
                      <span className={module.effectiveEnabled ? "rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800" : "rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"}>
                        {module.effectiveEnabled ? "Aan" : "Uit"}
                      </span>
                    </div>
                    {module.description && <p className="mt-2 text-sm text-slate-600">{module.description}</p>}
                    <p className="mt-2 text-xs text-slate-500">
                      Plan: {module.planIncluded === null ? "default" : module.planIncluded ? "aan" : "uit"} · Override: {module.tenantOverride === null ? "geen" : module.tenantOverride ? "aan" : "uit"}
                    </p>
                    {module.dependencyKeys.length > 0 && <p className="mt-1 text-xs text-slate-500">Vereist: {module.dependencyKeys.join(", ")}</p>}
                    <form action={updatePlatformTenantModuleFormAction} className="mt-3">
                      <input type="hidden" name="tenantId" value={tenant.id} />
                      <input type="hidden" name="moduleId" value={module.id} />
                      <input type="hidden" name="enabled" value={module.effectiveEnabled ? "false" : "true"} />
                      <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700">
                        {module.effectiveEnabled ? "Uitzetten" : "Aanzetten"}
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Sectorbeleid" helper="Beheer tenantsectoren, defaultsector en single/multi policy.">
              <form action={updatePlatformTenantSectorPolicyFormAction} className="mb-5 grid gap-3 md:grid-cols-[150px_120px_1fr_170px_auto] md:items-end">
                <input type="hidden" name="tenantId" value={tenant.id} />
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Modus
                  <select name="mode" defaultValue={sectorsModel.policy.mode} className="rounded border border-slate-300 px-3 py-2 text-sm">
                    <option value="multi">Multi</option>
                    <option value="single">Single</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Max
                  <input name="maxSectors" type="number" min="1" defaultValue={sectorsModel.policy.maxSectors ?? ""} className="rounded border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Default
                  <select name="defaultSectorId" defaultValue={sectorsModel.policy.defaultSectorId ?? ""} className="rounded border border-slate-300 px-3 py-2 text-sm">
                    <option value="">Geen default</option>
                    {enabledSectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
                  <input type="checkbox" name="enforceSectorScope" defaultChecked={sectorsModel.policy.enforceSectorScope} /> Afdwingen
                </label>
                <button type="submit" className="rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Opslaan</button>
              </form>

              <div className="grid gap-3 md:grid-cols-2">
                {sectorsModel.sectors.map((sector) => (
                  <div key={sector.id} className="flex items-center justify-between gap-3 rounded border border-slate-200 px-4 py-3">
                    <div>
                      <p className="font-medium text-slate-950">{sector.name}{sector.isDefault ? " · default" : ""}</p>
                      <p className="text-xs text-slate-500">{sector.globallyActive ? "Globaal actief" : "Globaal inactief"}</p>
                    </div>
                    <form action={updatePlatformTenantSectorFormAction}>
                      <input type="hidden" name="tenantId" value={tenant.id} />
                      <input type="hidden" name="sectorId" value={sector.id} />
                      <input type="hidden" name="enabled" value={sector.tenantEnabled ? "false" : "true"} />
                      <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700">
                        {sector.tenantEnabled ? "Uitzetten" : "Aanzetten"}
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          <aside className="flex flex-col gap-8">
            <Section title="First-run" helper={`${tenant.firstRun.completedSteps}/${tenant.firstRun.totalSteps} stappen klaar · ${tenant.firstRun.completionPercent}%`}>
              <div className="h-2 overflow-hidden rounded bg-slate-100">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${tenant.firstRun.completionPercent}%` }}
                />
              </div>
              <div className="mt-4 grid gap-2 text-sm">
                {tenant.firstRun.steps.map((step) => (
                  <div key={step.id} className="rounded border border-slate-200 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-slate-950">{step.label}</p>
                      <span className={step.completed ? "rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800" : "rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800"}>
                        {step.completed ? "Klaar" : "Open"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{step.detail}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Branding preview" helper="Preview van tenantnaam, kleuren en e-mail/PDF uitstraling.">
              <div className="overflow-hidden rounded border border-slate-200">
                <div className="p-4 text-white" style={{ backgroundColor: tenant.brandingPreview.primaryColor }}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded bg-white text-sm font-semibold" style={{ color: tenant.brandingPreview.primaryColor }}>
                      {tenant.brandingPreview.logoUrl ? "Logo" : initials(tenant.brandingPreview.displayName)}
                    </div>
                    <div>
                      <p className="text-sm opacity-80">{tenant.brandingPreview.platformName}</p>
                      <p className="text-lg font-semibold">{tenant.brandingPreview.displayName}</p>
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 bg-white p-4 text-sm">
                  <div className="flex gap-2">
                    <span className="h-6 w-6 rounded border border-slate-200" style={{ backgroundColor: tenant.brandingPreview.primaryColor }} />
                    <span className="h-6 w-6 rounded border border-slate-200" style={{ backgroundColor: tenant.brandingPreview.accentColor }} />
                    <span className="text-slate-500">{tenant.brandingPreview.customBrandingEnabled ? "Custom branding toegestaan" : "Fieldgrid branding"}</span>
                  </div>
                  <div className="rounded bg-slate-50 p-3">
                    <p className="font-medium text-slate-950">Voorbeeldbericht</p>
                    <p className="mt-1 text-slate-600">Uw rapportage staat klaar voor beoordeling.</p>
                    <div className="mt-3 h-1.5 rounded" style={{ backgroundColor: tenant.brandingPreview.accentColor }} />
                    <p className="mt-3 whitespace-pre-line text-xs text-slate-500">{tenant.brandingPreview.emailSignature}</p>
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Support grants" helper="Maak tijdelijke supporttoegang en revoke actieve grants.">
              <form action={createSupportAccessGrantFormAction} className="grid gap-3">
                <input type="hidden" name="tenantId" value={tenant.id} />
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Platformgebruiker
                  <select name="platformUserId" required className="rounded border border-slate-300 px-3 py-2 text-sm">
                    <option value="">Kies gebruiker</option>
                    {platformUsers.map((user) => (
                      <option key={user.id} value={user.id}>{user.role} · {user.userId}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Reden
                  <input name="reason" required className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Ondersteuning bij inrichting" />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Start
                  <input name="startsAt" type="datetime-local" className="rounded border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Verloopt
                  <input name="expiresAt" type="datetime-local" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <button type="submit" className="rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Grant maken</button>
              </form>

              <div className="mt-5 grid gap-3">
                {tenantSupportGrants.map((grant) => {
                  const status = supportGrantStatus(grant);
                  return (
                    <div key={grant.id} className="rounded border border-slate-200 p-3 text-sm">
                      <p className="font-medium text-slate-950">{status} · {formatDate(grant.expiresAt)}</p>
                      <p className="mt-1 text-slate-600">{grant.reason}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {status === "Actief" && (
                          <form action={enterSupportModeFormAction}>
                            <input type="hidden" name="tenantId" value={tenant.id} />
                            <button type="submit" className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700">Open</button>
                          </form>
                        )}
                        {!grant.revokedAt && (
                          <form action={revokeSupportAccessGrantFormAction}>
                            <input type="hidden" name="grantId" value={grant.id} />
                            <button type="submit" className="rounded border border-red-300 px-2 py-1 text-xs text-red-800">Revoke</button>
                          </form>
                        )}
                      </div>
                    </div>
                  );
                })}
                {tenantSupportGrants.length === 0 && <p className="text-sm text-slate-500">Nog geen supportgrants voor deze tenant.</p>}
              </div>
            </Section>

            <Section title="Gebruik" helper="Usage voor beheer, supporttriage en toekomstige limieten.">
              <dl className="grid gap-2 text-sm">
                {usageRows.map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-4 rounded bg-slate-50 px-3 py-2">
                    <dt className="text-slate-500">{key}</dt>
                    <dd className="font-medium text-slate-950">{value}</dd>
                  </div>
                ))}
              </dl>
            </Section>

            <Section title="Audit" helper="Laatste platform/supportregels voor deze tenant.">
              <div className="grid gap-3">
                {auditLog.slice(0, 12).map((entry) => (
                  <div key={entry.id} className="rounded border border-slate-200 p-3 text-sm">
                    <p className="font-medium text-slate-950">{entry.action}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDate(entry.createdAt)} · {entry.resource ?? "-"}</p>
                  </div>
                ))}
                {auditLog.length === 0 && <p className="text-sm text-slate-500">Nog geen auditregels.</p>}
              </div>
            </Section>
          </aside>
        </div>
      </div>
    </main>
  );
}
