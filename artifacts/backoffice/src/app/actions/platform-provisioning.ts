"use server";

import {
  FIELDGRID_BRAND_DEFAULTS,
  completeProvisionedTenantOwnerInvite,
  db,
  modulesTable,
  normalizeTenantProvisioningSlug,
  plansTable,
  provisionTenant,
  rollbackProvisionedTenant,
  sectorsTable,
  tenantProvisioningRunsTable,
  tenantsTable,
  type TenantPlanKey,
  type TenantProvisioningResult,
  type TenantSectorPolicyMode,
} from "@workspace/db";
import { asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin, writeSupportAccessAuditLog } from "@/lib/auth/platform";

const TENANT_PLAN_KEYS = ["starter", "professional", "enterprise"] as const;
const TENANT_SECTOR_POLICY_MODES = ["single", "multi"] as const;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;

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
  canResume: boolean;
  canRetry: boolean;
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
  startedAt: Date;
  metadata: Record<string, unknown> | null;
}): PlatformOnboardingDraft {
  const wizard = onboardingMetadata(row.metadata);
  const branding = isRecord(wizard.branding) ? wizard.branding : {};

  return {
    id: row.id,
    status: row.status,
    currentStep: row.currentStep,
    savedAt: row.startedAt.toISOString(),
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
  const primaryDomain = actionValue(formData, "domain") || null;
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

function metadataForInput(input: PlatformOnboardingInput, actor: PlatformActor, sourceRunId: string | null, reviewStatus: "draft" | "approved") {
  return {
    source: "platform-admin-onboarding-wizard",
    actorPlatformUserId: actor.id,
    ownerInviteRequested: Boolean(input.ownerEmail),
    sourceRunId,
    onboardingWizard: {
      version: 1,
      reviewStatus,
      saveResume: true,
      name: input.name,
      slug: input.slug,
      planKey: input.planKey,
      primaryDomain: input.primaryDomain,
      ownerEmail: input.ownerEmail,
      moduleKeys: input.moduleKeys,
      sectorIds: input.sectorIds,
      defaultSectorId: input.defaultSectorId,
      sectorMode: input.sectorMode,
      regionNames: input.regionNames,
      branding: input.branding,
      reviewNotes: input.reviewNotes,
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

async function inviteOwnerByEmail(email: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error) throw new Error(`Owner-uitnodiging mislukt: ${error.message}`);
  if (!data.user?.id) throw new Error("Owner-uitnodiging gaf geen gebruiker terug.");
  return data.user.id;
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
    metadata: metadataForInput(input, actor, sourceRunId, "approved"),
  });

  try {
    const ownerUserId = await inviteOwnerByEmail(input.ownerEmail);
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
    })
    .from(tenantProvisioningRunsTable)
    .leftJoin(tenantsTable, eq(tenantProvisioningRunsTable.tenantId, tenantsTable.id))
    .orderBy(desc(tenantProvisioningRunsTable.startedAt))
    .limit(Math.min(Math.max(limit, 1), 50));

  return rows.map((row) => {
    const wizard = onboardingMetadata(row.metadata);
    const branding = isRecord(wizard.branding) ? wizard.branding : {};

    return {
      ...row,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      moduleKeys: stringArray(wizard.moduleKeys),
      sectorIds: stringArray(wizard.sectorIds),
      regionNames: stringArray(wizard.regionNames),
      brandingDisplayName: optionalString(branding.displayName),
      reviewStatus: optionalString(wizard.reviewStatus) ?? "-",
      rollbackPath: runRollbackPath(row),
      canResume: row.status === "draft" && row.currentStep === "draft",
      canRetry: row.status === "failed" || row.status === "rolled_back",
    };
  });
}

export async function savePlatformOnboardingDraft(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const input = parseOnboardingInput(formData);
  const draftRunId = actionValue(formData, "draftRunId");
  const name = input.name || "Concept tenant";
  const slug = fallbackDraftSlug(input);
  const metadata = metadataForInput({ ...input, name, slug }, actor, draftRunId || null, "draft");
  const ownerInviteStatus: "pending" | "not_requested" = input.ownerEmail ? "pending" : "not_requested";
  const values = {
    requestedBy: actor.userId,
    name,
    slug,
    planKey: input.planKey,
    primaryDomain: input.primaryDomain,
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
  redirect(`/platform?onboardingDraft=${runId}`);
}

export async function retryPlatformTenantProvisioning(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const sourceRunId = actionValue(formData, "sourceRunId");
  if (!sourceRunId) throw new Error("Provisioning run ontbreekt.");

  const draft = await readProvisioningDraft(sourceRunId);
  if (!draft) throw new Error("Provisioning run niet gevonden.");

  const result = await runPlatformTenantProvisioning(draft, actor, sourceRunId);

  revalidatePath("/platform");
  revalidatePath(`/platform/tenants/${result.tenantId}`);
  redirect(`/platform/tenants/${result.tenantId}`);
}

export async function createPlatformTenant(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const draftRunId = actionValue(formData, "draftRunId") || null;
  const input = parseOnboardingInput(formData);
  const result = await runPlatformTenantProvisioning(input, actor, draftRunId);

  revalidatePath("/platform");
  revalidatePath(`/platform/tenants/${result.tenantId}`);
  redirect(`/platform/tenants/${result.tenantId}`);
}
