import Link from "next/link";
import type { ReactNode } from "react";
import {
  createPlatformTenant,
  getPlatformOnboardingDraft,
  listPlatformOnboardingCatalog,
  listTenantProvisioningRuns,
  retryPlatformTenantProvisioning,
  savePlatformOnboardingDraft,
  type PlatformOnboardingCatalog,
  type PlatformOnboardingDraft,
} from "@/app/actions/platform-provisioning";
import { listPlatformTenants } from "@/app/actions/platform-tenants";
import {
  enterSupportMode,
  listPlatformUsers,
  listSupportAccessGrants,
  type SupportAccessGrantRow,
} from "@/app/actions/platform";
import { listCurrentSupportAccessGrants } from "@/app/actions/support-mode";
import { getCurrentPlatformUser } from "@/lib/auth/platform";

export const metadata = {
  title: "Platformbeheer",
};

type Props = {
  searchParams: Promise<{ onboardingDraft?: string }>;
};

const EMPTY_ONBOARDING_CATALOG: PlatformOnboardingCatalog = {
  plans: [],
  modules: [],
  sectors: [],
};

const FALLBACK_PLANS: PlatformOnboardingCatalog["plans"] = [
  { key: "starter", name: "Starter", description: null },
  { key: "professional", name: "Professional", description: null },
  { key: "enterprise", name: "Enterprise", description: null },
];

const DEFAULT_PRIMARY_COLOR = "#081D3A";
const DEFAULT_ACCENT_COLOR = "#00B7B3";
const DEFAULT_EMAIL_SIGNATURE = "Met vriendelijke groet,\nFieldgrid";

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function supportGrantStatus(grant: SupportAccessGrantRow): "Actief" | "Gepland" | "Verlopen" | "Ingetrokken" {
  const now = Date.now();
  if (grant.revokedAt) return "Ingetrokken";
  if (new Date(grant.startsAt).getTime() > now) return "Gepland";
  if (new Date(grant.expiresAt).getTime() <= now) return "Verlopen";
  return "Actief";
}

function fieldValue(value: string | null | undefined): string | undefined {
  return value ?? undefined;
}

function isSelected(values: string[], value: string, fallback: boolean): boolean {
  return values.length > 0 ? values.includes(value) : fallback;
}

function OnboardingStep({ index, title, detail }: { index: number; title: string; detail: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-xs font-semibold uppercase text-slate-500">Stap {index}</p>
      <p className="mt-1 font-medium text-slate-950">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function WizardGroup({
  title,
  helper,
  children,
}: {
  title: string;
  helper: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="grid gap-3 border-t border-slate-200 pt-5">
      <div>
        <legend className="text-sm font-semibold text-slate-950">{title}</legend>
        <p className="mt-1 text-xs text-slate-500">{helper}</p>
      </div>
      {children}
    </fieldset>
  );
}

function OnboardingWizard({
  catalog,
  draft,
}: {
  catalog: PlatformOnboardingCatalog;
  draft: PlatformOnboardingDraft | null;
}) {
  const plans = catalog.plans.length > 0 ? catalog.plans : FALLBACK_PLANS;
  const selectedPlan = draft?.planKey ?? "starter";
  const selectedSectorMode = draft?.sectorMode ?? "multi";
  const selectedDefaultSectorId = draft?.defaultSectorId ?? catalog.sectors[0]?.id ?? "";

  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-normal">Tenant onboarding wizard</h2>
          <p className="mt-1 text-sm text-slate-500">
            Begeleid tenantgegevens, domein, plan, modules, sectoren, regio&apos;s, owner invite, branding, review, runstatus en rollback in een flow.
          </p>
        </div>
        <span className="w-fit rounded bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
          Provisioning service
        </span>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <OnboardingStep index={1} title="Tenantgegevens" detail="Naam, slug en SaaS-identiteit." />
        <OnboardingStep index={2} title="Domein en plan" detail="Host-first routing en abonnement." />
        <OnboardingStep index={3} title="Modules, sectoren en first-run" detail="Tenantmodules, beleid en regio-catalogus." />
        <OnboardingStep index={4} title="Owner invite en branding" detail="Owner-uitnodiging wordt direct verstuurd." />
        <OnboardingStep index={5} title="Review, runstatus en rollback" detail="Save/resume, retry en rollbackpad blijven zichtbaar." />
      </div>

      {draft && (
        <div className="mb-5 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Concept geladen: {draft.name || "Concept tenant"} / {draft.currentStep}. Opslaan werkt dit concept bij; provisionen maakt de tenant aan.
        </div>
      )}

      <form action={createPlatformTenant} className="grid gap-5">
        {draft && <input type="hidden" name="draftRunId" value={draft.id} />}

        <WizardGroup title="Tenantgegevens" helper="Nieuwe tenant kan zonder SQL worden ingericht.">
          <div className="grid gap-3 md:grid-cols-[1fr_0.7fr_0.7fr]">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Tenantnaam
              <input
                name="name"
                required
                className="rounded border border-slate-300 px-3 py-2 text-sm"
                placeholder="Demo A"
                defaultValue={fieldValue(draft?.name)}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Slug
              <input
                name="slug"
                className="rounded border border-slate-300 px-3 py-2 text-sm"
                placeholder="demo-a"
                defaultValue={fieldValue(draft?.slug)}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Plan
              <select name="planKey" defaultValue={selectedPlan} className="rounded border border-slate-300 px-3 py-2 text-sm">
                {plans.map((plan) => (
                  <option key={plan.key} value={plan.key}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </WizardGroup>

        <WizardGroup title="Domein en plan" helper="Fieldgrid-subdomeinen worden direct geverifieerd; custom domeinen starten pending.">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Primair domein
              <input
                name="domain"
                className="rounded border border-slate-300 px-3 py-2 text-sm"
                placeholder="demo-a.fieldgrid.nl"
                defaultValue={fieldValue(draft?.primaryDomain)}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Owner e-mail
              <input
                name="ownerEmail"
                type="email" required className="rounded border border-slate-300 px-3 py-2 text-sm"
                placeholder="eigenaar@example.nl"
                defaultValue={fieldValue(draft?.ownerEmail)}
              />
            </label>
          </div>
        </WizardGroup>

        <WizardGroup title="Modules, sectoren en regio's" helper="De wizard seedt modules, tenantsectoren, defaultbeleid en de tenant-regio catalogus.">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-2">
              <p className="text-xs font-semibold uppercase text-slate-500">Modules</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {catalog.modules.map((module) => (
                  <label key={module.key} className="flex gap-2 rounded border border-slate-200 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      name="moduleKeys"
                      value={module.key}
                      defaultChecked={isSelected(draft?.moduleKeys ?? [], module.key, module.defaultEnabled)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block font-medium text-slate-800">{module.name}</span>
                      <span className="block text-xs text-slate-500">{module.category}</span>
                    </span>
                  </label>
                ))}
                {catalog.modules.length === 0 && <p className="text-sm text-slate-500">Modulecatalogus nog leeg.</p>}
              </div>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Sectorbeleid
                  <select name="sectorMode" defaultValue={selectedSectorMode} className="rounded border border-slate-300 px-3 py-2 text-sm">
                    <option value="multi">Multi-sector</option>
                    <option value="single">Single-sector</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Defaultsector
                  <select name="defaultSectorId" defaultValue={selectedDefaultSectorId} className="rounded border border-slate-300 px-3 py-2 text-sm">
                    <option value="">Geen default</option>
                    {catalog.sectors.map((sector) => (
                      <option key={sector.id} value={sector.id}>
                        {sector.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-2">
                <p className="text-xs font-semibold uppercase text-slate-500">Sectoren</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {catalog.sectors.map((sector) => (
                    <label key={sector.id} className="flex gap-2 rounded border border-slate-200 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        name="sectorIds"
                        value={sector.id}
                        defaultChecked={isSelected(draft?.sectorIds ?? [], sector.id, true)}
                        className="mt-0.5"
                      />
                      <span>{sector.name}</span>
                    </label>
                  ))}
                  {catalog.sectors.length === 0 && <p className="text-sm text-slate-500">Geen actieve sectoren gevonden.</p>}
                </div>
              </div>
            </div>
          </div>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Regio&apos;s
            <textarea
              name="regionNames"
              rows={3}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder={"Noord\nRandstad\nZuid"}
              defaultValue={draft?.regionNames.join("\n") ?? ""}
            />
          </label>
        </WizardGroup>

        <WizardGroup title="Owner invite en branding" helper="Branding wordt als organisatie-instelling gezaaid en blijft later tenant-first-run beheerbaar.">
          <div className="grid gap-3 md:grid-cols-[1fr_0.45fr_0.45fr]">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Branding displaynaam
              <input
                name="brandingDisplayName"
                className="rounded border border-slate-300 px-3 py-2 text-sm"
                placeholder="Demo A"
                defaultValue={fieldValue(draft?.branding.displayName)}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Primaire kleur
              <input
                name="primaryColor"
                type="color"
                className="h-10 rounded border border-slate-300 px-2 py-1"
                defaultValue={draft?.branding.primaryColor ?? DEFAULT_PRIMARY_COLOR}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Accentkleur
              <input
                name="accentColor"
                type="color"
                className="h-10 rounded border border-slate-300 px-2 py-1"
                defaultValue={draft?.branding.accentColor ?? DEFAULT_ACCENT_COLOR}
              />
            </label>
          </div>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            E-mailhandtekening
            <textarea
              name="emailSignature"
              rows={3}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
              defaultValue={draft?.branding.emailSignature ?? DEFAULT_EMAIL_SIGNATURE}
            />
          </label>
        </WizardGroup>

        <WizardGroup title="Review, runstatus en rollback" helper="Mislukte provisioning geeft duidelijke status, retry en rollbackpad in de runhistorie.">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Reviewnotitie
            <textarea
              name="reviewNotes"
              rows={3}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="Controle op domein, plan, modules, sectoren, regio's, owner invite en branding."
              defaultValue={fieldValue(draft?.reviewNotes)}
            />
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="submit"
              formAction={savePlatformOnboardingDraft}
              formNoValidate
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Concept opslaan
            </button>
            <button type="submit" className="rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
              Tenant provisionen
            </button>
          </div>
        </WizardGroup>
      </form>
    </section>
  );
}

export default async function PlatformAdminPage({ searchParams }: Props) {
  const { onboardingDraft } = await searchParams;
  const platformUser = await getCurrentPlatformUser();
  const isPlatformAdmin = platformUser?.role === "owner" || platformUser?.role === "admin";

  const [tenants, platformUsers, supportGrants, provisioningRuns, onboardingCatalog, onboardingDraftData] = await Promise.all([
    isPlatformAdmin ? listPlatformTenants() : Promise.resolve([]),
    isPlatformAdmin ? listPlatformUsers() : Promise.resolve([]),
    isPlatformAdmin ? listSupportAccessGrants() : listCurrentSupportAccessGrants(),
    isPlatformAdmin ? listTenantProvisioningRuns() : Promise.resolve([]),
    isPlatformAdmin ? listPlatformOnboardingCatalog() : Promise.resolve(EMPTY_ONBOARDING_CATALOG),
    isPlatformAdmin && onboardingDraft ? getPlatformOnboardingDraft(onboardingDraft) : Promise.resolve(null),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-slate-500">Fieldgrid</p>
            <h1 className="text-3xl font-semibold tracking-normal">Platformbeheer</h1>
            {!isPlatformAdmin && (
              <p className="text-sm text-slate-500">
                Je ziet alleen supportgrants die expliciet aan jouw platformgebruiker zijn toegekend.
              </p>
            )}
          </div>
          {isPlatformAdmin && (
            <Link
              href="/platform/security"
              className="w-fit rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Securitydashboard
            </Link>
          )}
        </header>

        {isPlatformAdmin && <OnboardingWizard catalog={onboardingCatalog} draft={onboardingDraftData} />}

        {isPlatformAdmin && provisioningRuns.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-normal">Provisioning runs</h2>
              <span className="text-sm text-slate-500">{provisioningRuns.length}</span>
            </div>
            <div className="overflow-x-auto rounded border border-slate-200 bg-white">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Tenant</th>
                    <th className="px-4 py-3 font-semibold">Slug</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Scope</th>
                    <th className="px-4 py-3 font-semibold">Owner</th>
                    <th className="px-4 py-3 font-semibold">Gestart</th>
                    <th className="px-4 py-3 font-semibold">Rollbackpad</th>
                    <th className="px-4 py-3 font-semibold">Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {provisioningRuns.map((run) => (
                    <tr key={run.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium">
                        {run.tenantId ? (
                          <Link href={`/platform/tenants/${run.tenantId}`} className="underline-offset-2 hover:underline">
                            {run.tenantName ?? run.name}
                          </Link>
                        ) : (
                          run.name
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{run.slug}</td>
                      <td className="px-4 py-3 text-slate-600">{run.status} / {run.currentStep}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {run.moduleKeys.length} modules / {run.sectorIds.length} sectoren / {run.regionNames.length} regio&apos;s
                      </td>
                      <td className="px-4 py-3 text-slate-600">{run.ownerEmail ?? "-"} / {run.ownerInviteStatus}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(run.startedAt)}</td>
                      <td className="max-w-72 px-4 py-3 text-slate-600">
                        <span className="block truncate">{run.errorMessage ?? run.rollbackPath}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {run.canResume && (
                            <Link
                              href={`/platform?onboardingDraft=${run.id}`}
                              className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                            >
                              Hervat
                            </Link>
                          )}
                          {run.canRetry && (
                            <form action={retryPlatformTenantProvisioning}>
                              <input type="hidden" name="sourceRunId" value={run.id} />
                              <button
                                type="submit"
                                className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                              >
                                Retry
                              </button>
                            </form>
                          )}
                          {!run.canResume && !run.canRetry && <span className="text-xs text-slate-400">-</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {isPlatformAdmin && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-normal">Tenants</h2>
              <span className="text-sm text-slate-500">{tenants.length}</span>
            </div>
            <div className="overflow-x-auto rounded border border-slate-200 bg-white">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Naam</th>
                    <th className="px-4 py-3 font-semibold">Slug</th>
                    <th className="px-4 py-3 font-semibold">Plan</th>
                    <th className="px-4 py-3 font-semibold">Domein</th>
                    <th className="px-4 py-3 font-semibold">Gebruikers</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((tenant) => (
                    <tr key={tenant.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/platform/tenants/${tenant.id}`} className="text-slate-950 underline-offset-2 hover:underline">
                          {tenant.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{tenant.slug}</td>
                      <td className="px-4 py-3 text-slate-600">{tenant.planKey}</td>
                      <td className="px-4 py-3 text-slate-600">{tenant.primaryDomain ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{tenant.userCount}</td>
                      <td className="px-4 py-3 text-slate-600">{tenant.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className={isPlatformAdmin ? "grid gap-8 lg:grid-cols-2" : "grid gap-8"}>
          {isPlatformAdmin && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-semibold tracking-normal">Platformgebruikers</h2>
                <span className="text-sm text-slate-500">{platformUsers.length}</span>
              </div>
              <div className="overflow-x-auto rounded border border-slate-200 bg-white">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">User ID</th>
                      <th className="px-4 py-3 font-semibold">Rol</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Laatst gezien</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platformUsers.map((user) => (
                      <tr key={user.id} className="border-t border-slate-100">
                        <td className="max-w-64 truncate px-4 py-3 text-slate-600">{user.userId}</td>
                        <td className="px-4 py-3 font-medium">{user.role}</td>
                        <td className="px-4 py-3 text-slate-600">{user.status}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(user.lastSeenAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-normal">Supporttoegang</h2>
              <span className="text-sm text-slate-500">{supportGrants.length}</span>
            </div>
            <div className="overflow-x-auto rounded border border-slate-200 bg-white">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Tenant</th>
                    <th className="px-4 py-3 font-semibold">Reden</th>
                    <th className="px-4 py-3 font-semibold">Verloopt</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {supportGrants.map((grant) => {
                    const status = supportGrantStatus(grant);
                    return (
                      <tr key={grant.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-medium">{grant.tenantName}</td>
                        <td className="max-w-72 truncate px-4 py-3 text-slate-600">{grant.reason}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(grant.expiresAt)}</td>
                        <td className="px-4 py-3 text-slate-600">{status}</td>
                        <td className="px-4 py-3">
                          {status === "Actief" ? (
                            <form action={enterSupportMode}>
                              <input type="hidden" name="tenantId" value={grant.tenantId} />
                              <button
                                type="submit"
                                className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                              >
                                Open supportmodus
                              </button>
                            </form>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
