"use server";

import {
  FIELDGRID_BRAND_DEFAULTS,
  completeProvisionedTenantOwnerInvite,
  db,
  defaultTenantDomainForSlug,
  isPlatformHost,
  modulesTable,
  normalizeHost,
  normalizeTenantProvisioningSlug,
  plansTable,
  provisionTenant,
  rollbackProvisionedTenant,
  sectorsTable,
  tenantDomainsTable,
  tenantFirstRunStateTable,
  tenantProvisioningRunsTable,
  tenantsTable,
  type TenantPlanKey,
  type TenantProvisioningResult,
  type TenantSectorPolicyMode,
} from "@workspace/db";
import { asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin, writeSupportAccessAuditLog } from "@/lib/auth/platform";
import { provisionPortalUserWithTemporaryPassword } from "@/lib/auth/portal-invites";
import { buildTemporaryPasswordEmail, sendEmailWithResult } from "@/lib/email";

const TENANT_PLAN_KEYS = ["starter", "professional", "enterprise"] as const;
const TENANT_SECTOR_POLICY_MODES = ["single", "multi"] as const;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;
const TENANT_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

const ONBOARDING_WIZARD_STEPS = [
  "tenantgegevens",
  "plan",
  "fieldgrid_subdomain",
  "modules",
  "sectoren",
  "regios",
  "branding",
  "owner_invite",
  "review",
  "provisioning_run",
] as const;

type PlatformActor = Awaited<ReturnType<typeof requirePlatformAdmin>>;

type PlatformOnboardingInput = {
  name: string;
  slug: string | null;
  planKey: TenantPlanKey;
  primaryDomain: string | null;
  ownerEmail: string;
  moduleKeys: string[];
  sectorIds: string[];
  defaultSectorId: string | null;
  sectorMode: TenantSectorPolicyMode | null;
  regionNames: string[];
  branding: {
    displayName: string | null;
    primaryColor: string | null;
    accentColor: string | null;
    emailSignature: string | null;
  };
  reviewNotes: string | null;
};

export type PlatformOnboardingCatalog = {
  plans: Array<{
    key: TenantPlanKey;
    name: string;
    description: string | null;
  }>;
  modules: Array<{
    key: string;
    name: string;
    description: string | null;
    category: string;
    defaultEnabled: boolean;
  }>;
  sectors: Array<{
    id: string;
    name: string;
    description: string | null;
  }>;
};

export type PlatformOnboardingDraft = PlatformOnboardingInput & {
  id: string;
  status: string;
  currentStep: string;
  savedAt: string;
};

export type PlatformOnboardingPreflightStatus = "ready" | "warning" | "blocked";

export type PlatformOnboardingPreflightCheck = {
  id: string;
  label: string;
  status: PlatformOnboardingPreflightStatus;
  detail: string;
};

export type PlatformOnboardingPreflight = {
  status: PlatformOnboardingPreflightStatus;
  canProvision: boolean;
  slug: string | null;
  primaryDomain: string | null;
  fieldgridSubdomain: string | null;
  checks: PlatformOnboardingPreflightCheck[];
};

export type PlatformProvisioningStepRow = {
  id: string;
  label: string;
  status: "pending" | "active" | "completed" | "failed" | "rolled_back";
  detail: string;
};

export type PlatformProvisioningRunRow = {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  name: string;
  slug: string;
  planKey: string;
  primaryDomain: string | null;
  ownerEmail: string | null;
  ownerInviteStatus: string;
  status: string;
  currentStep: string;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  moduleKeys: string[];
  sectorIds: string[];
  regionNames: string[];
  brandingDisplayName: string | null;
  reviewStatus: string;
  rollbackPath: string;
  steps: PlatformProvisioningStepRow[];
  firstRunStatus: string | null;
  firstRunCompletedSteps: number;
  firstRunRequiredSteps: number;
  readinessLabel: string;
  canResume: boolean;
  canRetry: boolean;
  canRollback: boolean;
};

export type PlatformOnboardingWorkspace = {
  catalog: PlatformOnboardingCatalog;
  draft: PlatformOnboardingDraft | null;
  preflight: PlatformOnboardingPreflight | null;
  runs: PlatformProvisioningRunRow[];
};

function actionValue(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function actionValues(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

function splitTextValues(value: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const item of value.split(/[\n,;]/u)) {
    const cleaned = item.trim().replace(/\s+/gu, " ");
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    values.push(cleaned);
  }

  return values;
}

function normalizePlanKey(value: string): TenantPlanKey {
  return TENANT_PLAN_KEYS.includes(value as TenantPlanKey) ? (value as TenantPlanKey) : "starter";
}

function normalizeSectorMode(value: string): TenantSectorPolicyMode | null {
  return TENANT_SECTOR_POLICY_MODES.includes(value as TenantSectorPolicyMode)
    ? (value as TenantSectorPolicyMode)
    : null;
}

function normalizeOptionalColor(value: string, fallback: string): string | null {
  if (!value) return null;
  return COLOR_PATTERN.test(value) ? value : fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Tenant provisioning mislukt.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isoTimestamp(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function requiredIsoTimestamp(value: Date | string | null | undefined): string {
  return isoTimestamp(value) ?? new Date(0).toISOString();
}

function onboardingMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const wizard = isRecord(metadata?.onboardingWizard) ? metadata.onboardingWizard : null;
  return wizard ?? {};
}

function parseOnboardingInputFromMetadata(row: {
  id: string;
  name: string;
  slug: string;
  planKey: string;
  primaryDomain: string | null;
  ownerEmail: string | null;
  status: string;
  currentStep: string;
  startedAt: Date | string;
  metadata: Record<string, unknown> | null;
}): PlatformOnboardingDraft {
  const wizard = onboardingMetadata(row.metadata);
  const branding = isRecord(wizard.branding) ? wizard.branding : {};

  return {
    id: row.id,
    status: row.status,
    currentStep: row.currentStep,
    savedAt: requiredIsoTimestamp(row.startedAt),
    name: optionalString(wizard.name) ?? row.name,
    slug: optionalString(wizard.slug) ?? row.slug,
    planKey: normalizePlanKey(optionalString(wizard.planKey) ?? row.planKey),
    primaryDomain: optionalString(wizard.primaryDomain) ?? row.primaryDomain,
    ownerEmail: optionalString(wizard.ownerEmail) ?? row.ownerEmail ?? "",
    moduleKeys: stringArray(wizard.moduleKeys),
    sectorIds: stringArray(wizard.sectorIds),
    defaultSectorId: optionalString(wizard.defaultSectorId),
    sectorMode: normalizeSectorMode(optionalString(wizard.sectorMode) ?? ""),
    regionNames: stringArray(wizard.regionNames),
    branding: {
      displayName: optionalString(branding.displayName),
      primaryColor: optionalString(branding.primaryColor),
      accentColor: optionalString(branding.accentColor),
      emailSignature: optionalString(branding.emailSignature),
    },
    reviewNotes: optionalString(wizard.reviewNotes),
  };
}

function parseOnboardingInput(formData: FormData): PlatformOnboardingInput {
  const name = actionValue(formData, "name");
  const requestedSlug = actionValue(formData, "slug");
  const slug = requestedSlug ? normalizeTenantProvisioningSlug(requestedSlug) : null;
  const planKey = normalizePlanKey(actionValue(formData, "planKey"));
  const fieldgridSubdomain = normalizeTenantProvisioningSlug(actionValue(formData, "fieldgridSubdomain"));
  const primaryDomain = actionValue(formData, "domain") || (fieldgridSubdomain ? defaultTenantDomainForSlug(fieldgridSubdomain) : null);
  const ownerEmail = actionValue(formData, "ownerEmail").toLowerCase();
  const sectorIds = actionValues(formData, "sectorIds");
  const defaultSectorId = actionValue(formData, "defaultSectorId") || sectorIds[0] || null;
  const brandingDisplayName = actionValue(formData, "brandingDisplayName");

  return {
    name,
    slug,
    planKey,
    primaryDomain,
    ownerEmail,
    moduleKeys: actionValues(formData, "moduleKeys"),
    sectorIds,
    defaultSectorId,
    sectorMode: normalizeSectorMode(actionValue(formData, "sectorMode")),
    regionNames: splitTextValues(actionValue(formData, "regionNames")),
    branding: {
      displayName: brandingDisplayName || name || null,
      primaryColor: normalizeOptionalColor(actionValue(formData, "primaryColor"), FIELDGRID_BRAND_DEFAULTS.primaryColor),
      accentColor: normalizeOptionalColor(actionValue(formData, "accentColor"), FIELDGRID_BRAND_DEFAULTS.accentColor),
      emailSignature: actionValue(formData, "emailSignature") || null,
    },
    reviewNotes: actionValue(formData, "reviewNotes") || null,
  };
}

function metadataForInput(
  input: PlatformOnboardingInput,
  actor: PlatformActor,
  sourceRunId: string | null,
  reviewStatus: "draft" | "approved",
  preflight: PlatformOnboardingPreflight | null = null,
) {
  return {
    source: "platform-admin-onboarding-wizard",
    actorPlatformUserId: actor.id,
    ownerInviteRequested: Boolean(input.ownerEmail),
    sourceRunId,
    onboardingWizard: {
      version: 2,
      reviewStatus,
      saveResume: true,
      steps: [...ONBOARDING_WIZARD_STEPS],
      name: input.name,
      slug: input.slug,
      planKey: input.planKey,
      primaryDomain: input.primaryDomain,
      fieldgridSubdomain: preflight?.fieldgridSubdomain ?? null,
      ownerEmail: input.ownerEmail,
      moduleKeys: input.moduleKeys,
      sectorIds: input.sectorIds,
      defaultSectorId: input.defaultSectorId,
      sectorMode: input.sectorMode,
      regionNames: input.regionNames,
      branding: input.branding,
      reviewNotes: input.reviewNotes,
      preflight: preflight
        ? {
            status: preflight.status,
            canProvision: preflight.canProvision,
            checkedAt: new Date().toISOString(),
            checks: preflight.checks,
          }
        : null,
      firstRunReadiness: {
        ownerInviteRequired: true,
        requiredSteps: ["branding", "users", "sectors", "modules"],
      },
      savedAt: new Date().toISOString(),
    },
  };
}

function fallbackDraftSlug(input: PlatformOnboardingInput): string {
  const base = input.slug || normalizeTenantProvisioningSlug(input.name || "concept-tenant");
  return base || `concept-${Date.now().toString(36)}`;
}

function runRollbackPath(row: { status: string; currentStep: string; tenantId: string | null; errorMessage: string | null }): string {
  if (row.status === "rolled_back") return "Rollback uitgevoerd: tenant verwijderd, concept kan opnieuw worden hervat.";
  if (row.status === "failed" && row.tenantId) return "Fout na tenantaanmaak: controleer tenantdetail en rollback handmatig.";
  if (row.status === "failed") return "Geen tenant aangemaakt; hervat of retry de wizard na correctie.";
  if (row.currentStep === "owner_invite_pending") return "Tenant bestaat; owner invite kan opnieuw worden opgepakt.";
  return "Niet nodig.";
}

function effectiveOnboardingSlug(input: PlatformOnboardingInput): string | null {
  const slug = input.slug || normalizeTenantProvisioningSlug(input.name || "");
  return slug || null;
}

function effectiveOnboardingDomain(input: PlatformOnboardingInput, slug: string | null): string | null {
  const domain = normalizeHost(input.primaryDomain || (slug ? defaultTenantDomainForSlug(slug) : ""));
  return domain || null;
}

function fieldgridSubdomainFromDomain(domain: string | null): string | null {
  if (!domain?.endsWith(".fieldgrid.nl")) return null;
  return domain.slice(0, -".fieldgrid.nl".length);
}

function preflightStatus(checks: PlatformOnboardingPreflightCheck[]): PlatformOnboardingPreflightStatus {
  if (checks.some((check) => check.status === "blocked")) return "blocked";
  if (checks.some((check) => check.status === "warning")) return "warning";
  return "ready";
}

function provisioningStepStatus(input: {
  stepIndex: number;
  activeIndex: number;
  runStatus: string;
}): PlatformProvisioningStepRow["status"] {
  if (input.runStatus === "rolled_back") {
    return input.stepIndex <= input.activeIndex ? "rolled_back" : "pending";
  }
  if (input.runStatus === "failed") {
    if (input.stepIndex < input.activeIndex) return "completed";
    return input.stepIndex === input.activeIndex ? "failed" : "pending";
  }
  if (input.runStatus === "draft") return input.stepIndex === 0 ? "active" : "pending";
  if (input.stepIndex < input.activeIndex) return "completed";
  if (input.stepIndex === input.activeIndex) return input.runStatus === "succeeded" ? "completed" : "active";
  return "pending";
}

function buildProvisioningSteps(row: {
  status: string;
  currentStep: string;
  ownerInviteStatus: string;
  errorMessage: string | null;
  firstRunStatus: string | null;
}): PlatformProvisioningStepRow[] {
  const steps = [
    { id: "draft", label: "Concept", detail: "Tenantgegevens, plan en scope zijn opgeslagen." },
    { id: "preflight", label: "Preflight", detail: "Slug, domein en owner invite worden server-side gecontroleerd." },
    { id: "tenant", label: "Tenant", detail: "Tenantrecord, hostcontext en plan worden aangemaakt." },
    { id: "configuration", label: "Configuratie", detail: "Modules, sectoren, regio's en branding worden gezaaid." },
    { id: "owner_invite_pending", label: "Owner invite", detail: `Owner invite status: ${row.ownerInviteStatus}.` },
    { id: "completed", label: "First-run", detail: `Tenant first-run status: ${row.firstRunStatus ?? "pending"}.` },
  ];
  const currentStep = row.status === "draft" ? "draft" : row.currentStep;
  const activeIndex = Math.max(0, steps.findIndex((step) => step.id === currentStep || (currentStep === "failed" && step.id === "preflight")));

  return steps.map((step, index) => ({
    ...step,
    status: provisioningStepStatus({
      stepIndex: index,
      activeIndex,
      runStatus: row.status,
    }),
    detail: row.status === "failed" && index === activeIndex && row.errorMessage ? row.errorMessage : step.detail,
  }));
}

function readinessLabel(input: {
  status: string;
  ownerInviteStatus: string;
  firstRunStatus: string | null;
  firstRunCompletedSteps: number;
  firstRunRequiredSteps: number;
}): string {
  if (input.status === "failed" || input.status === "rolled_back") return "Provisioning geblokkeerd";
  if (input.ownerInviteStatus !== "sent" && input.ownerInviteStatus !== "accepted") return "Owner invite open";
  if (input.firstRunStatus === "completed" || input.firstRunStatus === "skipped") return "First-run afgerond";
  return `First-run ${input.firstRunCompletedSteps}/${input.firstRunRequiredSteps}`;
}

async function readOnboardingPreflight(input: PlatformOnboardingInput): Promise<PlatformOnboardingPreflight> {
  const slug = effectiveOnboardingSlug(input);
  const primaryDomain = effectiveOnboardingDomain(input, slug);
  const checks: PlatformOnboardingPreflightCheck[] = [];

  checks.push({
    id: "tenantgegevens",
    label: "Tenantgegevens",
    status: input.name.trim() ? "ready" : "blocked",
    detail: input.name.trim() ? "Tenantnaam is ingevuld." : "Tenantnaam is verplicht.",
  });

  checks.push({
    id: "slug",
    label: "Slug",
    status: slug && TENANT_SLUG_PATTERN.test(slug) ? "ready" : "blocked",
    detail: slug && TENANT_SLUG_PATTERN.test(slug)
      ? `Slug wordt ${slug}.`
      : "Slug moet 3-80 tekens zijn en alleen kleine letters, cijfers en koppeltekens bevatten.",
  });

  checks.push({
    id: "fieldgrid_subdomain",
    label: "Fieldgrid subdomain",
    status: primaryDomain?.endsWith(".fieldgrid.nl") ? "ready" : "warning",
    detail: primaryDomain?.endsWith(".fieldgrid.nl")
      ? `${primaryDomain} wordt direct geverifieerd.`
      : "Geen Fieldgrid subdomain ingevuld; custom domains blijven pending tot DNS-verificatie.",
  });

  checks.push({
    id: "domain",
    label: "Primair domein",
    status: primaryDomain && !isPlatformHost(primaryDomain) ? "ready" : "blocked",
    detail: !primaryDomain
      ? "Primair domein ontbreekt."
      : isPlatformHost(primaryDomain)
        ? "Platformhosts kunnen niet aan een tenant worden gekoppeld."
        : `Primair domein wordt ${primaryDomain}.`,
  });

  checks.push({
    id: "owner_invite",
    label: "Owner invite",
    status: EMAIL_PATTERN.test(input.ownerEmail) ? "ready" : "blocked",
    detail: EMAIL_PATTERN.test(input.ownerEmail)
      ? `Owner invite gaat naar ${input.ownerEmail}.`
      : "Een geldig owner e-mailadres is verplicht.",
  });

  if (slug && TENANT_SLUG_PATTERN.test(slug)) {
    const [duplicateSlug] = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.slug, slug))
      .limit(1);

    checks.push({
      id: "duplicate_slug",
      label: "Duplicate slug",
      status: duplicateSlug ? "blocked" : "ready",
      detail: duplicateSlug ? "Er bestaat al een tenant met deze slug." : "Slug is nog vrij.",
    });
  }

  if (primaryDomain && !isPlatformHost(primaryDomain)) {
    const [duplicateDomain] = await db
      .select({ id: tenantDomainsTable.id })
      .from(tenantDomainsTable)
      .where(eq(tenantDomainsTable.domain, primaryDomain))
      .limit(1);

    checks.push({
      id: "duplicate_domain",
      label: "Duplicate domain",
      status: duplicateDomain ? "blocked" : "ready",
      detail: duplicateDomain ? "Dit domein is al gekoppeld aan een tenant." : "Domein is nog vrij.",
    });
  }

  checks.push({
    id: "modules",
    label: "Modules",
    status: input.moduleKeys.length > 0 ? "ready" : "warning",
    detail: input.moduleKeys.length > 0 ? `${input.moduleKeys.length} module(s) geselecteerd.` : "Geen modules geselecteerd; plan-defaults worden gebruikt.",
  });

  checks.push({
    id: "sectoren",
    label: "Sectoren",
    status: input.sectorIds.length > 0 ? "ready" : "warning",
    detail: input.sectorIds.length > 0 ? `${input.sectorIds.length} sector(en) geselecteerd.` : "Geen sectoren geselecteerd; actieve sectors worden gebruikt.",
  });

  checks.push({
    id: "regios",
    label: "Regio's",
    status: input.regionNames.length > 0 ? "ready" : "warning",
    detail: input.regionNames.length > 0 ? `${input.regionNames.length} regio(s) klaar voor provisioning.` : "Regio's kunnen later worden toegevoegd.",
  });

  checks.push({
    id: "first_run",
    label: "First-run readiness",
    status: "ready",
    detail: "Provisioning maakt tenant first-run pending met branding, users, sectors en modules als readiness-stappen.",
  });

  const status = preflightStatus(checks);
  return {
    status,
    canProvision: status !== "blocked",
    slug,
    primaryDomain,
    fieldgridSubdomain: fieldgridSubdomainFromDomain(primaryDomain),
    checks,
  };
}

async function inviteOwnerByEmail(email: string, primaryDomain: string | null): Promise<string> {
  const invite = await provisionPortalUserWithTemporaryPassword({
    email,
    fullName: email,
    portal: "tenant-admin",
    allowExistingActive: true,
  });
  const host = normalizeHost(primaryDomain ?? "") || "admin.fieldgrid.nl";
  const { subject, html } = buildTemporaryPasswordEmail({
    recipientName: email,
    portalName: "Tenant backoffice",
    loginUrl: `https://${host}/admin/login`,
    temporaryPassword: invite.temporaryPassword,
  });
  const sent = await sendEmailWithResult({ to: email, subject, html });
  if (!sent.success) throw new Error(sent.error ?? "Owner-uitnodigingsmail versturen mislukt.");
  return invite.user.id;
}

async function readProvisioningDraft(runId: string): Promise<PlatformOnboardingDraft | null> {
  const [row] = await db
    .select({
      id: tenantProvisioningRunsTable.id,
      name: tenantProvisioningRunsTable.name,
      slug: tenantProvisioningRunsTable.slug,
      planKey: tenantProvisioningRunsTable.planKey,
      primaryDomain: tenantProvisioningRunsTable.primaryDomain,
      ownerEmail: tenantProvisioningRunsTable.ownerEmail,
      status: tenantProvisioningRunsTable.status,
      currentStep: tenantProvisioningRunsTable.currentStep,
      startedAt: tenantProvisioningRunsTable.startedAt,
      metadata: tenantProvisioningRunsTable.metadata,
    })
    .from(tenantProvisioningRunsTable)
    .where(eq(tenantProvisioningRunsTable.id, runId))
    .limit(1);

  return row ? parseOnboardingInputFromMetadata(row) : null;
}

async function markDraftProvisioned(runId: string, result: TenantProvisioningResult): Promise<void> {
  const [draft] = await db
    .select({
      status: tenantProvisioningRunsTable.status,
      metadata: tenantProvisioningRunsTable.metadata,
    })
    .from(tenantProvisioningRunsTable)
    .where(eq(tenantProvisioningRunsTable.id, runId))
    .limit(1);
  if (!draft || draft.status !== "draft") return;

  await db
    .update(tenantProvisioningRunsTable)
    .set({
      tenantId: result.tenantId,
      currentStep: "provisioned",
      completedAt: new Date(),
      metadata: {
        ...(draft.metadata ?? {}),
        provisionedTenantId: result.tenantId,
        provisionedRunId: result.runId,
      },
      updatedAt: new Date(),
    })
    .where(eq(tenantProvisioningRunsTable.id, runId));
}

async function runPlatformTenantProvisioning(
  input: PlatformOnboardingInput,
  actor: PlatformActor,
  sourceRunId: string | null,
): Promise<TenantProvisioningResult> {
  if (!input.ownerEmail) {
    throw new Error("Owner e-mail is verplicht voor tenant provisioning.");
  }

  const preflight = await readOnboardingPreflight(input);
  if (!preflight.canProvision) {
    const blocked = preflight.checks.filter((check) => check.status === "blocked");
    throw new Error(blocked.map((check) => check.detail).join(" ") || "Onboarding preflight blokkeert provisioning.");
  }

  const result = await provisionTenant({
    name: input.name,
    slug: input.slug,
    planKey: input.planKey,
    primaryDomain: input.primaryDomain,
    ownerEmail: input.ownerEmail,
    requestedBy: actor.userId,
    moduleKeys: input.moduleKeys,
    sectorIds: input.sectorIds,
    defaultSectorId: input.defaultSectorId,
    sectorMode: input.sectorMode,
    regionNames: input.regionNames,
    branding: input.branding,
    metadata: metadataForInput(input, actor, sourceRunId, "approved", preflight),
  });

  try {
    const ownerUserId = await inviteOwnerByEmail(input.ownerEmail, result.primaryDomain ?? defaultTenantDomainForSlug(result.slug));
    await completeProvisionedTenantOwnerInvite({
      tenantId: result.tenantId,
      runId: result.runId,
      ownerEmail: input.ownerEmail,
      ownerUserId,
      invitedBy: actor.userId,
    });
  } catch (error) {
    await rollbackProvisionedTenant({
      tenantId: result.tenantId,
      runId: result.runId,
      requestedBy: actor.userId,
      reason: errorMessage(error),
    });
    throw error;
  }

  await writeSupportAccessAuditLog({
    tenantId: result.tenantId,
    action: "tenant_provisioned",
    resource: "tenant_provisioning_runs",
    resourceId: result.runId,
    metadata: {
      slug: result.slug,
      planKey: result.planKey,
      primaryDomain: result.primaryDomain,
      ownerInviteRequested: true,
      sourceRunId,
      preflightStatus: preflight.status,
    },
  });

  if (sourceRunId) await markDraftProvisioned(sourceRunId, result);

  return result;
}

export async function listPlatformOnboardingCatalog(): Promise<PlatformOnboardingCatalog> {
  await requirePlatformAdmin();

  const [plans, modules, sectors] = await Promise.all([
    db
      .select({ key: plansTable.key, name: plansTable.name, description: plansTable.description })
      .from(plansTable)
      .where(eq(plansTable.isActive, true))
      .orderBy(asc(plansTable.sortOrder), asc(plansTable.name)),
    db
      .select({
        key: modulesTable.key,
        name: modulesTable.name,
        description: modulesTable.description,
        category: modulesTable.category,
        defaultEnabled: modulesTable.isEnabledByDefault,
      })
      .from(modulesTable)
      .orderBy(asc(modulesTable.category), asc(modulesTable.name)),
    db
      .select({ id: sectorsTable.id, name: sectorsTable.name, description: sectorsTable.description })
      .from(sectorsTable)
      .where(eq(sectorsTable.isActive, true))
      .orderBy(asc(sectorsTable.name)),
  ]);

  return { plans, modules, sectors };
}

export async function getPlatformOnboardingDraft(runId: string): Promise<PlatformOnboardingDraft | null> {
  await requirePlatformAdmin();
  return readProvisioningDraft(runId);
}

export async function listTenantProvisioningRuns(limit = 12): Promise<PlatformProvisioningRunRow[]> {
  await requirePlatformAdmin();

  const rows = await db
    .select({
      id: tenantProvisioningRunsTable.id,
      tenantId: tenantProvisioningRunsTable.tenantId,
      tenantName: tenantsTable.name,
      name: tenantProvisioningRunsTable.name,
      slug: tenantProvisioningRunsTable.slug,
      planKey: tenantProvisioningRunsTable.planKey,
      primaryDomain: tenantProvisioningRunsTable.primaryDomain,
      ownerEmail: tenantProvisioningRunsTable.ownerEmail,
      ownerInviteStatus: tenantProvisioningRunsTable.ownerInviteStatus,
      status: tenantProvisioningRunsTable.status,
      currentStep: tenantProvisioningRunsTable.currentStep,
      errorMessage: tenantProvisioningRunsTable.errorMessage,
      metadata: tenantProvisioningRunsTable.metadata,
      startedAt: tenantProvisioningRunsTable.startedAt,
      completedAt: tenantProvisioningRunsTable.completedAt,
      firstRunStatus: tenantFirstRunStateTable.status,
      firstRunRequiredSteps: tenantFirstRunStateTable.requiredSteps,
      firstRunCompletedSteps: tenantFirstRunStateTable.completedSteps,
    })
    .from(tenantProvisioningRunsTable)
    .leftJoin(tenantsTable, eq(tenantProvisioningRunsTable.tenantId, tenantsTable.id))
    .leftJoin(tenantFirstRunStateTable, eq(tenantFirstRunStateTable.tenantId, tenantProvisioningRunsTable.tenantId))
    .orderBy(desc(tenantProvisioningRunsTable.startedAt))
    .limit(Math.min(Math.max(limit, 1), 50));

  return rows.map((row) => {
    const wizard = onboardingMetadata(row.metadata);
    const branding = isRecord(wizard.branding) ? wizard.branding : {};

    return {
      ...row,
      startedAt: requiredIsoTimestamp(row.startedAt),
      completedAt: isoTimestamp(row.completedAt),
      moduleKeys: stringArray(wizard.moduleKeys),
      sectorIds: stringArray(wizard.sectorIds),
      regionNames: stringArray(wizard.regionNames),
      brandingDisplayName: optionalString(branding.displayName),
      reviewStatus: optionalString(wizard.reviewStatus) ?? "-",
      rollbackPath: runRollbackPath(row),
      steps: buildProvisioningSteps({
        status: row.status,
        currentStep: row.currentStep,
        ownerInviteStatus: row.ownerInviteStatus,
        errorMessage: row.errorMessage,
        firstRunStatus: row.firstRunStatus,
      }),
      firstRunStatus: row.firstRunStatus,
      firstRunCompletedSteps: Array.isArray(row.firstRunCompletedSteps) ? row.firstRunCompletedSteps.length : 0,
      firstRunRequiredSteps: Array.isArray(row.firstRunRequiredSteps) ? row.firstRunRequiredSteps.length : 0,
      readinessLabel: readinessLabel({
        status: row.status,
        ownerInviteStatus: row.ownerInviteStatus,
        firstRunStatus: row.firstRunStatus,
        firstRunCompletedSteps: Array.isArray(row.firstRunCompletedSteps) ? row.firstRunCompletedSteps.length : 0,
        firstRunRequiredSteps: Array.isArray(row.firstRunRequiredSteps) ? row.firstRunRequiredSteps.length : 0,
      }),
      canResume: row.status === "draft" && row.currentStep === "draft",
      canRetry: row.status === "failed" || row.status === "rolled_back",
      canRollback: Boolean(row.tenantId && row.status === "failed"),
    };
  });
}

export async function savePlatformOnboardingDraft(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const input = parseOnboardingInput(formData);
  const draftRunId = actionValue(formData, "draftRunId");
  const name = input.name || "Concept tenant";
  const slug = fallbackDraftSlug(input);
  const draftInput = { ...input, name, slug };
  const preflight = await readOnboardingPreflight(draftInput);
  const metadata = metadataForInput(draftInput, actor, draftRunId || null, "draft", preflight);
  const ownerInviteStatus: "pending" | "not_requested" = input.ownerEmail ? "pending" : "not_requested";
  const values = {
    requestedBy: actor.userId,
    name,
    slug,
    planKey: draftInput.planKey,
    primaryDomain: preflight.primaryDomain ?? draftInput.primaryDomain,
    ownerEmail: input.ownerEmail || null,
    ownerInviteStatus,
    status: "draft" as const,
    currentStep: "draft",
    errorMessage: null,
    completedAt: null,
    metadata,
    updatedAt: new Date(),
  };

  let runId = draftRunId;
  const existingDraft = draftRunId ? await readProvisioningDraft(draftRunId) : null;

  if (existingDraft?.status === "draft") {
    await db.update(tenantProvisioningRunsTable).set(values).where(eq(tenantProvisioningRunsTable.id, draftRunId));
  } else {
    const [created] = await db
      .insert(tenantProvisioningRunsTable)
      .values(values)
      .returning({ id: tenantProvisioningRunsTable.id });
    runId = created.id;
  }

  revalidatePath("/platform");
  revalidatePath("/platform/onboarding");
  redirect(`/platform/onboarding?onboardingDraft=${runId}`);
}

export async function retryPlatformTenantProvisioning(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const sourceRunId = actionValue(formData, "sourceRunId");
  if (!sourceRunId) throw new Error("Provisioning run ontbreekt.");

  const draft = await readProvisioningDraft(sourceRunId);
  if (!draft) throw new Error("Provisioning run niet gevonden.");

  let result;
  try {
    result = await runPlatformTenantProvisioning(draft, actor, sourceRunId);
  } catch {
    revalidatePath("/platform");
    revalidatePath("/platform/onboarding");
    redirect("/platform/onboarding#provisioning-runs");
  }

  revalidatePath("/platform");
  revalidatePath("/platform/onboarding");
  revalidatePath(`/platform/tenants/${result.tenantId}`);
  redirect(`/platform/tenants/${result.tenantId}`);
}

export async function createPlatformTenant(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const draftRunId = actionValue(formData, "draftRunId") || null;
  const input = parseOnboardingInput(formData);
  let result;
  try {
    result = await runPlatformTenantProvisioning(input, actor, draftRunId);
  } catch {
    revalidatePath("/platform");
    revalidatePath("/platform/onboarding");
    redirect("/platform/onboarding#provisioning-runs");
  }

  revalidatePath("/platform");
  revalidatePath("/platform/onboarding");
  revalidatePath(`/platform/tenants/${result.tenantId}`);
  redirect(`/platform/tenants/${result.tenantId}`);
}

export async function rollbackPlatformTenantProvisioning(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const runId = actionValue(formData, "runId");
  if (!runId) throw new Error("Provisioning run ontbreekt.");

  const [run] = await db
    .select({
      tenantId: tenantProvisioningRunsTable.tenantId,
      status: tenantProvisioningRunsTable.status,
      errorMessage: tenantProvisioningRunsTable.errorMessage,
    })
    .from(tenantProvisioningRunsTable)
    .where(eq(tenantProvisioningRunsTable.id, runId))
    .limit(1);

  if (!run?.tenantId) throw new Error("Rollback kan alleen op een run met aangemaakte tenant.");
  if (run.status !== "failed") throw new Error("Rollback is alleen beschikbaar voor mislukte provisioning runs.");

  await writeSupportAccessAuditLog({
    tenantId: run.tenantId,
    action: "tenant_provisioning_rollback_requested",
    resource: "tenant_provisioning_runs",
    resourceId: runId,
    metadata: { reason: run.errorMessage ?? "Handmatige rollback vanuit platform onboarding." },
  });

  await rollbackProvisionedTenant({
    tenantId: run.tenantId,
    runId,
    requestedBy: actor.userId,
    reason: run.errorMessage ?? "Handmatige rollback vanuit platform onboarding.",
  });

  revalidatePath("/platform");
  revalidatePath("/platform/onboarding");
  redirect("/platform/onboarding#provisioning-runs");
}

export async function getPlatformOnboardingWorkspace(onboardingDraft?: string): Promise<PlatformOnboardingWorkspace> {
  await requirePlatformAdmin();

  const [catalog, draft, runs] = await Promise.all([
    listPlatformOnboardingCatalog(),
    onboardingDraft ? getPlatformOnboardingDraft(onboardingDraft) : Promise.resolve(null),
    listTenantProvisioningRuns(20),
  ]);

  const preflight = draft ? await readOnboardingPreflight(draft) : null;
  return { catalog, draft, preflight, runs };
}
