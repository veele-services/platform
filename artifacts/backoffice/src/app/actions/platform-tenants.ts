"use server";

import {
  auditLogTable,
  db,
  assignmentsTable,
  customersTable,
  documentsTable,
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
  supportAccessAuditLogTable,
  supportAccessGrantsTable,
  tenantDomainsTable,
  tenantModulesTable,
  tenantOwnerInvitesTable,
  tenantRegionsTable,
  tenantSectorSettingsTable,
  tenantSectorsTable,
  tenantsTable,
  tenantSubscriptionsTable,
  tenantUsersTable,
  type TenantPlanKey,
  type TenantSectorPolicyMode,
  type TenantStatus,
} from "@workspace/db";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin, writeSupportAccessAuditLog } from "@/lib/auth/platform";
import type { ActionResult } from "./customers";

const TENANT_PLAN_KEYS = ["starter", "professional", "enterprise"] as const;
const TENANT_STATUS_FILTERS = ["provisioning", "trial", "active", "suspended", "archived"] as const;
const DOMAIN_TYPES = ["subdomain", "custom"] as const;
const DOMAIN_VERIFICATION_STATUSES = ["pending", "verified", "failed"] as const;
const TENANT_LIST_DOMAIN_STATUSES = ["missing", "pending", "verified", "failed"] as const;
const TENANT_LIST_READINESS_STATUSES = ["ready", "warning", "blocked"] as const;

export type PlatformTenantListDomainStatus = (typeof TENANT_LIST_DOMAIN_STATUSES)[number];
export type PlatformTenantListReadinessStatus = (typeof TENANT_LIST_READINESS_STATUSES)[number];

export type PlatformTenantListFilters = {
  q?: string;
  status?: TenantStatus | "all";
  plan?: TenantPlanKey | "all";
  module?: string;
  sector?: string;
  region?: string;
  domainStatus?: PlatformTenantListDomainStatus | "all";
  readiness?: PlatformTenantListReadinessStatus | "all";
  page?: number;
  pageSize?: number;
};

export type PlatformTenantListFacetOption = {
  value: string;
  label: string;
};

export type PlatformTenantListRow = PlatformTenantRow & {
  ownerEmail: string | null;
  ownerStatus: string | null;
  domainStatus: PlatformTenantListDomainStatus;
  readinessStatus: PlatformTenantListReadinessStatus;
  enabledModules: number;
  moduleSummary: string | null;
  enabledSectors: number;
  sectorSummary: string | null;
  activeRegions: number;
  regionSummary: string | null;
  latestActivityAt: string;
  subscriptionStatus: string | null;
  openActions: string[];
};

export type PlatformTenantListResult = {
  rows: PlatformTenantListRow[];
  facets: {
    statuses: PlatformTenantListFacetOption[];
    plans: PlatformTenantListFacetOption[];
    modules: PlatformTenantListFacetOption[];
    sectors: PlatformTenantListFacetOption[];
    regions: PlatformTenantListFacetOption[];
    domainStatuses: PlatformTenantListFacetOption[];
    readinessStatuses: PlatformTenantListFacetOption[];
  };
  filters: Required<Pick<PlatformTenantListFilters, "q" | "status" | "plan" | "module" | "sector" | "region" | "domainStatus" | "readiness" | "page" | "pageSize">>;
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

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
  downloadAuditEvents: number;
  pdfAuditEvents: number;
  domains: number;
  enabledModules: number;
  enabledSectors: number;
  activeRegions: number;
  activeSupportGrants: number;
  tenantPrefixedDocuments: number;
  legacyDocumentPaths: number;
  auditEvents: number;
  supportAuditEvents: number;
  migrationHistoryTables: number;
};

export type PlatformTenantUsageLimit = {
  key: string;
  description: string | null;
  isEnabled: boolean;
  limitValue: number | null;
};

export type PlatformTenantBrandingSurfacePreview = {
  surface: "Backoffice" | "Klantportaal" | "Personeelsapp" | "E-mail" | "PDF";
  headline: string;
  body: string;
  primaryColor: string;
  accentColor: string;
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
  surfaces: PlatformTenantBrandingSurfacePreview[];
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

export type PlatformTenantReadinessStatus = "ready" | "warning" | "blocked";

export type PlatformTenantReadinessSignal = {
  id: string;
  label: string;
  status: PlatformTenantReadinessStatus;
  detail: string;
};

export type PlatformTenantOperationalReadiness = {
  score: number;
  readySignals: number;
  totalSignals: number;
  signals: PlatformTenantReadinessSignal[];
};

export type PlatformTenantDetail = PlatformTenantRow & {
  suspendedAt: string | null;
  archivedAt: string | null;
  updatedAt: string;
  planName: string;
  planSource: string;
  usage: PlatformTenantUsage;
  usageLimits: PlatformTenantUsageLimit[];
  brandingPreview: PlatformTenantBrandingPreview;
  firstRun: PlatformTenantFirstRun;
  operationalReadiness: PlatformTenantOperationalReadiness;
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
  missingDependencyKeys: string[];
  enabledDependentKeys: string[];
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
    surfaces: [
      {
        surface: "Backoffice",
        headline: `${branding.displayName} beheer`,
        body: `${branding.platformName} toont planning, klanten en opdrachten met tenantkleuren.`,
        primaryColor: branding.primaryColor,
        accentColor: branding.accentColor,
      },
      {
        surface: "Klantportaal",
        headline: `${branding.displayName} portaal`,
        body: "Opdrachtgevers zien documenten, tickets en rapportages in dezelfde merklaag.",
        primaryColor: branding.primaryColor,
        accentColor: branding.accentColor,
      },
      {
        surface: "Personeelsapp",
        headline: `${branding.displayName} app`,
        body: "Medewerkers herkennen planning, werkbonnen en meldingen aan de tenantstijl.",
        primaryColor: branding.primaryColor,
        accentColor: branding.accentColor,
      },
      {
        surface: "E-mail",
        headline: branding.emailSignature || `${branding.displayName} notificatie`,
        body: branding.emailFooterText,
        primaryColor: branding.primaryColor,
        accentColor: branding.accentColor,
      },
      {
        surface: "PDF",
        headline: `${branding.displayName} rapportage`,
        body: "PDF's gebruiken dezelfde naam, primaire kleur en accentkleur als de tenant.",
        primaryColor: branding.primaryColor,
        accentColor: branding.accentColor,
      },
    ],
  };
}

function readinessSignal(input: PlatformTenantReadinessSignal): PlatformTenantReadinessSignal {
  return input;
}

function buildOperationalReadiness(input: {
  primaryDomain: string | null;
  usage: PlatformTenantUsage;
}): PlatformTenantOperationalReadiness {
  const signals = [
    readinessSignal({
      id: "host",
      label: "Host",
      status: input.primaryDomain || input.usage.domains > 0 ? "ready" : "blocked",
      detail: input.primaryDomain ?? (input.usage.domains > 0 ? "Domein aanwezig, primair/verified nog controleren." : "Geen tenantdomein gekoppeld."),
    }),
    readinessSignal({
      id: "login",
      label: "Login",
      status: input.usage.users > 0 ? "ready" : "blocked",
      detail: input.usage.users > 0 ? `${input.usage.users} actieve gebruiker(s).` : "Geen actieve tenantgebruiker gevonden.",
    }),
    readinessSignal({
      id: "modules",
      label: "Modules",
      status: input.usage.enabledModules > 0 ? "ready" : "blocked",
      detail: input.usage.enabledModules > 0 ? `${input.usage.enabledModules} module(s) actief.` : "Nog geen actieve tenantmodules.",
    }),
    readinessSignal({
      id: "sectors",
      label: "Sectoren",
      status: input.usage.enabledSectors > 0 ? "ready" : "blocked",
      detail: input.usage.enabledSectors > 0 ? `${input.usage.enabledSectors} sector(en) actief.` : "Tenantsectoren ontbreken of staan uit.",
    }),
    readinessSignal({
      id: "regions",
      label: "Regio's",
      status: input.usage.activeRegions > 0 ? "ready" : "warning",
      detail: input.usage.activeRegions > 0 ? `${input.usage.activeRegions} actieve regio(s).` : "Geen actieve tenantregio's gevonden.",
    }),
    readinessSignal({
      id: "storage",
      label: "Storage",
      status: input.usage.documents === 0 ? "warning" : input.usage.legacyDocumentPaths === 0 ? "ready" : "warning",
      detail:
        input.usage.documents === 0
          ? "Nog geen documenten om storagepaden te bewijzen."
          : `${input.usage.tenantPrefixedDocuments}/${input.usage.documents} documenten tenant-prefixed, ${input.usage.legacyDocumentPaths} legacy pad(en).`,
    }),
    readinessSignal({
      id: "pdf",
      label: "PDF en downloads",
      status: input.usage.downloadAuditEvents > 0 ? "ready" : "warning",
      detail:
        input.usage.downloadAuditEvents > 0
          ? `${input.usage.downloadAuditEvents} download/PDF audit-event(s), waarvan ${input.usage.pdfAuditEvents} PDF.`
          : "Nog geen download- of PDF-auditbewijs voor deze tenant.",
    }),
    readinessSignal({
      id: "migrations",
      label: "Migraties",
      status: input.usage.migrationHistoryTables > 0 ? "ready" : "warning",
      detail: `${input.usage.migrationHistoryTables} migration history tabel(len) zichtbaar. Sprint 14 voegt geen migratie toe.`,
    }),
    readinessSignal({
      id: "audit",
      label: "Audit",
      status: input.usage.auditEvents + input.usage.supportAuditEvents > 0 ? "ready" : "warning",
      detail: `${input.usage.auditEvents} tenant/platform audit-event(s), ${input.usage.supportAuditEvents} support-event(s).`,
    }),
  ];

  const scoreUnits = signals.reduce((total, signal) => {
    if (signal.status === "ready") return total + 1;
    if (signal.status === "warning") return total + 0.5;
    return total;
  }, 0);

  return {
    score: Math.round((scoreUnits / signals.length) * 100),
    readySignals: signals.filter((signal) => signal.status === "ready").length,
    totalSignals: signals.length,
    signals,
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

function compactListFilterValue(value: string | undefined): string {
  const compacted = (value ?? "").trim();
  return compacted === "all" ? "" : compacted;
}

function normalizeTenantListFilters(filters: PlatformTenantListFilters = {}): PlatformTenantListResult["filters"] {
  const q = compactListFilterValue(filters.q).slice(0, 120);
  const status = TENANT_STATUS_FILTERS.includes(filters.status as TenantStatus) ? filters.status as TenantStatus : "all";
  const plan = TENANT_PLAN_KEYS.includes(filters.plan as TenantPlanKey) ? filters.plan as TenantPlanKey : "all";
  const domainStatus = TENANT_LIST_DOMAIN_STATUSES.includes(filters.domainStatus as PlatformTenantListDomainStatus)
    ? filters.domainStatus as PlatformTenantListDomainStatus
    : "all";
  const readiness = TENANT_LIST_READINESS_STATUSES.includes(filters.readiness as PlatformTenantListReadinessStatus)
    ? filters.readiness as PlatformTenantListReadinessStatus
    : "all";
  const pageSize = Number.isFinite(filters.pageSize ?? NaN)
    ? Math.max(10, Math.min(50, Math.round(filters.pageSize!)))
    : 25;
  const page = Number.isFinite(filters.page ?? NaN)
    ? Math.max(1, Math.round(filters.page!))
    : 1;

  return {
    q,
    status,
    plan,
    module: compactListFilterValue(filters.module),
    sector: compactListFilterValue(filters.sector),
    region: compactListFilterValue(filters.region),
    domainStatus,
    readiness,
    page,
    pageSize,
  };
}

function tenantListDomainStatusSql(): SQL<PlatformTenantListDomainStatus> {
  return sql<PlatformTenantListDomainStatus>`(
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM ${tenantDomainsTable} td
        WHERE td.tenant_id = ${tenantsTable.id}
          AND td.type <> 'platform_reserved'
      ) THEN 'missing'
      WHEN EXISTS (
        SELECT 1 FROM ${tenantDomainsTable} td
        WHERE td.tenant_id = ${tenantsTable.id}
          AND td.type <> 'platform_reserved'
          AND td.verification_status = 'failed'
      ) THEN 'failed'
      WHEN EXISTS (
        SELECT 1 FROM ${tenantDomainsTable} td
        WHERE td.tenant_id = ${tenantsTable.id}
          AND td.type <> 'platform_reserved'
          AND td.verification_status = 'pending'
      ) THEN 'pending'
      WHEN EXISTS (
        SELECT 1 FROM ${tenantDomainsTable} td
        WHERE td.tenant_id = ${tenantsTable.id}
          AND td.type <> 'platform_reserved'
          AND td.verification_status = 'verified'
      ) THEN 'verified'
      ELSE 'missing'
    END
  )`;
}

function tenantListReadinessSql(): SQL<PlatformTenantListReadinessStatus> {
  return sql<PlatformTenantListReadinessStatus>`(
    CASE
      WHEN ${tenantsTable.status} IN ('suspended', 'archived')
        OR NOT EXISTS (
          SELECT 1 FROM ${tenantDomainsTable} td
          WHERE td.tenant_id = ${tenantsTable.id}
            AND td.type <> 'platform_reserved'
            AND td.verification_status = 'verified'
        )
        OR NOT EXISTS (
          SELECT 1 FROM ${tenantUsersTable} tu
          WHERE tu.tenant_id = ${tenantsTable.id}
            AND tu.status = 'active'
        )
        OR NOT EXISTS (
          SELECT 1 FROM ${tenantModulesTable} tm
          WHERE tm.tenant_id = ${tenantsTable.id}
            AND tm.is_enabled = true
        )
        OR NOT EXISTS (
          SELECT 1 FROM ${tenantSectorsTable} ts
          WHERE ts.tenant_id = ${tenantsTable.id}
            AND ts.is_enabled = true
        )
      THEN 'blocked'
      WHEN NOT EXISTS (
          SELECT 1 FROM ${tenantRegionsTable} tr
          WHERE tr.tenant_id = ${tenantsTable.id}
            AND tr.is_active = true
        )
        OR EXISTS (
          SELECT 1 FROM ${tenantDomainsTable} td
          WHERE td.tenant_id = ${tenantsTable.id}
            AND td.type <> 'platform_reserved'
            AND td.verification_status <> 'verified'
        )
        OR EXISTS (
          SELECT 1 FROM ${tenantSubscriptionsTable} sub
          WHERE sub.tenant_id = ${tenantsTable.id}
            AND sub.status = 'past_due'
        )
      THEN 'warning'
      ELSE 'ready'
    END
  )`;
}

function tenantListLatestActivitySql(): SQL<Date> {
  return sql<Date>`GREATEST(
    ${tenantsTable.updatedAt},
    COALESCE((SELECT max(al.created_at) FROM ${auditLogTable} al WHERE al.tenant_id = ${tenantsTable.id}), ${tenantsTable.updatedAt}),
    COALESCE((SELECT max(sal.created_at) FROM ${supportAccessAuditLogTable} sal WHERE sal.tenant_id = ${tenantsTable.id}), ${tenantsTable.updatedAt})
  )`;
}

function platformTenantListConditions(filters: PlatformTenantListResult["filters"]): SQL[] {
  const conditions: SQL[] = [];

  if (filters.q) {
    const pattern = `%${filters.q.toLowerCase()}%`;
    conditions.push(sql`(
      lower(${tenantsTable.name}) LIKE ${pattern}
      OR lower(${tenantsTable.slug}) LIKE ${pattern}
      OR EXISTS (
        SELECT 1 FROM ${tenantDomainsTable} td
        WHERE td.tenant_id = ${tenantsTable.id}
          AND lower(td.domain) LIKE ${pattern}
      )
      OR EXISTS (
        SELECT 1 FROM ${tenantOwnerInvitesTable} toi
        WHERE toi.tenant_id = ${tenantsTable.id}
          AND lower(toi.email) LIKE ${pattern}
      )
    )`);
  }

  if (filters.status !== "all") conditions.push(eq(tenantsTable.status, filters.status));
  if (filters.plan !== "all") conditions.push(eq(tenantsTable.planKey, filters.plan));

  if (filters.module) {
    conditions.push(sql`EXISTS (
      SELECT 1
      FROM ${tenantModulesTable} tm
      INNER JOIN ${modulesTable} m ON m.id = tm.module_id
      WHERE tm.tenant_id = ${tenantsTable.id}
        AND tm.is_enabled = true
        AND m.key = ${filters.module}
    )`);
  }

  if (filters.sector) {
    conditions.push(sql`EXISTS (
      SELECT 1
      FROM ${tenantSectorsTable} ts
      WHERE ts.tenant_id = ${tenantsTable.id}
        AND ts.is_enabled = true
        AND ts.sector_id::text = ${filters.sector}
    )`);
  }

  if (filters.region) {
    conditions.push(sql`EXISTS (
      SELECT 1
      FROM ${tenantRegionsTable} tr
      WHERE tr.tenant_id = ${tenantsTable.id}
        AND tr.is_active = true
        AND tr.id::text = ${filters.region}
    )`);
  }

  if (filters.domainStatus !== "all") {
    conditions.push(sql`${tenantListDomainStatusSql()} = ${filters.domainStatus}`);
  }

  if (filters.readiness !== "all") {
    conditions.push(sql`${tenantListReadinessSql()} = ${filters.readiness}`);
  }

  return conditions;
}

function tenantListOpenActions(row: {
  status: TenantStatus;
  userCount: number;
  ownerEmail: string | null;
  domainStatus: PlatformTenantListDomainStatus;
  readinessStatus: PlatformTenantListReadinessStatus;
  enabledModules: number;
  enabledSectors: number;
  activeRegions: number;
  subscriptionStatus: string | null;
}): string[] {
  const actions = new Set<string>();
  if (row.status === "suspended" || row.status === "archived") actions.add("Lifecycle");
  if (row.domainStatus === "missing") actions.add("Domein ontbreekt");
  if (row.domainStatus === "pending") actions.add("Domein pending");
  if (row.domainStatus === "failed") actions.add("Domein fout");
  if (!row.ownerEmail) actions.add("Owner invite");
  if (row.userCount === 0) actions.add("Geen users");
  if (row.enabledModules === 0) actions.add("Modules");
  if (row.enabledSectors === 0) actions.add("Sectoren");
  if (row.activeRegions === 0) actions.add("Regio's");
  if (row.subscriptionStatus === "past_due") actions.add("Billing");
  if (row.readinessStatus === "blocked") actions.add("Readiness blocked");
  return [...actions].slice(0, 5);
}

async function listPlatformTenantListFacets(): Promise<PlatformTenantListResult["facets"]> {
  const [plans, modules, sectors, regions] = await Promise.all([
    db
      .select({ value: plansTable.key, label: plansTable.name })
      .from(plansTable)
      .where(eq(plansTable.isActive, true))
      .orderBy(asc(plansTable.sortOrder), asc(plansTable.name)),
    db
      .select({ value: modulesTable.key, label: modulesTable.name })
      .from(modulesTable)
      .orderBy(asc(modulesTable.category), asc(modulesTable.name)),
    db
      .select({ value: sectorsTable.id, label: sectorsTable.name })
      .from(sectorsTable)
      .where(eq(sectorsTable.isActive, true))
      .orderBy(asc(sectorsTable.name)),
    db
      .select({ value: tenantRegionsTable.id, label: tenantRegionsTable.name })
      .from(tenantRegionsTable)
      .where(eq(tenantRegionsTable.isActive, true))
      .groupBy(tenantRegionsTable.id, tenantRegionsTable.name)
      .orderBy(asc(tenantRegionsTable.name)),
  ]);

  return {
    statuses: TENANT_STATUS_FILTERS.map((status) => ({ value: status, label: status })),
    plans: plans.map((plan) => ({ value: plan.value, label: plan.label })),
    modules: modules.map((module) => ({ value: module.value, label: module.label })),
    sectors: sectors.map((sector) => ({ value: sector.value, label: sector.label })),
    regions: regions.map((region) => ({ value: region.value, label: region.label })),
    domainStatuses: [
      { value: "missing", label: "Geen domein" },
      { value: "pending", label: "Pending" },
      { value: "verified", label: "Verified" },
      { value: "failed", label: "Failed" },
    ],
    readinessStatuses: [
      { value: "ready", label: "Ready" },
      { value: "warning", label: "Aandacht" },
      { value: "blocked", label: "Blocked" },
    ],
  };
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

export async function listPlatformTenantList(filters: PlatformTenantListFilters = {}): Promise<PlatformTenantListResult> {
  await requirePlatformAdmin();

  const normalizedFilters = normalizeTenantListFilters(filters);
  const conditions = platformTenantListConditions(normalizedFilters);
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const domainStatus = tenantListDomainStatusSql();
  const readinessStatus = tenantListReadinessSql();
  const latestActivityAt = tenantListLatestActivitySql();

  const [countRows, facets] = await Promise.all([
    db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(tenantsTable)
      .where(where),
    listPlatformTenantListFacets(),
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / normalizedFilters.pageSize));
  const page = Math.min(normalizedFilters.page, totalPages);
  const offset = (page - 1) * normalizedFilters.pageSize;

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
          FROM ${tenantUsersTable} tu
          WHERE tu.tenant_id = ${tenantsTable.id}
            AND tu.status = 'active'
        )::int`,
        primaryDomain: sql<string | null>`(
          SELECT td.domain
          FROM ${tenantDomainsTable} td
          WHERE td.tenant_id = ${tenantsTable.id}
            AND td.type <> 'platform_reserved'
            AND td.verification_status = 'verified'
          ORDER BY td.is_primary DESC, td.created_at ASC
          LIMIT 1
        )`,
        ownerEmail: sql<string | null>`(
          SELECT toi.email
          FROM ${tenantOwnerInvitesTable} toi
          WHERE toi.tenant_id = ${tenantsTable.id}
          ORDER BY
            CASE toi.status WHEN 'accepted' THEN 0 WHEN 'sent' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
            toi.updated_at DESC
          LIMIT 1
        )`,
        ownerStatus: sql<string | null>`(
          SELECT toi.status
          FROM ${tenantOwnerInvitesTable} toi
          WHERE toi.tenant_id = ${tenantsTable.id}
          ORDER BY
            CASE toi.status WHEN 'accepted' THEN 0 WHEN 'sent' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
            toi.updated_at DESC
          LIMIT 1
        )`,
        domainStatus,
        readinessStatus,
        enabledModules: sql<number>`(
          SELECT COUNT(*)
          FROM ${tenantModulesTable} tm
          WHERE tm.tenant_id = ${tenantsTable.id}
            AND tm.is_enabled = true
        )::int`,
        moduleSummary: sql<string | null>`(
          SELECT string_agg(module_names.name, ', ' ORDER BY module_names.name)
          FROM (
            SELECT m.name
            FROM ${tenantModulesTable} tm
            INNER JOIN ${modulesTable} m ON m.id = tm.module_id
            WHERE tm.tenant_id = ${tenantsTable.id}
              AND tm.is_enabled = true
            ORDER BY m.name
            LIMIT 3
          ) module_names
        )`,
        enabledSectors: sql<number>`(
          SELECT COUNT(*)
          FROM ${tenantSectorsTable} ts
          WHERE ts.tenant_id = ${tenantsTable.id}
            AND ts.is_enabled = true
        )::int`,
        sectorSummary: sql<string | null>`(
          SELECT string_agg(sector_names.name, ', ' ORDER BY sector_names.name)
          FROM (
            SELECT s.name
            FROM ${tenantSectorsTable} ts
            INNER JOIN ${sectorsTable} s ON s.id = ts.sector_id
            WHERE ts.tenant_id = ${tenantsTable.id}
              AND ts.is_enabled = true
            ORDER BY s.name
            LIMIT 3
          ) sector_names
        )`,
        activeRegions: sql<number>`(
          SELECT COUNT(*)
          FROM ${tenantRegionsTable} tr
          WHERE tr.tenant_id = ${tenantsTable.id}
            AND tr.is_active = true
        )::int`,
        regionSummary: sql<string | null>`(
          SELECT string_agg(region_names.name, ', ' ORDER BY region_names.name)
          FROM (
            SELECT tr.name
            FROM ${tenantRegionsTable} tr
            WHERE tr.tenant_id = ${tenantsTable.id}
              AND tr.is_active = true
            ORDER BY tr.sort_order, tr.name
            LIMIT 3
          ) region_names
        )`,
        latestActivityAt,
        subscriptionStatus: sql<string | null>`(
          SELECT sub.status
          FROM ${tenantSubscriptionsTable} sub
          WHERE sub.tenant_id = ${tenantsTable.id}
          ORDER BY
            CASE sub.status WHEN 'active' THEN 0 WHEN 'trial' THEN 1 WHEN 'past_due' THEN 2 ELSE 3 END,
            sub.updated_at DESC
          LIMIT 1
        )`,
      })
      .from(tenantsTable)
      .where(where)
      .orderBy(desc(latestActivityAt), asc(tenantsTable.name))
      .limit(normalizedFilters.pageSize)
      .offset(offset);

  return {
    rows: rows.map((row) => {
      const normalizedRow = {
        ...row,
        createdAt: row.createdAt.toISOString(),
        latestActivityAt: row.latestActivityAt.toISOString(),
      };
      return {
        ...normalizedRow,
        openActions: tenantListOpenActions(normalizedRow),
      };
    }),
    facets,
    filters: { ...normalizedFilters, page },
    pagination: {
      total,
      page,
      pageSize: normalizedFilters.pageSize,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

async function listPlatformTenantUsageLimits(planId: string | null): Promise<PlatformTenantUsageLimit[]> {
  if (!planId) return [];

  const rows = await db
    .select({
      key: planLimitsTable.key,
      description: planLimitsTable.description,
      isEnabled: planLimitsTable.isEnabled,
      limitValue: planLimitsTable.limitValue,
    })
    .from(planLimitsTable)
    .where(eq(planLimitsTable.planId, planId))
    .orderBy(asc(planLimitsTable.key));

  return rows.map((row) => ({
    key: row.key,
    description: row.description,
    isEnabled: row.isEnabled,
    limitValue: row.limitValue,
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
  const usageLimits = await listPlatformTenantUsageLimits(plan.planId);
  const brandingPreview = buildBrandingPreview(branding);
  const operationalReadiness = buildOperationalReadiness({
    primaryDomain: tenant.primaryDomain,
    usage,
  });

  return {
    ...tenant,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
    suspendedAt: tenant.suspendedAt?.toISOString() ?? null,
    archivedAt: tenant.archivedAt?.toISOString() ?? null,
    usage,
    usageLimits,
    planName: plan.planName,
    planSource: plan.source,
    brandingPreview,
    firstRun: buildFirstRunStatus({ primaryDomain: tenant.primaryDomain, usage, brandingPreview }),
    operationalReadiness,
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
      downloadAuditEvents: sql<number>`(
        (SELECT count(*) FROM ${auditLogTable}
          WHERE tenant_id = ${tenantId}::uuid
            AND (
              lower(concat_ws(' ', action, resource, resource_id, metadata::text)) LIKE '%download%'
              OR lower(concat_ws(' ', action, resource, resource_id, metadata::text)) LIKE '%pdf%'
              OR lower(concat_ws(' ', action, resource, resource_id, metadata::text)) LIKE '%signed%'
            )
        ) +
        (SELECT count(*) FROM ${supportAccessAuditLogTable}
          WHERE tenant_id = ${tenantId}::uuid
            AND (
              lower(concat_ws(' ', action, resource, resource_id, metadata::text)) LIKE '%download%'
              OR lower(concat_ws(' ', action, resource, resource_id, metadata::text)) LIKE '%pdf%'
              OR lower(concat_ws(' ', action, resource, resource_id, metadata::text)) LIKE '%signed%'
            )
        )
      )::int`,
      pdfAuditEvents: sql<number>`(
        (SELECT count(*) FROM ${auditLogTable}
          WHERE tenant_id = ${tenantId}::uuid
            AND lower(concat_ws(' ', action, resource, resource_id, metadata::text)) LIKE '%pdf%'
        ) +
        (SELECT count(*) FROM ${supportAccessAuditLogTable}
          WHERE tenant_id = ${tenantId}::uuid
            AND lower(concat_ws(' ', action, resource, resource_id, metadata::text)) LIKE '%pdf%'
        )
      )::int`,
      domains: sql<number>`(SELECT count(*) FROM tenant_domains WHERE tenant_id = ${tenantId}::uuid AND type <> 'platform_reserved')::int`,
      enabledModules: sql<number>`(SELECT count(*) FROM tenant_modules WHERE tenant_id = ${tenantId}::uuid AND is_enabled = true)::int`,
      enabledSectors: sql<number>`(SELECT count(*) FROM tenant_sectors WHERE tenant_id = ${tenantId}::uuid AND is_enabled = true)::int`,
      activeRegions: sql<number>`(SELECT count(*) FROM ${tenantRegionsTable} WHERE tenant_id = ${tenantId}::uuid AND is_active = true)::int`,
      activeSupportGrants: sql<number>`(
        SELECT count(*) FROM ${supportAccessGrantsTable}
        WHERE tenant_id = ${tenantId}::uuid
          AND revoked_at IS NULL
          AND starts_at <= now()
          AND expires_at > now()
      )::int`,
      tenantPrefixedDocuments: sql<number>`(
        SELECT count(*) FROM ${documentsTable}
        WHERE tenant_id = ${tenantId}::uuid
          AND storage_path LIKE ${`tenant/${tenantId}/%`}
      )::int`,
      legacyDocumentPaths: sql<number>`(
        SELECT count(*) FROM ${documentsTable}
        WHERE tenant_id = ${tenantId}::uuid
          AND storage_path NOT LIKE ${`tenant/${tenantId}/%`}
      )::int`,
      auditEvents: sql<number>`(SELECT count(*) FROM ${auditLogTable} WHERE tenant_id = ${tenantId}::uuid)::int`,
      supportAuditEvents: sql<number>`(SELECT count(*) FROM ${supportAccessAuditLogTable} WHERE tenant_id = ${tenantId}::uuid)::int`,
      migrationHistoryTables: sql<number>`(
        SELECT count(*)
        FROM pg_catalog.pg_class c
        INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'drizzle'
          AND c.relname IN ('__drizzle_migrations', 'veele_sql_migrations')
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
    downloadAuditEvents: Number(usage?.downloadAuditEvents ?? 0),
    pdfAuditEvents: Number(usage?.pdfAuditEvents ?? 0),
    domains: Number(usage?.domains ?? 0),
    enabledModules: Number(usage?.enabledModules ?? 0),
    enabledSectors: Number(usage?.enabledSectors ?? 0),
    activeRegions: Number(usage?.activeRegions ?? 0),
    activeSupportGrants: Number(usage?.activeSupportGrants ?? 0),
    tenantPrefixedDocuments: Number(usage?.tenantPrefixedDocuments ?? 0),
    legacyDocumentPaths: Number(usage?.legacyDocumentPaths ?? 0),
    auditEvents: Number(usage?.auditEvents ?? 0),
    supportAuditEvents: Number(usage?.supportAuditEvents ?? 0),
    migrationHistoryTables: Number(usage?.migrationHistoryTables ?? 0),
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

  const [modules, overrides, plan, dependencies, dependents] = await Promise.all([
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
    db
      .select({
        moduleId: moduleDependenciesTable.dependsOnModuleId,
        dependentKey: modulesTable.key,
      })
      .from(moduleDependenciesTable)
      .innerJoin(modulesTable, eq(moduleDependenciesTable.moduleId, modulesTable.id)),
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
  const dependentKeysByModuleId = new Map<string, string[]>();
  for (const dependent of dependents) {
    const keys = dependentKeysByModuleId.get(dependent.moduleId) ?? [];
    keys.push(dependent.dependentKey);
    dependentKeysByModuleId.set(dependent.moduleId, keys);
  }

  const moduleRows = modules.map((module) => {
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
      missingDependencyKeys: [],
      enabledDependentKeys: [],
    };
  });
  const enabledByKey = new Map(moduleRows.map((module) => [module.key, module.effectiveEnabled]));

  return moduleRows.map((module) => ({
    ...module,
    missingDependencyKeys: module.dependencyKeys.filter((dependencyKey) => !enabledByKey.get(dependencyKey)),
    enabledDependentKeys: (dependentKeysByModuleId.get(module.id) ?? []).filter((dependentKey) => enabledByKey.get(dependentKey)),
  }));
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
