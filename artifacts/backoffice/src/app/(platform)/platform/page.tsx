import { CheckboxAdapter } from "@/components/ui/checkbox-adapter";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Building2,
  CreditCard,
  ExternalLink,
  LifeBuoy,
  ShieldCheck,
  Sparkles,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import {
  getPlatformDashboardSignals,
  type PlatformDashboardSignals,
} from "@/app/actions/platform-dashboard";
import {
  createPlatformTenant,
  getPlatformOnboardingDraft,
  listPlatformOnboardingCatalog,
  listTenantProvisioningRuns,
  retryPlatformTenantProvisioning,
  savePlatformOnboardingDraft,
  type PlatformOnboardingCatalog,
  type PlatformOnboardingDraft,
  type PlatformProvisioningRunRow,
} from "@/app/actions/platform-provisioning";
import { getPlatformStagingSmokeDashboard } from "@/app/actions/platform-smoke";
import type {
  PlatformSmokeStatus,
  PlatformStagingSmokeDashboard,
} from "@/app/actions/platform-smoke.types";
import {
  listPlatformTenants,
  type PlatformTenantRow,
} from "@/app/actions/platform-tenants";
import {
  enterSupportMode,
  listPlatformSecurityDashboard,
  listPlatformUsers,
  listSupportAccessGrants,
  type PlatformSecurityDashboard,
  type PlatformSecurityEventRow,
  type SupportAccessGrantRow,
} from "@/app/actions/platform";
import { listPlatformReleases } from "@/app/actions/releases";
import { listCurrentSupportAccessGrants } from "@/app/actions/support-mode";
import { getCurrentPlatformUser } from "@/lib/auth/platform";
import type { ReleaseSummary } from "@workspace/db";

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

function supportGrantStatus(
  grant: SupportAccessGrantRow,
): "Actief" | "Gepland" | "Verlopen" | "Ingetrokken" {
  const now = Date.now();
  if (grant.revokedAt) return "Ingetrokken";
  if (new Date(grant.startsAt).getTime() > now) return "Gepland";
  if (new Date(grant.expiresAt).getTime() <= now) return "Verlopen";
  return "Actief";
}

function fieldValue(value: string | null | undefined): string | undefined {
  return value ?? undefined;
}

function isSelected(
  values: string[],
  value: string,
  fallback: boolean,
): boolean {
  return values.length > 0 ? values.includes(value) : fallback;
}

function OnboardingStep({
  index,
  title,
  detail,
}: {
  index: number;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-xs font-semibold uppercase text-slate-500">
        Stap {index}
      </p>
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
        <legend className="text-sm font-semibold text-slate-950">
          {title}
        </legend>
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
  const selectedDefaultSectorId =
    draft?.defaultSectorId ?? catalog.sectors[0]?.id ?? "";

  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-normal">
            Tenant onboarding wizard
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Begeleid tenantgegevens, domein, plan, modules, sectoren,
            regio&apos;s, owner invite, branding, review, runstatus en rollback
            in een flow.
          </p>
        </div>
        <span className="w-fit rounded bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
          Provisioning service
        </span>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <OnboardingStep
          index={1}
          title="Tenantgegevens"
          detail="Naam, slug en SaaS-identiteit."
        />
        <OnboardingStep
          index={2}
          title="Domein en plan"
          detail="Host-first routing en abonnement."
        />
        <OnboardingStep
          index={3}
          title="Modules, sectoren en first-run"
          detail="Tenantmodules, beleid en regio-catalogus."
        />
        <OnboardingStep
          index={4}
          title="Owner invite en branding"
          detail="Owner-uitnodiging wordt direct verstuurd."
        />
        <OnboardingStep
          index={5}
          title="Review, runstatus en rollback"
          detail="Save/resume, retry en rollbackpad blijven zichtbaar."
        />
      </div>

      {draft && (
        <div className="mb-5 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Concept geladen: {draft.name || "Concept tenant"} /{" "}
          {draft.currentStep}. Opslaan werkt dit concept bij; provisionen maakt
          de tenant aan.
        </div>
      )}

      <form action={createPlatformTenant} className="grid gap-5">
        {draft && <input type="hidden" name="draftRunId" value={draft.id} />}

        <WizardGroup
          title="Tenantgegevens"
          helper="Nieuwe tenant kan zonder SQL worden ingericht."
        >
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
              <select
                name="planKey"
                defaultValue={selectedPlan}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              >
                {plans.map((plan) => (
                  <option key={plan.key} value={plan.key}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </WizardGroup>

        <WizardGroup
          title="Domein en plan"
          helper="Fieldgrid-subdomeinen worden direct geverifieerd; custom domeinen starten pending."
        >
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
                type="email"
                required
                className="rounded border border-slate-300 px-3 py-2 text-sm"
                placeholder="eigenaar@example.nl"
                defaultValue={fieldValue(draft?.ownerEmail)}
              />
            </label>
          </div>
        </WizardGroup>

        <WizardGroup
          title="Modules, sectoren en regio's"
          helper="De wizard seedt modules, tenantsectoren, defaultbeleid en de tenant-regio catalogus."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-2">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Modules
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {catalog.modules.map((module) => (
                  <label
                    key={module.key}
                    className="flex gap-2 rounded border border-slate-200 px-3 py-2 text-sm"
                  >
                    <CheckboxAdapter
                      type="checkbox"
                      name="moduleKeys"
                      value={module.key}
                      defaultChecked={isSelected(
                        draft?.moduleKeys ?? [],
                        module.key,
                        module.defaultEnabled,
                      )}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block font-medium text-slate-800">
                        {module.name}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {module.category}
                      </span>
                    </span>
                  </label>
                ))}
                {catalog.modules.length === 0 && (
                  <p className="text-sm text-slate-500">
                    Modulecatalogus nog leeg.
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Sectorbeleid
                  <select
                    name="sectorMode"
                    defaultValue={selectedSectorMode}
                    className="rounded border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="multi">Multi-sector</option>
                    <option value="single">Single-sector</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Defaultsector
                  <select
                    name="defaultSectorId"
                    defaultValue={selectedDefaultSectorId}
                    className="rounded border border-slate-300 px-3 py-2 text-sm"
                  >
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
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Sectoren
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {catalog.sectors.map((sector) => (
                    <label
                      key={sector.id}
                      className="flex gap-2 rounded border border-slate-200 px-3 py-2 text-sm"
                    >
                      <CheckboxAdapter
                        type="checkbox"
                        name="sectorIds"
                        value={sector.id}
                        defaultChecked={isSelected(
                          draft?.sectorIds ?? [],
                          sector.id,
                          true,
                        )}
                        className="mt-0.5"
                      />
                      <span>{sector.name}</span>
                    </label>
                  ))}
                  {catalog.sectors.length === 0 && (
                    <p className="text-sm text-slate-500">
                      Geen actieve sectoren gevonden.
                    </p>
                  )}
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

        <WizardGroup
          title="Owner invite en branding"
          helper="Branding wordt als organisatie-instelling gezaaid en blijft later tenant-first-run beheerbaar."
        >
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
                defaultValue={
                  draft?.branding.primaryColor ?? DEFAULT_PRIMARY_COLOR
                }
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Accentkleur
              <input
                name="accentColor"
                type="color"
                className="h-10 rounded border border-slate-300 px-2 py-1"
                defaultValue={
                  draft?.branding.accentColor ?? DEFAULT_ACCENT_COLOR
                }
              />
            </label>
          </div>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            E-mailhandtekening
            <textarea
              name="emailSignature"
              rows={3}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
              defaultValue={
                draft?.branding.emailSignature ?? DEFAULT_EMAIL_SIGNATURE
              }
            />
          </label>
        </WizardGroup>

        <WizardGroup
          title="Review, runstatus en rollback"
          helper="Mislukte provisioning geeft duidelijke status, retry en rollbackpad in de runhistorie."
        >
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
            <button
              type="submit"
              className="rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Tenant provisionen
            </button>
          </div>
        </WizardGroup>
      </form>
    </section>
  );
}

type DashboardTone = "neutral" | "good" | "warning" | "danger";

type DashboardMetric = {
  label: string;
  value: string | number;
  detail: string;
  href: string;
  icon: LucideIcon;
  tone: DashboardTone;
};

type DashboardAction = {
  id: string;
  label: string;
  detail: string;
  href: string;
  meta: string;
  tone: DashboardTone;
};

function dashboardToneClasses(tone: DashboardTone): string {
  if (tone === "good")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "danger") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function dashboardStatusLabel(status: PlatformSmokeStatus): string {
  if (status === "ok") return "Groen";
  if (status === "warning") return "Aandacht";
  if (status === "blocked") return "Geblokkeerd";
  return "Handmatig";
}

function dashboardStatusTone(status: PlatformSmokeStatus): DashboardTone {
  if (status === "ok") return "good";
  if (status === "blocked") return "danger";
  if (status === "warning") return "warning";
  return "neutral";
}

function metricValueClass(tone: DashboardTone): string {
  if (tone === "good") return "text-emerald-700";
  if (tone === "warning") return "text-amber-700";
  if (tone === "danger") return "text-rose-700";
  return "text-slate-950";
}

function DashboardMetricCard({ metric }: { metric: DashboardMetric }) {
  const Icon = metric.icon;

  return (
    <Link
      href={metric.href}
      className="group rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition hover:border-slate-300 hover:bg-slate-50"
      title={metric.detail}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md border ${dashboardToneClasses(metric.tone)}`}
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={`text-lg font-semibold leading-6 tracking-normal ${metricValueClass(metric.tone)}`}
            >
              {metric.value}
            </p>
            <ExternalLink
              className="mt-0.5 size-3.5 shrink-0 text-slate-300 transition group-hover:text-slate-500"
              aria-hidden="true"
            />
          </div>
          <p className="mt-0.5 truncate text-sm font-medium text-slate-900">
            {metric.label}
          </p>
          <p className="mt-0.5 line-clamp-1 text-xs leading-4 text-slate-500">
            {metric.detail}
          </p>
        </div>
      </div>
    </Link>
  );
}

function DashboardActionList({ actions }: { actions: DashboardAction[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-base font-semibold tracking-normal">
            Actielijst
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Compact overzicht. Details staan per actie ingeklapt.
          </p>
        </div>
        <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          {actions.length}
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        {actions.length > 0 ? (
          actions.map((action) => (
            <div key={action.id} className="grid gap-2 py-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded border px-2 py-0.5 text-[11px] font-medium ${dashboardToneClasses(action.tone)}`}
                  >
                    {action.meta}
                  </span>
                  <Link
                    href={action.href}
                    className="font-medium text-slate-950 underline-offset-2 hover:underline"
                  >
                    {action.label}
                  </Link>
                </div>
                <details className="group/details mt-1">
                  <summary className="cursor-pointer list-none text-xs font-medium text-slate-500 hover:text-slate-800">
                    Details
                    <span className="ml-1 text-slate-300 group-open/details:hidden">
                      +
                    </span>
                    <span className="ml-1 hidden text-slate-300 group-open/details:inline">
                      -
                    </span>
                  </summary>
                  <p className="mt-2 rounded-md bg-slate-50 p-2 text-xs leading-5 text-slate-600 break-words">
                    {action.detail}
                  </p>
                </details>
              </div>
            </div>
          ))
        ) : (
          <div className="py-6 text-sm text-slate-500">
            Geen directe acties gevonden.
          </div>
        )}
      </div>
    </section>
  );
}

function RecentAuditEvents({ events }: { events: PlatformSecurityEventRow[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-base font-semibold tracking-normal">
            Recente audit-events
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Platform-, support- en tenantsecurity in tijdvolgorde.
          </p>
        </div>
        <Link
          href="/platform/security"
          className="text-sm font-medium text-slate-700 underline-offset-2 hover:underline"
        >
          Open
        </Link>
      </div>
      <div className="divide-y divide-slate-100">
        {events.length > 0 ? (
          events.map((event) => (
            <div key={`${event.source}:${event.id}`} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  {event.scope}
                </span>
                <p className="font-medium text-slate-950">{event.action}</p>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {event.tenantName} · {event.resource ?? "platform"} ·{" "}
                {formatDate(event.createdAt)}
              </p>
            </div>
          ))
        ) : (
          <div className="py-6 text-sm text-slate-500">
            Nog geen audit-events zichtbaar.
          </div>
        )}
      </div>
    </section>
  );
}

function RecentTicketsAndNotifications() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="border-b border-slate-100 pb-3">
        <h2 className="text-base font-semibold tracking-normal">
          Tickets en meldingen
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Routes staan klaar; centrale platform-inbox volgt in de ticket- en
          notificatiefase.
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        <Link
          href="/platform/tickets"
          className="group flex items-center justify-between gap-4 py-4"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex size-9 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-600">
              <Ticket className="size-4" aria-hidden="true" />
            </span>
            <div>
              <p className="font-medium text-slate-950">
                Geen open platformtickets
              </p>
              <p className="text-sm text-slate-500">
                Databron wordt gekoppeld in de ticketsysteemfase.
              </p>
            </div>
          </div>
          <ExternalLink
            className="size-4 shrink-0 text-slate-300 transition group-hover:text-slate-500"
            aria-hidden="true"
          />
        </Link>
        <Link
          href="/platform/notifications"
          className="group flex items-center justify-between gap-4 py-4"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex size-9 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-600">
              <Bell className="size-4" aria-hidden="true" />
            </span>
            <div>
              <p className="font-medium text-slate-950">
                Geen platformmeldingen
              </p>
              <p className="text-sm text-slate-500">
                Realtime meldingencentrum volgt na de dashboardbasis.
              </p>
            </div>
          </div>
          <ExternalLink
            className="size-4 shrink-0 text-slate-300 transition group-hover:text-slate-500"
            aria-hidden="true"
          />
        </Link>
      </div>
    </section>
  );
}

function LatestPlatformRelease({
  release,
}: {
  release: ReleaseSummary | null;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-base font-semibold tracking-normal">
            Laatste release
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Globale release notes, highlights en gekoppelde roadmapitems.
          </p>
        </div>
        <Link
          href="/platform/releases"
          className="text-sm font-medium text-slate-700 underline-offset-2 hover:underline"
        >
          Beheer
        </Link>
      </div>
      {release ? (
        <Link
          href={`/platform/releases/${release.slug}`}
          className="group block py-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-700">
              {release.version}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {release.status}
            </span>
          </div>
          <p className="mt-2 font-medium text-slate-950 group-hover:underline">
            {release.title}
          </p>
          {release.summary && (
            <p className="mt-1 text-sm leading-5 text-slate-500">
              {release.summary}
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            {release.items.length} items · {release.roadmapItems.length}{" "}
            roadmaplinks
          </p>
        </Link>
      ) : (
        <div className="py-6 text-sm text-slate-500">
          Nog geen releases aangemaakt.
        </div>
      )}
    </section>
  );
}

function quickTenantLinks(
  tenants: PlatformTenantRow[],
  signals: PlatformDashboardSignals,
): PlatformTenantRow[] {
  const byId = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  const selected: PlatformTenantRow[] = [];
  const seen = new Set<string>();
  const pick = (tenant: PlatformTenantRow | undefined) => {
    if (!tenant || seen.has(tenant.id)) return;
    seen.add(tenant.id);
    selected.push(tenant);
  };

  signals.pendingDomains.rows.forEach((row) => pick(byId.get(row.tenantId)));
  signals.pastDueSubscriptions.rows.forEach((row) =>
    pick(byId.get(row.tenantId)),
  );
  tenants.filter((tenant) => tenant.status === "suspended").forEach(pick);
  tenants.filter((tenant) => tenant.status === "trial").forEach(pick);
  tenants.forEach(pick);

  return selected.slice(0, 6);
}

function QuickTenantLinks({
  tenants,
  signals,
}: {
  tenants: PlatformTenantRow[];
  signals: PlatformDashboardSignals;
}) {
  const quickLinks = quickTenantLinks(tenants, signals);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-base font-semibold tracking-normal">
            Snelle organisatielinks
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Prioriteit op open acties, proefperiodes en actieve organisaties.
          </p>
        </div>
        <Link
          href="/platform/tenants"
          className="text-sm font-medium text-slate-700 underline-offset-2 hover:underline"
        >
          Alles
        </Link>
      </div>
      <div className="divide-y divide-slate-100">
        {quickLinks.map((tenant) => (
          <Link
            key={tenant.id}
            href={`/platform/tenants/${tenant.id}`}
            className="group flex items-center justify-between gap-4 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-950">
                {tenant.name}
              </p>
              <p className="truncate text-xs text-slate-500">
                {tenant.slug} · {tenant.planKey} · {tenant.status}
              </p>
            </div>
            <ExternalLink
              className="size-4 shrink-0 text-slate-300 transition group-hover:text-slate-500"
              aria-hidden="true"
            />
          </Link>
        ))}
        {quickLinks.length === 0 && (
          <div className="py-6 text-sm text-slate-500">
            Nog geen organisaties beschikbaar.
          </div>
        )}
      </div>
    </section>
  );
}

function buildDashboardActions(input: {
  signals: PlatformDashboardSignals;
  provisioningRuns: PlatformProvisioningRunRow[];
  supportGrants: SupportAccessGrantRow[];
  smokeDashboard: PlatformStagingSmokeDashboard;
}): DashboardAction[] {
  const actions: DashboardAction[] = [];
  const now = Date.now();
  const soon = now + 24 * 60 * 60 * 1000;

  for (const run of input.provisioningRuns) {
    if (run.canResume) {
      actions.push({
        id: `resume:${run.id}`,
        label: `${run.name} onboarding hervatten`,
        detail: `${run.slug} staat als concept op ${run.currentStep}.`,
        href: `/platform/onboarding?onboardingDraft=${run.id}`,
        meta: "Onboarding",
        tone: "warning",
      });
    } else if (run.canRetry) {
      actions.push({
        id: `retry:${run.id}`,
        label: `${run.name} inrichting opnieuw bekijken`,
        detail: run.errorMessage ?? run.rollbackPath,
        href: "/platform/onboarding#provisioning-runs",
        meta: "Inrichting",
        tone: "danger",
      });
    } else if (run.ownerInviteStatus === "pending") {
      actions.push({
        id: `owner-invite:${run.id}`,
        label: `${run.name} eigenaarsuitnodiging staat open`,
        detail: run.ownerEmail
          ? `${run.ownerEmail} heeft de eigenaarsuitnodiging nog niet afgerond.`
          : "De eigenaarsuitnodiging staat nog in afwachting.",
        href: run.tenantId
          ? `/platform/tenants/${run.tenantId}`
          : "/platform/onboarding#provisioning-runs",
        meta: "Eigenaar",
        tone: "warning",
      });
    }
  }

  for (const domain of input.signals.pendingDomains.rows) {
    actions.push({
      id: `domain:${domain.id}`,
      label: `${domain.domain} verifieren`,
      detail: `${domain.tenantName} heeft domeinstatus ${domain.verificationStatus}.`,
      href: `/platform/tenants/${domain.tenantId}`,
      meta: "Domein",
      tone: "warning",
    });
  }

  for (const subscription of input.signals.pastDueSubscriptions.rows) {
    actions.push({
      id: `subscription:${subscription.id}`,
      label: `${subscription.tenantName} abonnement met betalingsachterstand`,
      detail: `${subscription.planName} staat sinds ${formatDate(subscription.updatedAt)} op ${subscription.status}.`,
      href: `/platform/tenants/${subscription.tenantId}`,
      meta: "Abonnement",
      tone: "danger",
    });
  }

  for (const grant of input.supportGrants) {
    const expiresAt = new Date(grant.expiresAt).getTime();
    if (supportGrantStatus(grant) !== "Actief" || expiresAt > soon) continue;
    actions.push({
      id: `support:${grant.id}`,
      label: `${grant.tenantName} supporttoegang verloopt bijna`,
      detail: `Verloopt ${formatDate(grant.expiresAt)}. Reden: ${grant.reason}`,
      href: `/platform/tenants/${grant.tenantId}`,
      meta: "Support",
      tone: "warning",
    });
  }

  if (input.smokeDashboard.finalExternalTenantGate.status !== "ok") {
    actions.push({
      id: "smoke:final-gate",
      label: "Externe organisatiecontrole vraagt aandacht",
      detail: input.smokeDashboard.finalExternalTenantGate.summary,
      href: "/platform/operations",
      meta: "Controle",
      tone: dashboardStatusTone(
        input.smokeDashboard.finalExternalTenantGate.status,
      ),
    });
  }

  input.smokeDashboard.checks
    .filter((check) => check.status === "blocked")
    .slice(0, 2)
    .forEach((check) => {
      actions.push({
        id: `smoke:${check.id}`,
        label: `${check.label} is geblokkeerd`,
        detail: check.nextAction,
        href: "/platform/operations",
        meta: "Controle",
        tone: "danger",
      });
    });

  return actions.slice(0, 10);
}

function PlatformDashboardOverview({
  tenants,
  supportGrants,
  provisioningRuns,
  signals,
  securityDashboard,
  smokeDashboard,
  latestRelease,
}: {
  tenants: PlatformTenantRow[];
  supportGrants: SupportAccessGrantRow[];
  provisioningRuns: PlatformProvisioningRunRow[];
  signals: PlatformDashboardSignals;
  securityDashboard: PlatformSecurityDashboard;
  smokeDashboard: PlatformStagingSmokeDashboard;
  latestRelease: ReleaseSummary | null;
}) {
  const activeTenants = tenants.filter(
    (tenant) => tenant.isActive && ["trial", "active"].includes(tenant.status),
  ).length;
  const suspendedTenants = tenants.filter(
    (tenant) => tenant.status === "suspended",
  ).length;
  const activeSupportGrants = supportGrants.filter(
    (grant) => supportGrantStatus(grant) === "Actief",
  ).length;
  const activeProvisioningRuns = provisioningRuns.filter((run) =>
    ["draft", "started", "running", "retrying"].includes(run.status),
  ).length;
  const blockedSmokeChecks = smokeDashboard.checks.filter(
    (check) => check.status === "blocked",
  ).length;
  const warningSmokeChecks = smokeDashboard.checks.filter(
    (check) => check.status === "warning",
  ).length;
  const smokeTone = dashboardStatusTone(
    smokeDashboard.finalExternalTenantGate.status,
  );
  const actions = buildDashboardActions({
    signals,
    provisioningRuns,
    supportGrants,
    smokeDashboard,
  });

  const metrics: DashboardMetric[] = [
    {
      label: "Actieve organisaties",
      value: activeTenants,
      detail: `${tenants.length} organisaties in platformbeheer.`,
      href: "/platform/tenants",
      icon: Building2,
      tone: "good",
    },
    {
      label: "Gepauzeerde organisaties",
      value: suspendedTenants,
      detail: "Geblokkeerde of gepauzeerde klantomgevingen.",
      href: "/platform/tenants?status=suspended",
      icon: AlertTriangle,
      tone: suspendedTenants > 0 ? "danger" : "good",
    },
    {
      label: "Actieve supporttoegang",
      value: activeSupportGrants,
      detail: "Tijdelijke, gecontroleerde toegang met een actieve eindtijd.",
      href: "/platform/users",
      icon: LifeBuoy,
      tone: activeSupportGrants > 0 ? "warning" : "neutral",
    },
    {
      label: "Domeinen in afwachting",
      value: signals.pendingDomains.total,
      detail: "Niet-geverifieerde organisatiedomeinen.",
      href: "/platform/tenants",
      icon: ShieldCheck,
      tone: signals.pendingDomains.total > 0 ? "warning" : "good",
    },
    {
      label: "Abonnementen met achterstand",
      value: signals.pastDueSubscriptions.total,
      detail: "Abonnementen die betaal- of statusactie vragen.",
      href: "/platform/subscriptions",
      icon: CreditCard,
      tone: signals.pastDueSubscriptions.total > 0 ? "danger" : "good",
    },
    {
      label: "Platformcontrole",
      value: dashboardStatusLabel(
        smokeDashboard.finalExternalTenantGate.status,
      ),
      detail: `${blockedSmokeChecks} geblokkeerd, ${warningSmokeChecks} aandachtspunt(en).`,
      href: "/platform/operations",
      icon: Activity,
      tone: smokeTone,
    },
    {
      label: "Actieve onboarding",
      value: activeProvisioningRuns,
      detail: "Organisaties die nog worden ingericht of hervat kunnen worden.",
      href: "/platform/onboarding",
      icon: Sparkles,
      tone: activeProvisioningRuns > 0 ? "warning" : "good",
    },
  ];

  return (
    <section className="grid gap-4">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {metrics.map((metric) => (
          <DashboardMetricCard key={metric.label} metric={metric} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <DashboardActionList actions={actions} />
        <QuickTenantLinks tenants={tenants} signals={signals} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RecentAuditEvents events={securityDashboard.events.slice(0, 6)} />
        <LatestPlatformRelease release={latestRelease} />
      </div>
    </section>
  );
}

function SupportWorkspace({ grants }: { grants: SupportAccessGrantRow[] }) {
  const activeGrants = grants.filter(
    (grant) => supportGrantStatus(grant) === "Actief",
  );

  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">
          Toegewezen supportomgevingen
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Je ziet alleen organisaties waarvoor je tijdelijke supporttoegang hebt
          gekregen.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {activeGrants.map((grant) => (
          <article
            key={grant.id}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <p className="font-semibold text-slate-950">{grant.tenantName}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {grant.reason}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Verloopt {formatDate(grant.expiresAt)} · tijdzone Europe/Amsterdam
            </p>
            <form action={enterSupportMode} className="mt-4">
              <input type="hidden" name="tenantId" value={grant.tenantId} />
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center rounded border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Supportomgeving openen
              </button>
            </form>
          </article>
        ))}
        {activeGrants.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 md:col-span-2">
            Er is nu geen actieve supporttoegang aan jou toegewezen.
          </div>
        )}
      </div>
    </section>
  );
}

export default async function PlatformAdminPage() {
  const platformUser = await getCurrentPlatformUser();
  const isPlatformAdmin =
    platformUser?.role === "owner" || platformUser?.role === "admin";

  const [
    tenants,
    supportGrants,
    provisioningRuns,
    dashboardSignals,
    securityDashboard,
    smokeDashboard,
    platformReleases,
  ] = await Promise.all([
    isPlatformAdmin ? listPlatformTenants() : Promise.resolve([]),
    isPlatformAdmin
      ? listSupportAccessGrants()
      : listCurrentSupportAccessGrants(),
    isPlatformAdmin ? listTenantProvisioningRuns() : Promise.resolve([]),
    isPlatformAdmin ? getPlatformDashboardSignals() : Promise.resolve(null),
    isPlatformAdmin
      ? listPlatformSecurityDashboard({ limit: 80 })
      : Promise.resolve(null),
    isPlatformAdmin
      ? getPlatformStagingSmokeDashboard()
      : Promise.resolve(null),
    isPlatformAdmin ? listPlatformReleases() : Promise.resolve([]),
  ]);

  return (
    <main className="platform-page min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Fieldgrid platform
            </p>
            <h1 className="text-2xl font-semibold tracking-normal">
              Platformbeheer
            </h1>
            {!isPlatformAdmin && (
              <p className="text-sm text-slate-500">
                Je ziet alleen supportgrants die expliciet aan jouw
                platformgebruiker zijn toegekend.
              </p>
            )}
          </div>
          {isPlatformAdmin && (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/platform/accelerators"
                className="inline-flex w-fit items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                <Sparkles aria-hidden="true" className="size-4" />
                Platformversnellers
              </Link>
              <Link
                href="/platform/security"
                className="w-fit rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Securitydashboard
              </Link>
            </div>
          )}
        </header>

        {isPlatformAdmin &&
          dashboardSignals &&
          securityDashboard &&
          smokeDashboard && (
            <PlatformDashboardOverview
              tenants={tenants}
              supportGrants={supportGrants}
              provisioningRuns={provisioningRuns}
              signals={dashboardSignals}
              securityDashboard={securityDashboard}
              smokeDashboard={smokeDashboard}
              latestRelease={platformReleases[0] ?? null}
            />
          )}

        {isPlatformAdmin && (
          <nav
            className="flex flex-wrap gap-2"
            aria-label="Snelle platformacties"
          >
            <Link
              href="/platform/onboarding"
              className="inline-flex min-h-11 items-center gap-2 rounded bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Sparkles aria-hidden="true" className="size-4" />
              Organisatie inrichten
            </Link>
            <Link
              href="/platform/tenants"
              className="inline-flex min-h-11 items-center gap-2 rounded border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Building2 aria-hidden="true" className="size-4" />
              Organisaties beheren
            </Link>
            <Link
              href="/platform/users"
              className="inline-flex min-h-11 items-center gap-2 rounded border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <LifeBuoy aria-hidden="true" className="size-4" />
              Toegang beheren
            </Link>
          </nav>
        )}

        {!isPlatformAdmin && <SupportWorkspace grants={supportGrants} />}
      </div>
    </main>
  );
}
