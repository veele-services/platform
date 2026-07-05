import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "./index";
import { isPlatformHost, normalizeHost } from "./tenant-context";
import {
  modulesTable,
  organizationSettingsTable,
  planModulesTable,
  plansTable,
  rolePermissionsTable,
  rolesTable,
  sectorsTable,
  tenantDomainsTable,
  tenantFirstRunStateTable,
  tenantModulesTable,
  tenantOwnerInvitesTable,
  tenantProvisioningRunsTable,
  tenantRegionsTable,
  tenantRolePermissionsTable,
  tenantRolesTable,
  tenantSectorSettingsTable,
  tenantSectorsTable,
  tenantSubscriptionsTable,
  tenantUserRolesTable,
  tenantUsersTable,
  tenantsTable,
  TENANT_PLAN_KEYS,
  type TenantPlanKey,
  type TenantSectorPolicyMode,
} from "./schema";

const TENANT_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/u;
const OWNER_ROLE_NAMES = ["Management", "Owner", "Eigenaar", "Administration"] as const;
const DEFAULT_FIRST_RUN_STEPS = ["branding", "users", "sectors", "modules"] as const;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;
const DEFAULT_ORGANIZATION_SETTINGS = {
  betaaltermijnDagen: 30,
  availabilityAdvanceDays: 60,
  smtpEnabled: false,
  smtpEncryption: "starttls",
  emailTemplateBrandColor: "#081D3A",
  emailTemplateAccentColor: "#00B7B3",
  emailTemplateFooterText:
    "Dit is een automatisch bericht van Fieldgrid. U ontvangt dit bericht omdat u betrokken bent bij een aanvraag, opdracht, rapportage, factuur of portaalmelding.",
  emailTemplateSignature: "Met vriendelijke groet,\nFieldgrid",
  notifRapportGoedgekeurd: true,
  notifRapportAfgekeurd: true,
  notifOfferteVerstuurd: true,
  notifOfferteVerlopen: true,
  notifBetalingHerinnering: true,
  notifHerinneringDagen: 7,
} as const;

type DbExecutor = typeof db | any;
type ProvisioningSectorRow = { id: string };
type TemplateRolePermissionRow = { permissionId: string };

export type TenantProvisioningBrandingInput = {
  displayName?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  emailSignature?: string | null;
};

export type TenantProvisioningInput = {
  name: string;
  slug?: string | null;
  planKey?: TenantPlanKey | string | null;
  primaryDomain?: string | null;
  requestedBy: string;
  ownerEmail?: string | null;
  sectorIds?: string[];
  defaultSectorId?: string | null;
  sectorMode?: TenantSectorPolicyMode | null;
  moduleKeys?: string[];
  regionNames?: string[];
  branding?: TenantProvisioningBrandingInput | null;
  metadata?: Record<string, unknown> | null;
};

export type NormalizedTenantProvisioningInput = {
  name: string;
  slug: string;
  planKey: TenantPlanKey;
  primaryDomain: string;
  domainType: "fieldgrid_subdomain" | "custom_domain";
  domainVerificationStatus: "pending" | "verified";
  requestedBy: string;
  ownerEmail: string | null;
  sectorIds: string[];
  defaultSectorId: string | null;
  sectorMode: TenantSectorPolicyMode | null;
  moduleKeys: string[] | null;
  regionNames: string[];
  branding: {
    displayName: string | null;
    primaryColor: string | null;
    accentColor: string | null;
    emailSignature: string | null;
  };
  metadata: Record<string, unknown> | null;
};

export type TenantProvisioningResult = {
  tenantId: string;
  runId: string;
  slug: string;
  planKey: TenantPlanKey;
  primaryDomain: string;
  ownerEmail: string | null;
};

function uniqueValues(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeTenantProvisioningRegionName(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function uniqueRegionNames(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const value of values ?? []) {
    const name = value.trim().replace(/\s+/gu, " ").slice(0, 120);
    const normalized = normalizeTenantProvisioningRegionName(name);
    if (!name || seen.has(normalized)) continue;
    seen.add(normalized);
    names.push(name);
  }

  return names;
}

function normalizeOptionalColor(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return COLOR_PATTERN.test(trimmed) ? trimmed : null;
}

function normalizeProvisioningBranding(input: TenantProvisioningBrandingInput | null | undefined): NormalizedTenantProvisioningInput["branding"] {
  return {
    displayName: input?.displayName?.trim().slice(0, 200) || null,
    primaryColor: normalizeOptionalColor(input?.primaryColor),
    accentColor: normalizeOptionalColor(input?.accentColor),
    emailSignature: input?.emailSignature?.trim().slice(0, 2000) || null,
  };
}

export function normalizeTenantProvisioningSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

export function defaultTenantDomainForSlug(slug: string): string {
  return `${slug}.fieldgrid.nl`;
}

export function normalizeTenantProvisioningInput(
  input: TenantProvisioningInput,
): NormalizedTenantProvisioningInput {
  const name = input.name.trim();
  if (!name) throw new Error("Tenantnaam is verplicht.");

  const slug = normalizeTenantProvisioningSlug(input.slug || name);
  if (!TENANT_SLUG_PATTERN.test(slug)) {
    throw new Error("Slug moet 3-80 tekens zijn en alleen kleine letters, cijfers en koppeltekens bevatten.");
  }

  const planKey = TENANT_PLAN_KEYS.includes(input.planKey as TenantPlanKey)
    ? (input.planKey as TenantPlanKey)
    : "starter";
  const primaryDomain = normalizeHost(input.primaryDomain || defaultTenantDomainForSlug(slug));
  if (!primaryDomain) throw new Error("Primair domein is verplicht.");
  if (isPlatformHost(primaryDomain)) {
    throw new Error("Platformhosts kunnen niet aan een tenant worden gekoppeld.");
  }

  const ownerEmail = input.ownerEmail?.trim().toLowerCase() || null;
  const isFieldgridSubdomain = primaryDomain.endsWith(".fieldgrid.nl");

  return {
    name,
    slug,
    planKey,
    primaryDomain,
    domainType: isFieldgridSubdomain ? "fieldgrid_subdomain" : "custom_domain",
    domainVerificationStatus: isFieldgridSubdomain ? "verified" : "pending",
    requestedBy: input.requestedBy,
    ownerEmail,
    sectorIds: uniqueValues(input.sectorIds),
    defaultSectorId: input.defaultSectorId?.trim() || null,
    sectorMode: input.sectorMode === "single" || input.sectorMode === "multi" ? input.sectorMode : null,
    moduleKeys: input.moduleKeys ? uniqueValues(input.moduleKeys) : null,
    regionNames: uniqueRegionNames(input.regionNames),
    branding: normalizeProvisioningBranding(input.branding),
    metadata: input.metadata ?? null,
  };
}

export async function assertTenantProvisioningIsUnique(
  input: Pick<NormalizedTenantProvisioningInput, "slug" | "primaryDomain">,
): Promise<void> {
  const [duplicateSlug] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, input.slug))
    .limit(1);

  if (duplicateSlug) throw new Error("Er bestaat al een tenant met deze slug.");

  const [duplicateDomain] = await db
    .select({ id: tenantDomainsTable.id })
    .from(tenantDomainsTable)
    .where(eq(tenantDomainsTable.domain, input.primaryDomain))
    .limit(1);

  if (duplicateDomain) throw new Error("Dit domein is al gekoppeld aan een tenant.");
}

async function resolveProvisioningSectors(
  tx: DbExecutor,
  input: NormalizedTenantProvisioningInput,
): Promise<ProvisioningSectorRow[]> {
  if (input.sectorIds.length > 0) {
    return tx
      .select({ id: sectorsTable.id })
      .from(sectorsTable)
      .where(and(inArray(sectorsTable.id, input.sectorIds), eq(sectorsTable.isActive, true)))
      .orderBy(asc(sectorsTable.name));
  }

  return tx
    .select({ id: sectorsTable.id })
    .from(sectorsTable)
    .where(eq(sectorsTable.isActive, true))
    .orderBy(asc(sectorsTable.name));
}

async function copyTemplateRoles(tx: DbExecutor, tenantId: string): Promise<Map<string, string>> {
  const templateRoles = await tx
    .select({
      id: rolesTable.id,
      name: rolesTable.name,
      description: rolesTable.description,
      isSystem: rolesTable.isSystem,
    })
    .from(rolesTable)
    .where(eq(rolesTable.isSystem, true))
    .orderBy(asc(rolesTable.name));

  const tenantRoleIdByName = new Map<string, string>();
  for (const template of templateRoles) {
    const [tenantRole] = await tx
      .insert(tenantRolesTable)
      .values({
        tenantId,
        templateRoleId: template.id,
        name: template.name,
        description: template.description,
        isSystem: template.isSystem,
        isCustom: false,
      })
      .onConflictDoNothing()
      .returning({ id: tenantRolesTable.id });

    const roleId = tenantRole?.id;
    if (!roleId) continue;
    tenantRoleIdByName.set(template.name, roleId);

    const permissions = await tx
      .select({ permissionId: rolePermissionsTable.permissionId })
      .from(rolePermissionsTable)
      .where(eq(rolePermissionsTable.roleId, template.id));

    if (permissions.length > 0) {
      await tx
        .insert(tenantRolePermissionsTable)
        .values(
          permissions.map((permission: TemplateRolePermissionRow) => ({
            tenantRoleId: roleId,
            permissionId: permission.permissionId,
          })),
        )
        .onConflictDoNothing();
    }
  }

  return tenantRoleIdByName;
}

export async function provisionTenant(
  rawInput: TenantProvisioningInput,
): Promise<TenantProvisioningResult> {
  const input = normalizeTenantProvisioningInput(rawInput);
  await assertTenantProvisioningIsUnique(input);

  const [run] = await db
    .insert(tenantProvisioningRunsTable)
    .values({
      requestedBy: input.requestedBy,
      name: input.name,
      slug: input.slug,
      planKey: input.planKey,
      primaryDomain: input.primaryDomain,
      ownerEmail: input.ownerEmail,
      ownerInviteStatus: input.ownerEmail ? "pending" : "not_requested",
      status: "started",
      currentStep: "preflight",
      metadata: input.metadata,
    })
    .returning({ id: tenantProvisioningRunsTable.id });

  try {
    const result = await db.transaction(async (tx) => {
      await tx
        .update(tenantProvisioningRunsTable)
        .set({ currentStep: "tenant" })
        .where(eq(tenantProvisioningRunsTable.id, run.id));

      const [plan] = await tx
        .select({ id: plansTable.id, key: plansTable.key })
        .from(plansTable)
        .where(and(eq(plansTable.key, input.planKey), eq(plansTable.isActive, true)))
        .limit(1);

      if (!plan) throw new Error("Plan niet gevonden of inactief.");

      const [tenant] = await tx
        .insert(tenantsTable)
        .values({
          name: input.name,
          slug: input.slug,
          planKey: input.planKey,
          status: "trial",
          isActive: true,
          createdBy: input.requestedBy,
        })
        .returning({ id: tenantsTable.id });

      await tx
        .update(tenantProvisioningRunsTable)
        .set({ tenantId: tenant.id, currentStep: "configuration" })
        .where(eq(tenantProvisioningRunsTable.id, run.id));

      const organizationSettingsValues: typeof organizationSettingsTable.$inferInsert = {
        tenantId: tenant.id,
        naam: input.branding.displayName ?? input.name,
        ...DEFAULT_ORGANIZATION_SETTINGS,
        updatedAt: new Date(),
      };
      if (input.branding.primaryColor) organizationSettingsValues.emailTemplateBrandColor = input.branding.primaryColor;
      if (input.branding.accentColor) organizationSettingsValues.emailTemplateAccentColor = input.branding.accentColor;
      if (input.branding.emailSignature) organizationSettingsValues.emailTemplateSignature = input.branding.emailSignature;

      await tx.insert(organizationSettingsTable).values(organizationSettingsValues);

      await tx.insert(tenantDomainsTable).values({
        tenantId: tenant.id,
        domain: input.primaryDomain,
        type: input.domainType,
        isPrimary: true,
        verificationStatus: input.domainVerificationStatus,
        verifiedAt: input.domainVerificationStatus === "verified" ? new Date() : null,
      });

      await tx.insert(tenantSubscriptionsTable).values({
        tenantId: tenant.id,
        planId: plan.id,
        status: "trial",
        source: "manual",
        createdBy: input.requestedBy,
        currentPeriodStartsAt: new Date(),
      });

      const planModules = await tx
        .select({ moduleId: planModulesTable.moduleId })
        .from(planModulesTable)
        .where(and(eq(planModulesTable.planId, plan.id), eq(planModulesTable.isIncluded, true)));

      const selectedModuleIds = input.moduleKeys
        ? (await tx
            .select({ id: modulesTable.id })
            .from(modulesTable)
            .where(inArray(modulesTable.key, input.moduleKeys))).map((module) => module.id)
        : planModules.map((module) => module.moduleId);

      if (selectedModuleIds.length > 0) {
        await tx
          .insert(tenantModulesTable)
          .values(
            selectedModuleIds.map((moduleId) => ({
              tenantId: tenant.id,
              moduleId,
              isEnabled: true,
              source: "plan" as const,
              configuredBy: input.requestedBy,
              enabledAt: new Date(),
            })),
          )
          .onConflictDoNothing();
      }

      const sectors = await resolveProvisioningSectors(tx, input);
      const enabledSectorIds = sectors.map((sector: ProvisioningSectorRow) => sector.id);
      const defaultSectorId = input.defaultSectorId && enabledSectorIds.includes(input.defaultSectorId)
        ? input.defaultSectorId
        : enabledSectorIds[0] ?? null;
      const mode = input.sectorMode ?? (enabledSectorIds.length <= 1 ? "single" : "multi");

      if (enabledSectorIds.length > 0) {
        await tx
          .insert(tenantSectorsTable)
          .values(enabledSectorIds.map((sectorId: string) => ({ tenantId: tenant.id, sectorId, isEnabled: true })))
          .onConflictDoNothing();
      }

      await tx.insert(tenantSectorSettingsTable).values({
        tenantId: tenant.id,
        mode,
        maxSectors: mode === "single" ? 1 : null,
        defaultSectorId,
        enforceSectorScope: true,
      });

      if (input.regionNames.length > 0) {
        await tx
          .insert(tenantRegionsTable)
          .values(
            input.regionNames.map((name, index) => ({
              tenantId: tenant.id,
              name,
              normalizedName: normalizeTenantProvisioningRegionName(name),
              source: "manual" as const,
              sortOrder: index,
            })),
          )
          .onConflictDoNothing();
      }

      const tenantRoleIdByName = await copyTemplateRoles(tx, tenant.id);

      if (input.ownerEmail) {
        await tx.insert(tenantOwnerInvitesTable).values({
          tenantId: tenant.id,
          email: input.ownerEmail,
          status: "pending",
          invitedBy: input.requestedBy,
          metadata: { runId: run.id },
        });
      }

      await tx.insert(tenantFirstRunStateTable).values({
        tenantId: tenant.id,
        status: "pending",
        requiredSteps: [...DEFAULT_FIRST_RUN_STEPS],
        completedSteps: [],
      });

      await tx
        .update(tenantProvisioningRunsTable)
        .set({
          tenantId: tenant.id,
          status: "succeeded",
          currentStep: input.ownerEmail ? "owner_invite_pending" : "completed",
          metadata: {
            ...(input.metadata ?? {}),
            moduleCount: selectedModuleIds.length,
            sectorCount: enabledSectorIds.length,
            regionCount: input.regionNames.length,
            brandingSeeded: Boolean(
              input.branding.displayName ||
              input.branding.primaryColor ||
              input.branding.accentColor ||
              input.branding.emailSignature
            ),
            tenantRoleCount: tenantRoleIdByName.size,
          },
          completedAt: new Date(),
        })
        .where(eq(tenantProvisioningRunsTable.id, run.id));

      return {
        tenantId: tenant.id,
        runId: run.id,
        slug: input.slug,
        planKey: input.planKey,
        primaryDomain: input.primaryDomain,
        ownerEmail: input.ownerEmail,
      } satisfies TenantProvisioningResult;
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provisioning mislukt.";
    await db
      .update(tenantProvisioningRunsTable)
      .set({ status: "failed", currentStep: "failed", errorMessage: message, completedAt: new Date() })
      .where(eq(tenantProvisioningRunsTable.id, run.id));
    throw error;
  }
}

export async function completeProvisionedTenantOwnerInvite(input: {
  tenantId: string;
  runId: string;
  ownerEmail: string;
  ownerUserId: string;
  invitedBy: string;
}): Promise<void> {
  const email = input.ownerEmail.trim().toLowerCase();

  await db.transaction(async (tx) => {
    const [tenant] = await tx
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, input.tenantId))
      .limit(1);
    if (!tenant) throw new Error("Tenant niet gevonden voor owner invite.");

    await tx
      .insert(tenantUsersTable)
      .values({ tenantId: input.tenantId, userId: input.ownerUserId, role: "owner", status: "active" })
      .onConflictDoUpdate({
        target: [tenantUsersTable.tenantId, tenantUsersTable.userId],
        set: { role: "owner", status: "active", updatedAt: new Date() },
      });

    const tenantRoles = await tx
      .select({ id: tenantRolesTable.id, name: tenantRolesTable.name })
      .from(tenantRolesTable)
      .where(eq(tenantRolesTable.tenantId, input.tenantId));

    const ownerRole = OWNER_ROLE_NAMES.map((name) => tenantRoles.find((role) => role.name === name)).find(Boolean)
      ?? tenantRoles[0]
      ?? null;

    if (ownerRole) {
      await tx
        .insert(tenantUserRolesTable)
        .values({ tenantId: input.tenantId, userId: input.ownerUserId, tenantRoleId: ownerRole.id })
        .onConflictDoNothing();
    }

    await tx
      .insert(tenantOwnerInvitesTable)
      .values({
        tenantId: input.tenantId,
        email,
        userId: input.ownerUserId,
        status: "sent",
        invitedBy: input.invitedBy,
        inviteSentAt: new Date(),
        metadata: { runId: input.runId },
      })
      .onConflictDoUpdate({
        target: [tenantOwnerInvitesTable.tenantId, tenantOwnerInvitesTable.email],
        set: {
          userId: input.ownerUserId,
          status: "sent",
          invitedBy: input.invitedBy,
          inviteSentAt: new Date(),
          errorMessage: null,
          updatedAt: new Date(),
          metadata: { runId: input.runId },
        },
      });

    await tx
      .update(tenantProvisioningRunsTable)
      .set({
        ownerEmail: email,
        ownerUserId: input.ownerUserId,
        ownerInviteStatus: "sent",
        currentStep: "completed",
        updatedAt: new Date(),
      })
      .where(eq(tenantProvisioningRunsTable.id, input.runId));
  });
}

export async function rollbackProvisionedTenant(input: {
  tenantId: string;
  runId: string;
  requestedBy: string;
  reason: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [run] = await tx
      .select({ metadata: tenantProvisioningRunsTable.metadata })
      .from(tenantProvisioningRunsTable)
      .where(eq(tenantProvisioningRunsTable.id, input.runId))
      .limit(1);

    await tx
      .update(tenantOwnerInvitesTable)
      .set({ status: "rolled_back", rollbackAt: new Date(), errorMessage: input.reason, updatedAt: new Date() })
      .where(eq(tenantOwnerInvitesTable.tenantId, input.tenantId));

    await tx.delete(tenantsTable).where(eq(tenantsTable.id, input.tenantId));

    await tx
      .update(tenantProvisioningRunsTable)
      .set({
        tenantId: null,
        requestedBy: input.requestedBy,
        status: "rolled_back",
        currentStep: "rolled_back",
        ownerInviteStatus: "rolled_back",
        errorMessage: input.reason,
        metadata: {
          ...(run?.metadata ?? {}),
          rolledBackTenantId: input.tenantId,
          rollback: {
            tenantId: input.tenantId,
            reason: input.reason,
            requestedBy: input.requestedBy,
            rolledBackAt: new Date().toISOString(),
          },
        },
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tenantProvisioningRunsTable.id, input.runId));
  });
}
