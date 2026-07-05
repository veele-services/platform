"use server";

import { randomBytes } from "node:crypto";
import { resolve4, resolve6, resolveCname, resolveTxt } from "node:dns/promises";
import {
  auditLogTable,
  canTenantUseCustomDomains,
  customDomainTxtName,
  customDomainVerificationValue,
  db,
  assignmentsTable,
  customersTable,
  documentsTable,
  FIELDGRID_BRAND_DEFAULTS,
  getTenantBranding,
  getTenantPlanSnapshot,
  isPlatformHost,
  isTenantRuntimeActive,
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
  tenantDomainChecksTable,
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
  type TenantSubscriptionStatus,
  type TenantStatus,
} from "@workspace/db";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin, writeSupportAccessAuditLog } from "@/lib/auth/platform";
import type { ActionResult } from "./customers";
import { ensurePlatformTicketForDomainFailure } from "./platform-tickets";

const TENANT_PLAN_KEYS = ["starter", "professional", "enterprise"] as const;
const TENANT_STATUS_FILTERS = ["provisioning", "trial", "active", "suspended", "archived"] as const;
const TENANT_SUBSCRIPTION_STATUS_VALUES = ["trial", "active", "past_due", "canceled", "expired"] as const;
const DOMAIN_TYPES = ["fieldgrid_subdomain", "custom_domain"] as const;
const DOMAIN_VERIFICATION_STATUSES = ["pending", "pending_dns", "dns_seen", "verified", "tls_pending", "active", "failed", "disabled", "disabled_plan"] as const;
const TENANT_LIST_DOMAIN_STATUSES = ["missing", "pending", "verified", "failed"] as const;
const TENANT_LIST_READINESS_STATUSES = ["ready", "warning", "blocked"] as const;
const ROUTABLE_DOMAIN_STATUSES = ["verified", "active"] as const;
const CUSTOM_DOMAIN_TOKEN_BYTES = 24;

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
  verificationToken: string | null;
  verificationMethod: string;
  dnsTxtName: string | null;
  dnsTarget: string | null;
  dnsLastCheckedAt: string | null;
  dnsLastError: string | null;
  tlsStatus: string;
  tlsLastCheckedAt: string | null;
  tlsLastError: string | null;
  activatedAt: string | null;
  disabledAt: string | null;
  disabledReason: string | null;
  verifiedAt: string | null;
  createdAt: string;
};

export type PlatformPlanRow = {
  id: string;
  key: TenantPlanKey;
  name: string;
  description: string | null;
  supportLevel: string;
  supportDescription: string | null;
  maxSeats: number | null;
  isActive: boolean;
  isPublic: boolean;
  customRoles: boolean;
  customDomains: boolean;
  moduleCount: number;
  limitSummary: string | null;
  activeSubscriptions: number;
  trialSubscriptions: number;
  pastDueSubscriptions: number;
  tenantCount: number;
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

export type PlatformTenantSubscriptionRow = {
  id: string;
  planName: string;
  planKey: TenantPlanKey;
  status: string;
  source: string;
  startsAt: string;
  currentPeriodStartsAt: string | null;
  currentPeriodEndsAt: string | null;
  canceledAt: string | null;
  billingReference: string | null;
  manualBillingNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformSubscriptionListRow = PlatformTenantSubscriptionRow & {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: TenantStatus;
  customDomainCount: number;
  activeCustomDomainCount: number;
  downgradeImpact: string | null;
};

export type PlatformSubscriptionDashboard = {
  plans: PlatformPlanRow[];
  subscriptions: PlatformSubscriptionListRow[];
  stats: {
    totalSubscriptions: number;
    trial: number;
    active: number;
    pastDue: number;
    canceled: number;
    expired: number;
  };
};

export type PlatformTenantUserRow = {
  id: string;
  userId: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type PlatformTenantOwnerInviteRow = {
  id: string;
  email: string;
  userId: string | null;
  status: string;
  inviteSentAt: string | null;
  rollbackAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformTenantUsersAndOwner = {
  users: PlatformTenantUserRow[];
  ownerInvites: PlatformTenantOwnerInviteRow[];
};

export type PlatformTenantRegionRow = {
  id: string;
  name: string;
  normalizedName: string;
  isActive: boolean;
  source: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizePlanKey(value: string): TenantPlanKey {
  return TENANT_PLAN_KEYS.includes(value as TenantPlanKey) ? (value as TenantPlanKey) : "starter";
}

function revalidatePlatformTenant(tenantId: string): void {
  revalidatePath("/platform");
  revalidatePath("/platform/subscriptions");
  revalidatePath(`/platform/tenants/${tenantId}`);
}

function actionValue(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function booleanValue(formData: FormData, name: string): boolean {
  return formData.get(name) === "on" || formData.get(name) === "true";
}

function textValue(formData: FormData, name: string, maxLength = 1000): string | null {
  const value = actionValue(formData, name);
  return value ? value.slice(0, maxLength) : null;
}

function normalizeSubscriptionStatus(value: string): TenantSubscriptionStatus {
  return TENANT_SUBSCRIPTION_STATUS_VALUES.includes(value as TenantSubscriptionStatus)
    ? (value as TenantSubscriptionStatus)
    : "active";
}

function optionalDateValue(formData: FormData, name: string): Date | null {
  const value = actionValue(formData, name);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function subscriptionIsRuntimeActive(status: TenantSubscriptionStatus): boolean {
  return status === "trial" || status === "active";
}

function randomVerificationToken(): string {
  return randomBytes(CUSTOM_DOMAIN_TOKEN_BYTES).toString("base64url");
}

function normalizeDomainType(value: string, domain: string): typeof DOMAIN_TYPES[number] {
  if (value === "fieldgrid_subdomain" || value === "subdomain") return "fieldgrid_subdomain";
  if (value === "custom_domain" || value === "custom") return "custom_domain";
  return domain.endsWith(".fieldgrid.nl") ? "fieldgrid_subdomain" : "custom_domain";
}

function publicIpv4Target(): string | null {
  return process.env.FIELDGRID_PUBLIC_IPV4?.trim() || null;
}

function publicIpv6Target(): string | null {
  return process.env.FIELDGRID_PUBLIC_IPV6?.trim() || null;
}

function customDomainCnameTarget(tenantSlug: string): string {
  return normalizeHost(process.env.FIELDGRID_CUSTOM_DOMAIN_CNAME_TARGET ?? `${tenantSlug}.fieldgrid.nl`);
}

function domainStatusTone(status: string): "neutral" | "good" | "warning" | "danger" {
  if (status === "verified" || status === "active") return "good";
  if (status === "failed" || status === "disabled" || status === "disabled_plan") return "danger";
  return "warning";
}

function domainCanRoute(status: string): boolean {
  return ROUTABLE_DOMAIN_STATUSES.includes(status as typeof ROUTABLE_DOMAIN_STATUSES[number]);
}

async function tenantCustomDomainGate(tenantId: string): Promise<{
  allowed: boolean;
  detail: string;
  tenant: { id: string; slug: string; name: string; isActive: boolean; status: TenantStatus; planKey: TenantPlanKey } | null;
}> {
  const [tenant] = await db
    .select({
      id: tenantsTable.id,
      slug: tenantsTable.slug,
      name: tenantsTable.name,
      isActive: tenantsTable.isActive,
      status: tenantsTable.status,
      planKey: tenantsTable.planKey,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  if (!tenant) return { allowed: false, detail: "Tenant niet gevonden.", tenant: null };
  if (!isTenantRuntimeActive(tenant)) {
    return { allowed: false, detail: "Custom domains vereisen een actieve tenant.", tenant };
  }

  const allowed = await canTenantUseCustomDomains(tenantId);
  return {
    allowed,
    detail: allowed ? "Enterprise custom domains toegestaan." : "Custom domains zijn beschikbaar voor Enterprise tenants.",
    tenant,
  };
}

async function recordDomainCheck(input: {
  tenantDomainId: string;
  tenantId: string;
  checkType: string;
  status: string;
  details: Record<string, unknown>;
}): Promise<void> {
  await db.insert(tenantDomainChecksTable).values({
    tenantDomainId: input.tenantDomainId,
    tenantId: input.tenantId,
    checkType: input.checkType,
    status: input.status,
    details: input.details,
  });
}

async function maybeOpenDomainVerificationTicket(input: {
  tenantId: string;
  domainId: string;
  domain: string;
  status: "dns_seen" | "failed";
  errorMessage: string | null;
}): Promise<void> {
  const [failureStats] = await db
    .select({ failureCount: sql<number>`count(*)::int` })
    .from(tenantDomainChecksTable)
    .where(
      and(
        eq(tenantDomainChecksTable.tenantDomainId, input.domainId),
        eq(tenantDomainChecksTable.checkType, "dns"),
        inArray(tenantDomainChecksTable.status, ["failed", "dns_seen"]),
      ),
    )
    .limit(1);

  const failureCount = Number(failureStats?.failureCount ?? 0);
  if (failureCount < 3) return;

  const ticketId = await ensurePlatformTicketForDomainFailure({
    tenantId: input.tenantId,
    domainId: input.domainId,
    domain: input.domain,
    failureCount,
    latestError: input.errorMessage,
  });

  if (!ticketId) return;

  await auditPlatformTenantAction({
    tenantId: input.tenantId,
    action: "platform_ticket_created_from_domain_failure",
    resource: "platform_tickets",
    resourceId: ticketId,
    metadata: {
      domainId: input.domainId,
      domain: input.domain,
      status: input.status,
      failureCount,
      errorMessage: input.errorMessage,
    },
  });
}

function dnsErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "DNS-record niet gevonden.";
}

async function resolveTxtValues(name: string): Promise<string[]> {
  try {
    return (await resolveTxt(name)).map((parts) => parts.join(""));
  } catch {
    return [];
  }
}

async function resolveAValues(domain: string): Promise<string[]> {
  const [ipv4, ipv6] = await Promise.all([
    resolve4(domain).catch(() => [] as string[]),
    resolve6(domain).catch(() => [] as string[]),
  ]);
  return [...ipv4, ...ipv6];
}

async function resolveCnameValues(domain: string): Promise<string[]> {
  try {
    return (await resolveCname(domain)).map((value) => normalizeHost(value));
  } catch {
    return [];
  }
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
          AND td.verification_status IN ('failed', 'disabled', 'disabled_plan')
      ) THEN 'failed'
      WHEN EXISTS (
        SELECT 1 FROM ${tenantDomainsTable} td
        WHERE td.tenant_id = ${tenantsTable.id}
          AND td.type <> 'platform_reserved'
          AND td.verification_status IN ('pending', 'pending_dns', 'dns_seen', 'tls_pending')
      ) THEN 'pending'
      WHEN EXISTS (
        SELECT 1 FROM ${tenantDomainsTable} td
        WHERE td.tenant_id = ${tenantsTable.id}
          AND td.type <> 'platform_reserved'
          AND td.verification_status IN ('verified', 'active')
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
            AND td.verification_status IN ('verified', 'active')
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
            AND td.verification_status NOT IN ('verified', 'active')
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
          AND td.verification_status IN ('verified', 'active')
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
            AND td.verification_status IN ('verified', 'active')
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
          AND td.verification_status IN ('verified', 'active')
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
      supportLevel: plansTable.supportLevel,
      supportDescription: plansTable.supportDescription,
      maxSeats: plansTable.maxSeats,
      isActive: plansTable.isActive,
      isPublic: plansTable.isPublic,
      customRoles: sql<boolean>`COALESCE((
        SELECT pl.is_enabled FROM plan_limits pl
        WHERE pl.plan_id = ${plansTable.id}
          AND pl.key = 'custom_roles'
        LIMIT 1
      ), ${plansTable.key} IN ('professional', 'enterprise'))`,
      customDomains: sql<boolean>`COALESCE((
        SELECT pl.is_enabled FROM plan_limits pl
        WHERE pl.plan_id = ${plansTable.id}
          AND pl.key = 'custom_domains'
        LIMIT 1
      ), ${plansTable.key} = 'enterprise')`,
      moduleCount: sql<number>`(
        SELECT count(*)
        FROM ${planModulesTable} pm
        WHERE pm.plan_id = ${plansTable.id}
          AND pm.is_included = true
      )::int`,
      limitSummary: sql<string | null>`(
        SELECT string_agg(
          pl.key || '=' || CASE
            WHEN pl.limit_value IS NOT NULL THEN pl.limit_value::text
            WHEN pl.is_enabled THEN 'aan'
            ELSE 'uit'
          END,
          ', ' ORDER BY pl.key
        )
        FROM ${planLimitsTable} pl
        WHERE pl.plan_id = ${plansTable.id}
      )`,
      activeSubscriptions: sql<number>`(
        SELECT count(*)
        FROM ${tenantSubscriptionsTable} sub
        WHERE sub.plan_id = ${plansTable.id}
          AND sub.status = 'active'
      )::int`,
      trialSubscriptions: sql<number>`(
        SELECT count(*)
        FROM ${tenantSubscriptionsTable} sub
        WHERE sub.plan_id = ${plansTable.id}
          AND sub.status = 'trial'
      )::int`,
      pastDueSubscriptions: sql<number>`(
        SELECT count(*)
        FROM ${tenantSubscriptionsTable} sub
        WHERE sub.plan_id = ${plansTable.id}
          AND sub.status = 'past_due'
      )::int`,
      tenantCount: sql<number>`(
        SELECT count(*)
        FROM ${tenantsTable} tenant
        WHERE tenant.plan_key = ${plansTable.key}
      )::int`,
    })
    .from(plansTable)
    .orderBy(asc(plansTable.sortOrder), asc(plansTable.name));

  return rows;
}

export async function listPlatformTenantSubscriptions(tenantId: string): Promise<PlatformTenantSubscriptionRow[]> {
  await requirePlatformAdmin();

  const rows = await db
    .select({
      id: tenantSubscriptionsTable.id,
      planName: plansTable.name,
      planKey: plansTable.key,
      status: tenantSubscriptionsTable.status,
      source: tenantSubscriptionsTable.source,
      startsAt: tenantSubscriptionsTable.startsAt,
      currentPeriodStartsAt: tenantSubscriptionsTable.currentPeriodStartsAt,
      currentPeriodEndsAt: tenantSubscriptionsTable.currentPeriodEndsAt,
      canceledAt: tenantSubscriptionsTable.canceledAt,
      billingReference: tenantSubscriptionsTable.billingReference,
      manualBillingNotes: tenantSubscriptionsTable.manualBillingNotes,
      createdAt: tenantSubscriptionsTable.createdAt,
      updatedAt: tenantSubscriptionsTable.updatedAt,
    })
    .from(tenantSubscriptionsTable)
    .innerJoin(plansTable, eq(tenantSubscriptionsTable.planId, plansTable.id))
    .where(eq(tenantSubscriptionsTable.tenantId, tenantId))
    .orderBy(desc(tenantSubscriptionsTable.updatedAt));

  return rows.map((row) => ({
    ...row,
    startsAt: row.startsAt.toISOString(),
    currentPeriodStartsAt: row.currentPeriodStartsAt?.toISOString() ?? null,
    currentPeriodEndsAt: row.currentPeriodEndsAt?.toISOString() ?? null,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function listPlatformSubscriptionDashboard(): Promise<PlatformSubscriptionDashboard> {
  await requirePlatformAdmin();

  const [plans, subscriptions, statusRows] = await Promise.all([
    listPlatformPlans(),
    db
      .select({
        id: tenantSubscriptionsTable.id,
        tenantId: tenantSubscriptionsTable.tenantId,
        tenantName: tenantsTable.name,
        tenantSlug: tenantsTable.slug,
        tenantStatus: tenantsTable.status,
        planName: plansTable.name,
        planKey: plansTable.key,
        status: tenantSubscriptionsTable.status,
        source: tenantSubscriptionsTable.source,
        startsAt: tenantSubscriptionsTable.startsAt,
        currentPeriodStartsAt: tenantSubscriptionsTable.currentPeriodStartsAt,
        currentPeriodEndsAt: tenantSubscriptionsTable.currentPeriodEndsAt,
        canceledAt: tenantSubscriptionsTable.canceledAt,
        billingReference: tenantSubscriptionsTable.billingReference,
        manualBillingNotes: tenantSubscriptionsTable.manualBillingNotes,
        createdAt: tenantSubscriptionsTable.createdAt,
        updatedAt: tenantSubscriptionsTable.updatedAt,
        customDomainCount: sql<number>`(
          SELECT count(*)
          FROM ${tenantDomainsTable} td
          WHERE td.tenant_id = ${tenantSubscriptionsTable.tenantId}
            AND td.type = 'custom_domain'
        )::int`,
        activeCustomDomainCount: sql<number>`(
          SELECT count(*)
          FROM ${tenantDomainsTable} td
          WHERE td.tenant_id = ${tenantSubscriptionsTable.tenantId}
            AND td.type = 'custom_domain'
            AND td.verification_status IN ('verified', 'active')
        )::int`,
      })
      .from(tenantSubscriptionsTable)
      .innerJoin(plansTable, eq(tenantSubscriptionsTable.planId, plansTable.id))
      .innerJoin(tenantsTable, eq(tenantSubscriptionsTable.tenantId, tenantsTable.id))
      .orderBy(desc(tenantSubscriptionsTable.updatedAt))
      .limit(250),
    db
      .select({
        status: tenantSubscriptionsTable.status,
        total: sql<number>`count(*)::int`,
      })
      .from(tenantSubscriptionsTable)
      .groupBy(tenantSubscriptionsTable.status),
  ]);

  const statusTotals = new Map(statusRows.map((row) => [row.status, Number(row.total)]));

  return {
    plans,
    subscriptions: subscriptions.map((row) => {
      const customDomainCount = Number(row.customDomainCount ?? 0);
      return {
        ...row,
        customDomainCount,
        activeCustomDomainCount: Number(row.activeCustomDomainCount ?? 0),
        downgradeImpact: row.planKey === "enterprise" && customDomainCount > 0
          ? `${customDomainCount} custom domain(s) worden uitgeschakeld bij downgrade naar Starter/Professional.`
          : null,
        startsAt: row.startsAt.toISOString(),
        currentPeriodStartsAt: row.currentPeriodStartsAt?.toISOString() ?? null,
        currentPeriodEndsAt: row.currentPeriodEndsAt?.toISOString() ?? null,
        canceledAt: row.canceledAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    }),
    stats: {
      totalSubscriptions: [...statusTotals.values()].reduce((total, value) => total + value, 0),
      trial: statusTotals.get("trial") ?? 0,
      active: statusTotals.get("active") ?? 0,
      pastDue: statusTotals.get("past_due") ?? 0,
      canceled: statusTotals.get("canceled") ?? 0,
      expired: statusTotals.get("expired") ?? 0,
    },
  };
}

export async function listPlatformTenantUsersAndOwner(tenantId: string): Promise<PlatformTenantUsersAndOwner> {
  await requirePlatformAdmin();

  const [users, ownerInvites] = await Promise.all([
    db
      .select({
        id: tenantUsersTable.id,
        userId: tenantUsersTable.userId,
        role: tenantUsersTable.role,
        status: tenantUsersTable.status,
        createdAt: tenantUsersTable.createdAt,
        updatedAt: tenantUsersTable.updatedAt,
      })
      .from(tenantUsersTable)
      .where(eq(tenantUsersTable.tenantId, tenantId))
      .orderBy(asc(tenantUsersTable.role), desc(tenantUsersTable.updatedAt)),
    db
      .select({
        id: tenantOwnerInvitesTable.id,
        email: tenantOwnerInvitesTable.email,
        userId: tenantOwnerInvitesTable.userId,
        status: tenantOwnerInvitesTable.status,
        inviteSentAt: tenantOwnerInvitesTable.inviteSentAt,
        rollbackAt: tenantOwnerInvitesTable.rollbackAt,
        errorMessage: tenantOwnerInvitesTable.errorMessage,
        createdAt: tenantOwnerInvitesTable.createdAt,
        updatedAt: tenantOwnerInvitesTable.updatedAt,
      })
      .from(tenantOwnerInvitesTable)
      .where(eq(tenantOwnerInvitesTable.tenantId, tenantId))
      .orderBy(desc(tenantOwnerInvitesTable.updatedAt)),
  ]);

  return {
    users: users.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    ownerInvites: ownerInvites.map((row) => ({
      ...row,
      inviteSentAt: row.inviteSentAt?.toISOString() ?? null,
      rollbackAt: row.rollbackAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}

export async function listPlatformTenantRegions(tenantId: string): Promise<PlatformTenantRegionRow[]> {
  await requirePlatformAdmin();

  const rows = await db
    .select({
      id: tenantRegionsTable.id,
      name: tenantRegionsTable.name,
      normalizedName: tenantRegionsTable.normalizedName,
      isActive: tenantRegionsTable.isActive,
      source: tenantRegionsTable.source,
      sortOrder: tenantRegionsTable.sortOrder,
      createdAt: tenantRegionsTable.createdAt,
      updatedAt: tenantRegionsTable.updatedAt,
    })
    .from(tenantRegionsTable)
    .where(eq(tenantRegionsTable.tenantId, tenantId))
    .orderBy(asc(tenantRegionsTable.sortOrder), asc(tenantRegionsTable.name));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
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
      verificationToken: tenantDomainsTable.verificationToken,
      verificationMethod: tenantDomainsTable.verificationMethod,
      dnsTxtName: tenantDomainsTable.dnsTxtName,
      dnsTarget: tenantDomainsTable.dnsTarget,
      dnsLastCheckedAt: tenantDomainsTable.dnsLastCheckedAt,
      dnsLastError: tenantDomainsTable.dnsLastError,
      tlsStatus: tenantDomainsTable.tlsStatus,
      tlsLastCheckedAt: tenantDomainsTable.tlsLastCheckedAt,
      tlsLastError: tenantDomainsTable.tlsLastError,
      activatedAt: tenantDomainsTable.activatedAt,
      disabledAt: tenantDomainsTable.disabledAt,
      disabledReason: tenantDomainsTable.disabledReason,
      verifiedAt: tenantDomainsTable.verifiedAt,
      createdAt: tenantDomainsTable.createdAt,
    })
    .from(tenantDomainsTable)
    .where(eq(tenantDomainsTable.tenantId, tenantId))
    .orderBy(desc(tenantDomainsTable.isPrimary), asc(tenantDomainsTable.domain));

  return rows.map((row) => ({
    ...row,
    dnsLastCheckedAt: row.dnsLastCheckedAt?.toISOString() ?? null,
    tlsLastCheckedAt: row.tlsLastCheckedAt?.toISOString() ?? null,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    disabledAt: row.disabledAt?.toISOString() ?? null,
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
        type: "fieldgrid_subdomain",
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
  const billingReference = textValue(formData, "billingReference", 160);
  const manualBillingNotes = textValue(formData, "manualBillingNotes", 2000);
  const currentPeriodEndsAt = optionalDateValue(formData, "currentPeriodEndsAt");

  if (!tenantId) return { success: false, message: "Tenant is verplicht." };

  const previousPlan = await getTenantPlanSnapshot(tenantId);
  const [plan] = await db
    .select({
      id: plansTable.id,
      name: plansTable.name,
      customDomains: sql<boolean>`COALESCE((
        SELECT pl.is_enabled FROM ${planLimitsTable} pl
        WHERE pl.plan_id = ${plansTable.id}
          AND pl.key = 'custom_domains'
        LIMIT 1
      ), ${plansTable.key} = 'enterprise')`,
      customRoles: sql<boolean>`COALESCE((
        SELECT pl.is_enabled FROM ${planLimitsTable} pl
        WHERE pl.plan_id = ${plansTable.id}
          AND pl.key = 'custom_roles'
        LIMIT 1
      ), ${plansTable.key} IN ('professional', 'enterprise'))`,
    })
    .from(plansTable)
    .where(and(eq(plansTable.key, planKey), eq(plansTable.isActive, true)))
    .limit(1);

  if (!plan) return { success: false, message: "Plan niet gevonden of inactief." };

  const [impact] = await db
    .select({
      customDomains: sql<number>`(
        SELECT count(*)
        FROM ${tenantDomainsTable}
        WHERE tenant_id = ${tenantId}::uuid
          AND type = 'custom_domain'
          AND verification_status NOT IN ('disabled', 'disabled_plan')
      )::int`,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  const customDomainsDisabled = plan.customDomains ? 0 : Number(impact?.customDomains ?? 0);

  await db.transaction(async (tx) => {
    await tx.update(tenantsTable).set({ planKey, updatedAt: new Date() }).where(eq(tenantsTable.id, tenantId));
    await tx
      .update(tenantSubscriptionsTable)
      .set({ status: "canceled", canceledAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(tenantSubscriptionsTable.tenantId, tenantId),
          inArray(tenantSubscriptionsTable.status, ["trial", "active", "past_due"]),
        ),
      );
    await tx.insert(tenantSubscriptionsTable).values({
      tenantId,
      planId: plan.id,
      status: "active",
      source: "manual",
      createdBy: actor.userId,
      currentPeriodStartsAt: new Date(),
      currentPeriodEndsAt,
      billingReference,
      manualBillingNotes,
    });

    if (!plan.customDomains) {
      await tx
        .update(tenantDomainsTable)
        .set({
          verificationStatus: "disabled_plan",
          tlsStatus: "disabled",
          disabledAt: new Date(),
          disabledReason: "Custom domains zijn niet inbegrepen in het actieve subscription-plan.",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tenantDomainsTable.tenantId, tenantId),
            eq(tenantDomainsTable.type, "custom_domain"),
            inArray(tenantDomainsTable.verificationStatus, ["pending", "pending_dns", "dns_seen", "verified", "tls_pending", "active", "failed"]),
          ),
        );
    }
  });

  await auditPlatformTenantAction({
    tenantId,
    action: "tenant_plan_updated",
    metadata: {
      fromPlan: previousPlan.plan,
      toPlan: planKey,
      planName: plan.name,
      customRoles: plan.customRoles,
      customDomains: plan.customDomains,
      disabledCustomDomains: customDomainsDisabled,
      billingReference,
      hasManualBillingNotes: Boolean(manualBillingNotes),
    },
  });
  revalidatePlatformTenant(tenantId);
  return { success: true };
}

export async function updatePlatformTenantSubscription(formData: FormData): Promise<ActionResult> {
  const actor = await requirePlatformAdmin();
  const subscriptionId = actionValue(formData, "subscriptionId");
  const status = normalizeSubscriptionStatus(actionValue(formData, "status"));
  const currentPeriodEndsAt = optionalDateValue(formData, "currentPeriodEndsAt");
  const billingReference = textValue(formData, "billingReference", 160);
  const manualBillingNotes = textValue(formData, "manualBillingNotes", 2000);

  if (!subscriptionId) return { success: false, message: "Subscription is verplicht." };

  const [subscription] = await db
    .select({
      id: tenantSubscriptionsTable.id,
      tenantId: tenantSubscriptionsTable.tenantId,
      planId: tenantSubscriptionsTable.planId,
      planKey: plansTable.key,
      planName: plansTable.name,
    })
    .from(tenantSubscriptionsTable)
    .innerJoin(plansTable, eq(tenantSubscriptionsTable.planId, plansTable.id))
    .where(eq(tenantSubscriptionsTable.id, subscriptionId))
    .limit(1);

  if (!subscription) return { success: false, message: "Subscription niet gevonden." };

  await db.transaction(async (tx) => {
    if (subscriptionIsRuntimeActive(status)) {
      await tx
        .update(tenantSubscriptionsTable)
        .set({ status: "canceled", canceledAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(tenantSubscriptionsTable.tenantId, subscription.tenantId),
            inArray(tenantSubscriptionsTable.status, ["trial", "active"]),
          ),
        );
      await tx.update(tenantsTable).set({ planKey: subscription.planKey, updatedAt: new Date() }).where(eq(tenantsTable.id, subscription.tenantId));
    }

    await tx
      .update(tenantSubscriptionsTable)
      .set({
        status,
        currentPeriodEndsAt,
        billingReference,
        manualBillingNotes,
        canceledAt: subscriptionIsRuntimeActive(status) ? null : status === "canceled" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(tenantSubscriptionsTable.id, subscriptionId));
  });

  await auditPlatformTenantAction({
    tenantId: subscription.tenantId,
    action: "tenant_subscription_updated",
    resource: "tenant_subscriptions",
    resourceId: subscription.id,
    metadata: {
      status,
      planKey: subscription.planKey,
      planName: subscription.planName,
      billingReference,
      hasManualBillingNotes: Boolean(manualBillingNotes),
      updatedBy: actor.userId,
    },
  });
  revalidatePlatformTenant(subscription.tenantId);
  return { success: true };
}

export async function addPlatformTenantDomain(formData: FormData): Promise<ActionResult> {
  const actor = await requirePlatformAdmin();
  const tenantId = actionValue(formData, "tenantId");
  const domain = normalizeHost(actionValue(formData, "domain"));
  const type = normalizeDomainType(actionValue(formData, "type"), domain);
  const isPrimary = booleanValue(formData, "isPrimary");

  if (!tenantId || !domain) return { success: false, message: "Tenant en domein zijn verplicht." };
  if (isPlatformHost(domain)) return { success: false, message: "Platformhost kan niet aan een tenant worden gekoppeld." };

  const gate = await tenantCustomDomainGate(tenantId);
  if (!gate.tenant) return { success: false, message: gate.detail };

  const isCustomDomain = type === "custom_domain";
  if (isCustomDomain && !gate.allowed) return { success: false, message: gate.detail };

  const token = isCustomDomain ? randomVerificationToken() : null;
  const verificationStatus = isCustomDomain ? "pending_dns" : "verified";
  const verifiedAt = isCustomDomain ? null : new Date();
  const dnsTxtName = isCustomDomain ? customDomainTxtName(domain) : null;
  const dnsTarget = isCustomDomain ? customDomainCnameTarget(gate.tenant.slug) : null;
  const tlsStatus = isCustomDomain ? "pending" : "active";

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
        verificationToken: token,
        verificationMethod: "dns_txt",
        dnsTxtName,
        dnsTarget,
        tlsStatus,
        verifiedAt,
        activatedAt: isCustomDomain ? null : new Date(),
        createdByPlatformUserId: actor.id,
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
  const actor = await requirePlatformAdmin();
  const tenantId = actionValue(formData, "tenantId");
  const domainId = actionValue(formData, "domainId");
  const domainAction = actionValue(formData, "domainAction");

  if (!tenantId || !domainId) return { success: false, message: "Tenant en domein zijn verplicht." };

  const [domain] = await db
    .select({
      id: tenantDomainsTable.id,
      tenantId: tenantDomainsTable.tenantId,
      domain: tenantDomainsTable.domain,
      type: tenantDomainsTable.type,
      verificationStatus: tenantDomainsTable.verificationStatus,
      verificationToken: tenantDomainsTable.verificationToken,
      dnsTxtName: tenantDomainsTable.dnsTxtName,
      dnsTarget: tenantDomainsTable.dnsTarget,
    })
    .from(tenantDomainsTable)
    .where(and(eq(tenantDomainsTable.id, domainId), eq(tenantDomainsTable.tenantId, tenantId)))
    .limit(1);

  if (!domain) return { success: false, message: "Domein niet gevonden." };
  if (domain.type === "platform_reserved") return { success: false, message: "Platformdomeinen kunnen hier niet worden gewijzigd." };

  const gate = await tenantCustomDomainGate(tenantId);
  if (!gate.tenant) return { success: false, message: gate.detail };
  if (domain.type === "custom_domain" && !gate.allowed) {
    await db
      .update(tenantDomainsTable)
      .set({
        verificationStatus: "disabled_plan",
        tlsStatus: "disabled",
        disabledAt: new Date(),
        disabledReason: gate.detail,
        updatedAt: new Date(),
      })
      .where(eq(tenantDomainsTable.id, domainId));
    await auditPlatformTenantAction({ tenantId, action: "tenant_domain_disabled_plan", resource: "tenant_domains", resourceId: domainId, metadata: { domain: domain.domain } });
    revalidatePlatformTenant(tenantId);
    return { success: false, message: gate.detail };
  }

  if (domainAction === "check_dns" || domainAction === "verify") {
    if (domain.type !== "custom_domain") {
      await db
        .update(tenantDomainsTable)
        .set({ verificationStatus: "verified", tlsStatus: "active", verifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(tenantDomainsTable.id, domainId));
      await auditPlatformTenantAction({ tenantId, action: "tenant_domain_verified", resource: "tenant_domains", resourceId: domainId, metadata: { domain: domain.domain, type: domain.type } });
      revalidatePlatformTenant(tenantId);
      return { success: true };
    }

    if (!domain.verificationToken || !domain.dnsTxtName) {
      return { success: false, message: "Verificatietoken ontbreekt. Verwijder en voeg het domein opnieuw toe." };
    }

    const expectedTxt = customDomainVerificationValue(domain.verificationToken);
    const expectedIpv4 = publicIpv4Target();
    const expectedIpv6 = publicIpv6Target();
    const expectedCname = domain.dnsTarget ? normalizeHost(domain.dnsTarget) : customDomainCnameTarget(gate.tenant.slug);
    let txtValues: string[] = [];
    let addressValues: string[] = [];
    let cnameValues: string[] = [];
    let status: "dns_seen" | "verified" | "failed" = "failed";
    let errorMessage: string | null = null;

    try {
      [txtValues, addressValues, cnameValues] = await Promise.all([
        resolveTxtValues(domain.dnsTxtName),
        resolveAValues(domain.domain),
        resolveCnameValues(domain.domain),
      ]);

      const txtOk = txtValues.includes(expectedTxt);
      const aOk = Boolean((expectedIpv4 && addressValues.includes(expectedIpv4)) || (expectedIpv6 && addressValues.includes(expectedIpv6)));
      const cnameOk = cnameValues.includes(expectedCname);
      const routingOk = aOk || cnameOk;

      if (txtOk && routingOk) {
        status = "verified";
      } else if (txtOk) {
        status = "dns_seen";
        errorMessage = "TXT-record klopt, maar A/AAAA/CNAME wijst nog niet naar Fieldgrid.";
      } else {
        errorMessage = "TXT-verificatie ontbreekt of heeft een verkeerde waarde.";
      }
    } catch (error) {
      errorMessage = dnsErrorMessage(error);
    }

    const now = new Date();
    await db
      .update(tenantDomainsTable)
      .set({
        verificationStatus: status,
        verifiedAt: status === "verified" ? now : null,
        verifiedByPlatformUserId: status === "verified" ? actor.id : null,
        dnsLastCheckedAt: now,
        dnsLastError: errorMessage,
        tlsStatus: status === "verified" ? "pending" : "pending",
        tlsLastError: null,
        disabledAt: null,
        disabledReason: null,
        updatedAt: now,
      })
      .where(eq(tenantDomainsTable.id, domainId));

    await recordDomainCheck({
      tenantDomainId: domainId,
      tenantId,
      checkType: "dns",
      status,
      details: {
        expectedTxt,
        expectedIpv4,
        expectedIpv6,
        expectedCname,
        txtValues,
        addressValues,
        cnameValues,
        errorMessage,
      },
    });
    await auditPlatformTenantAction({ tenantId, action: "tenant_domain_dns_checked", resource: "tenant_domains", resourceId: domainId, metadata: { domain: domain.domain, status, errorMessage } });

    if (status !== "verified") {
      await maybeOpenDomainVerificationTicket({
        tenantId,
        domainId,
        domain: domain.domain,
        status,
        errorMessage,
      });
    }

    revalidatePlatformTenant(tenantId);

    return status === "verified"
      ? { success: true }
      : { success: false, message: errorMessage ?? "DNS-verificatie is nog niet compleet." };
  } else if (domainAction === "check_tls") {
    if (!domainCanRoute(domain.verificationStatus)) {
      return { success: false, message: "TLS kan pas na DNS-verificatie worden geactiveerd." };
    }
    await db
      .update(tenantDomainsTable)
      .set({ tlsStatus: "active", tlsLastCheckedAt: new Date(), tlsLastError: null, activatedAt: new Date(), verificationStatus: "active", updatedAt: new Date() })
      .where(eq(tenantDomainsTable.id, domainId));
    await recordDomainCheck({ tenantDomainId: domainId, tenantId, checkType: "tls", status: "active", details: { domain: domain.domain } });
    await auditPlatformTenantAction({ tenantId, action: "tenant_domain_tls_checked", resource: "tenant_domains", resourceId: domainId, metadata: { domain: domain.domain, status: "active" } });
  } else if (domainAction === "activate") {
    if (!domainCanRoute(domain.verificationStatus)) {
      return { success: false, message: "Domein moet eerst geverifieerd zijn." };
    }
    await db
      .update(tenantDomainsTable)
      .set({ verificationStatus: "active", tlsStatus: "pending", activatedAt: new Date(), disabledAt: null, disabledReason: null, updatedAt: new Date() })
      .where(eq(tenantDomainsTable.id, domainId));
  } else if (domainAction === "primary") {
    if (!domainCanRoute(domain.verificationStatus)) {
      return { success: false, message: "Alleen verified/active domeinen kunnen primair worden." };
    }
    await db.transaction(async (tx) => {
      await tx.update(tenantDomainsTable).set({ isPrimary: false }).where(eq(tenantDomainsTable.tenantId, tenantId));
      await tx.update(tenantDomainsTable).set({ isPrimary: true, updatedAt: new Date() }).where(eq(tenantDomainsTable.id, domainId));
    });
  } else if (domainAction === "disable") {
    await db
      .update(tenantDomainsTable)
      .set({ verificationStatus: "disabled", tlsStatus: "disabled", disabledAt: new Date(), disabledReason: actionValue(formData, "disabledReason") || "Uitgeschakeld door platformbeheer.", updatedAt: new Date() })
      .where(eq(tenantDomainsTable.id, domainId));
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
