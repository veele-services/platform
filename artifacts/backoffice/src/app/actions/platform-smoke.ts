"use server";

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  auditLogTable,
  db,
  documentsTable,
  invoicesTable,
  isPlatformHost,
  modulesTable,
  platformUsersTable,
  quotesTable,
  reportsTable,
  supportAccessAuditLogTable,
  supportAccessGrantsTable,
  tenantDomainsTable,
  tenantModulesTable,
  tenantRegionsTable,
  tenantSectorSettingsTable,
  tenantSectorsTable,
  tenantUsersTable,
  tenantsTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import { requirePlatformAdmin } from "@/lib/auth/platform";

export type PlatformSmokeStatus = "ok" | "warning" | "blocked" | "manual";

export type PlatformSmokeCheck = {
  id: string;
  label: string;
  status: PlatformSmokeStatus;
  summary: string;
  detail: string;
  testIds: string[];
  nextAction: string;
};

export type PlatformSmokeRunHistoryEntry = {
  id: string;
  kind: "dashboard-snapshot" | "migration-smoke" | "staging-smoke";
  label: string;
  status: PlatformSmokeStatus;
  startedAt: string;
  finishedAt: string;
  source: string;
  summary: string;
  artifactPath: string | null;
  checks: string[];
  cleanup: "not-needed" | "required" | "completed" | "unknown";
};

export type PlatformLiveSmokeTarget = {
  id: string;
  label: string;
  status: PlatformSmokeStatus;
  host: string;
  route: string;
  command: string;
  testIds: string[];
  nextAction: string;
};

export type PlatformMigrationSmokeStatus = {
  status: PlatformSmokeStatus;
  command: string;
  reportDirectory: string;
  latestRun: PlatformSmokeRunHistoryEntry | null;
  targets: {
    id: "empty-database" | "staging-copy";
    label: string;
    status: PlatformSmokeStatus;
    requiredSecret: string;
    confirmVar: string;
    testIds: string[];
  }[];
  nextAction: string;
};

export type PlatformMutatingSmokeCheck = {
  id: string;
  label: string;
  status: PlatformSmokeStatus;
  tenantScope: string;
  cleanupStatus: "required-before-run" | "ready" | "not-configured";
  confirmVar: string;
  cleanupSelector: string;
  testIds: string[];
  nextAction: string;
};

export type PlatformStagingSmokeDashboard = {
  generatedAt: string;
  environment: {
    platformHost: string;
    stagingHost: string;
    platformHostKnown: boolean;
    stagingHostKnown: boolean;
  };
  totals: {
    tenants: number;
    activeTenants: number;
    demoTenants: number;
    tenantDomains: number;
    verifiedTenantDomains: number;
    activeTenantUsers: number;
    activePlatformUsers: number;
    moduleCatalog: number;
    tenantsWithEnabledModules: number;
    enabledTenantModules: number;
    tenantSectors: number;
    tenantSectorSettings: number;
    tenantRegions: number;
    documents: number;
    tenantPrefixedDocuments: number;
    legacyDocumentPaths: number;
    reports: number;
    quotes: number;
    invoices: number;
    activeSupportGrants: number;
    supportAuditEvents: number;
    auditEvents: number;
    downloadAuditEvents: number;
    migrationHistoryTables: number;
  };
  checks: PlatformSmokeCheck[];
  runHistory: PlatformSmokeRunHistoryEntry[];
  liveSmokes: PlatformLiveSmokeTarget[];
  migrationSmoke: PlatformMigrationSmokeStatus;
  mutatingChecks: PlatformMutatingSmokeCheck[];
  minimumGreen: string[];
  playbooks: string[];
};

function makeCheck(input: PlatformSmokeCheck): PlatformSmokeCheck {
  return input;
}

function countValue(value: unknown): number {
  return Number(value ?? 0);
}

function statusFromSummary(value: unknown): PlatformSmokeStatus {
  if (value === "pass" || value === "ok") return "ok";
  if (value === "fail" || value === "blocked") return "blocked";
  if (value === "warning") return "warning";
  return "manual";
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function runStatusFromChecks(checks: PlatformSmokeCheck[]): PlatformSmokeStatus {
  if (checks.some((check) => check.status === "blocked")) return "blocked";
  if (checks.some((check) => check.status === "warning")) return "warning";
  if (checks.some((check) => check.status === "manual")) return "manual";
  return "ok";
}

async function readJsonReport(path: string): Promise<Record<string, unknown> | null> {
  try {
    return recordValue(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return null;
  }
}

async function readSmokeRunReports(): Promise<PlatformSmokeRunHistoryEntry[]> {
  const reportSources = [
    {
      kind: "staging-smoke" as const,
      directory: join(process.cwd(), "artifacts", "staging-smoke"),
      relativeDirectory: "artifacts/staging-smoke",
      label: "Staging smoke snapshot",
    },
    {
      kind: "migration-smoke" as const,
      directory: join(process.cwd(), "artifacts", "migration-smoke"),
      relativeDirectory: "artifacts/migration-smoke",
      label: "Migration smoke",
    },
  ];
  const reports: PlatformSmokeRunHistoryEntry[] = [];

  for (const source of reportSources) {
    let filenames: string[] = [];
    try {
      filenames = (await readdir(source.directory)).filter((filename) => filename.endsWith(".json")).sort().reverse().slice(0, 3);
    } catch {
      continue;
    }

    for (const filename of filenames) {
      const absolutePath = join(source.directory, filename);
      const report = await readJsonReport(absolutePath);
      if (!report) continue;

      const summary = recordValue(report["summary"]);
      const results = Array.isArray(report["results"]) ? report["results"].map(recordValue) : [];
      const checks = stringList(report["checks"]).concat(results.map((result) => stringValue(result["target"], "")).filter(Boolean));
      const createdAt = stringValue(report["createdAt"], stringValue(report["generatedAt"], new Date(0).toISOString()));
      const startedAt = stringValue(results[0]?.["startedAt"], createdAt);
      const finishedAt = stringValue(results.at(-1)?.["finishedAt"], createdAt);
      const status = statusFromSummary(summary["status"] ?? report["status"]);

      reports.push({
        id: `${source.kind}:${filename}`,
        kind: source.kind,
        label: source.label,
        status,
        startedAt,
        finishedAt,
        source: source.relativeDirectory,
        summary: stringValue(summary["message"], `${source.label}: ${status}`),
        artifactPath: `${source.relativeDirectory}/${filename}`,
        checks,
        cleanup: source.kind === "migration-smoke" ? "not-needed" : "unknown",
      });
    }
  }

  return reports.sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime()).slice(0, 6);
}

function buildCurrentRunHistory(generatedAt: string, checks: PlatformSmokeCheck[]): PlatformSmokeRunHistoryEntry {
  const status = runStatusFromChecks(checks);
  return {
    id: `dashboard:${generatedAt}`,
    kind: "dashboard-snapshot",
    label: "Huidige dashboard snapshot",
    status,
    startedAt: generatedAt,
    finishedAt: generatedAt,
    source: "getPlatformStagingSmokeDashboard",
    summary: `${checks.filter((check) => check.status === "ok").length}/${checks.length} checks groen, ${checks.filter((check) => check.status === "blocked").length} blokkerend.`,
    artifactPath: null,
    checks: checks.map((check) => check.id),
    cleanup: "not-needed",
  };
}

function buildLiveSmokes(checks: PlatformSmokeCheck[], totals: PlatformStagingSmokeDashboard["totals"]): PlatformLiveSmokeTarget[] {
  const byId = new Map(checks.map((check) => [check.id, check]));
  const checkStatus = (id: string): PlatformSmokeStatus => byId.get(id)?.status ?? "manual";

  return [
    {
      id: "FG-LIVE-HOST",
      label: "Host-first platform en tenants",
      status: checkStatus("FG-SMOKE-HOST"),
      host: "staging.fieldgrid.nl",
      route: "/platform",
      command: "Playwright host-first smoke voor platform, demo-a, demo-b en veele.",
      testIds: ["FG-HOST-001", "FG-HOST-002", "FG-HOST-003", "FG-HOST-004"],
      nextAction: "Draai host-first browser smoke met platform owner en Tenant A/B/Veele hosts.",
    },
    {
      id: "FG-LIVE-MODULES",
      label: "Modules en sectoren",
      status: checkStatus("FG-SMOKE-MODULES") === "ok" && checkStatus("FG-SMOKE-SECTORS") === "ok" ? "ok" : "warning",
      host: "demo-a.fieldgrid.nl",
      route: "/",
      command: "Playwright module-off en sector-denial smoke.",
      testIds: ["FG-MODULE-001", "FG-MODULE-003", "FG-SECTOR-001", "FG-SECTOR-006"],
      nextAction: "Controleer dat module/sector blokkades ook via directe route server-side falen.",
    },
    {
      id: "FG-LIVE-REGIONS",
      label: "Regio's",
      status: totals.tenantRegions > 0 ? "warning" : "manual",
      host: "demo-a.fieldgrid.nl",
      route: "/planning",
      command: "Playwright regio-filter en planning-overlap smoke.",
      testIds: ["FG-REGION-003", "FG-REGION-006", "FG-REGION-007"],
      nextAction: "Gebruik Tenant A/B/Veele fixtures om regio-overlap en cross-tenant regio-denials te bewijzen.",
    },
    {
      id: "FG-LIVE-CUSTOMER-PORTAL",
      label: "Klantportaal",
      status: "manual",
      host: "demo-a.fieldgrid.nl",
      route: "/portal",
      command: "Playwright klantportaal documenten/facturen/tickets smoke.",
      testIds: ["FG-PORTAL-C-001", "FG-PORTAL-C-002", "FG-PORTAL-C-003", "FG-PORTAL-C-004"],
      nextAction: "Draai klantportaal smoke met A-CUSTOMER en verkeerde-host denial.",
    },
    {
      id: "FG-LIVE-PERSONNEL-PLANNING",
      label: "Personeelsapp planning",
      status: "manual",
      host: "demo-a.fieldgrid.nl",
      route: "/app",
      command: "Playwright personeelsapp Home/Planning actualiteit smoke.",
      testIds: ["FG-PORTAL-P-001", "FG-PORTAL-P-002", "FG-PORTAL-P-005"],
      nextAction: "Controleer personeelsplanning na wijziging met realtime event of zichtbare minuut-refresh.",
    },
    {
      id: "FG-LIVE-STORAGE-PDF",
      label: "Storage en PDF/downloads",
      status: checkStatus("FG-SMOKE-STORAGE") === "ok" && checkStatus("FG-SMOKE-PDF-DOWNLOADS") === "ok" ? "ok" : "manual",
      host: "demo-a.fieldgrid.nl",
      route: "/documents",
      command: "Playwright signed URL/path guessing en PDF-download smoke.",
      testIds: ["FG-STORAGE-001", "FG-STORAGE-002", "FG-DATA-004", "FG-AUDIT-001"],
      nextAction: "Download tenantdocument/PDF en bevestig audit plus Tenant B denial.",
    },
  ];
}

function buildMigrationSmokeStatus(
  totals: PlatformStagingSmokeDashboard["totals"],
  runHistory: PlatformSmokeRunHistoryEntry[],
): PlatformMigrationSmokeStatus {
  const latestRun = runHistory.find((run) => run.kind === "migration-smoke") ?? null;
  const status = latestRun?.status ?? (totals.migrationHistoryTables >= 2 ? "warning" : "blocked");

  return {
    status,
    command: "pnpm fieldgrid:sprint7-migration-smoke --run --target all",
    reportDirectory: "artifacts/migration-smoke",
    latestRun,
    targets: [
      {
        id: "empty-database",
        label: "Lege database",
        status: latestRun?.checks.includes("empty-database") ? latestRun.status : "manual",
        requiredSecret: "FIELDGRID_MIGRATION_SMOKE_EMPTY_DATABASE_URL",
        confirmVar: "FIELDGRID_MIGRATION_SMOKE_EMPTY_CONFIRM",
        testIds: ["FG-MIG-001", "FG-MIG-003"],
      },
      {
        id: "staging-copy",
        label: "Staging-copy",
        status: latestRun?.checks.includes("staging-copy") ? latestRun.status : "manual",
        requiredSecret: "FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_DATABASE_URL",
        confirmVar: "FIELDGRID_MIGRATION_SMOKE_STAGING_COPY_CONFIRM",
        testIds: ["FG-MIG-002", "FG-MIG-003"],
      },
    ],
    nextAction: latestRun
      ? "Controleer het migration-smoke artifact voordat staging wordt gepromoot."
      : "Draai de lege database en staging-copy migration smoke en upload het JSON artifact.",
  };
}

function buildMutatingChecks(totals: PlatformStagingSmokeDashboard["totals"]): PlatformMutatingSmokeCheck[] {
  const demoTenantsReady = totals.demoTenants >= 3;
  const status: PlatformSmokeStatus = demoTenantsReady ? "manual" : "blocked";
  const cleanupStatus: PlatformMutatingSmokeCheck["cleanupStatus"] = demoTenantsReady ? "ready" : "not-configured";

  return [
    {
      id: "FG-MUTATE-LIFECYCLE",
      label: "Lifecycle mutatie met rollback",
      status,
      tenantScope: "demo-a",
      cleanupStatus,
      confirmVar: "FIELDGRID_MUTATING_SMOKE_CONFIRM=demo-tenants-only",
      cleanupSelector: "fieldgrid-sprint-15-mutating-lifecycle",
      testIds: ["FG-LIFE-001", "FG-LIFE-002", "FG-PLATFORM-004"],
      nextAction: "Voer alleen uit op demo-a en herstel status direct in dezelfde run.",
    },
    {
      id: "FG-MUTATE-SUPPORT-GRANT",
      label: "Supportgrant aanmaken en revoken",
      status,
      tenantScope: "demo-a",
      cleanupStatus,
      confirmVar: "FIELDGRID_MUTATING_SMOKE_CONFIRM=demo-tenants-only",
      cleanupSelector: "fieldgrid-sprint-15-mutating-support",
      testIds: ["FG-SUPPORT-002", "FG-SUPPORT-003", "FG-PLATFORM-006"],
      nextAction: "Maak een korte grant met marker en revoke hem voordat de run eindigt.",
    },
    {
      id: "FG-MUTATE-DOCUMENT-DOWNLOAD",
      label: "Document/PDF audit met cleanup",
      status,
      tenantScope: "demo-a/demo-b",
      cleanupStatus,
      confirmVar: "FIELDGRID_MUTATING_SMOKE_CONFIRM=demo-tenants-only",
      cleanupSelector: "fieldgrid-sprint-15-mutating-document",
      testIds: ["FG-DATA-004", "FG-STORAGE-001", "FG-AUDIT-001"],
      nextAction: "Gebruik marker-scoped demo-documenten en verwijder alleen die markerdata.",
    },
  ];
}

export async function getPlatformStagingSmokeDashboard(): Promise<PlatformStagingSmokeDashboard> {
  await requirePlatformAdmin();

  const [snapshot] = await db
    .select({
      tenants: sql<number>`(SELECT count(*) FROM ${tenantsTable})::int`,
      activeTenants: sql<number>`(SELECT count(*) FROM ${tenantsTable} WHERE status IN ('trial', 'active') AND is_active = true)::int`,
      demoTenants: sql<number>`(SELECT count(*) FROM ${tenantsTable} WHERE slug IN ('demo-a', 'demo-b', 'veele'))::int`,
      tenantDomains: sql<number>`(SELECT count(*) FROM ${tenantDomainsTable} WHERE type <> 'platform_reserved')::int`,
      verifiedTenantDomains: sql<number>`(SELECT count(*) FROM ${tenantDomainsTable} WHERE type <> 'platform_reserved' AND verification_status = 'verified')::int`,
      activeTenantUsers: sql<number>`(SELECT count(*) FROM ${tenantUsersTable} WHERE status = 'active')::int`,
      activePlatformUsers: sql<number>`(SELECT count(*) FROM ${platformUsersTable} WHERE status = 'active')::int`,
      moduleCatalog: sql<number>`(SELECT count(*) FROM ${modulesTable})::int`,
      tenantsWithEnabledModules: sql<number>`(SELECT count(DISTINCT tenant_id) FROM ${tenantModulesTable} WHERE is_enabled = true)::int`,
      enabledTenantModules: sql<number>`(SELECT count(*) FROM ${tenantModulesTable} WHERE is_enabled = true)::int`,
      tenantSectors: sql<number>`(SELECT count(*) FROM ${tenantSectorsTable} WHERE is_enabled = true)::int`,
      tenantSectorSettings: sql<number>`(SELECT count(*) FROM ${tenantSectorSettingsTable})::int`,
      tenantRegions: sql<number>`(SELECT count(*) FROM ${tenantRegionsTable} WHERE is_active = true)::int`,
      documents: sql<number>`(SELECT count(*) FROM ${documentsTable} WHERE tenant_id IS NOT NULL)::int`,
      tenantPrefixedDocuments: sql<number>`(SELECT count(*) FROM ${documentsTable} WHERE tenant_id IS NOT NULL AND storage_path LIKE 'tenant/%')::int`,
      legacyDocumentPaths: sql<number>`(SELECT count(*) FROM ${documentsTable} WHERE tenant_id IS NOT NULL AND storage_path NOT LIKE 'tenant/%')::int`,
      reports: sql<number>`(SELECT count(*) FROM ${reportsTable} WHERE tenant_id IS NOT NULL)::int`,
      quotes: sql<number>`(SELECT count(*) FROM ${quotesTable} WHERE tenant_id IS NOT NULL)::int`,
      invoices: sql<number>`(SELECT count(*) FROM ${invoicesTable} WHERE tenant_id IS NOT NULL)::int`,
      activeSupportGrants: sql<number>`(
        SELECT count(*) FROM ${supportAccessGrantsTable}
        WHERE revoked_at IS NULL
          AND starts_at <= now()
          AND expires_at > now()
      )::int`,
      supportAuditEvents: sql<number>`(SELECT count(*) FROM ${supportAccessAuditLogTable})::int`,
      auditEvents: sql<number>`(SELECT count(*) FROM ${auditLogTable})::int`,
      downloadAuditEvents: sql<number>`(
        (SELECT count(*) FROM ${auditLogTable}
          WHERE lower(concat_ws(' ', action, resource, resource_id, metadata::text)) LIKE '%download%'
             OR lower(concat_ws(' ', action, resource, resource_id, metadata::text)) LIKE '%pdf%'
             OR lower(concat_ws(' ', action, resource, resource_id, metadata::text)) LIKE '%signed%') +
        (SELECT count(*) FROM ${supportAccessAuditLogTable}
          WHERE lower(concat_ws(' ', action, resource, resource_id, metadata::text)) LIKE '%download%'
             OR lower(concat_ws(' ', action, resource, resource_id, metadata::text)) LIKE '%pdf%'
             OR lower(concat_ws(' ', action, resource, resource_id, metadata::text)) LIKE '%signed%')
      )::int`,
      migrationHistoryTables: sql<number>`(
        SELECT count(*)
        FROM pg_catalog.pg_class c
        INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'drizzle'
          AND c.relname IN ('__drizzle_migrations', 'veele_sql_migrations')
      )::int`,
    })
    .from(tenantsTable)
    .limit(1);

  const totals = {
    tenants: countValue(snapshot?.tenants),
    activeTenants: countValue(snapshot?.activeTenants),
    demoTenants: countValue(snapshot?.demoTenants),
    tenantDomains: countValue(snapshot?.tenantDomains),
    verifiedTenantDomains: countValue(snapshot?.verifiedTenantDomains),
    activeTenantUsers: countValue(snapshot?.activeTenantUsers),
    activePlatformUsers: countValue(snapshot?.activePlatformUsers),
    moduleCatalog: countValue(snapshot?.moduleCatalog),
    tenantsWithEnabledModules: countValue(snapshot?.tenantsWithEnabledModules),
    enabledTenantModules: countValue(snapshot?.enabledTenantModules),
    tenantSectors: countValue(snapshot?.tenantSectors),
    tenantSectorSettings: countValue(snapshot?.tenantSectorSettings),
    tenantRegions: countValue(snapshot?.tenantRegions),
    documents: countValue(snapshot?.documents),
    tenantPrefixedDocuments: countValue(snapshot?.tenantPrefixedDocuments),
    legacyDocumentPaths: countValue(snapshot?.legacyDocumentPaths),
    reports: countValue(snapshot?.reports),
    quotes: countValue(snapshot?.quotes),
    invoices: countValue(snapshot?.invoices),
    activeSupportGrants: countValue(snapshot?.activeSupportGrants),
    supportAuditEvents: countValue(snapshot?.supportAuditEvents),
    auditEvents: countValue(snapshot?.auditEvents),
    downloadAuditEvents: countValue(snapshot?.downloadAuditEvents),
    migrationHistoryTables: countValue(snapshot?.migrationHistoryTables),
  };

  const platformHost = "platform.fieldgrid.nl";
  const stagingHost = "staging.fieldgrid.nl";
  const platformHostKnown = isPlatformHost(platformHost);
  const stagingHostKnown = isPlatformHost(stagingHost);
  const documentSurface = totals.documents + totals.reports + totals.quotes + totals.invoices;

  const checks = [
    makeCheck({
      id: "FG-SMOKE-HOST",
      label: "Host en domeinen",
      status: platformHostKnown && stagingHostKnown && totals.verifiedTenantDomains > 0 ? "ok" : "warning",
      summary: `${totals.verifiedTenantDomains}/${totals.tenantDomains} tenantdomeinen verified`,
      detail: "Controleert platform.fieldgrid.nl, staging.fieldgrid.nl en geverifieerde tenantdomeinen zonder hostcontext te overschrijven.",
      testIds: ["FG-HOST-001", "FG-HOST-002", "FG-HOST-003", "FG-HOST-004"],
      nextAction: "Voer Playwright host-first smoke uit voor platform-, staging- en tenanthosts.",
    }),
    makeCheck({
      id: "FG-SMOKE-LOGIN",
      label: "Login en identiteit",
      status: totals.activePlatformUsers > 0 && totals.activeTenantUsers > 0 ? "ok" : "blocked",
      summary: `${totals.activePlatformUsers} actieve platformgebruiker(s), ${totals.activeTenantUsers} actieve tenantgebruiker(s)`,
      detail: "Bewijst dat platform- en tenantidentiteit aanwezig zijn voor operationele staging-smokes.",
      testIds: ["FG-PLATFORM-001", "FG-PLATFORM-002", "FG-PLATFORM-003", "FG-RBAC-001"],
      nextAction: "Controleer handmatig login voor platform owner en Tenant A/B/Veele actoren.",
    }),
    makeCheck({
      id: "FG-SMOKE-MODULES",
      label: "Modules",
      status: totals.moduleCatalog > 0 && totals.tenantsWithEnabledModules > 0 ? "ok" : "warning",
      summary: `${totals.enabledTenantModules} tenantmodule-koppelingen actief over ${totals.tenantsWithEnabledModules} tenant(s)`,
      detail: "Smoke voor plan/module seed en tenant-entitlements voordat module-off tests naar staging gaan.",
      testIds: ["FG-MODULE-001", "FG-MODULE-002", "FG-MODULE-003", "FG-MODULE-005"],
      nextAction: "Controleer module-off denial via UI, directe URL, server action en API.",
    }),
    makeCheck({
      id: "FG-SMOKE-SECTORS",
      label: "Sectoren",
      status: totals.tenantSectors > 0 && totals.tenantSectorSettings > 0 ? "ok" : "warning",
      summary: `${totals.tenantSectors} actieve tenantsectoren en ${totals.tenantSectorSettings} policyrecord(s)`,
      detail: "Controleert dat tenantsectoren en sectorpolicy beschikbaar zijn voor harde server-side validatie.",
      testIds: ["FG-SECTOR-001", "FG-SECTOR-002", "FG-SECTOR-003", "FG-SECTOR-006"],
      nextAction: "Draai sector happy/denial smoke voor Tenant A en Tenant B.",
    }),
    makeCheck({
      id: "FG-SMOKE-STORAGE",
      label: "Storage",
      status: totals.documents === 0 ? "manual" : totals.legacyDocumentPaths === 0 ? "ok" : "warning",
      summary: `${totals.tenantPrefixedDocuments}/${totals.documents} documenten tenant-prefixed, ${totals.legacyDocumentPaths} legacy pad(en)`,
      detail: "Read-only indicatie of documentstorage tenant-prefixed is; fysieke Supabase policytests blijven apart verplicht.",
      testIds: ["FG-STORAGE-001", "FG-STORAGE-002", "FG-STORAGE-006", "FG-STORAGE-007"],
      nextAction: "Voer signed URL/path guessing smoke uit en plan legacy storage backfill waar nodig.",
    }),
    makeCheck({
      id: "FG-SMOKE-PDF-DOWNLOADS",
      label: "PDF en downloads",
      status: documentSurface > 0 && totals.downloadAuditEvents > 0 ? "ok" : "manual",
      summary: `${documentSurface} downloadbare records, ${totals.downloadAuditEvents} download/PDF audit-event(s)`,
      detail: "Koppelt document/report/quote/invoice oppervlak aan auditbewijs voor PDF- en downloadpaden.",
      testIds: ["FG-DATA-004", "FG-DATA-005", "FG-DATA-006", "FG-DATA-007", "FG-AUDIT-001"],
      nextAction: "Download document, report, quote en invoice via Tenant A en bevestig audit en Tenant B denial.",
    }),
    makeCheck({
      id: "FG-SMOKE-MIGRATIONS",
      label: "Migraties",
      status: totals.migrationHistoryTables >= 2 ? "ok" : "warning",
      summary: `${totals.migrationHistoryTables}/2 migration history tables gevonden`,
      detail: "Controleert of Drizzle- en SQL-migration history aanwezig zijn; staging-copy smoke blijft het harde bewijs.",
      testIds: ["FG-MIG-001", "FG-MIG-002", "FG-MIG-003"],
      nextAction: "Draai lege database smoke en staging-copy smoke voor elke migratie-PR.",
    }),
    makeCheck({
      id: "FG-SMOKE-SUPPORT",
      label: "Support grants",
      status: totals.activeSupportGrants > 0 ? "ok" : "manual",
      summary: `${totals.activeSupportGrants} actieve supportgrant(s), ${totals.supportAuditEvents} support audit-event(s)`,
      detail: "Laat zien of break-glass/supporttoegang operationeel en auditbaar is op staging.",
      testIds: ["FG-SUPPORT-001", "FG-SUPPORT-002", "FG-SUPPORT-003", "FG-SUPPORT-004", "FG-SUPPORT-005"],
      nextAction: "Maak een korte dedicated supportgrant voor Tenant A en test verlopen/verkeerde tenant denial.",
    }),
    makeCheck({
      id: "FG-SMOKE-AUDIT",
      label: "Audit",
      status: totals.auditEvents + totals.supportAuditEvents > 0 ? "ok" : "manual",
      summary: `${totals.auditEvents} tenant/platform audit-event(s), ${totals.supportAuditEvents} support audit-event(s)`,
      detail: "Read-only operationele indicatie dat security-, support- en downloadsmokes auditsporen kunnen opleveren.",
      testIds: ["FG-AUDIT-001", "FG-AUDIT-002", "FG-AUDIT-003", "FG-AUDIT-004"],
      nextAction: "Controleer tenant-audit isolation en platform-only audit via het securitydashboard.",
    }),
  ];
  const generatedAt = new Date().toISOString();
  const reportHistory = await readSmokeRunReports();
  const runHistory = [buildCurrentRunHistory(generatedAt, checks), ...reportHistory];
  const liveSmokes = buildLiveSmokes(checks, totals);
  const migrationSmoke = buildMigrationSmokeStatus(totals, runHistory);
  const mutatingChecks = buildMutatingChecks(totals);

  return {
    generatedAt,
    environment: { platformHost, stagingHost, platformHostKnown, stagingHostKnown },
    totals,
    checks,
    runHistory,
    liveSmokes,
    migrationSmoke,
    mutatingChecks,
    minimumGreen: [
      "FG-SMOKE-HOST",
      "FG-SMOKE-LOGIN",
      "FG-SMOKE-MODULES",
      "FG-SMOKE-SECTORS",
      "FG-SMOKE-STORAGE",
      "FG-SMOKE-MIGRATIONS",
    ],
    playbooks: [
      "docs/fieldgrid-phase-7-operations.md",
      "docs/fieldgrid-backup-restore-rollback-playbook.md",
      "docs/fieldgrid-first-external-tenant-checklist.md",
    ],
  };
}
