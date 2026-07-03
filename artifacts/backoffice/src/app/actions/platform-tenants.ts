"use server";

import {
  db,
  assignmentsTable,
  customersTable,
  FIELDGRID_BRAND_DEFAULTS,
  getTenantBranding,
  getTenantPlanSnapshot,
  isPlatformHost,
  isTenantModuleEnabled,
  moduleDependenciesTable,
  modulesTable,
  normalizeHost,
  objectsTable,
  personnelTable,
  planLimitsTable,
  planModulesTable,
  plansTable,
  sectorsTable,
  supportAccessGrantsTable,
  tenantDomainsTable,
  tenantModulesTable,
  tenantSectorSettingsTable,
  tenantSectorsTable,
  tenantsTable,
  tenantSubscriptionsTable,
  tenantUsersTable,
  type TenantPlanKey,
  type TenantSectorPolicyMode,
  type TenantStatus,
} from "@workspace/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin, writeSupportAccessAuditLog } from "@/lib/auth/platform";
import type { ActionResult } from "./customers";

const TENANT_PLAN_KEYS = ["starter", "professional", "enterprise"] as const;
const DOMAIN_TYPES = ["subdomain", "custom"] as const;
const DOMAIN_VERIFICATION_STATUSES = ["pending", "verified", "failed"] as const;

export type PlatformTenantRow = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  status: TenantStatus;
  planKey: TenantPlanKey;
  userCount: number;
  primaryDomain: string | null;
  createdAt: string;
};

export type PlatformTenantUsage = {
  users: number;
  customers: number;
  objects: number;
  personnel: number;
  assignments: number;
  documents: number;
  storageBytes: number;
  domains: number;
  enabledModules: number;
  enabledSectors: number;
  activeSupportGrants: number;
};

export type PlatformTenantBrandingPreview = {
  displayName: string;
  platformName: string;
  plan: TenantPlanKey;
  customBrandingEnabled: boolean;
  customized: boolean;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  emailFooterText: string;
  emailSignature: string;
};

export type PlatformTenantFirstRunStep = {
  id: string;
  label: string;
  completed: boolean;
  detail: string;
};

export type PlatformTenantFirstRun = {
  completionPercent: number;
  completedSteps: number;
  totalSteps: number;
  steps: PlatformTenantFirstRunStep[];
};

export type PlatformTenantDetail = PlatformTenantRow & {
  suspendedAt: string | null;
  archivedAt: string | null;
  updatedAt: string;
  planName: string;
  planSource: string;
  usage: PlatformTenantUsage;
  brandingPreview: PlatformTenantBrandingPreview;
  firstRun: PlatformTenantFirstRun;
};

export type PlatformTenantDomainRow = {
  id: string;
  domain: string;
  type: string;
  isPrimary: boolean;
  verificationStatus: string;
  verifiedAt: string | null;
  createdAt: string;
};

export type PlatformPlanRow = {
  id: string;
  key: TenantPlanKey;
  name: string;
  description: string | null;
  isActive: boolean;
  isPublic: boolean;
  customRoles: boolean;
};

export type PlatformTenantModuleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  effectiveEnabled: boolean;
  tenantOverride: boolean | null;
  planIncluded: boolean | null;
  defaultEnabled: boolean;
  source: string | null;
  dependencyKeys: string[];
};

export type PlatformTenantSectorRow = {
  id: string;
  name: string;
  description: string | null;
  globallyActive: boolean;
  tenantEnabled: boolean;
  isDefault: boolean;
};

export type PlatformTenantSectorPolicy = {
  mode: TenantSectorPolicyMode;
  maxSectors: number | null;
  defaultSectorId: string | null;
  enforceSectorScope: boolean;
};

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizePlanKey(value: string): TenantPlanKey {
  return TENANT_PLAN_KEYS.includes(value as TenantPlanKey) ? (value as TenantPlanKey) : "starter";
}

function revalidatePlatformTenant(tenantId: string): void {
  revalidatePath("/platform");
  revalidatePath(`/platform/tenants/${tenantId}`);
}

function actionValue(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function booleanValue(formData: FormData, name: string): boolean {
  return formData.get(name) === "on" || formData.get(name) === "true";
}

function buildBrandingPreview(branding: Awaited<ReturnType<typeof getTenantBranding>>): PlatformTenantBrandingPreview {
  const customized =
    Boolean(branding.logoUrl) ||
    branding.primaryColor !== FIELDGRID_BRAND_DEFAULTS.primaryColor ||
    branding.accentColor !== FIELDGRID_BRAND_DEFAULTS.accentColor ||
    branding.emailFooterText !== FIELDGRID_BRAND_DEFAULTS.footerText ||
    branding.emailSignature !== FIELDGRID_BRAND_DEFAULTS.signature;

  return {
    displayName: branding.displayName,
    platformName: branding.platformName,
    plan: branding.plan,
    customBrandingEnabled: branding.customBrandingEnabled,
    customized,
    logoUrl: branding.logoUrl,
    primaryColor: branding.primaryColor,
    accentColor: branding.accentColor,
    emailFooterText: branding.emailFooterText,
    emailSignature: branding.emailSignature,
  };
}

function buildFirstRunStatus(input: {
  primaryDomain: string | null;
  usage: PlatformTenantUsage;
  brandingPreview: PlatformTenantBrandingPreview;
}): PlatformTenantFirstRun {
  const steps: PlatformTenantFirstRunStep[] = [
    {
      id: "domain",
      label: "Domein gekoppeld",
      completed: Boolean(input.primaryDomain) || input.usage.domains > 0,
      detail: input.primaryDomain ?? (input.usage.domains > 0 ? "Domein aanwezig, nog geen geverifieerd primair domein." : "Koppel of verifieer een tenantdomein."),
    },
    {
      id: "owner",
      label: "Owner actief",
      completed: input.usage.users > 0,
      detail: input.usage.users > 0 ? `${input.usage.users} actieve gebruiker(s).` : "Nodig de tenant-owner uit.",
    },
    {
      id: "modules",
      label: "Modules ingesteld",
      completed: input.usage.enabledModules > 0,
      detail: input.usage.enabledModules > 0 ? `${input.usage.enabledModules} module(s) actief.` : "Zet de eerste modules aan.",
    },
    {
      id: "sectors",
      label: "Sectoren ingesteld",
      completed: input.usage.enabledSectors > 0,
      detail: input.usage.enabledSectors > 0 ? `${input.usage.enabledSectors} sector(en) actief.` : "Kies tenantsectoren en defaultbeleid.",
    },
    {
      id: "branding",
      label: "Branding beoordeeld",
      completed: input.brandingPreview.customBrandingEnabled ? input.brandingPreview.customized : true,
      detail: input.brandingPreview.customBrandingEnabled
        ? input.brandingPreview.customized
          ? "Custom branding is ingesteld."
          : "Professional/Enterprise tenant kan branding nog personaliseren."
        : "Starter gebruikt Fieldgrid branding.",
    },
    {
      id: "first-data",
      label: "Eerste data aanwezig",
      completed: input.usage.customers + input.usage.objects + input.usage.personnel + input.usage.assignments > 0,
      detail: "Controleer eerste klant, object, medewerker of opdracht.",
    },
  ];

  const completedSteps = steps.filter((step) => step.completed).length;
  return {
    completionPercent: Math.round((completedSteps / steps.length) * 100),
    completedSteps,
    totalSteps: steps.length,
    steps,
  };
}

async function auditPlatformTenantAction(input: {
  tenantId: string;
  action: string;
  resource?: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await writeSupportAccessAuditLog({
    tenantId: input.tenantId,
    action: input.action,
    resource: input.resource ?? "tenants",
    resourceId: input.resourceId ?? input.tenantId,
    metadata: input.metadata ?? null,
  });
}

async function assertTenantExists(tenantId: string): Promise<void> {
  const [tenant] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  if (!tenant) throw new Error("Tenant niet gevonden.");
}

async function countTenantSectorUsage(tenantId: string, sectorId: string): Promise<number> {
  const [usage] = await db
    .select({
      total: sql<number>`(
        (SELECT count(*) FROM ${customersTable} WHERE ${customersTable.tenantId} = ${tenantId}::uuid AND ${customersTable.sectorId} = ${sectorId}::uuid) +
        (SELECT count(*) FROM ${objectsTable} WHERE ${objectsTable.tenantId} = ${tenantId}::uuid AND ${objectsTable.sectorId} = ${sectorId}::uuid) +
        (SELECT count(*) FROM ${personnelTable} WHERE ${personnelTable.tenantId} = ${tenantId}::uuid AND ${personnelTable.sectorId} = ${sectorId}::uuid)
      )::int`,
    })
    .from(tenantSectorsTable)
    .where(and(eq(tenantSectorsTable.tenantId, tenantId), eq(tenantSectorsTable.sectorId, sectorId)))
    .limit(1);

  return Number(usage?.total ?? 0);
}

export async function listPlatformTenants(): Promise<PlatformTenantRow[]> {
  await requirePlatformAdmin();

  const rows = await db
    .select({
      id: tenantsTable.id,
      slug: tenantsTable.slug,
      name: tenantsTable.name,
      isActive: tenantsTable.isActive,
      status: tenantsTable.status,
      planKey: tenantsTable.planKey,
      createdAt: tenantsTable.createdAt,
      userCount: sql<number>`(
        SELECT COUNT(*)
        FROM tenant_users tu
        WHERE tu.tenant_id = ${tenantsTable.id}
          AND tu.status = 'active'
      )::int`,
      primaryDomain: sql<string | null>`(
        SELECT td.domain
        FROM tenant_domains td
        WHERE td.tenant_id = ${tenantsTable.id}
          AND td.type <> 'platform_reserved'
          AND td.verification_status = 'verified'
        ORDER BY td.is_primary DESC, td.created_at ASC
        LIMIT 1
      )`,
    })
    .from(tenantsTable)
    .orderBy(asc(tenantsTable.name));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getPlatformTenantDetail(tenantId: string): Promise<PlatformTenantDetail | null> {
  await requirePlatformAdmin();

  const [tenant] = await db
    .select({
      id: tenantsTable.id,
      slug: tenantsTable.slug,
      name: tenantsTable.name,
      isActive: tenantsTable.isActive,
      status: tenantsTable.status,
      planKey: tenantsTable.planKey,
      suspendedAt: tenantsTable.suspendedAt,
      archivedAt: tenantsTable.archivedAt,
      createdAt: tenantsTable.createdAt,
      updatedAt: tenantsTable.updatedAt,
      userCount: sql<number>`(
        SELECT COUNT(*) FROM tenant_users tu
        WHERE tu.tenant_id = ${tenantsTable.id}
          AND tu.status = 'active'
      )::int`,
      primaryDomain: sql<string | null>`(
        SELECT td.domain FROM tenant_domains td
        WHERE td.tenant_id = ${tenantsTable.id}
          AND td.type <> 'platform_reserved'
          AND td.verification_status = 'verified'
        ORDER BY td.is_primary DESC, td.created_at ASC
        LIMIT 1
      )`,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  if (!tenant) return null;

  const [usage, plan, branding] = await Promise.all([
    getPlatformTenantUsage(tenantId),
    getTenantPlanSnapshot(tenantId),
    getTenantBranding(tenantId),
  ]);
  const brandingPreview = buildBrandingPreview(branding);

  return {
    ...tenant,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
    suspendedAt: tenant.suspendedAt?.toISOString() ?? null,
    archivedAt: tenant.archivedAt?.toISOString() ?? null,
    usage,
    planName: plan.planName,
    planSource: plan.source,
    brandingPreview,
    firstRun: buildFirstRunStatus({ primaryDomain: tenant.primaryDomain, usage, brandingPreview }),
  };
}

export async function getPlatformTenantUsage(tenantId: string): Promise<PlatformTenantUsage> {
  await requirePlatformAdmin();

  const [usage] = await db
    .select({
      users: sql<number>`(SELECT count(*) FROM tenant_users WHERE tenant_id = ${tenantId}::uuid AND status = 'active')::int`,
      customers: sql<number>`(SELECT count(*) FROM customers WHERE tenant_id = ${tenantId}::uuid)::int`,
      objects: sql<number>`(SELECT count(*) FROM objects WHERE tenant_id = ${tenantId}::uuid)::int`,
      personnel: sql<number>`(SELECT count(*) FROM personnel WHERE tenant_id = ${tenantId}::uuid)::int`,
      assignments: sql<number>`(SELECT count(*) FROM assignments WHERE tenant_id = ${tenantId}::uuid)::int`,
      documents: sql<number>`(SELECT count(*) FROM documents WHERE tenant_id = ${tenantId}::uuid)::int`,
      storageBytes: sql<number>`COALESCE((SELECT sum(size_bytes) FROM documents WHERE tenant_id = ${tenantId}::uuid), 0)::bigint`,
      domains: sql<number>`(SELECT count(*) FROM tenant_domains WHERE tenant_id = ${tenantId}::uuid AND type <> 'platform_reserved')::int`,
      enabledModules: sql<number>`(SELECT count(*) FROM tenant_modules WHERE tenant_id = ${tenantId}::uuid AND is_enabled = true)::int`,
      enabledSectors: sql<number>`(SELECT count(*) FROM tenant_sectors WHERE tenant_id = ${tenantId}::uuid AND is_enabled = true)::int`,
      activeSupportGrants: sql<number>`(
        SELECT count(*) FROM support_access_grants
        WHERE tenant_id = ${tenantId}::uuid
          AND revoked_at IS NULL
          AND starts_at <= now()
          AND expires_at > now()
      )::int`,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  return {
    users: Number(usage?.users ?? 0),
    customers: Number(usage?.customers ?? 0),
    objects: Number(usage?.objects ?? 0),
    personnel: Number(usage?.personnel ?? 0),
    assignments: Number(usage?.assignments ?? 0),
    documents: Number(usage?.documents ?? 0),
    storageBytes: Number(usage?.storageBytes ?? 0),
    domains: Number(usage?.domains ?? 0),
    enabledModules: Number(usage?.enabledModules ?? 0),
    enabledSectors: Number(usage?.enabledSectors ?? 0),
    activeSupportGrants: Number(usage?.activeSupportGrants ?? 0),
  };
}

export async function listPlatformPlans(): Promise<PlatformPlanRow[]> {
  await requirePlatformAdmin();

  const rows = await db
    .select({
      id: plansTable.id,
      key: plansTable.key,
      name: plansTable.name,
      description: plansTable.description,
      isActive: plansTable.isActive,
      isPublic: plansTable.isPublic,
      customRoles: sql<boolean>`COALESCE((
        SELECT pl.is_enabled FROM plan_limits pl
        WHERE pl.plan_id = ${plansTable.id}
          AND pl.key = 'custom_roles'
        LIMIT 1
      ), ${plansTable.key} IN ('professional', 'enterprise'))`,
    })
    .from(plansTable)
    .orderBy(asc(plansTable.sortOrder), asc(plansTable.name));

  return rows;
}

export async function listPlatformTenantDomains(tenantId: string): Promise<PlatformTenantDomainRow[]> {
  await requirePlatformAdmin();

  const rows = await db
    .select({
      id: tenantDomainsTable.id,
      domain: tenantDomainsTable.domain,
      type: tenantDomainsTable.type,
      isPrimary: tenantDomainsTable.isPrimary,
      verificationStatus: tenantDomainsTable.verificationStatus,
      verifiedAt: tenantDomainsTable.verifiedAt,
      createdAt: tenantDomainsTable.createdAt,
    })
    .from(tenantDomainsTable)
    .where(eq(tenantDomainsTable.tenantId, tenantId))
    .orderBy(desc(tenantDomainsTable.isPrimary), asc(tenantDomainsTable.domain));

  return rows.map((row) => ({
    ...row,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function listPlatformTenantModules(tenantId: string): Promise<PlatformTenantModuleRow[]> {
  await requirePlatformAdmin();

  const [modules, overrides, plan, dependencies] = await Promise.all([
    db.select().from(modulesTable).orderBy(asc(modulesTable.category), asc(modulesTable.name)),
    db.select().from(tenantModulesTable).where(eq(tenantModulesTable.tenantId, tenantId)),
    getTenantPlanSnapshot(tenantId),
    db
      .select({
        moduleId: moduleDependenciesTable.moduleId,
        dependencyKey: modulesTable.key,
      })
      .from(moduleDependenciesTable)
      .innerJoin(modulesTable, eq(moduleDependenciesTable.dependsOnModuleId, modulesTable.id)),
  ]);

  const planModules = plan.planId
    ? await db
        .select({ moduleId: planModulesTable.moduleId, isIncluded: planModulesTable.isIncluded })
        .from(planModulesTable)
        .where(eq(planModulesTable.planId, plan.planId))
    : [];

  const overrideByModuleId = new Map(overrides.map((entry) => [entry.moduleId, entry]));
  const planByModuleId = new Map(planModules.map((entry) => [entry.moduleId, entry]));
  const dependencyKeysByModuleId = new Map<string, string[]>();
  for (const dependency of dependencies) {
    const keys = dependencyKeysByModuleId.get(dependency.moduleId) ?? [];
    keys.push(dependency.dependencyKey);
    dependencyKeysByModuleId.set(dependency.moduleId, keys);
  }

  return modules.map((module) => {
    const override = overrideByModuleId.get(module.id);
    const planModule = planByModuleId.get(module.id);
    return {
      id: module.id,
      key: module.key,
      name: module.name,
      description: module.description,
      category: module.category,
      effectiveEnabled: override?.isEnabled ?? planModule?.isIncluded ?? module.isEnabledByDefault,
      tenantOverride: override?.isEnabled ?? null,
      planIncluded: planModule?.isIncluded ?? null,
      defaultEnabled: module.isEnabledByDefault,
      source: override?.source ?? null,
      dependencyKeys: dependencyKeysByModuleId.get(module.id) ?? [],
    };
  });
}

export async function listPlatformTenantSectors(tenantId: string): Promise<{
  sectors: PlatformTenantSectorRow[];
  policy: PlatformTenantSectorPolicy;
}> {
  await requirePlatformAdmin();

  const [sectors, tenantSectors, settings] = await Promise.all([
    db.select().from(sectorsTable).orderBy(asc(sectorsTable.name)),
    db.select().from(tenantSectorsTable).where(eq(tenantSectorsTable.tenantId, tenantId)),
    db
      .select()
      .from(tenantSectorSettingsTable)
      .where(eq(tenantSectorSettingsTable.tenantId, tenantId))
      .limit(1),
  ]);

  const tenantSectorBySectorId = new Map(tenantSectors.map((entry) => [entry.sectorId, entry]));
  const enabledIds = tenantSectors.filter((entry) => entry.isEnabled).map((entry) => entry.sectorId);
  const policy: PlatformTenantSectorPolicy = settings[0]
    ? {
        mode: settings[0].mode,
        maxSectors: settings[0].maxSectors,
        defaultSectorId: settings[0].defaultSectorId,
        enforceSectorScope: settings[0].enforceSectorScope,
      }
    : {
        mode: enabledIds.length === 1 ? "single" : "multi",
        maxSectors: enabledIds.length === 1 ? 1 : null,
        defaultSectorId: enabledIds.length === 1 ? enabledIds[0] ?? null : null,
        enforceSectorScope: true,
      };

  return {
    policy,
    sectors: sectors.map((sector) => {
      const tenantSector = tenantSectorBySectorId.get(sector.id);
      return {
        id: sector.id,
        name: sector.name,
        description: sector.description,
        globallyActive: sector.isActive,
        tenantEnabled: tenantSector?.isEnabled ?? false,
        isDefault: policy.defaultSectorId === sector.id,
      };
    }),
  };
}

export async function createPlatformTenant(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const name = actionValue(formData, "name");
  const slug = normalizeSlug(actionValue(formData, "slug") || name);
  const planKey = normalizePlanKey(actionValue(formData, "planKey"));
  const domain = normalizeHost(actionValue(formData, "domain"));

  if (!name) throw new Error("Tenantnaam is verplicht.");
  if (!slug || !/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(slug)) {
    throw new Error("Slug moet 3-80 tekens zijn en alleen kleine letters, cijfers en koppeltekens bevatten.");
  }
  if (domain && isPlatformHost(domain)) {
    throw new Error("Platformhosts kunnen niet aan een tenant worden gekoppeld.");
  }

  const [created] = await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenantsTable)
      .values({ name, slug, planKey, status: "trial", isActive: true, createdBy: actor.userId })
      .returning({ id: tenantsTable.id });

    await tx.insert(tenantSectorSettingsTable).values({ tenantId: tenant.id }).onConflictDoNothing();

    const [plan] = await tx
      .select({ id: plansTable.id })
      .from(plansTable)
      .where(and(eq(plansTable.key, planKey), eq(plansTable.isActive, true)))
      .limit(1);

    if (plan) {
      await tx.insert(tenantSubscriptionsTable).values({
        tenantId: tenant.id,
        planId: plan.id,
        status: "trial",
        source: "manual",
        createdBy: actor.userId,
        currentPeriodStartsAt: new Date(),
      });
    }

    if (domain) {
      await tx.insert(tenantDomainsTable).values({
        tenantId: tenant.id,
        domain,
        type: "subdomain",
        isPrimary: true,
        verificationStatus: "pending",
      });
    }

    return [tenant];
  });

  await auditPlatformTenantAction({
    tenantId: created.id,
    action: "tenant_created",
    metadata: { name, slug, planKey, domain: domain || null },
  });

  revalidatePlatformTenant(created.id);
  redirect(`/platform/tenants/${created.id}`);
}

export async function updatePlatformTenantLifecycle(formData: FormData): Promise<ActionResult> {
  const actor = await requirePlatformAdmin();
  const tenantId = actionValue(formData, "tenantId");
  const lifecycleAction = actionValue(formData, "lifecycleAction");
  const now = new Date();

  if (!tenantId) return { success: false, message: "Tenant is verplicht." };

  if (lifecycleAction === "suspend") {
    await db
      .update(tenantsTable)
      .set({ status: "suspended", isActive: false, suspendedAt: now, suspendedBy: actor.userId, updatedAt: now })
      .where(eq(tenantsTable.id, tenantId));
  } else if (lifecycleAction === "reactivate") {
    await db
      .update(tenantsTable)
      .set({ status: "active", isActive: true, suspendedAt: null, suspendedBy: null, updatedAt: now })
      .where(eq(tenantsTable.id, tenantId));
  } else if (lifecycleAction === "archive") {
    await db
      .update(tenantsTable)
      .set({ status: "archived", isActive: false, archivedAt: now, archivedBy: actor.userId, updatedAt: now })
      .where(eq(tenantsTable.id, tenantId));
  } else {
    return { success: false, message: "Onbekende lifecycle-actie." };
  }

  await auditPlatformTenantAction({ tenantId, action: `tenant_${lifecycleAction}` });
  revalidatePlatformTenant(tenantId);
  return { success: true };
}

export async function updatePlatformTenantPlan(formData: FormData): Promise<ActionResult> {
  const actor = await requirePlatformAdmin();
  const tenantId = actionValue(formData, "tenantId");
  const planKey = normalizePlanKey(actionValue(formData, "planKey"));

  if (!tenantId) return { success: false, message: "Tenant is verplicht." };

  const [plan] = await db
    .select({ id: plansTable.id })
    .from(plansTable)
    .where(and(eq(plansTable.key, planKey), eq(plansTable.isActive, true)))
    .limit(1);

  if (!plan) return { success: false, message: "Plan niet gevonden of inactief." };

  await db.transaction(async (tx) => {
    await tx.update(tenantsTable).set({ planKey, updatedAt: new Date() }).where(eq(tenantsTable.id, tenantId));
    await tx
      .update(tenantSubscriptionsTable)
      .set({ status: "canceled", canceledAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(tenantSubscriptionsTable.tenantId, tenantId),
          inArray(tenantSubscriptionsTable.status, ["trial", "active"]),
        ),
      );
    await tx.insert(tenantSubscriptionsTable).values({
      tenantId,
      planId: plan.id,
      status: "active",
      source: "manual",
      createdBy: actor.userId,
      currentPeriodStartsAt: new Date(),
    });
  });

  await auditPlatformTenantAction({ tenantId, action: "tenant_plan_updated", metadata: { planKey } });
  revalidatePlatformTenant(tenantId);
  return { success: true };
}

export async function addPlatformTenantDomain(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();
  const tenantId = actionValue(formData, "tenantId");
  const domain = normalizeHost(actionValue(formData, "domain"));
  const type = DOMAIN_TYPES.includes(actionValue(formData, "type") as typeof DOMAIN_TYPES[number])
    ? actionValue(formData, "type")
    : "custom";
  const verificationStatus = DOMAIN_VERIFICATION_STATUSES.includes(actionValue(formData, "verificationStatus") as typeof DOMAIN_VERIFICATION_STATUSES[number])
    ? actionValue(formData, "verificationStatus")
    : "pending";
  const isPrimary = booleanValue(formData, "isPrimary");

  if (!tenantId || !domain) return { success: false, message: "Tenant en domein zijn verplicht." };
  if (isPlatformHost(domain)) return { success: false, message: "Platformhost kan niet aan een tenant worden gekoppeld." };

  try {
    await db.transaction(async (tx) => {
      if (isPrimary) {
        await tx.update(tenantDomainsTable).set({ isPrimary: false }).where(eq(tenantDomainsTable.tenantId, tenantId));
      }

      await tx.insert(tenantDomainsTable).values({
        tenantId,
        domain,
        type,
        isPrimary,
        verificationStatus,
        verifiedAt: verificationStatus === "verified" ? new Date() : null,
      });
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      return { success: false, message: "Dit domein is al gekoppeld." };
    }
    throw error;
  }

  await auditPlatformTenantAction({ tenantId, action: "tenant_domain_added", resource: "tenant_domains", metadata: { domain, type, verificationStatus, isPrimary } });
  revalidatePlatformTenant(tenantId);
  return { success: true };
}

export async function updatePlatformTenantDomain(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();
  const tenantId = actionValue(formData, "tenantId");
  const domainId = actionValue(formData, "domainId");
  const domainAction = actionValue(formData, "domainAction");

  if (!tenantId || !domainId) return { success: false, message: "Tenant en domein zijn verplicht." };

  const [domain] = await db
    .select({ id: tenantDomainsTable.id, type: tenantDomainsTable.type })
    .from(tenantDomainsTable)
    .where(and(eq(tenantDomainsTable.id, domainId), eq(tenantDomainsTable.tenantId, tenantId)))
    .limit(1);

  if (!domain) return { success: false, message: "Domein niet gevonden." };
  if (domain.type === "platform_reserved") return { success: false, message: "Platformdomeinen kunnen hier niet worden gewijzigd." };

  if (domainAction === "verify") {
    await db
      .update(tenantDomainsTable)
      .set({ verificationStatus: "verified", verifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(tenantDomainsTable.id, domainId));
  } else if (domainAction === "primary") {
    await db.transaction(async (tx) => {
      await tx.update(tenantDomainsTable).set({ isPrimary: false }).where(eq(tenantDomainsTable.tenantId, tenantId));
      await tx.update(tenantDomainsTable).set({ isPrimary: true, updatedAt: new Date() }).where(eq(tenantDomainsTable.id, domainId));
    });
  } else if (domainAction === "remove") {
    await db.delete(tenantDomainsTable).where(eq(tenantDomainsTable.id, domainId));
  } else {
    return { success: false, message: "Onbekende domeinactie." };
  }

  await auditPlatformTenantAction({ tenantId, action: `tenant_domain_${domainAction}`, resource: "tenant_domains", resourceId: domainId });
  revalidatePlatformTenant(tenantId);
  return { success: true };
}

export async function updatePlatformTenantModule(formData: FormData): Promise<ActionResult> {
  const actor = await requirePlatformAdmin();
  const tenantId = actionValue(formData, "tenantId");
  const moduleId = actionValue(formData, "moduleId");
  const enabled = actionValue(formData, "enabled") === "true";

  if (!tenantId || !moduleId) return { success: false, message: "Tenant en module zijn verplicht." };

  const [module] = await db.select().from(modulesTable).where(eq(modulesTable.id, moduleId)).limit(1);
  if (!module) return { success: false, message: "Module niet gevonden." };

  if (enabled) {
    const dependencies = await db
      .select({ dependencyKey: modulesTable.key })
      .from(moduleDependenciesTable)
      .innerJoin(modulesTable, eq(moduleDependenciesTable.dependsOnModuleId, modulesTable.id))
      .where(eq(moduleDependenciesTable.moduleId, moduleId));

    for (const dependency of dependencies) {
      if (!(await isTenantModuleEnabled(tenantId, dependency.dependencyKey))) {
        return {
          success: false,
          message: `Module ${module.key} vereist eerst module ${dependency.dependencyKey}.`,
        };
      }
    }
  } else {
    const dependents = await db
      .select({ dependentKey: modulesTable.key })
      .from(moduleDependenciesTable)
      .innerJoin(modulesTable, eq(moduleDependenciesTable.moduleId, modulesTable.id))
      .where(eq(moduleDependenciesTable.dependsOnModuleId, moduleId));

    for (const dependent of dependents) {
      if (await isTenantModuleEnabled(tenantId, dependent.dependentKey)) {
        return {
          success: false,
          message: `Module ${module.key} kan niet uit zolang ${dependent.dependentKey} aan staat.`,
        };
      }
    }
  }

  await db
    .insert(tenantModulesTable)
    .values({
      tenantId,
      moduleId,
      isEnabled: enabled,
      source: "manual",
      configuredBy: actor.userId,
      enabledAt: enabled ? new Date() : null,
      disabledAt: enabled ? null : new Date(),
    })
    .onConflictDoUpdate({
      target: [tenantModulesTable.tenantId, tenantModulesTable.moduleId],
      set: {
        isEnabled: enabled,
        source: "manual",
        configuredBy: actor.userId,
        enabledAt: enabled ? new Date() : null,
        disabledAt: enabled ? null : new Date(),
        updatedAt: new Date(),
      },
    });

  await auditPlatformTenantAction({ tenantId, action: enabled ? "tenant_module_enabled" : "tenant_module_disabled", resource: "tenant_modules", resourceId: moduleId, metadata: { moduleKey: module.key } });
  revalidatePlatformTenant(tenantId);
  return { success: true };
}

export async function updatePlatformTenantSector(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();
  const tenantId = actionValue(formData, "tenantId");
  const sectorId = actionValue(formData, "sectorId");
  const enabled = actionValue(formData, "enabled") === "true";

  if (!tenantId || !sectorId) return { success: false, message: "Tenant en sector zijn verplicht." };

  const [sector] = await db.select().from(sectorsTable).where(eq(sectorsTable.id, sectorId)).limit(1);
  if (!sector) return { success: false, message: "Sector niet gevonden." };
  if (!sector.isActive && enabled) return { success: false, message: "Inactieve globale sector kan niet worden ingeschakeld." };

  if (!enabled) {
    const [policy] = await db
      .select({ defaultSectorId: tenantSectorSettingsTable.defaultSectorId })
      .from(tenantSectorSettingsTable)
      .where(eq(tenantSectorSettingsTable.tenantId, tenantId))
      .limit(1);

    if (policy?.defaultSectorId === sectorId) {
      return { success: false, message: "Kies eerst een andere defaultsector." };
    }

    const usageCount = await countTenantSectorUsage(tenantId, sectorId);
    if (usageCount > 0) {
      return { success: false, message: "Sector is nog in gebruik en kan niet worden uitgeschakeld." };
    }
  }

  try {
    await db
      .insert(tenantSectorsTable)
      .values({ tenantId, sectorId, isEnabled: enabled })
      .onConflictDoUpdate({
        target: [tenantSectorsTable.tenantId, tenantSectorsTable.sectorId],
        set: { isEnabled: enabled, updatedAt: new Date() },
      });
  } catch (error) {
    if ((error as { code?: string })?.code === "23514") {
      return { success: false, message: "Sectorbeleid staat deze wijziging niet toe." };
    }
    throw error;
  }

  await auditPlatformTenantAction({ tenantId, action: enabled ? "tenant_sector_enabled" : "tenant_sector_disabled", resource: "tenant_sectors", resourceId: sectorId });
  revalidatePlatformTenant(tenantId);
  return { success: true };
}

export async function updatePlatformTenantSectorPolicy(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();
  const tenantId = actionValue(formData, "tenantId");
  const mode = actionValue(formData, "mode") === "single" ? "single" : "multi";
  const defaultSectorId = actionValue(formData, "defaultSectorId") || null;
  const maxSectorsRaw = actionValue(formData, "maxSectors");
  const maxSectors = mode === "single" ? 1 : maxSectorsRaw ? Number.parseInt(maxSectorsRaw, 10) : null;
  const enforceSectorScope = booleanValue(formData, "enforceSectorScope");

  if (!tenantId) return { success: false, message: "Tenant is verplicht." };
  if (maxSectors !== null && (!Number.isFinite(maxSectors) || maxSectors < 1)) {
    return { success: false, message: "Maximum sectoren moet minimaal 1 zijn." };
  }

  if (defaultSectorId) {
    const [defaultSector] = await db
      .select({ sectorId: tenantSectorsTable.sectorId })
      .from(tenantSectorsTable)
      .where(
        and(
          eq(tenantSectorsTable.tenantId, tenantId),
          eq(tenantSectorsTable.sectorId, defaultSectorId),
          eq(tenantSectorsTable.isEnabled, true),
        ),
      )
      .limit(1);

    if (!defaultSector) return { success: false, message: "Defaultsector moet actief zijn voor deze tenant." };
  }

  await db
    .insert(tenantSectorSettingsTable)
    .values({ tenantId, mode, maxSectors, defaultSectorId, enforceSectorScope })
    .onConflictDoUpdate({
      target: tenantSectorSettingsTable.tenantId,
      set: { mode, maxSectors, defaultSectorId, enforceSectorScope, updatedAt: new Date() },
    });

  await auditPlatformTenantAction({ tenantId, action: "tenant_sector_policy_updated", resource: "tenant_sector_settings", resourceId: tenantId, metadata: { mode, maxSectors, defaultSectorId, enforceSectorScope } });
  revalidatePlatformTenant(tenantId);
  return { success: true };
}
