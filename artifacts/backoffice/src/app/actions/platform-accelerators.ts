"use server";

import {
  auditLogTable,
  db,
  defaultTenantDomainForSlug,
  documentsTable,
  emailDeliveryLogTable,
  platformNotificationDispatchesTable,
  plansTable,
  tenantDomainsTable,
  tenantModulesTable,
  tenantSubscriptionsTable,
  tenantUsersTable,
  tenantsTable,
  resolveFieldgridDeploymentEnvironment,
} from "@workspace/db";
import { asc, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  requirePlatformAdmin,
  type CurrentPlatformUser,
} from "@/lib/auth/platform";
import { listPlatformNotificationCenter } from "./platform-notifications";
import { getPlatformStagingSmokeDashboard } from "./platform-smoke";
import type { PlatformSmokeStatus } from "./platform-smoke.types";

export type PlatformAcceleratorHealthSignal = {
  id:
    | "domains"
    | "mail"
    | "modules"
    | "users"
    | "errors"
    | "storage"
    | "smokes";
  label: string;
  status: PlatformSmokeStatus;
  summary: string;
  nextAction: string;
};

export type PlatformAcceleratorTenantHealthRow = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
  planKey: string;
  primaryDomain: string | null;
  subscriptionStatus: string | null;
  score: number;
  status: PlatformSmokeStatus;
  signals: PlatformAcceleratorHealthSignal[];
  metrics: {
    domains: number;
    verifiedDomains: number;
    failedEmails7d: number;
    sentEmails7d: number;
    enabledModules: number;
    activeUsers: number;
    errorEvents7d: number;
    documents: number;
    storageBytes: number;
    legacyStoragePaths: number;
    latestSmokeStatus: PlatformSmokeStatus;
  };
};

export type PlatformAcceleratorDemoTenant = {
  slug: "demo-a" | "demo-b" | "veeleservices";
  label: string;
  domain: string;
  recommendedPlan: string;
  resetCommand: string;
  exists: boolean;
  tenantId: string | null;
  status: string | null;
  healthStatus: PlatformSmokeStatus;
  lastResetRequestedAt: string | null;
};

export type PlatformAcceleratorNotificationSandboxEvent = {
  key: string;
  label: string;
  description: string;
  title: string;
  body: string;
  recommendedAudience: string;
  estimatedRecipients: number;
  latestDispatchStatus: string | null;
  channels: string[];
};

export type PlatformAcceleratorVisualSnapshotTarget = {
  id:
    | "platform-backoffice"
    | "tenant-backoffice"
    | "customer-portal"
    | "personnel-portal";
  label: string;
  baseUrlEnv: string;
  routes: string[];
  viewports: string[];
  artifactDirectory: string;
  command: string;
  latestRequestAt: string | null;
};

export type PlatformAcceleratorExportCenterItem = {
  id: "platform-admin" | "audit" | "billing";
  label: string;
  description: string;
  href: string;
  format: "csv";
  owner: string;
  status: PlatformSmokeStatus;
  lastRequestedAt: string | null;
};

export type PlatformAcceleratorsDashboard = {
  generatedAt: string;
  summary: {
    tenants: number;
    healthyTenants: number;
    warningTenants: number;
    blockedTenants: number;
    manualTenants: number;
    demoTenants: number;
    notificationEvents: number;
    exportFeeds: number;
  };
  demoTenants: PlatformAcceleratorDemoTenant[];
  notificationSandbox: PlatformAcceleratorNotificationSandboxEvent[];
  tenantHealth: PlatformAcceleratorTenantHealthRow[];
  visualRegression: PlatformAcceleratorVisualSnapshotTarget[];
  exportCenter: PlatformAcceleratorExportCenterItem[];
};

type CountMap = Map<string, number>;

const DEMO_TENANT_SLUGS = ["demo-a", "demo-b", "veeleservices"] as const;
const DEMO_RESET_CONFIRMATION = "reset-demo-tenants";

const VISUAL_REGRESSION_VIEWPORTS = [
  "mobile-390",
  "tablet-768",
  "desktop-1440",
];
const VISUAL_REGRESSION_COMMAND =
  "pnpm fieldgrid:visual-regression-snapshots --run";

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function numberValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function statusRank(status: PlatformSmokeStatus): number {
  if (status === "blocked") return 3;
  if (status === "warning") return 2;
  if (status === "manual") return 1;
  return 0;
}

function combinedStatus(
  signals: PlatformAcceleratorHealthSignal[],
): PlatformSmokeStatus {
  return signals.reduce<PlatformSmokeStatus>(
    (current, signal) =>
      statusRank(signal.status) > statusRank(current) ? signal.status : current,
    "ok",
  );
}

function healthScore(signals: PlatformAcceleratorHealthSignal[]): number {
  const weights: Record<PlatformSmokeStatus, number> = {
    ok: 100,
    manual: 70,
    warning: 45,
    blocked: 0,
  };
  return Math.round(
    signals.reduce((total, signal) => total + weights[signal.status], 0) /
      signals.length,
  );
}

function statusForScore(
  score: number,
  status: PlatformSmokeStatus,
): PlatformSmokeStatus {
  if (status === "blocked") return "blocked";
  if (status === "warning") return "warning";
  if (status === "manual") return "manual";
  return score >= 85 ? "ok" : "warning";
}

function mapCounts(
  rows: Array<{ tenantId: string; value: unknown }>,
): CountMap {
  return new Map(rows.map((row) => [row.tenantId, numberValue(row.value)]));
}

async function latestAuditActionTimes(
  action: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      resourceId: auditLogTable.resourceId,
      latestAt: sql<Date>`max(${auditLogTable.createdAt})`,
    })
    .from(auditLogTable)
    .where(eq(auditLogTable.action, action))
    .groupBy(auditLogTable.resourceId);

  return new Map(
    rows
      .filter((row) => Boolean(row.resourceId))
      .map((row) => [String(row.resourceId), toIso(row.latestAt) ?? ""]),
  );
}

async function writePlatformAcceleratorAudit(input: {
  actor: CurrentPlatformUser;
  action: string;
  resourceId: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  await db.insert(auditLogTable).values({
    tenantId: null,
    userId: input.actor.userId,
    action: input.action,
    resource: "platform_accelerators",
    resourceId: input.resourceId,
    metadata: input.metadata,
  });
}

async function listDomainCounts(): Promise<
  Map<
    string,
    { domains: number; verifiedDomains: number; primaryDomain: string | null }
  >
> {
  const rows = await db
    .select({
      tenantId: tenantDomainsTable.tenantId,
      domains: sql<number>`count(*) FILTER (WHERE ${tenantDomainsTable.type} <> 'platform_reserved')::int`,
      verifiedDomains: sql<number>`count(*) FILTER (
        WHERE ${tenantDomainsTable.type} <> 'platform_reserved'
          AND ${tenantDomainsTable.verificationStatus} IN ('verified', 'active')
          AND ${tenantDomainsTable.tlsStatus} IN ('ready', 'active', 'issued', 'verified')
      )::int`,
      primaryDomain: sql<
        string | null
      >`max(${tenantDomainsTable.domain}) FILTER (WHERE ${tenantDomainsTable.isPrimary} = true)`,
    })
    .from(tenantDomainsTable)
    .groupBy(tenantDomainsTable.tenantId);

  return new Map(
    rows.map((row) => [
      row.tenantId,
      {
        domains: numberValue(row.domains),
        verifiedDomains: numberValue(row.verifiedDomains),
        primaryDomain: row.primaryDomain,
      },
    ]),
  );
}

async function listMailCounts(): Promise<
  Map<string, { sent: number; failed: number }>
> {
  const rows = await db
    .select({
      tenantId: emailDeliveryLogTable.tenantId,
      sent: sql<number>`count(*) FILTER (WHERE ${emailDeliveryLogTable.status} IN ('sent', 'delivered', 'queued', 'scheduled'))::int`,
      failed: sql<number>`count(*) FILTER (WHERE ${emailDeliveryLogTable.status} IN ('failed', 'error', 'bounced'))::int`,
    })
    .from(emailDeliveryLogTable)
    .where(
      sql`${emailDeliveryLogTable.tenantId} IS NOT NULL AND ${emailDeliveryLogTable.createdAt} >= now() - interval '7 days'`,
    )
    .groupBy(emailDeliveryLogTable.tenantId);

  return new Map(
    rows
      .filter((row): row is typeof row & { tenantId: string } =>
        Boolean(row.tenantId),
      )
      .map((row) => [
        row.tenantId,
        { sent: numberValue(row.sent), failed: numberValue(row.failed) },
      ]),
  );
}

async function listLatestSubscriptionStatus(): Promise<Map<string, string>> {
  const rows = await db
    .select({
      tenantId: tenantSubscriptionsTable.tenantId,
      status: tenantSubscriptionsTable.status,
      updatedAt: tenantSubscriptionsTable.updatedAt,
    })
    .from(tenantSubscriptionsTable)
    .orderBy(
      asc(tenantSubscriptionsTable.tenantId),
      desc(tenantSubscriptionsTable.updatedAt),
    );

  const result = new Map<string, string>();
  for (const row of rows) {
    if (!result.has(row.tenantId)) {
      result.set(row.tenantId, row.status);
    }
  }
  return result;
}

async function listStorageCounts(): Promise<
  Map<string, { documents: number; storageBytes: number; legacyPaths: number }>
> {
  const rows = await db
    .select({
      tenantId: documentsTable.tenantId,
      documents: sql<number>`count(*)::int`,
      storageBytes: sql<number>`coalesce(sum(${documentsTable.sizeBytes}), 0)::bigint`,
      legacyPaths: sql<number>`count(*) FILTER (
        WHERE ${documentsTable.storagePath} NOT LIKE ('tenants/' || ${documentsTable.tenantId}::text || '/%')
          AND ${documentsTable.storagePath} NOT LIKE (${documentsTable.tenantId}::text || '/%')
      )::int`,
    })
    .from(documentsTable)
    .where(sql`${documentsTable.tenantId} IS NOT NULL`)
    .groupBy(documentsTable.tenantId);

  return new Map(
    rows
      .filter((row): row is typeof row & { tenantId: string } =>
        Boolean(row.tenantId),
      )
      .map((row) => [
        row.tenantId,
        {
          documents: numberValue(row.documents),
          storageBytes: numberValue(row.storageBytes),
          legacyPaths: numberValue(row.legacyPaths),
        },
      ]),
  );
}

function buildHealthSignals(input: {
  tenantStatus: string;
  domainCount: number;
  verifiedDomainCount: number;
  sentEmails7d: number;
  failedEmails7d: number;
  enabledModules: number;
  activeUsers: number;
  errorEvents7d: number;
  documents: number;
  storageBytes: number;
  legacyStoragePaths: number;
  smokeStatus: PlatformSmokeStatus;
}): PlatformAcceleratorHealthSignal[] {
  const inactiveTenant = ["suspended", "archived"].includes(input.tenantStatus);

  return [
    {
      id: "domains",
      label: "Domeinen",
      status:
        input.verifiedDomainCount > 0
          ? "ok"
          : input.domainCount > 0
            ? "warning"
            : inactiveTenant
              ? "manual"
              : "blocked",
      summary:
        input.verifiedDomainCount > 0
          ? `${input.verifiedDomainCount}/${input.domainCount} domeinen verified.`
          : input.domainCount > 0
            ? `${input.domainCount} domein(en), verificatie open.`
            : "Geen tenantdomein gekoppeld.",
      nextAction:
        input.verifiedDomainCount > 0
          ? "Geen actie nodig."
          : "Controleer DNS/TLS en host-first routing voor deze tenant.",
    },
    {
      id: "mail",
      label: "Mail",
      status:
        input.failedEmails7d > 0
          ? "warning"
          : input.sentEmails7d > 0
            ? "ok"
            : "manual",
      summary:
        input.failedEmails7d > 0
          ? `${input.failedEmails7d} mailfout(en) in 7 dagen.`
          : input.sentEmails7d > 0
            ? `${input.sentEmails7d} mail events in 7 dagen zonder fouten.`
            : "Geen maildelivery bewijs in 7 dagen.",
      nextAction:
        input.failedEmails7d > 0
          ? "Open e-maildelivery log en test tenant-template override."
          : "Draai een tenant notification sandbox of onboardingmail.",
    },
    {
      id: "modules",
      label: "Modules",
      status:
        input.enabledModules > 0 ? "ok" : inactiveTenant ? "manual" : "blocked",
      summary: `${input.enabledModules} module(s) actief.`,
      nextAction:
        input.enabledModules > 0
          ? "Geen actie nodig."
          : "Koppel minimaal de basis modules via onboarding/provisioning.",
    },
    {
      id: "users",
      label: "Users",
      status:
        input.activeUsers > 0 ? "ok" : inactiveTenant ? "manual" : "blocked",
      summary: `${input.activeUsers} actieve tenant user(s).`,
      nextAction:
        input.activeUsers > 0
          ? "Geen actie nodig."
          : "Controleer owner invite en tenant_users membership.",
    },
    {
      id: "errors",
      label: "Errors",
      status:
        input.errorEvents7d > 10
          ? "blocked"
          : input.errorEvents7d > 0
            ? "warning"
            : "ok",
      summary: `${input.errorEvents7d} error/denial events in 7 dagen.`,
      nextAction:
        input.errorEvents7d > 0
          ? "Open security/audit export en koppel owner per terugkerende fout."
          : "Geen actie nodig.",
    },
    {
      id: "storage",
      label: "Storage",
      status:
        input.legacyStoragePaths > 0
          ? "warning"
          : input.documents > 0
            ? "ok"
            : "manual",
      summary:
        input.documents > 0
          ? `${input.documents} documenten, ${formatBytes(input.storageBytes)}, ${input.legacyStoragePaths} legacy path(s).`
          : "Geen documentstorage bewijs.",
      nextAction:
        input.legacyStoragePaths > 0
          ? "Migreer legacy documentpaden naar tenant-prefixed storage."
          : "Draai storage/download smoke voor tenant bewijs.",
    },
    {
      id: "smokes",
      label: "Smokes",
      status: input.smokeStatus,
      summary:
        input.smokeStatus === "ok"
          ? "Laatste staging smoke staat groen."
          : "Smoke evidence vraagt handmatige check.",
      nextAction:
        input.smokeStatus === "ok"
          ? "Geen actie nodig."
          : "Draai staging smoke en publiceer evidence artifact.",
    },
  ];
}

async function buildTenantHealth(): Promise<
  PlatformAcceleratorTenantHealthRow[]
> {
  const [
    tenants,
    domainCounts,
    mailCounts,
    moduleCounts,
    activeUserCounts,
    errorCounts,
    storageCounts,
    subscriptionStatuses,
    stagingSmoke,
  ] = await Promise.all([
    db.select().from(tenantsTable).orderBy(asc(tenantsTable.name)),
    listDomainCounts(),
    listMailCounts(),
    db
      .select({
        tenantId: tenantModulesTable.tenantId,
        value: sql<number>`count(*) FILTER (WHERE ${tenantModulesTable.isEnabled} = true)::int`,
      })
      .from(tenantModulesTable)
      .groupBy(tenantModulesTable.tenantId)
      .then(mapCounts),
    db
      .select({
        tenantId: tenantUsersTable.tenantId,
        value: sql<number>`count(*) FILTER (WHERE ${tenantUsersTable.status} = 'active')::int`,
      })
      .from(tenantUsersTable)
      .groupBy(tenantUsersTable.tenantId)
      .then(mapCounts),
    db
      .select({
        tenantId: auditLogTable.tenantId,
        value: sql<number>`count(*)::int`,
      })
      .from(auditLogTable)
      .where(
        sql`${auditLogTable.tenantId} IS NOT NULL
        AND ${auditLogTable.createdAt} >= now() - interval '7 days'
        AND (
          ${auditLogTable.action} ILIKE '%error%'
          OR ${auditLogTable.action} ILIKE '%failed%'
          OR ${auditLogTable.action} ILIKE '%denied%'
          OR ${auditLogTable.action} ILIKE '%blocked%'
        )`,
      )
      .groupBy(auditLogTable.tenantId)
      .then(
        (rows) =>
          new Map(
            rows
              .filter((row): row is typeof row & { tenantId: string } =>
                Boolean(row.tenantId),
              )
              .map((row) => [row.tenantId, numberValue(row.value)]),
          ),
      ),
    listStorageCounts(),
    listLatestSubscriptionStatus(),
    getPlatformStagingSmokeDashboard(),
  ]);

  const smokeStatus = stagingSmoke.stagingPromotionGate.status;

  return tenants.map((tenant) => {
    const domains = domainCounts.get(tenant.id) ?? {
      domains: 0,
      verifiedDomains: 0,
      primaryDomain: null,
    };
    const mail = mailCounts.get(tenant.id) ?? { sent: 0, failed: 0 };
    const storage = storageCounts.get(tenant.id) ?? {
      documents: 0,
      storageBytes: 0,
      legacyPaths: 0,
    };
    const metrics = {
      domains: domains.domains,
      verifiedDomains: domains.verifiedDomains,
      failedEmails7d: mail.failed,
      sentEmails7d: mail.sent,
      enabledModules: moduleCounts.get(tenant.id) ?? 0,
      activeUsers: activeUserCounts.get(tenant.id) ?? 0,
      errorEvents7d: errorCounts.get(tenant.id) ?? 0,
      documents: storage.documents,
      storageBytes: storage.storageBytes,
      legacyStoragePaths: storage.legacyPaths,
      latestSmokeStatus: smokeStatus,
    };
    const signals = buildHealthSignals({
      tenantStatus: tenant.status,
      domainCount: metrics.domains,
      verifiedDomainCount: metrics.verifiedDomains,
      sentEmails7d: metrics.sentEmails7d,
      failedEmails7d: metrics.failedEmails7d,
      enabledModules: metrics.enabledModules,
      activeUsers: metrics.activeUsers,
      errorEvents7d: metrics.errorEvents7d,
      documents: metrics.documents,
      storageBytes: metrics.storageBytes,
      legacyStoragePaths: metrics.legacyStoragePaths,
      smokeStatus,
    });
    const score = healthScore(signals);

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      tenantStatus: tenant.status,
      planKey: tenant.planKey,
      primaryDomain: domains.primaryDomain,
      subscriptionStatus: subscriptionStatuses.get(tenant.id) ?? null,
      score,
      status: statusForScore(score, combinedStatus(signals)),
      signals,
      metrics,
    };
  });
}

function buildNotificationSandbox(
  center: Awaited<ReturnType<typeof listPlatformNotificationCenter>>,
): PlatformAcceleratorNotificationSandboxEvent[] {
  return center.templates.map((template) => {
    const latestDispatch =
      center.dispatches.find(
        (dispatch) => dispatch.templateKey === template.key,
      ) ?? null;
    const estimatedRecipients =
      template.key === "maintenance" || template.key === "incident"
        ? center.stats.platformUsers + center.stats.tenantOwners
        : template.key === "onboarding_reminder" ||
            template.key === "domain_dns_reminder"
          ? center.stats.readinessIssues
          : center.plans.reduce(
              (total, plan) => total + plan.recipientCount,
              0,
            );

    return {
      key: template.key,
      label: template.label,
      description: template.description,
      title: template.title,
      body: template.body,
      recommendedAudience:
        template.key === "maintenance" || template.key === "incident"
          ? "platform_users + tenant_owners"
          : template.key === "subscription_warning"
            ? "tenants_by_plan"
            : "tenants_with_readiness_issue",
      estimatedRecipients,
      latestDispatchStatus: latestDispatch?.status ?? null,
      channels: ["in_app", "email"],
    };
  });
}

async function buildDemoTenants(
  healthRows: PlatformAcceleratorTenantHealthRow[],
): Promise<PlatformAcceleratorDemoTenant[]> {
  const environment = resolveFieldgridDeploymentEnvironment();
  const lastResetRequests = await latestAuditActionTimes(
    "demo_tenant_reset_requested",
  );
  const healthBySlug = new Map(healthRows.map((row) => [row.tenantSlug, row]));

  const presets = [
    {
      slug: "demo-a",
      label: "Demo A",
      domain: defaultTenantDomainForSlug("demo-a", environment),
      recommendedPlan: "professional",
      resetCommand:
        "FIELDGRID_DEMO_RESET_CONFIRM=demo-a pnpm fieldgrid:phase1-fixtures -- --tenant demo-a --reset",
    },
    {
      slug: "demo-b",
      label: "Demo B",
      domain: defaultTenantDomainForSlug("demo-b", environment),
      recommendedPlan: "professional",
      resetCommand:
        "FIELDGRID_DEMO_RESET_CONFIRM=demo-b pnpm fieldgrid:phase1-fixtures -- --tenant demo-b --reset",
    },
    {
      slug: "veeleservices",
      label: "Veeleservices referentie",
      domain: defaultTenantDomainForSlug("veeleservices", environment),
      recommendedPlan: "enterprise",
      resetCommand:
        "FIELDGRID_DEMO_RESET_CONFIRM=veeleservices pnpm fieldgrid:phase1-fixtures -- --tenant veeleservices --reset",
    },
  ] satisfies Array<
    Pick<
      PlatformAcceleratorDemoTenant,
      "slug" | "label" | "domain" | "recommendedPlan" | "resetCommand"
    >
  >;

  return presets.map((preset) => {
    const health = healthBySlug.get(preset.slug);
    return {
      ...preset,
      exists: Boolean(health),
      tenantId: health?.tenantId ?? null,
      status: health?.tenantStatus ?? null,
      healthStatus: health?.status ?? "manual",
      lastResetRequestedAt: lastResetRequests.get(preset.slug) ?? null,
    };
  });
}

async function buildVisualRegressionTargets(): Promise<
  PlatformAcceleratorVisualSnapshotTarget[]
> {
  const lastRequests = await latestAuditActionTimes(
    "visual_regression_snapshot_requested",
  );
  const artifactDirectory = "artifacts/visual-regression";

  return [
    {
      id: "platform-backoffice",
      label: "Platform backoffice",
      baseUrlEnv: "FIELDGRID_BACKOFFICE_BASE_URL",
      routes: [
        "/platform",
        "/platform/accelerators",
        "/platform/tenants",
        "/platform/notifications",
        "/platform/security",
        "/platform/staging-smoke",
      ],
      viewports: VISUAL_REGRESSION_VIEWPORTS,
      artifactDirectory,
      command: `${VISUAL_REGRESSION_COMMAND} --target platform-backoffice`,
      latestRequestAt: lastRequests.get("platform-backoffice") ?? null,
    },
    {
      id: "tenant-backoffice",
      label: "Tenant backoffice",
      baseUrlEnv: "FIELDGRID_TENANT_BACKOFFICE_BASE_URL",
      routes: [
        "/dashboard",
        "/customers",
        "/objects",
        "/assignments",
        "/documents",
      ],
      viewports: VISUAL_REGRESSION_VIEWPORTS,
      artifactDirectory,
      command: `${VISUAL_REGRESSION_COMMAND} --target tenant-backoffice`,
      latestRequestAt: lastRequests.get("tenant-backoffice") ?? null,
    },
    {
      id: "customer-portal",
      label: "Klantenportaal",
      baseUrlEnv: "FIELDGRID_CUSTOMER_PORTAL_BASE_URL",
      routes: ["/", "/dashboard", "/documenten", "/facturen"],
      viewports: VISUAL_REGRESSION_VIEWPORTS,
      artifactDirectory,
      command: `${VISUAL_REGRESSION_COMMAND} --target customer-portal`,
      latestRequestAt: lastRequests.get("customer-portal") ?? null,
    },
    {
      id: "personnel-portal",
      label: "Personeelsportaal",
      baseUrlEnv: "FIELDGRID_PERSONNEL_PORTAL_BASE_URL",
      routes: ["/", "/planning", "/berichten", "/documenten"],
      viewports: VISUAL_REGRESSION_VIEWPORTS,
      artifactDirectory,
      command: `${VISUAL_REGRESSION_COMMAND} --target personnel-portal`,
      latestRequestAt: lastRequests.get("personnel-portal") ?? null,
    },
  ];
}

async function buildExportCenter(): Promise<
  PlatformAcceleratorExportCenterItem[]
> {
  const lastRequests = await latestAuditActionTimes(
    "platform_export_requested",
  );

  return [
    {
      id: "platform-admin",
      label: "Platform-admin export",
      description:
        "Tenantlijst met domeinen, users, modules, subscriptions en health-score.",
      href: "/api/platform/exports/tenants",
      format: "csv",
      owner: "Platform",
      status: "ok",
      lastRequestedAt: lastRequests.get("platform-admin") ?? null,
    },
    {
      id: "audit",
      label: "Audit/security export",
      description:
        "Securitydashboard export met scope, severity, denial type en metadata.",
      href: "/api/platform/security/export",
      format: "csv",
      owner: "Security",
      status: "ok",
      lastRequestedAt: lastRequests.get("audit") ?? null,
    },
    {
      id: "billing",
      label: "Billing/subscription export",
      description:
        "Subscriptions, plannen, periodes, referenties en handmatige billingnotities.",
      href: "/api/platform/billing/export",
      format: "csv",
      owner: "Finance",
      status: "ok",
      lastRequestedAt: lastRequests.get("billing") ?? null,
    },
  ];
}

function dashboardSummary(
  health: PlatformAcceleratorTenantHealthRow[],
  notificationEvents: number,
  exportFeeds: number,
): PlatformAcceleratorsDashboard["summary"] {
  return {
    tenants: health.length,
    healthyTenants: health.filter((tenant) => tenant.status === "ok").length,
    warningTenants: health.filter((tenant) => tenant.status === "warning")
      .length,
    blockedTenants: health.filter((tenant) => tenant.status === "blocked")
      .length,
    manualTenants: health.filter((tenant) => tenant.status === "manual").length,
    demoTenants: health.filter((tenant) =>
      DEMO_TENANT_SLUGS.includes(
        tenant.tenantSlug as (typeof DEMO_TENANT_SLUGS)[number],
      ),
    ).length,
    notificationEvents,
    exportFeeds,
  };
}

export async function getPlatformAcceleratorsDashboard(): Promise<PlatformAcceleratorsDashboard> {
  await requirePlatformAdmin();

  const [health, notificationCenter, visualRegression, exportCenter] =
    await Promise.all([
      buildTenantHealth(),
      listPlatformNotificationCenter(),
      buildVisualRegressionTargets(),
      buildExportCenter(),
    ]);
  const demoTenants = await buildDemoTenants(health);
  const notificationSandbox = buildNotificationSandbox(notificationCenter);

  return {
    generatedAt: new Date().toISOString(),
    summary: dashboardSummary(
      health,
      notificationSandbox.length,
      exportCenter.length,
    ),
    demoTenants,
    notificationSandbox,
    tenantHealth: health,
    visualRegression,
    exportCenter,
  };
}

export async function requestDemoTenantReset(
  formData: FormData,
): Promise<void> {
  const actor = await requirePlatformAdmin();
  const slug = String(formData.get("slug") ?? "").trim();
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const demoSlug = DEMO_TENANT_SLUGS.includes(
    slug as (typeof DEMO_TENANT_SLUGS)[number],
  )
    ? (slug as (typeof DEMO_TENANT_SLUGS)[number])
    : null;

  if (!demoSlug || confirmation !== DEMO_RESET_CONFIRMATION) {
    await writePlatformAcceleratorAudit({
      actor,
      action: "demo_tenant_reset_rejected",
      resourceId: slug || "unknown",
      metadata: {
        requestedFrom: "/platform/accelerators",
        reason: demoSlug ? "confirmation_mismatch" : "unsupported_demo_slug",
      },
    });
    revalidatePath("/platform/accelerators");
    return;
  }

  await writePlatformAcceleratorAudit({
    actor,
    action: "demo_tenant_reset_requested",
    resourceId: demoSlug,
    metadata: {
      requestedFrom: "/platform/accelerators",
      scope: "demo-tenants-only",
      cleanupContract:
        "Reset mag alleen demo-a, demo-b of veeleservices seeded data raken en moet storage/audit evidence vastleggen.",
      command: `FIELDGRID_DEMO_RESET_CONFIRM=${demoSlug} pnpm fieldgrid:phase1-fixtures -- --tenant ${demoSlug} --reset`,
    },
  });

  revalidatePath("/platform/accelerators");
  revalidatePath("/platform");
}

export async function requestVisualRegressionSnapshot(
  formData: FormData,
): Promise<void> {
  const actor = await requirePlatformAdmin();
  const target = String(formData.get("target") ?? "").trim();
  const allowedTargets: PlatformAcceleratorVisualSnapshotTarget["id"][] = [
    "platform-backoffice",
    "tenant-backoffice",
    "customer-portal",
    "personnel-portal",
  ];
  const targetId = allowedTargets.includes(
    target as PlatformAcceleratorVisualSnapshotTarget["id"],
  )
    ? (target as PlatformAcceleratorVisualSnapshotTarget["id"])
    : "platform-backoffice";

  await writePlatformAcceleratorAudit({
    actor,
    action: "visual_regression_snapshot_requested",
    resourceId: targetId,
    metadata: {
      requestedFrom: "/platform/accelerators",
      command: `${VISUAL_REGRESSION_COMMAND} --target ${targetId}`,
      artifactDirectory: "artifacts/visual-regression",
      viewports: VISUAL_REGRESSION_VIEWPORTS,
    },
  });

  revalidatePath("/platform/accelerators");
}

export async function requestPlatformExportAudit(
  formData: FormData,
): Promise<void> {
  const actor = await requirePlatformAdmin();
  const exportId = String(formData.get("exportId") ?? "").trim();
  const allowedExports: PlatformAcceleratorExportCenterItem["id"][] = [
    "platform-admin",
    "audit",
    "billing",
  ];
  const resourceId = allowedExports.includes(
    exportId as PlatformAcceleratorExportCenterItem["id"],
  )
    ? (exportId as PlatformAcceleratorExportCenterItem["id"])
    : "platform-admin";

  await writePlatformAcceleratorAudit({
    actor,
    action: "platform_export_requested",
    resourceId,
    metadata: {
      requestedFrom: "/platform/accelerators",
      format: "csv",
    },
  });

  revalidatePath("/platform/accelerators");
}

export async function listPlatformTenantHealthForExport(): Promise<
  PlatformAcceleratorTenantHealthRow[]
> {
  await requirePlatformAdmin();
  return buildTenantHealth();
}

export async function listBillingExportRows(): Promise<
  Array<{
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    tenantStatus: string;
    planKey: string;
    planName: string;
    subscriptionStatus: string;
    source: string;
    startsAt: string;
    currentPeriodStartsAt: string | null;
    currentPeriodEndsAt: string | null;
    canceledAt: string | null;
    billingReference: string | null;
    manualBillingNotes: string | null;
    updatedAt: string;
  }>
> {
  await requirePlatformAdmin();

  const rows = await db
    .select({
      tenantId: tenantsTable.id,
      tenantSlug: tenantsTable.slug,
      tenantName: tenantsTable.name,
      tenantStatus: tenantsTable.status,
      planKey: plansTable.key,
      planName: plansTable.name,
      subscriptionStatus: tenantSubscriptionsTable.status,
      source: tenantSubscriptionsTable.source,
      startsAt: tenantSubscriptionsTable.startsAt,
      currentPeriodStartsAt: tenantSubscriptionsTable.currentPeriodStartsAt,
      currentPeriodEndsAt: tenantSubscriptionsTable.currentPeriodEndsAt,
      canceledAt: tenantSubscriptionsTable.canceledAt,
      billingReference: tenantSubscriptionsTable.billingReference,
      manualBillingNotes: tenantSubscriptionsTable.manualBillingNotes,
      updatedAt: tenantSubscriptionsTable.updatedAt,
    })
    .from(tenantSubscriptionsTable)
    .innerJoin(
      tenantsTable,
      eq(tenantSubscriptionsTable.tenantId, tenantsTable.id),
    )
    .innerJoin(plansTable, eq(tenantSubscriptionsTable.planId, plansTable.id))
    .orderBy(asc(tenantsTable.name), desc(tenantSubscriptionsTable.updatedAt));

  return rows.map((row) => ({
    tenantId: row.tenantId,
    tenantSlug: row.tenantSlug,
    tenantName: row.tenantName,
    tenantStatus: row.tenantStatus,
    planKey: row.planKey,
    planName: row.planName,
    subscriptionStatus: row.subscriptionStatus,
    source: row.source,
    startsAt: row.startsAt.toISOString(),
    currentPeriodStartsAt: toIso(row.currentPeriodStartsAt),
    currentPeriodEndsAt: toIso(row.currentPeriodEndsAt),
    canceledAt: toIso(row.canceledAt),
    billingReference: row.billingReference,
    manualBillingNotes: row.manualBillingNotes,
    updatedAt: row.updatedAt.toISOString(),
  }));
}
