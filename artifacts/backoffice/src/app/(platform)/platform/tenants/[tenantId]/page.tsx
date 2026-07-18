import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { customDomainVerificationValue, FIELDGRID_SUPPORT_RUNTIME_PERMISSION_KEYS } from "@workspace/db";
import {
  Activity,
  Bell,
  Boxes,
  Building2,
  ChevronRight,
  CreditCard,
  ExternalLink,
  FileText,
  Globe2,
  LifeBuoy,
  Megaphone,
  ShieldCheck,
  Ticket,
  UserCog,
} from "lucide-react";
import {
  addPlatformTenantAdmin,
  addPlatformTenantDomain,
  deletePlatformTenantAdmin,
  getPlatformTenantDetail,
  listPlatformPlans,
  listPlatformTenantDomains,
  listPlatformTenantModules,
  listPlatformTenantRegions,
  listPlatformTenantSectors,
  listPlatformTenantSubscriptions,
  listPlatformTenantUsersAndOwner,
  sendPlatformTenantAdminPasswordReset,
  updatePlatformTenantDomain,
  updatePlatformTenantLifecycle,
  updatePlatformTenantModule,
  updatePlatformTenantAdmin,
  updatePlatformTenantOwnerInvite,
  updatePlatformTenantPlan,
  updatePlatformTenantSector,
  updatePlatformTenantSectorPolicy,
  type PlatformTenantDetail,
  type PlatformTenantRegionRow,
} from "@/app/actions/platform-tenants";
import {
  listTenantProvisioningRuns,
  retryPlatformTenantProvisioning,
  type PlatformProvisioningRunRow,
} from "@/app/actions/platform-provisioning";
import {
  createSupportAccessGrantFromForm,
  enterSupportMode,
  listPlatformSecurityDashboard,
  listPlatformUsers,
  listSupportAccessGrants,
  revokeSupportAccessGrantFromForm,
  type PlatformSecurityEventRow,
  type SupportAccessGrantRow,
} from "@/app/actions/platform";

export const metadata = {
  title: "Tenantbeheer",
};

type Props = {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ tab?: string }>;
};

type TenantDomainRow = Awaited<ReturnType<typeof listPlatformTenantDomains>>[number];

const TENANT_TABS = [
  { id: "overview", label: "Overzicht", icon: Building2 },
  { id: "subscription", label: "Abonnement", icon: CreditCard },
  { id: "domains", label: "Domeinen", icon: Globe2 },
  { id: "modules", label: "Modules", icon: Boxes },
  { id: "sectors", label: "Sectoren en regio's", icon: Activity },
  { id: "users", label: "Gebruikers en owner", icon: UserCog },
  { id: "branding", label: "Branding", icon: FileText },
  { id: "usage", label: "Usage en readiness", icon: ShieldCheck },
  { id: "support", label: "Support grants", icon: LifeBuoy },
  { id: "tickets", label: "Tickets", icon: Ticket },
  { id: "notifications", label: "Meldingen", icon: Bell },
  { id: "audit", label: "Audit", icon: ShieldCheck },
  { id: "provisioning", label: "Provisioning", icon: Megaphone },
] as const;

type TenantTabId = (typeof TENANT_TABS)[number]["id"];

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

async function addPlatformTenantAdminFormAction(formData: FormData): Promise<void> {
  "use server";
  await addPlatformTenantAdmin(formData);
}

async function updatePlatformTenantAdminFormAction(formData: FormData): Promise<void> {
  "use server";
  await updatePlatformTenantAdmin(formData);
}

async function deletePlatformTenantAdminFormAction(formData: FormData): Promise<void> {
  "use server";
  await deletePlatformTenantAdmin(formData);
}

async function sendPlatformTenantAdminPasswordResetFormAction(formData: FormData): Promise<void> {
  "use server";
  await sendPlatformTenantAdminPasswordReset(formData);
}

async function updatePlatformTenantOwnerInviteFormAction(formData: FormData): Promise<void> {
  "use server";
  await updatePlatformTenantOwnerInvite(formData);
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

async function retryPlatformTenantProvisioningFormAction(formData: FormData): Promise<void> {
  "use server";
  await retryPlatformTenantProvisioning(formData);
}

function normalizeTab(value: string | undefined): TenantTabId {
  return TENANT_TABS.some((tab) => tab.id === value) ? value as TenantTabId : "overview";
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

function statusChipClass(tone: "neutral" | "good" | "warning" | "danger"): string {
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "danger") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function tenantStatusTone(status: PlatformTenantDetail["status"]): "neutral" | "good" | "warning" | "danger" {
  if (status === "active") return "good";
  if (status === "trial" || status === "provisioning") return "warning";
  if (status === "suspended" || status === "archived") return "danger";
  return "neutral";
}

function readinessTone(status: "ready" | "warning" | "blocked"): "neutral" | "good" | "warning" | "danger" {
  if (status === "ready") return "good";
  if (status === "warning") return "warning";
  return "danger";
}

function readinessStatusLabel(status: "ready" | "warning" | "blocked"): string {
  if (status === "ready") return "Klaar";
  if (status === "warning") return "Check";
  return "Blokkeert";
}

function tenantHasCustomDomains(tenant: PlatformTenantDetail): boolean {
  return tenant.planKey === "enterprise" || tenant.usageLimits.some((limit) => limit.key === "custom_domains" && limit.isEnabled);
}

function domainTypeLabel(type: string): string {
  if (type === "custom_domain") return "Custom domain";
  if (type === "platform_reserved") return "Platform";
  return "Fieldgrid subdomain";
}

function domainStatusTone(status: string): "neutral" | "good" | "warning" | "danger" {
  if (status === "verified" || status === "active") return "good";
  if (status === "failed" || status === "disabled" || status === "disabled_plan") return "danger";
  if (status === "pending" || status === "pending_dns" || status === "dns_seen" || status === "tls_pending") return "warning";
  return "neutral";
}

function subscriptionStatusTone(status: string): "neutral" | "good" | "warning" | "danger" {
  if (status === "active") return "good";
  if (status === "trial" || status === "past_due") return "warning";
  if (status === "canceled" || status === "expired") return "danger";
  return "neutral";
}

function tlsStatusTone(status: string): "neutral" | "good" | "warning" | "danger" {
  if (status === "active") return "good";
  if (status === "failed" || status === "disabled") return "danger";
  if (status === "pending") return "warning";
  return "neutral";
}

function fieldgridPublicIpv4(): string {
  return process.env.FIELDGRID_PUBLIC_IPV4?.trim() || "FIELDGRID_PUBLIC_IPV4";
}

function fieldgridPublicIpv6(): string | null {
  return process.env.FIELDGRID_PUBLIC_IPV6?.trim() || null;
}

function fieldgridCnameTarget(tenant: PlatformTenantDetail, domain: TenantDomainRow): string {
  return domain.dnsTarget || `${tenant.slug}.fieldgrid.nl`;
}

function canRouteDomain(domain: TenantDomainRow): boolean {
  return domain.verificationStatus === "verified" || domain.verificationStatus === "active";
}

function preferredTenantAdminRoleIds(roles: Awaited<ReturnType<typeof listPlatformTenantUsersAndOwner>>["roles"]): string[] {
  const preferredNames = ["Admin", "Administrator", "Administration", "Beheerder", "Management", "Owner", "Eigenaar"];
  const role = preferredNames
    .map((name) => roles.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase()))
    .find(Boolean) ?? roles[0] ?? null;
  return role ? [role.id] : [];
}

function Section({ title, children, helper }: { title: string; helper?: string; children: ReactNode }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-normal text-slate-950">{title}</h2>
        {helper && <p className="mt-1 text-sm leading-6 text-slate-500">{helper}</p>}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

function TenantTabs({ tenantId, activeTab }: { tenantId: string; activeTab: TenantTabId }) {
  return (
    <nav className="platform-scroll-x -mx-4 px-4 pb-1 sm:mx-0 sm:px-0" aria-label="Tenantdetail tabs">
      <div className="platform-tab-strip flex min-w-max gap-2 border-b border-slate-200">
        {TENANT_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <Link
              key={tab.id}
              href={`/platform/tenants/${tenantId}?tab=${tab.id}`}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium ${
                active
                  ? "border-slate-950 text-slate-950"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
              }`}
            >
              <Icon className="size-4" aria-hidden="true" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function TenantOpenLinks({ tenant }: { tenant: PlatformTenantDetail }) {
  const host = tenant.primaryDomain ?? `${tenant.slug}.fieldgrid.nl`;
  const links = [
    { label: "Tenant root", path: "" },
    { label: "Tenant backoffice", path: "/admin" },
    { label: "Klantenportaal", path: "/klant" },
    { label: "Personeelsportaal", path: "/personeel" },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {links.map((link) => (
        <a
          key={link.label}
          href={`https://${host}${link.path}`}
          target="_blank"
          rel="noreferrer"
          className="group flex items-center justify-between gap-3 rounded border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:border-slate-300"
        >
          <span className="min-w-0 truncate">{link.label}</span>
          <ExternalLink className="size-4 shrink-0 text-slate-300 group-hover:text-slate-500" aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}

function LifecycleActions({ tenant }: { tenant: PlatformTenantDetail }) {
  const actions = [
    { value: "suspend", label: "Suspend", tone: "warning", hidden: tenant.status === "suspended" || tenant.status === "archived" },
    { value: "reactivate", label: "Reactiveren", tone: "good", hidden: tenant.status === "active" },
    { value: "archive", label: "Archiveren", tone: "danger", hidden: tenant.status === "archived" },
  ] as const;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.filter((action) => !action.hidden).map((action) => (
        <form key={action.value} action={updatePlatformTenantLifecycleFormAction}>
          <input type="hidden" name="tenantId" value={tenant.id} />
          <input type="hidden" name="lifecycleAction" value={action.value} />
          <button
            type="submit"
            className={`rounded border px-3 py-2 text-sm font-medium ${statusChipClass(action.tone)}`}
          >
            {action.label}
          </button>
        </form>
      ))}
    </div>
  );
}

function StatusPanel({ tenant }: { tenant: PlatformTenantDetail }) {
  const blockingSignals = tenant.operationalReadiness.signals.filter((signal) => signal.status === "blocked").length;

  return (
    <section className="rounded border border-slate-200 bg-white p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded border px-2.5 py-1 text-xs font-medium ${statusChipClass(tenantStatusTone(tenant.status))}`}>
              {tenant.status}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
              {tenant.planName} via {tenant.planSource}
            </span>
            <span className={`rounded border px-2.5 py-1 text-xs font-medium ${statusChipClass(blockingSignals === 0 ? "good" : "danger")}`}>
              readiness {tenant.operationalReadiness.score}%
            </span>
          </div>
          <h1 className="mt-3 break-words text-3xl font-semibold tracking-normal text-slate-950">{tenant.name}</h1>
          <p className="mt-2 break-all text-sm text-slate-500">
            {tenant.slug} - host {tenant.primaryDomain ?? `${tenant.slug}.fieldgrid.nl`}
          </p>
        </div>
        <LifecycleActions tenant={tenant} />
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Readiness" value={`${tenant.operationalReadiness.score}%`} detail={`${tenant.operationalReadiness.readySignals}/${tenant.operationalReadiness.totalSignals} klaar`} />
        <Stat label="Gebruikers" value={tenant.usage.users} />
        <Stat label="Actieve modules" value={tenant.usage.enabledModules} />
        <Stat label="Support grants" value={tenant.usage.activeSupportGrants} />
      </div>
      <div className="mt-5">
        <TenantOpenLinks tenant={tenant} />
      </div>
    </section>
  );
}

function OverviewTab({
  tenant,
  provisioningRuns,
}: {
  tenant: PlatformTenantDetail;
  provisioningRuns: PlatformProvisioningRunRow[];
}) {
  const retryableRuns = provisioningRuns.filter((run) => run.canRetry);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid gap-5">
        <Section title="Status en lifecycle" helper="Lifecycle acties controleren platformrol server-side en schrijven auditregels.">
          <dl className="grid gap-3 text-sm md:grid-cols-2">
            {[
              ["Tenant ID", tenant.id],
              ["Slug", tenant.slug],
              ["Plan", `${tenant.planName} (${tenant.planKey})`],
              ["Primaire host", tenant.primaryDomain ?? `${tenant.slug}.fieldgrid.nl`],
              ["Aangemaakt", formatDate(tenant.createdAt)],
              ["Bijgewerkt", formatDate(tenant.updatedAt)],
              ["Suspended", formatDate(tenant.suspendedAt)],
              ["Archived", formatDate(tenant.archivedAt)],
            ].map(([label, value]) => (
              <div key={label} className="rounded bg-slate-50 px-3 py-2">
                <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
                <dd className="mt-1 break-all font-medium text-slate-950">{value}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="Open tenant" helper="Host-first links voor tenant root, backoffice en beide portalen.">
          <TenantOpenLinks tenant={tenant} />
        </Section>

        <Section title="Rollbackbare provisioning retry" helper="Mislukte of teruggedraaide provisioning runs kunnen opnieuw via dezelfde retry-action.">
          {retryableRuns.length > 0 ? (
            <div className="grid gap-3">
              {retryableRuns.map((run) => (
                <form key={run.id} action={retryPlatformTenantProvisioningFormAction} className="rounded border border-amber-200 bg-amber-50 p-4">
                  <input type="hidden" name="sourceRunId" value={run.id} />
                  <p className="font-medium text-amber-950">{run.name} - {run.status}</p>
                  <p className="mt-1 text-sm text-amber-900">{run.errorMessage ?? run.rollbackPath}</p>
                  <button type="submit" className="mt-3 rounded border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900">
                    Retry provisioning
                  </button>
                </form>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Geen retrybare provisioning runs voor deze tenant.</p>
          )}
        </Section>
      </div>

      <ReadinessColumn tenant={tenant} />
    </div>
  );
}

function ReadinessColumn({ tenant }: { tenant: PlatformTenantDetail }) {
  return (
    <aside className="grid gap-5">
      <Section title="Operational readiness" helper={`${tenant.operationalReadiness.readySignals}/${tenant.operationalReadiness.totalSignals} signalen klaar`}>
        <div className="h-2 overflow-hidden rounded bg-slate-100">
          <div className="h-full bg-sky-500" style={{ width: `${tenant.operationalReadiness.score}%` }} />
        </div>
        <div className="mt-4 grid gap-2 text-sm">
          {tenant.operationalReadiness.signals.map((signal) => (
            <div key={signal.id} className="rounded border border-slate-200 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-slate-950">{signal.label}</p>
                <span className={`rounded border px-2 py-1 text-xs font-medium ${statusChipClass(readinessTone(signal.status))}`}>
                  {readinessStatusLabel(signal.status)}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{signal.detail}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="First-run" helper={`${tenant.firstRun.completedSteps}/${tenant.firstRun.totalSteps} stappen klaar`}>
        <div className="h-2 overflow-hidden rounded bg-slate-100">
          <div className="h-full bg-emerald-500" style={{ width: `${tenant.firstRun.completionPercent}%` }} />
        </div>
        <div className="mt-4 grid gap-2 text-sm">
          {tenant.firstRun.steps.map((step) => (
            <div key={step.id} className="rounded border border-slate-200 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-slate-950">{step.label}</p>
                <span className={`rounded border px-2 py-1 text-xs font-medium ${statusChipClass(step.completed ? "good" : "warning")}`}>
                  {step.completed ? "Klaar" : "Open"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{step.detail}</p>
            </div>
          ))}
        </div>
      </Section>
    </aside>
  );
}

function SubscriptionTab({
  tenant,
  plans,
  subscriptions,
  customDomainCount,
}: {
  tenant: PlatformTenantDetail;
  plans: Awaited<ReturnType<typeof listPlatformPlans>>;
  subscriptions: Awaited<ReturnType<typeof listPlatformTenantSubscriptions>>;
  customDomainCount: number;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Section title="Actief abonnement" helper="Planwissels zijn transactioneel en schrijven een audit-event. Billingstatus wordt handmatig beheerd totdat automatische facturatie is gekoppeld.">
        {customDomainCount > 0 && tenant.planKey === "enterprise" && (
          <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Downgrade naar Starter/Professional schakelt {customDomainCount} custom domain(s) uit.
          </p>
        )}
        <form action={updatePlatformTenantPlanFormAction} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)_auto] lg:items-end">
          <input type="hidden" name="tenantId" value={tenant.id} />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Plan
            <select name="planKey" defaultValue={tenant.planKey} className="h-10 rounded border border-slate-300 px-3 text-sm">
              {plans.map((plan) => (
                <option key={plan.id} value={plan.key}>
                  {plan.name}{plan.customDomains ? " - custom domeinen" : plan.customRoles ? " - custom rollen" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Periode-einde
            <input name="currentPeriodEndsAt" type="datetime-local" className="h-10 rounded border border-slate-300 px-3 text-sm" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Billing referentie
            <input name="billingReference" className="h-10 rounded border border-slate-300 px-3 text-sm" />
          </label>
          <button type="submit" className="h-10 rounded bg-slate-950 px-4 text-sm font-semibold text-white">
            Plan opslaan
          </button>
          <label className="grid gap-1 text-sm font-medium text-slate-700 lg:col-span-4">
            Handmatige billingnotities
            <textarea name="manualBillingNotes" rows={2} className="rounded border border-slate-300 px-3 py-2 text-sm" />
          </label>
        </form>

        <div className="mt-5 grid gap-2 text-sm md:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan.id} className="rounded border border-slate-200 px-3 py-2">
              <p className="font-medium text-slate-950">{plan.name}</p>
              <p className="mt-1 text-xs text-slate-500">{plan.supportLevel} support - {plan.maxSeats ?? "contract"} seats</p>
              <p className="mt-1 text-xs text-slate-500">{plan.limitSummary ?? "geen expliciete limits"}</p>
            </div>
          ))}
        </div>

        <div className="platform-scroll-x mt-5 rounded border border-slate-200">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Bron</th>
                <th className="px-3 py-2">Periode</th>
                <th className="px-3 py-2">Billing</th>
                <th className="px-3 py-2">Bijgewerkt</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((subscription) => (
                <tr key={subscription.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{subscription.planName}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded border px-2 py-1 text-xs font-medium ${statusChipClass(subscriptionStatusTone(subscription.status))}`}>
                      {subscription.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{subscription.source}</td>
                  <td className="px-3 py-2 text-slate-600">{formatDate(subscription.currentPeriodStartsAt)} - {formatDate(subscription.currentPeriodEndsAt)}</td>
                  <td className="px-3 py-2 text-slate-600">{subscription.billingReference ?? subscription.manualBillingNotes ?? "-"}</td>
                  <td className="px-3 py-2 text-slate-600">{formatDate(subscription.updatedAt)}</td>
                </tr>
              ))}
              {subscriptions.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Geen abonnementen gevonden.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Planlimieten" helper={`${tenant.usageLimits.length} limiet(en) gekoppeld aan ${tenant.planName}.`}>
        <div className="grid gap-2 text-sm">
          {tenant.usageLimits.map((limit) => (
            <div key={limit.key} className="rounded border border-slate-200 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-slate-950">{limit.key}</p>
                <span className={`rounded border px-2 py-1 text-xs font-medium ${statusChipClass(limit.isEnabled ? "good" : "neutral")}`}>
                  {limit.isEnabled ? "Aan" : "Uit"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{limit.description ?? "Geen omschrijving"} - waarde {limit.limitValue ?? "onbeperkt"}</p>
            </div>
          ))}
          {tenant.usageLimits.length === 0 && <p className="text-sm text-slate-500">Geen expliciete planlimieten voor dit pakket.</p>}
        </div>
      </Section>
    </div>
  );
}

function DomainsTab({
  tenant,
  domains,
}: {
  tenant: PlatformTenantDetail;
  domains: Awaited<ReturnType<typeof listPlatformTenantDomains>>;
}) {
  const customDomainsEnabled = tenantHasCustomDomains(tenant);
  const ipv4Target = fieldgridPublicIpv4();
  const ipv6Target = fieldgridPublicIpv6();

  return (
    <Section title="Domeinen" helper="Platformbeheer koppelt tenantdomeinen, verifieert DNS en activeert routing per tenant. Custom domains zijn Enterprise-only.">
      <form action={addPlatformTenantDomainFormAction} className="mb-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_110px_auto] md:items-end">
        <input type="hidden" name="tenantId" value={tenant.id} />
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Domein
          <input name="domain" required placeholder={`${tenant.slug}.fieldgrid.nl`} className="h-10 rounded border border-slate-300 px-3 text-sm" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Type
          <select name="type" defaultValue="fieldgrid_subdomain" className="h-10 rounded border border-slate-300 px-3 text-sm">
            <option value="fieldgrid_subdomain">Fieldgrid subdomain</option>
            <option value="custom_domain" disabled={!customDomainsEnabled}>Custom domain</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" name="isPrimary" /> Primair
        </label>
        <button type="submit" className="h-10 rounded bg-slate-950 px-4 text-sm font-semibold text-white">Toevoegen</button>
      </form>
      {!customDomainsEnabled && (
        <p className="mb-5 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Custom domains zijn geblokkeerd tot deze tenant op Enterprise staat.
        </p>
      )}

      <div className="grid gap-3">
        {domains.map((domain) => {
          const isCustomDomain = domain.type === "custom_domain";
          const isPlatformDomain = domain.type === "platform_reserved";
          const routeReady = canRouteDomain(domain);
          const actions: Array<{ action: string; label: string; danger?: boolean; disabled?: boolean }> = isPlatformDomain
            ? []
            : [
                { action: isCustomDomain ? "check_dns" : "verify", label: isCustomDomain ? "Check DNS" : "Verifieer" },
                ...(isCustomDomain ? [{ action: "check_tls", label: "Check TLS", disabled: !routeReady }] : []),
                { action: "activate", label: "Activeer", disabled: !routeReady || domain.verificationStatus === "active" },
                { action: "primary", label: "Primair", disabled: !routeReady || domain.isPrimary },
                { action: "disable", label: "Uitschakelen", danger: true, disabled: domain.verificationStatus === "disabled" || domain.verificationStatus === "disabled_plan" },
                { action: "remove", label: "Verwijder", danger: true },
              ];

          return (
            <div key={domain.id} className="rounded border border-slate-200 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="platform-long-text font-medium text-slate-950">{domain.domain}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">{domainTypeLabel(domain.type)}</span>
                    <span className={`rounded border px-2 py-1 text-xs font-medium ${statusChipClass(domainStatusTone(domain.verificationStatus))}`}>
                      {domain.verificationStatus}
                    </span>
                    <span className={`rounded border px-2 py-1 text-xs font-medium ${statusChipClass(tlsStatusTone(domain.tlsStatus))}`}>
                      TLS {domain.tlsStatus}
                    </span>
                    {domain.isPrimary && <span className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">primair</span>}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    DNS check: {formatDate(domain.dnsLastCheckedAt)} - TLS check: {formatDate(domain.tlsLastCheckedAt)} - actief: {formatDate(domain.activatedAt)}
                  </p>
                  {(domain.dnsLastError || domain.tlsLastError || domain.disabledReason) && (
                    <p className="platform-long-text mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                      {domain.dnsLastError || domain.tlsLastError || domain.disabledReason}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {actions.map(({ action, label, danger, disabled }) => (
                    <form key={action} action={updatePlatformTenantDomainFormAction}>
                      <input type="hidden" name="tenantId" value={tenant.id} />
                      <input type="hidden" name="domainId" value={domain.id} />
                      <input type="hidden" name="domainAction" value={action} />
                      <button
                        type="submit"
                        disabled={disabled}
                        className={`rounded border px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                          danger ? "border-rose-300 text-rose-800" : "border-slate-300 text-slate-700"
                        }`}
                      >
                        {label}
                      </button>
                    </form>
                  ))}
                </div>
              </div>

              {isCustomDomain && (
                <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-950">DNS instructies</p>
                    <span className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600">
                      {customDomainsEnabled ? "Enterprise actief" : "Enterprise vereist"}
                    </span>
                  </div>
                  <div className="grid gap-2 text-xs sm:grid-cols-[90px_minmax(0,1fr)_minmax(0,1.4fr)]">
                    <p className="font-semibold text-slate-500">Type</p>
                    <p className="font-semibold text-slate-500">Naam</p>
                    <p className="font-semibold text-slate-500">Waarde</p>
                    <p className="font-medium text-slate-700">TXT</p>
                    <p className="platform-long-text text-slate-600">{domain.dnsTxtName || `_fieldgrid-verification.${domain.domain}`}</p>
                    <p className="platform-long-text text-slate-950">{domain.verificationToken ? customDomainVerificationValue(domain.verificationToken) : "-"}</p>
                    <p className="font-medium text-slate-700">A</p>
                    <p className="platform-long-text text-slate-600">{domain.domain}</p>
                    <p className="platform-long-text text-slate-950">{ipv4Target}</p>
                    {ipv6Target && (
                      <>
                        <p className="font-medium text-slate-700">AAAA</p>
                        <p className="platform-long-text text-slate-600">{domain.domain}</p>
                        <p className="platform-long-text text-slate-950">{ipv6Target}</p>
                      </>
                    )}
                    <p className="font-medium text-slate-700">CNAME</p>
                    <p className="platform-long-text text-slate-600">www of subdomein</p>
                    <p className="platform-long-text text-slate-950">{fieldgridCnameTarget(tenant, domain)}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {domains.length === 0 && <p className="text-sm text-slate-500">Nog geen domeinen gekoppeld.</p>}
      </div>
    </Section>
  );
}

function ModulesTab({
  tenant,
  modules,
}: {
  tenant: PlatformTenantDetail;
  modules: Awaited<ReturnType<typeof listPlatformTenantModules>>;
}) {
  return (
    <Section title="Modules" helper="Manual overrides winnen van plan/default. Dependency inspectie voorkomt onveilige modulewissels.">
      <div className="grid gap-3 lg:grid-cols-2">
        {modules.map((module) => {
          const moduleToggleBlocked = module.effectiveEnabled
            ? module.enabledDependentKeys.length > 0
            : module.missingDependencyKeys.length > 0;

          return (
            <div key={module.id} className="rounded border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950">{module.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">{module.key} - {module.category}</p>
                </div>
                <span className={`rounded border px-2 py-1 text-xs font-medium ${statusChipClass(module.effectiveEnabled ? "good" : "neutral")}`}>
                  {module.effectiveEnabled ? "Aan" : "Uit"}
                </span>
              </div>
              {module.description && <p className="mt-2 text-sm text-slate-600">{module.description}</p>}
              <p className="mt-2 text-xs text-slate-500">
                Plan: {module.planIncluded === null ? "default" : module.planIncluded ? "aan" : "uit"} - Override: {module.tenantOverride === null ? "geen" : module.tenantOverride ? "aan" : "uit"}
              </p>
              {module.dependencyKeys.length > 0 && <p className="mt-1 text-xs text-slate-500">Vereist: {module.dependencyKeys.join(", ")}</p>}
              {module.missingDependencyKeys.length > 0 && (
                <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                  Aanzetten geblokkeerd door: {module.missingDependencyKeys.join(", ")}
                </p>
              )}
              {module.enabledDependentKeys.length > 0 && (
                <p className="mt-2 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-800">
                  Uitzetten geblokkeerd door actieve modules: {module.enabledDependentKeys.join(", ")}
                </p>
              )}
              <form action={updatePlatformTenantModuleFormAction} className="mt-3">
                <input type="hidden" name="tenantId" value={tenant.id} />
                <input type="hidden" name="moduleId" value={module.id} />
                <input type="hidden" name="enabled" value={module.effectiveEnabled ? "false" : "true"} />
                <button
                  type="submit"
                  disabled={moduleToggleBlocked}
                  className="rounded border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {module.effectiveEnabled ? "Uitzetten" : "Aanzetten"}
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function SectorsAndRegionsTab({
  tenant,
  sectorsModel,
  regions,
}: {
  tenant: PlatformTenantDetail;
  sectorsModel: Awaited<ReturnType<typeof listPlatformTenantSectors>>;
  regions: PlatformTenantRegionRow[];
}) {
  const enabledSectors = sectorsModel.sectors.filter((sector) => sector.tenantEnabled);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Section title="Sectorbeleid" helper="Beheer tenantsectoren, defaultsector en single/multi policy.">
        <form action={updatePlatformTenantSectorPolicyFormAction} className="mb-5 grid gap-3 md:grid-cols-[150px_120px_1fr_170px_auto] md:items-end">
          <input type="hidden" name="tenantId" value={tenant.id} />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Modus
            <select name="mode" defaultValue={sectorsModel.policy.mode} className="h-10 rounded border border-slate-300 px-3 text-sm">
              <option value="multi">Multi</option>
              <option value="single">Single</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Max
            <input name="maxSectors" type="number" min="1" defaultValue={sectorsModel.policy.maxSectors ?? ""} className="h-10 rounded border border-slate-300 px-3 text-sm" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Default
            <select name="defaultSectorId" defaultValue={sectorsModel.policy.defaultSectorId ?? ""} className="h-10 rounded border border-slate-300 px-3 text-sm">
              <option value="">Geen default</option>
              {enabledSectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input type="checkbox" name="enforceSectorScope" defaultChecked={sectorsModel.policy.enforceSectorScope} /> Afdwingen
          </label>
          <button type="submit" className="h-10 rounded bg-slate-950 px-4 text-sm font-semibold text-white">Opslaan</button>
        </form>

        <div className="grid gap-3 md:grid-cols-2">
          {sectorsModel.sectors.map((sector) => (
            <div key={sector.id} className="flex items-center justify-between gap-3 rounded border border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-950">{sector.name}{sector.isDefault ? " - default" : ""}</p>
                <p className="text-xs text-slate-500">{sector.globallyActive ? "Globaal actief" : "Globaal inactief"}</p>
              </div>
              <form action={updatePlatformTenantSectorFormAction}>
                <input type="hidden" name="tenantId" value={tenant.id} />
                <input type="hidden" name="sectorId" value={sector.id} />
                <input type="hidden" name="enabled" value={sector.tenantEnabled ? "false" : "true"} />
                <button type="submit" className="rounded border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700">
                  {sector.tenantEnabled ? "Uitzetten" : "Aanzetten"}
                </button>
              </form>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Regio's" helper="Actieve regio's bepalen planning- en scopefilters. Mutaties volgen in de onboarding/operations fases.">
        <div className="grid gap-2 text-sm">
          {regions.map((region) => (
            <div key={region.id} className="rounded border border-slate-200 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-slate-950">{region.name}</p>
                <span className={`rounded border px-2 py-1 text-xs font-medium ${statusChipClass(region.isActive ? "good" : "neutral")}`}>
                  {region.isActive ? "Actief" : "Uit"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{region.source} - sort {region.sortOrder}</p>
            </div>
          ))}
          {regions.length === 0 && <p className="text-sm text-slate-500">Nog geen regio's ingesteld.</p>}
        </div>
      </Section>
    </div>
  );
}

function UsersTab({
  tenant,
  tenantUsersAndOwner,
}: {
  tenant: PlatformTenantDetail;
  tenantUsersAndOwner: Awaited<ReturnType<typeof listPlatformTenantUsersAndOwner>>;
}) {
  const defaultAdminRoleIds = preferredTenantAdminRoleIds(tenantUsersAndOwner.roles);
  const hasTenantRoles = tenantUsersAndOwner.roles.length > 0;

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Section title="Tenant admins" helper="Voeg tenantbeheerders toe, wijzig rollen/status of verwijder tenanttoegang. Wachtwoorden en resetcodes worden door Fieldgrid gemaild.">
        <div className="grid gap-3">
          <form action={addPlatformTenantAdminFormAction} className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
            <input type="hidden" name="tenantId" value={tenant.id} />
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <label className="grid gap-1">
                <span className="text-xs font-medium uppercase text-slate-500">Nieuwe tenant admin</span>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="admin@example.nl"
                  className="h-10 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-500"
                />
              </label>
              <button
                type="submit"
                disabled={!hasTenantRoles}
                className="h-10 rounded bg-slate-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Toevoegen
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {tenantUsersAndOwner.roles.map((role) => (
                <label key={role.id} className="flex items-start gap-2 rounded border border-slate-200 bg-white px-3 py-2">
                  <input
                    type="checkbox"
                    name="tenantRoleIds"
                    value={role.id}
                    defaultChecked={defaultAdminRoleIds.includes(role.id)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-medium text-slate-800">{role.name}</span>
                    {role.description && <span className="block text-xs leading-5 text-slate-500">{role.description}</span>}
                  </span>
                </label>
              ))}
            </div>
            {!hasTenantRoles && <p className="mt-2 text-xs text-amber-700">Deze tenant heeft nog geen rollen; rond provisioning/rolseed eerst af.</p>}
          </form>

          {tenantUsersAndOwner.users.map((user) => (
            <div key={user.id} className="rounded border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="max-w-full truncate font-medium text-slate-950">{user.email ?? user.userId}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{user.userId}</p>
                </div>
                <span className={`rounded border px-2 py-1 text-xs font-medium ${statusChipClass(user.status === "active" ? "good" : "neutral")}`}>
                  {user.status}
                </span>
              </div>
              <p className="mt-2 text-slate-500">
                Basisrol {user.role} - Auth {user.authStatus} - bijgewerkt {formatDate(user.updatedAt)}
              </p>
              {user.tenantRoles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {user.tenantRoles.map((role) => (
                    <span key={role.id} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">{role.name}</span>
                  ))}
                </div>
              )}
              <form action={updatePlatformTenantAdminFormAction} className="mt-3 grid gap-3 rounded bg-slate-50 p-3">
                <input type="hidden" name="tenantId" value={tenant.id} />
                <input type="hidden" name="userId" value={user.userId} />
                <label className="grid gap-1">
                  <span className="text-xs font-medium uppercase text-slate-500">Status</span>
                  <select
                    name="status"
                    defaultValue={user.status}
                    className="h-10 rounded border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-500"
                  >
                    <option value="active">Actief</option>
                    <option value="inactive">Inactief</option>
                    <option value="suspended">Geschorst</option>
                  </select>
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {tenantUsersAndOwner.roles.map((role) => (
                    <label key={role.id} className="flex items-start gap-2 rounded border border-slate-200 bg-white px-3 py-2">
                      <input
                        type="checkbox"
                        name="tenantRoleIds"
                        value={role.id}
                        defaultChecked={user.tenantRoles.some((assignedRole) => assignedRole.id === role.id)}
                        className="mt-1"
                      />
                      <span>
                        <span className="block font-medium text-slate-800">{role.name}</span>
                        {role.description && <span className="block text-xs leading-5 text-slate-500">{role.description}</span>}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="submit" className="rounded bg-slate-950 px-3 py-2 text-xs font-semibold text-white">Opslaan</button>
                </div>
              </form>
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                <form action={sendPlatformTenantAdminPasswordResetFormAction}>
                  <input type="hidden" name="tenantId" value={tenant.id} />
                  <input type="hidden" name="userId" value={user.userId} />
                  <button type="submit" className="rounded border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800 hover:bg-cyan-100">
                    Resetcode mailen
                  </button>
                </form>
                <form action={deletePlatformTenantAdminFormAction}>
                  <input type="hidden" name="tenantId" value={tenant.id} />
                  <input type="hidden" name="userId" value={user.userId} />
                  <button type="submit" className="rounded border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">
                    Tenanttoegang verwijderen
                  </button>
                </form>
              </div>
            </div>
          ))}
          {tenantUsersAndOwner.users.length === 0 && <p className="text-sm text-slate-500">Geen tenantgebruikers gevonden.</p>}
        </div>
      </Section>

      <Section title="Owner invites" helper="Corrigeer een verkeerd owner e-mailadres en verstuur opnieuw een eenmalige Fieldgrid-activatiecode. De owner krijgt direct tenant owner-toegang.">
        <div className="grid gap-3">
          {tenantUsersAndOwner.ownerInvites.map((invite) => (
            <div key={invite.id} className="rounded border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="max-w-full truncate font-medium text-slate-950">{invite.email}</p>
                <span className={`rounded border px-2 py-1 text-xs font-medium ${statusChipClass(invite.status === "accepted" ? "good" : invite.status === "failed" ? "danger" : "warning")}`}>
                  {invite.status}
                </span>
              </div>
              <p className="mt-1 text-slate-500">Verstuurd {formatDate(invite.inviteSentAt)} - bijgewerkt {formatDate(invite.updatedAt)}</p>
              {invite.userId && <p className="mt-1 truncate text-xs text-slate-500">Auth user {invite.userId}</p>}
              {invite.errorMessage && <p className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{invite.errorMessage}</p>}
              <form action={updatePlatformTenantOwnerInviteFormAction} className="mt-3 grid gap-2 rounded bg-slate-50 p-3">
                <input type="hidden" name="tenantId" value={tenant.id} />
                <input type="hidden" name="inviteId" value={invite.id} />
                <label className="grid gap-1">
                  <span className="text-xs font-medium uppercase text-slate-500">Owner e-mail</span>
                  <input
                    type="email"
                    name="email"
                    required
                    defaultValue={invite.email}
                    className="h-10 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-500"
                  />
                </label>
                <button
                  type="submit"
                  disabled={!hasTenantRoles}
                  className="w-fit rounded bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Wijzigen en opnieuw versturen
                </button>
              </form>
            </div>
          ))}
          {tenantUsersAndOwner.ownerInvites.length === 0 && (
            <form action={updatePlatformTenantOwnerInviteFormAction} className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
              <input type="hidden" name="tenantId" value={tenant.id} />
              <label className="grid gap-1">
                <span className="text-xs font-medium uppercase text-slate-500">Owner e-mail</span>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="owner@example.nl"
                  className="h-10 rounded border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-500"
                />
              </label>
              <button
                type="submit"
                disabled={!hasTenantRoles}
                className="mt-3 rounded bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Owner invite aanmaken
              </button>
            </form>
          )}
        </div>
      </Section>
    </div>
  );
}

function BrandingTab({ tenant }: { tenant: PlatformTenantDetail }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Section title="Branding preview" helper="Preview van tenantnaam, kleuren en e-mail/PDF uitstraling.">
        <div className="overflow-hidden rounded border border-slate-200">
          <div className="p-5 text-white" style={{ backgroundColor: tenant.brandingPreview.primaryColor }}>
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded bg-white text-sm font-semibold" style={{ color: tenant.brandingPreview.primaryColor }}>
                {tenant.brandingPreview.logoUrl ? "Logo" : initials(tenant.brandingPreview.displayName)}
              </div>
              <div>
                <p className="text-sm opacity-80">{tenant.brandingPreview.platformName}</p>
                <p className="text-xl font-semibold">{tenant.brandingPreview.displayName}</p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 bg-white p-5 text-sm">
            <div className="flex gap-2">
              <span className="size-7 rounded border border-slate-200" style={{ backgroundColor: tenant.brandingPreview.primaryColor }} />
              <span className="size-7 rounded border border-slate-200" style={{ backgroundColor: tenant.brandingPreview.accentColor }} />
              <span className="text-slate-500">{tenant.brandingPreview.customBrandingEnabled ? "Custom branding toegestaan" : "Fieldgrid branding"}</span>
            </div>
            <div className="rounded bg-slate-50 p-4">
              <p className="font-medium text-slate-950">Voorbeeldbericht</p>
              <p className="mt-1 text-slate-600">Uw rapportage staat klaar voor beoordeling.</p>
              <div className="mt-3 h-1.5 rounded" style={{ backgroundColor: tenant.brandingPreview.accentColor }} />
              <p className="mt-3 whitespace-pre-line text-xs text-slate-500">{tenant.brandingPreview.emailSignature}</p>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Surfaces" helper="Waar deze branding zichtbaar wordt.">
        <div className="grid gap-2">
          {tenant.brandingPreview.surfaces.map((surface) => (
            <div key={surface.surface} className="rounded border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium uppercase text-slate-500">{surface.surface}</p>
                <span className="size-3 rounded-full" style={{ backgroundColor: surface.accentColor }} />
              </div>
              <p className="mt-2 font-medium text-slate-950">{surface.headline}</p>
              <p className="mt-1 text-xs text-slate-500">{surface.body}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function UsageTab({ tenant }: { tenant: PlatformTenantDetail }) {
  const usageRows = [
    ["Gebruikers", tenant.usage.users],
    ["Klanten", tenant.usage.customers],
    ["Objecten", tenant.usage.objects],
    ["Personeel", tenant.usage.personnel],
    ["Opdrachten", tenant.usage.assignments],
    ["Documenten", tenant.usage.documents],
    ["Storage", formatBytes(tenant.usage.storageBytes)],
    ["Downloads/PDF", tenant.usage.downloadAuditEvents],
    ["Domeinen", tenant.usage.domains],
    ["Actieve modules", tenant.usage.enabledModules],
    ["Actieve sectoren", tenant.usage.enabledSectors],
    ["Regio's", tenant.usage.activeRegions],
    ["Supportgrants", tenant.usage.activeSupportGrants],
    ["Tenant-prefixed documenten", `${tenant.usage.tenantPrefixedDocuments}/${tenant.usage.documents}`],
    ["Legacy storagepaden", tenant.usage.legacyDocumentPaths],
    ["Audit events", tenant.usage.auditEvents + tenant.usage.supportAuditEvents],
  ] as const;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Section title="Usage" helper="Usage voor beheer, supporttriage en toekomstige limieten.">
        <dl className="grid gap-2 text-sm md:grid-cols-2">
          {usageRows.map(([key, value]) => (
            <div key={key} className="flex justify-between gap-4 rounded bg-slate-50 px-3 py-2">
              <dt className="text-slate-500">{key}</dt>
              <dd className="font-medium text-slate-950">{value}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <ReadinessColumn tenant={tenant} />
    </div>
  );
}

function SupportTab({
  tenant,
  platformUsers,
  tenantSupportGrants,
}: {
  tenant: PlatformTenantDetail;
  platformUsers: Awaited<ReturnType<typeof listPlatformUsers>>;
  tenantSupportGrants: SupportAccessGrantRow[];
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Section title="Nieuwe support grant" helper="Break-glass toegang vereist reden en expiry.">
        <form action={createSupportAccessGrantFormAction} className="grid gap-3">
          <input type="hidden" name="tenantId" value={tenant.id} />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Platformgebruiker
            <select name="platformUserId" required className="h-10 rounded border border-slate-300 px-3 text-sm">
              <option value="">Kies gebruiker</option>
              {platformUsers.map((user) => (
                <option key={user.id} value={user.id}>{user.role} - {user.userId}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Reden
            <input name="reason" required className="h-10 rounded border border-slate-300 px-3 text-sm" placeholder="Ondersteuning bij inrichting" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Scope
            <select name="scope" required defaultValue="tenant" className="h-10 rounded border border-slate-300 px-3 text-sm">
              <option value="tenant">Tenant support</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Start
            <input name="startsAt" type="datetime-local" className="h-10 rounded border border-slate-300 px-3 text-sm" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Verloopt
            <input name="expiresAt" type="datetime-local" required className="h-10 rounded border border-slate-300 px-3 text-sm" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700 xl:col-span-2">
            Toegestane handelingen
            <select name="permissions" required multiple size={7} className="rounded border border-slate-300 px-3 py-2 text-sm">
              {FIELDGRID_SUPPORT_RUNTIME_PERMISSION_KEYS.map((permission) => (
                <option key={permission} value={permission}>{permission}</option>
              ))}
            </select>
            <span className="text-xs font-normal text-slate-500">Selecteer alleen de noodzakelijke capabilities.</span>
          </label>
          <button type="submit" className="h-10 rounded bg-slate-950 px-4 text-sm font-semibold text-white">Grant maken</button>
        </form>
      </Section>

      <Section title="Support grants" helper="Actieve grants kunnen supportmodus openen of worden ingetrokken.">
        <div className="grid gap-3">
          {tenantSupportGrants.map((grant) => {
            const status = supportGrantStatus(grant);
            return (
              <div key={grant.id} className="rounded border border-slate-200 p-4 text-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-950">{status} - verloopt {formatDate(grant.expiresAt)}</p>
                    <p className="mt-1 text-slate-600">{grant.reason}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {status === "Actief" && (
                      <form action={enterSupportModeFormAction}>
                        <input type="hidden" name="tenantId" value={tenant.id} />
                        <button type="submit" className="rounded border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700">Open</button>
                      </form>
                    )}
                    {!grant.revokedAt && (
                      <form action={revokeSupportAccessGrantFormAction}>
                        <input type="hidden" name="grantId" value={grant.id} />
                        <button type="submit" className="rounded border border-red-300 px-3 py-2 text-xs font-medium text-red-800">Revoke</button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {tenantSupportGrants.length === 0 && <p className="text-sm text-slate-500">Nog geen supportgrants voor deze tenant.</p>}
        </div>
      </Section>
    </div>
  );
}

function PlaceholderTab({
  title,
  helper,
  href,
}: {
  title: string;
  helper: string;
  href: string;
}) {
  return (
    <Section title={title} helper={helper}>
      <Link href={href} className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
        Open platformpagina
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </Section>
  );
}

function AuditTab({ events }: { events: PlatformSecurityEventRow[] }) {
  return (
    <Section title="Audit" helper="Gecombineerde support_access_audit_log en audit_log events voor deze tenant.">
      <div className="grid gap-3">
        {events.slice(0, 60).map((event) => (
          <div key={`${event.source}:${event.id}`} className="rounded border border-slate-200 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">{event.source}</span>
              <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">{event.scope}</span>
              <p className="font-medium text-slate-950">{event.action}</p>
            </div>
            <p className="mt-2 text-xs text-slate-500">{formatDate(event.createdAt)} - {event.resource ?? "-"} - {event.resourceId ?? "-"}</p>
          </div>
        ))}
        {events.length === 0 && <p className="text-sm text-slate-500">Nog geen auditregels.</p>}
      </div>
    </Section>
  );
}

function ProvisioningTab({ runs }: { runs: PlatformProvisioningRunRow[] }) {
  return (
    <Section title="Provisioning" helper="Runstatus, retry en rollbackpad blijven zichtbaar per tenant.">
      <div className="grid gap-3">
        {runs.map((run) => (
          <div key={run.id} className="rounded border border-slate-200 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="font-medium text-slate-950">{run.name} - {run.status}</p>
                <p className="mt-1 text-sm text-slate-500">{run.slug} - {run.currentStep} - {formatDate(run.startedAt)}</p>
                <p className="mt-2 text-sm text-slate-600">{run.errorMessage ?? run.rollbackPath}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Owner {run.ownerEmail ?? "-"} - {run.ownerInviteStatus} - {run.moduleKeys.length} module(s), {run.sectorIds.length} sector(en), {run.regionNames.length} regio(s)
                </p>
              </div>
              {run.canRetry && (
                <form action={retryPlatformTenantProvisioningFormAction}>
                  <input type="hidden" name="sourceRunId" value={run.id} />
                  <button type="submit" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                    Retry
                  </button>
                </form>
              )}
            </div>
          </div>
        ))}
        {runs.length === 0 && <p className="text-sm text-slate-500">Geen provisioning runs voor deze tenant.</p>}
      </div>
    </Section>
  );
}

export default async function PlatformTenantDetailPage({ params, searchParams }: Props) {
  const { tenantId } = await params;
  const { tab } = await searchParams;
  const activeTab = normalizeTab(tab);

  const [
    tenant,
    domains,
    modules,
    sectorsModel,
    regions,
    plans,
    subscriptions,
    tenantUsersAndOwner,
    platformUsers,
    supportGrants,
    securityDashboard,
    provisioningRuns,
  ] = await Promise.all([
    getPlatformTenantDetail(tenantId),
    listPlatformTenantDomains(tenantId),
    listPlatformTenantModules(tenantId),
    listPlatformTenantSectors(tenantId),
    listPlatformTenantRegions(tenantId),
    listPlatformPlans(),
    listPlatformTenantSubscriptions(tenantId),
    listPlatformTenantUsersAndOwner(tenantId),
    listPlatformUsers(),
    listSupportAccessGrants(),
    listPlatformSecurityDashboard({ tenantId, limit: 120 }),
    listTenantProvisioningRuns(50),
  ]);

  if (!tenant) notFound();

  const tenantSupportGrants = supportGrants.filter((grant) => grant.tenantId === tenantId);
  const tenantProvisioningRuns = provisioningRuns.filter((run) => run.tenantId === tenantId);

  return (
    <main className="platform-page min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-5">
          <Link href="/platform/tenants" className="w-fit text-sm text-slate-500 underline-offset-2 hover:underline">
            Platformbeheer / Tenants
          </Link>
          <StatusPanel tenant={tenant} />
        </header>

        <TenantTabs tenantId={tenant.id} activeTab={activeTab} />

        {activeTab === "overview" && <OverviewTab tenant={tenant} provisioningRuns={tenantProvisioningRuns} />}
        {activeTab === "subscription" && (
          <SubscriptionTab
            tenant={tenant}
            plans={plans}
            subscriptions={subscriptions}
            customDomainCount={domains.filter((domain) => domain.type === "custom_domain").length}
          />
        )}
        {activeTab === "domains" && <DomainsTab tenant={tenant} domains={domains} />}
        {activeTab === "modules" && <ModulesTab tenant={tenant} modules={modules} />}
        {activeTab === "sectors" && <SectorsAndRegionsTab tenant={tenant} sectorsModel={sectorsModel} regions={regions} />}
        {activeTab === "users" && <UsersTab tenant={tenant} tenantUsersAndOwner={tenantUsersAndOwner} />}
        {activeTab === "branding" && <BrandingTab tenant={tenant} />}
        {activeTab === "usage" && <UsageTab tenant={tenant} />}
        {activeTab === "support" && <SupportTab tenant={tenant} platformUsers={platformUsers} tenantSupportGrants={tenantSupportGrants} />}
        {activeTab === "tickets" && (
          <PlaceholderTab
            title="Tickets"
            helper="Tenantgekoppelde platformtickets volgen in fase 8. Deze tab houdt de detailomgeving alvast compleet."
            href="/platform/tickets"
          />
        )}
        {activeTab === "notifications" && (
          <PlaceholderTab
            title="Meldingen"
            helper="Tenantcommunicatie en platformmeldingen volgen in fase 9. Selectie en audit blijven platform-scoped."
            href="/platform/notifications"
          />
        )}
        {activeTab === "audit" && <AuditTab events={securityDashboard.events} />}
        {activeTab === "provisioning" && <ProvisioningTab runs={tenantProvisioningRuns} />}
      </div>
    </main>
  );
}
