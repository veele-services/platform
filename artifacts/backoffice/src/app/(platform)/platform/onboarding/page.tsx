import { CheckboxAdapter } from "@/components/ui/checkbox-adapter";
import { SelectAdapter } from "@/components/ui/select-adapter";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Play,
  RotateCcw,
  Save,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import {
  createPlatformTenant,
  getPlatformOnboardingWorkspace,
  retryPlatformTenantProvisioning,
  rollbackPlatformTenantProvisioning,
  savePlatformOnboardingDraft,
  type PlatformOnboardingCatalog,
  type PlatformOnboardingPreflight,
  type PlatformOnboardingPreflightStatus,
  type PlatformProvisioningRunRow,
  type PlatformProvisioningStepRow,
} from "@/app/actions/platform-provisioning";
import { ResolvedFeatureHelp } from "@/components/knowledgebase/ResolvedFeatureHelp";

export const metadata = {
  title: "Platform onboarding",
};

type Props = {
  searchParams: Promise<{ onboardingDraft?: string }>;
};

const FALLBACK_PLANS: PlatformOnboardingCatalog["plans"] = [
  { key: "starter", name: "Starter", description: null },
  { key: "professional", name: "Professional", description: null },
  { key: "enterprise", name: "Enterprise", description: null },
];

const DEFAULT_PRIMARY_COLOR = "#081D3A";
const DEFAULT_ACCENT_COLOR = "#00B7B3";
const DEFAULT_EMAIL_SIGNATURE = "Met vriendelijke groet,\nFieldgrid";

const WIZARD_STEPS = [
  { id: "tenantgegevens", label: "Tenantgegevens" },
  { id: "plan", label: "Plan" },
  { id: "fieldgrid_subdomain", label: "Fieldgrid subdomain" },
  { id: "modules", label: "Modules" },
  { id: "sectoren", label: "Sectoren" },
  { id: "regios", label: "Regio's" },
  { id: "branding", label: "Branding" },
  { id: "owner_invite", label: "Owner invite" },
  { id: "review", label: "Review" },
  { id: "provisioning_run", label: "Provisioning run" },
] as const;

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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

function statusClass(
  status:
    | PlatformOnboardingPreflightStatus
    | PlatformProvisioningStepRow["status"],
): string {
  if (status === "ready" || status === "completed")
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "warning" || status === "active")
    return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "blocked" || status === "failed" || status === "rolled_back")
    return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function StatusIcon({
  status,
}: {
  status:
    | PlatformOnboardingPreflightStatus
    | PlatformProvisioningStepRow["status"];
}) {
  if (status === "ready" || status === "completed")
    return <CheckCircle2 aria-hidden="true" className="size-4" />;
  if (status === "blocked" || status === "failed" || status === "rolled_back")
    return <AlertTriangle aria-hidden="true" className="size-4" />;
  return <CircleDashed aria-hidden="true" className="size-4" />;
}

function Badge({
  children,
  status,
}: {
  children: ReactNode;
  status:
    | PlatformOnboardingPreflightStatus
    | PlatformProvisioningStepRow["status"];
}) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded border px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}
    >
      <StatusIcon status={status} />
      {children}
    </span>
  );
}

function FieldGroup({
  title,
  helper,
  children,
}: {
  title: string;
  helper: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="grid gap-4 border-t border-slate-200 pt-5 first:border-t-0 first:pt-0">
      <div>
        <legend className="text-base font-semibold text-slate-950">
          {title}
        </legend>
        <p className="mt-1 text-sm text-slate-500">{helper}</p>
      </div>
      {children}
    </fieldset>
  );
}

function TextInput({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="min-h-11 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}

function StepRail() {
  return (
    <nav aria-label="Onboarding stappen" className="platform-scroll-x pb-1">
      <ol className="platform-tab-strip flex min-w-max gap-2">
        {WIZARD_STEPS.map((step, index) => (
          <li key={step.id} className="flex items-center gap-2">
            <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white">
              {index + 1}
            </span>
            <span className="max-w-36 text-sm font-medium text-slate-700">
              {step.label}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function PreflightPanel({
  preflight,
}: {
  preflight: PlatformOnboardingPreflight | null;
}) {
  return (
    <section className="grid gap-3 rounded border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Preflight</h2>
          <p className="mt-1 text-sm text-slate-500">
            Duplicate slug/domain, owner invite, Fieldgrid subdomain en tenant
            first-run readiness worden server-side beoordeeld.
          </p>
        </div>
        <Badge status={preflight?.status ?? "warning"}>
          {preflight?.status ?? "concept"}
        </Badge>
      </div>
      {preflight ? (
        <div className="grid gap-2 md:grid-cols-2">
          {preflight.checks.map((check) => (
            <div
              key={check.id}
              className={`rounded border p-3 ${statusClass(check.status)}`}
            >
              <div className="flex items-center gap-2">
                <StatusIcon status={check.status} />
                <p className="text-sm font-semibold">{check.label}</p>
              </div>
              <p className="mt-2 text-sm opacity-90">{check.detail}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Sla een concept op om preflightstatus direct zichtbaar en hervatbaar
          te maken.
        </p>
      )}
    </section>
  );
}

function OnboardingWizard({
  workspace,
}: {
  workspace: Awaited<ReturnType<typeof getPlatformOnboardingWorkspace>>;
}) {
  const { catalog, draft, preflight } = workspace;
  const plans = catalog.plans.length > 0 ? catalog.plans : FALLBACK_PLANS;
  const selectedPlan = draft?.planKey ?? "starter";
  const selectedSectorMode = draft?.sectorMode ?? "multi";
  const selectedDefaultSectorId =
    draft?.defaultSectorId ?? catalog.sectors[0]?.id ?? "";
  const fieldgridSubdomain = preflight?.fieldgridSubdomain ?? draft?.slug ?? "";

  return (
    <section className="grid gap-5 rounded border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-normal text-slate-950">
            Onboarding 2.0 wizard
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Nieuwe tenants worden zonder SQL aangemaakt met save/resume, review,
            provisioning run, veilige retry en rollback.
          </p>
        </div>
        {draft ? (
          <Badge status={preflight?.status ?? "warning"}>
            Concept {draft.currentStep}
          </Badge>
        ) : (
          <Badge status="warning">Nieuw concept</Badge>
        )}
      </div>

      <StepRail />

      <form action={createPlatformTenant} className="grid gap-6">
        {draft && <input type="hidden" name="draftRunId" value={draft.id} />}

        <FieldGroup
          title="Tenantgegevens"
          helper="Naam en slug bepalen tenantidentiteit en hostcontext."
        >
          <div className="grid gap-3 md:grid-cols-[1fr_0.7fr]">
            <TextInput
              label="Tenantnaam"
              name="name"
              required
              placeholder="Demo X"
              defaultValue={fieldValue(draft?.name)}
            />
            <TextInput
              label="Slug"
              name="slug"
              placeholder="demo-x"
              defaultValue={fieldValue(draft?.slug)}
            />
          </div>
        </FieldGroup>

        <FieldGroup
          title="Plan en Fieldgrid subdomain"
          helper="Voor demo-x is demo-x.fieldgrid.nl direct bereikbaar na provisioning."
        >
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Plan
              <SelectAdapter
                name="planKey"
                defaultValue={selectedPlan}
                className="min-h-11 rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {plans.map((plan) => (
                  <option key={plan.key} value={plan.key}>
                    {plan.name}
                  </option>
                ))}
              </SelectAdapter>
            </label>
            <TextInput
              label="Fieldgrid subdomain"
              name="fieldgridSubdomain"
              placeholder="demo-x"
              defaultValue={fieldValue(fieldgridSubdomain)}
            />
            <TextInput
              label="Primair domein override"
              name="domain"
              placeholder="demo-x.fieldgrid.nl"
              defaultValue={fieldValue(draft?.primaryDomain)}
            />
          </div>
        </FieldGroup>

        <FieldGroup
          title="Modules"
          helper="Kies modules expliciet, of laat leeg om plandefaults te gebruiken."
        >
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {catalog.modules.map((module) => (
              <label
                key={module.key}
                className="flex min-h-20 gap-3 rounded border border-slate-200 px-3 py-2 text-sm"
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
                  className="mt-1"
                />
                <span>
                  <span className="block font-semibold text-slate-900">
                    {module.name}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
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
        </FieldGroup>

        <FieldGroup
          title="Sectoren en regio's"
          helper="Deze stap zaait sectorbeleid, defaultsector en tenantregio's."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Sectorbeleid
              <SelectAdapter
                name="sectorMode"
                defaultValue={selectedSectorMode}
                className="min-h-11 rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="multi">Multi-sector</option>
                <option value="single">Single-sector</option>
              </SelectAdapter>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Defaultsector
              <SelectAdapter
                name="defaultSectorId"
                defaultValue={selectedDefaultSectorId}
                className="min-h-11 rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Geen default</option>
                {catalog.sectors.map((sector) => (
                  <option key={sector.id} value={sector.id}>
                    {sector.name}
                  </option>
                ))}
              </SelectAdapter>
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
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
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Regio's
            <textarea
              name="regionNames"
              rows={4}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              placeholder={"Noord\nRandstad\nZuid"}
              defaultValue={draft?.regionNames.join("\n") ?? ""}
            />
          </label>
        </FieldGroup>

        <FieldGroup
          title="Branding en owner invite"
          helper="Owner invite en tenant first-run readiness worden aan de provisioning run gekoppeld."
        >
          <div className="grid gap-3 md:grid-cols-[1fr_0.5fr_0.5fr]">
            <TextInput
              label="Branding displaynaam"
              name="brandingDisplayName"
              placeholder="Demo X"
              defaultValue={fieldValue(draft?.branding.displayName)}
            />
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Primaire kleur
              <input
                name="primaryColor"
                type="color"
                defaultValue={
                  draft?.branding.primaryColor ?? DEFAULT_PRIMARY_COLOR
                }
                className="h-11 rounded border border-slate-300 bg-white px-2 py-1"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Accentkleur
              <input
                name="accentColor"
                type="color"
                defaultValue={
                  draft?.branding.accentColor ?? DEFAULT_ACCENT_COLOR
                }
                className="h-11 rounded border border-slate-300 bg-white px-2 py-1"
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <TextInput
              label="Owner e-mail"
              name="ownerEmail"
              type="email"
              required
              placeholder="owner@example.nl"
              defaultValue={fieldValue(draft?.ownerEmail)}
            />
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              E-mailhandtekening
              <textarea
                name="emailSignature"
                rows={3}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                defaultValue={
                  draft?.branding.emailSignature ?? DEFAULT_EMAIL_SIGNATURE
                }
              />
            </label>
          </div>
        </FieldGroup>

        <FieldGroup
          title="Review"
          helper="Reviewnotitie blijft in de provisioningmetadata staan voor save/resume, retry en rollbackcontext."
        >
          <textarea
            name="reviewNotes"
            rows={4}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            placeholder="Controle op duplicate slug/domain, plan, modules, sectoren, regio's, owner invite en readiness."
            defaultValue={fieldValue(draft?.reviewNotes)}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="submit"
              formAction={savePlatformOnboardingDraft}
              formNoValidate
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <Save aria-hidden="true" className="size-4" />
              Concept opslaan
            </button>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Play aria-hidden="true" className="size-4" />
              Tenant provisionen
            </button>
          </div>
        </FieldGroup>
      </form>
    </section>
  );
}

function RunSteps({ steps }: { steps: PlatformProvisioningStepRow[] }) {
  return (
    <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {steps.map((step) => (
        <li
          key={step.id}
          className={`rounded border p-3 ${statusClass(step.status)}`}
        >
          <div className="flex items-center gap-2">
            <StatusIcon status={step.status} />
            <p className="text-sm font-semibold">{step.label}</p>
          </div>
          <p className="mt-2 text-xs opacity-90">{step.detail}</p>
        </li>
      ))}
    </ol>
  );
}

function RunCard({ run }: { run: PlatformProvisioningRunRow }) {
  return (
    <article className="grid gap-4 rounded border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-slate-950">
            {run.tenantId ? (
              <Link
                href={`/platform/tenants/${run.tenantId}`}
                className="underline-offset-2 hover:underline"
              >
                {run.tenantName ?? run.name}
              </Link>
            ) : (
              run.name
            )}
          </h3>
          <p className="mt-1 break-all text-sm text-slate-500">
            {run.slug} / {run.primaryDomain ?? "geen domein"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge
            status={
              run.status === "failed"
                ? "failed"
                : run.status === "rolled_back"
                  ? "rolled_back"
                  : run.status === "draft"
                    ? "active"
                    : "completed"
            }
          >
            {run.status}
          </Badge>
          <Badge
            status={
              run.ownerInviteStatus === "sent" ||
              run.ownerInviteStatus === "accepted"
                ? "completed"
                : "active"
            }
          >
            {run.readinessLabel}
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-3">
        <p>
          <span className="font-semibold text-slate-800">Plan:</span>{" "}
          {run.planKey}
        </p>
        <p>
          <span className="font-semibold text-slate-800">Owner:</span>{" "}
          {run.ownerEmail ?? "-"}
        </p>
        <p>
          <span className="font-semibold text-slate-800">Gestart:</span>{" "}
          {formatDate(run.startedAt)}
        </p>
        <p>
          <span className="font-semibold text-slate-800">Modules:</span>{" "}
          {run.moduleKeys.length}
        </p>
        <p>
          <span className="font-semibold text-slate-800">Sectoren:</span>{" "}
          {run.sectorIds.length}
        </p>
        <p>
          <span className="font-semibold text-slate-800">Regio's:</span>{" "}
          {run.regionNames.length}
        </p>
      </div>

      <RunSteps steps={run.steps} />

      <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">Rollbackpad</p>
        <p className="mt-1">{run.errorMessage ?? run.rollbackPath}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {run.canResume && (
          <Link
            href={`/platform/onboarding?onboardingDraft=${run.id}`}
            className="inline-flex min-h-10 items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <ExternalLink aria-hidden="true" className="size-4" />
            Hervat
          </Link>
        )}
        {run.canRetry && (
          <form action={retryPlatformTenantProvisioning}>
            <input type="hidden" name="sourceRunId" value={run.id} />
            <button
              type="submit"
              className="inline-flex min-h-10 items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              Retry
            </button>
          </form>
        )}
        {run.canRollback && (
          <form action={rollbackPlatformTenantProvisioning}>
            <input type="hidden" name="runId" value={run.id} />
            <button
              type="submit"
              className="inline-flex min-h-10 items-center gap-2 rounded border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
            >
              <Undo2 aria-hidden="true" className="size-4" />
              Rollback provisioning
            </button>
          </form>
        )}
      </div>
    </article>
  );
}

function RunHistory({ runs }: { runs: PlatformProvisioningRunRow[] }) {
  return (
    <section id="provisioning-runs" className="grid gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-normal text-slate-950">
            Provisioning runs
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Runstatus, stappen, owner invite, tenant first-run readiness, retry
            en rollback.
          </p>
        </div>
        <span className="text-sm text-slate-500">{runs.length} runs</span>
      </div>
      <div className="grid gap-3">
        {runs.map((run) => (
          <RunCard key={run.id} run={run} />
        ))}
        {runs.length === 0 && (
          <div className="rounded border border-slate-200 bg-white p-5 text-sm text-slate-500">
            Nog geen provisioning runs. Sla een concept op of provision de
            eerste tenant.
          </div>
        )}
      </div>
    </section>
  );
}

export default async function PlatformOnboardingPage({ searchParams }: Props) {
  const { onboardingDraft } = await searchParams;
  const workspace = await getPlatformOnboardingWorkspace(onboardingDraft);

  return (
    <main className="platform-page mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-slate-950 sm:p-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Platform onboarding
          </div>
          <div className="mt-2 flex items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-normal">
              Onboarding en provisioning 2.0
            </h1>
            <ResolvedFeatureHelp
              surface="platform"
              featureKey="platform.onboarding"
              moduleKey="knowledgebase"
            />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Maak een tenant aan zonder SQL, bewaar en hervat concepten,
            controleer duplicate slug/domain vooraf en volg provisioning tot
            owner invite en first-run readiness.
          </p>
        </div>
        <Link
          href="/platform/tenants"
          className="inline-flex min-h-10 w-fit items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Tenants openen
          <ExternalLink aria-hidden="true" className="size-4" />
        </Link>
      </header>

      <PreflightPanel preflight={workspace.preflight} />
      <OnboardingWizard workspace={workspace} />
      <RunHistory runs={workspace.runs} />
    </main>
  );
}
