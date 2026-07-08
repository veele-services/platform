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
import type {
  PlatformAdminReleaseGate,
  PlatformAdminReleaseGateException,
  PlatformAdminReleaseGateItem,
  PlatformFinalExternalTenantGate,
  PlatformFinalGateRequirement,
  PlatformLiveSmokeTarget,
  PlatformMigrationSmokeStatus,
  PlatformMutatingSmokeCheck,
  PlatformPostLaunchException,
  PlatformSmokeCheck,
  PlatformSmokeRunHistoryEntry,
  PlatformSmokeStatus,
  PlatformStagingSmokeDashboard,
  PlatformStagingPromotionGate,
  PlatformStagingPromotionGateSignal,
} from "./platform-smoke.types";

const STAGING_PILOT_TENANT_SLUG =
  process.env.FIELDGRID_STAGING_PILOT_TENANT_SLUG?.trim() || "field-demo";
const STAGING_PILOT_TENANT_HOST = `${STAGING_PILOT_TENANT_SLUG}.fieldgrid.nl`;
const DEFAULT_STAGING_MUTATING_SMOKE_CONFIRM_VALUE = "field-demo-only";
const STAGING_MUTATING_SMOKE_CONFIRM_VALUE =
  process.env.FIELDGRID_MUTATING_SMOKE_CONFIRM_VALUE?.trim() ||
  DEFAULT_STAGING_MUTATING_SMOKE_CONFIRM_VALUE;
const STAGING_MUTATING_SMOKE_CONFIRM = `FIELDGRID_MUTATING_SMOKE_CONFIRM=${STAGING_MUTATING_SMOKE_CONFIRM_VALUE}`;

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
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function runStatusFromChecks(
  checks: PlatformSmokeCheck[],
): PlatformSmokeStatus {
  if (checks.some((check) => check.status === "blocked")) return "blocked";
  if (checks.some((check) => check.status === "warning")) return "warning";
  if (checks.some((check) => check.status === "manual")) return "manual";
  return "ok";
}

async function readJsonReport(
  path: string,
): Promise<Record<string, unknown> | null> {
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
      filenames = (await readdir(source.directory))
        .filter((filename) => filename.endsWith(".json"))
        .sort()
        .reverse()
        .slice(0, 3);
    } catch {
      continue;
    }

    for (const filename of filenames) {
      const absolutePath = join(source.directory, filename);
      const report = await readJsonReport(absolutePath);
      if (!report) continue;

      const summary = recordValue(report["summary"]);
      const results = Array.isArray(report["results"])
        ? report["results"].map(recordValue)
        : [];
      const checks = stringList(report["checks"]).concat(
        results
          .map((result) => stringValue(result["target"], ""))
          .filter(Boolean),
      );
      const createdAt = stringValue(
        report["createdAt"],
        stringValue(report["generatedAt"], new Date(0).toISOString()),
      );
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

  return reports
    .sort(
      (a, b) =>
        new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime(),
    )
    .slice(0, 6);
}

function buildCurrentRunHistory(
  generatedAt: string,
  checks: PlatformSmokeCheck[],
): PlatformSmokeRunHistoryEntry {
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

export async function getPlatformStagingSmokeDashboard(): Promise<PlatformStagingSmokeDashboard> {
  await requirePlatformAdmin();
  return buildPlatformStagingSmokeDashboard();
}

function buildLiveSmokes(
  checks: PlatformSmokeCheck[],
  totals: PlatformStagingSmokeDashboard["totals"],
): PlatformLiveSmokeTarget[] {
  const byId = new Map(checks.map((check) => [check.id, check]));
  const checkStatus = (id: string): PlatformSmokeStatus =>
    byId.get(id)?.status ?? "manual";

  return [
    {
      id: "FG-LIVE-HOST",
      label: "Host-first platform en tenants",
      status: checkStatus("FG-SMOKE-HOST"),
      host: "staging.fieldgrid.nl",
      route: "/platform",
      command:
        `Playwright host-first smoke voor platform, staging en ${STAGING_PILOT_TENANT_SLUG}.`,
      testIds: ["FG-HOST-001", "FG-HOST-002", "FG-HOST-003", "FG-HOST-004"],
      nextAction:
        `Draai host-first browser smoke met platform owner en ${STAGING_PILOT_TENANT_HOST}.`,
    },
    {
      id: "FG-LIVE-MODULES",
      label: "Modules en sectoren",
      status:
        checkStatus("FG-SMOKE-MODULES") === "ok" &&
        checkStatus("FG-SMOKE-SECTORS") === "ok"
          ? "ok"
          : "warning",
      host: STAGING_PILOT_TENANT_HOST,
      route: "/",
      command: "Playwright module-off en sector-denial smoke.",
      testIds: [
        "FG-MODULE-001",
        "FG-MODULE-003",
        "FG-SECTOR-001",
        "FG-SECTOR-006",
      ],
      nextAction:
        "Controleer dat module/sector blokkades ook via directe route server-side falen.",
    },
    {
      id: "FG-LIVE-REGIONS",
      label: "Regio's",
      status: totals.tenantRegions > 0 ? "warning" : "manual",
      host: STAGING_PILOT_TENANT_HOST,
      route: "/planning",
      command: "Playwright regio-filter en planning-overlap smoke.",
      testIds: ["FG-REGION-003", "FG-REGION-006", "FG-REGION-007"],
      nextAction:
        `Gebruik ${STAGING_PILOT_TENANT_SLUG} voor regio-overlap en koppel cross-tenant denial evidence apart.`,
    },
    {
      id: "FG-LIVE-CUSTOMER-PORTAL",
      label: "Klantportaal",
      status: "manual",
      host: STAGING_PILOT_TENANT_HOST,
      route: "/klant",
      command: "Playwright klantportaal documenten/facturen/tickets smoke.",
      testIds: [
        "FG-PORTAL-C-001",
        "FG-PORTAL-C-002",
        "FG-PORTAL-C-003",
        "FG-PORTAL-C-004",
      ],
      nextAction:
        `Draai klantportaal smoke op ${STAGING_PILOT_TENANT_SLUG} met verkeerde-host denial.`,
    },
    {
      id: "FG-LIVE-PERSONNEL-PLANNING",
      label: "Personeelsapp planning",
      status: "manual",
      host: STAGING_PILOT_TENANT_HOST,
      route: "/personeel",
      command: "Playwright personeelsapp Home/Planning actualiteit smoke.",
      testIds: ["FG-PORTAL-P-001", "FG-PORTAL-P-002", "FG-PORTAL-P-005"],
      nextAction:
        "Controleer personeelsplanning na wijziging met realtime event of zichtbare minuut-refresh.",
    },
    {
      id: "FG-LIVE-STORAGE-PDF",
      label: "Storage en PDF/downloads",
      status:
        checkStatus("FG-SMOKE-STORAGE") === "ok" &&
        checkStatus("FG-SMOKE-PDF-DOWNLOADS") === "ok"
          ? "ok"
          : "manual",
      host: STAGING_PILOT_TENANT_HOST,
      route: "/documents",
      command: "Playwright signed URL/path guessing en PDF-download smoke.",
      testIds: [
        "FG-STORAGE-001",
        "FG-STORAGE-002",
        "FG-DATA-004",
        "FG-AUDIT-001",
      ],
      nextAction:
        `Download ${STAGING_PILOT_TENANT_SLUG} document/PDF en bevestig audit plus wrong-host denial.`,
    },
  ];
}

function buildMigrationSmokeStatus(
  totals: PlatformStagingSmokeDashboard["totals"],
  runHistory: PlatformSmokeRunHistoryEntry[],
): PlatformMigrationSmokeStatus {
  const latestRun =
    runHistory.find((run) => run.kind === "migration-smoke") ?? null;
  const status =
    latestRun?.status ??
    (totals.migrationHistoryTables >= 2 ? "warning" : "blocked");

  return {
    status,
    command: "pnpm fieldgrid:sprint7-migration-smoke --run --target all",
    reportDirectory: "artifacts/migration-smoke",
    latestRun,
    targets: [
      {
        id: "empty-database",
        label: "Lege database",
        status: latestRun?.checks.includes("empty-database")
          ? latestRun.status
          : "manual",
        requiredSecret: "FIELDGRID_MIGRATION_SMOKE_EMPTY_DATABASE_URL",
        confirmVar: "FIELDGRID_MIGRATION_SMOKE_EMPTY_CONFIRM",
        testIds: ["FG-MIG-001", "FG-MIG-003"],
      },
      {
        id: "staging-copy",
        label: "Staging-copy",
        status: latestRun?.checks.includes("staging-copy")
          ? latestRun.status
          : "manual",
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

function buildMutatingChecks(
  totals: PlatformStagingSmokeDashboard["totals"],
): PlatformMutatingSmokeCheck[] {
  const pilotTenantReady = totals.pilotTenants >= 1;
  const status: PlatformSmokeStatus = pilotTenantReady ? "manual" : "blocked";
  const cleanupStatus: PlatformMutatingSmokeCheck["cleanupStatus"] =
    pilotTenantReady ? "ready" : "not-configured";

  return [
    {
      id: "FG-MUTATE-LIFECYCLE",
      label: "Lifecycle mutatie met rollback",
      status,
      tenantScope: STAGING_PILOT_TENANT_SLUG,
      cleanupStatus,
      confirmVar: STAGING_MUTATING_SMOKE_CONFIRM,
      cleanupSelector: "fieldgrid-sprint-15-mutating-lifecycle",
      testIds: ["FG-LIFE-001", "FG-LIFE-002", "FG-PLATFORM-004"],
      nextAction:
        `Voer alleen uit op ${STAGING_PILOT_TENANT_SLUG} en herstel status direct in dezelfde run.`,
    },
    {
      id: "FG-MUTATE-SUPPORT-GRANT",
      label: "Supportgrant aanmaken en revoken",
      status,
      tenantScope: STAGING_PILOT_TENANT_SLUG,
      cleanupStatus,
      confirmVar: STAGING_MUTATING_SMOKE_CONFIRM,
      cleanupSelector: "fieldgrid-sprint-15-mutating-support",
      testIds: ["FG-SUPPORT-002", "FG-SUPPORT-003", "FG-PLATFORM-006"],
      nextAction:
        "Maak een korte grant met marker en revoke hem voordat de run eindigt.",
    },
    {
      id: "FG-MUTATE-DOCUMENT-DOWNLOAD",
      label: "Document/PDF audit met cleanup",
      status,
      tenantScope: STAGING_PILOT_TENANT_SLUG,
      cleanupStatus,
      confirmVar: STAGING_MUTATING_SMOKE_CONFIRM,
      cleanupSelector: "fieldgrid-sprint-15-mutating-document",
      testIds: ["FG-DATA-004", "FG-STORAGE-001", "FG-AUDIT-001"],
      nextAction:
        "Gebruik marker-scoped demo-documenten en verwijder alleen die markerdata.",
    },
  ];
}

function buildFinalExternalTenantGate(input: {
  checks: PlatformSmokeCheck[];
  liveSmokes: PlatformLiveSmokeTarget[];
  migrationSmoke: PlatformMigrationSmokeStatus;
  mutatingChecks: PlatformMutatingSmokeCheck[];
}): PlatformFinalExternalTenantGate {
  const blockedChecks = input.checks.filter(
    (check) => check.status === "blocked",
  );
  const liveReady = input.liveSmokes.filter(
    (smoke) => smoke.status === "ok",
  ).length;
  const mutatingReady = input.mutatingChecks.every(
    (check) => check.cleanupStatus === "ready",
  );
  const smokeChecksGreen = blockedChecks.length === 0;
  const migrationReady = input.migrationSmoke.status === "ok";

  const requirements: PlatformFinalGateRequirement[] = [
    {
      id: "FG-FINAL-PERFORMANCE",
      label: "Performance review op tenantqueries",
      status: "manual",
      evidence:
        "EXPLAIN ANALYZE voor tenantlijst, direct-ID, dashboardstatistieken, planning en storage/download queries.",
      command: "pnpm fieldgrid:sprint16-final-gate:check",
      testIds: ["FG-HOST-001", "FG-DATA-001", "FG-DATA-003", "FG-OPS-003"],
      nextAction:
        "Leg runtime EXPLAIN-output vast in artifacts/final-gate voordat de eerste externe tenant live gaat.",
    },
    {
      id: "FG-FINAL-SERVICE-ROLE",
      label: "Security review op service-role gebruik",
      status: "warning",
      evidence:
        "SUPABASE_SERVICE_ROLE_KEY blijft server-only en wordt niet via NEXT_PUBLIC gepubliceerd.",
      command: "pnpm fieldgrid:sprint16-final-gate:check",
      testIds: [
        "FG-PORTAL-C-001",
        "FG-PORTAL-P-001",
        "FG-STORAGE-001",
        "FG-AUDIT-002",
      ],
      nextAction:
        "Controleer admin clients en service-role Drizzle paden per portalactie met tenant-scope bewijs.",
    },
    {
      id: "FG-FINAL-STAGING-COPY",
      label: "Final staging-copy smoke",
      status: migrationReady ? "ok" : "manual",
      evidence:
        "Sprint 7 migration smoke runner met empty-database en staging-copy targets.",
      command: "pnpm fieldgrid:sprint7-migration-smoke --run --target all",
      testIds: ["FG-MIG-001", "FG-MIG-002", "FG-MIG-003"],
      nextAction:
        "Draai tegen een herstelde staging-copy en koppel het JSON artifact aan de run history.",
    },
    {
      id: "FG-FINAL-RUNTIME-PROOF",
      label: "Runtime proof, storage proof en portal acceptance",
      status:
        smokeChecksGreen && liveReady === input.liveSmokes.length
          ? "ok"
          : "manual",
      evidence:
        "Sprint 5, 6, 7 en 15 scripts leveren contracten; live artifacts blijven vereist.",
      command:
        "pnpm fieldgrid:sprint5-runtime-proof:check && pnpm fieldgrid:sprint6-portal-acceptance:check && pnpm fieldgrid:sprint15-staging-smoke:check",
      testIds: [
        "FG-HOST-001",
        "FG-RBAC-001",
        "FG-STORAGE-002",
        "FG-PORTAL-C-004",
        "FG-PORTAL-P-005",
      ],
      nextAction:
        "Koppel live Playwright/storage/DB artifacts aan de staging smoke run history.",
    },
    {
      id: "FG-FINAL-EXTERNAL-TENANT",
      label: "Eerste externe tenant checklist",
      status: smokeChecksGreen && mutatingReady ? "manual" : "blocked",
      evidence:
        "docs/fieldgrid-first-external-tenant-checklist.md is het go/no-go contract.",
      command: "pnpm fieldgrid:sprint16-final-gate:check",
      testIds: ["FG-OPS-001", "FG-OPS-002", "FG-OPS-008", "FG-PLATFORM-004"],
      nextAction:
        "Gebruik de checklist als releaseformulier en noteer expliciete owner per manual check.",
    },
  ];

  const postLaunchExceptions: PlatformPostLaunchException[] = [
    {
      id: "FG-POST-RUNTIME-E2E",
      label: "Host/RBAC/lifecycle runtime E2E bewijs",
      risk: "P0/P1",
      owner: "Platform engineering",
      acceptedUntil: "Voor eerste externe tenant met productiegegevens",
      targetEvidence:
        `${STAGING_PILOT_TENANT_SLUG} Playwright + integration artifacts voor host, RBAC, lifecycle en direct-ID denials.`,
      testIds: ["FG-HOST-001", "FG-LIFE-002", "FG-RBAC-002", "FG-DATA-001"],
      requiresGoNoGoApproval: true,
    },
    {
      id: "FG-POST-STORAGE-PROOF",
      label: "Supabase Storage policy en fysieke backfill proof",
      risk: "P0/P1",
      owner: "Platform engineering",
      acceptedUntil: "Voor externe tenant document/media gebruik",
      targetEvidence:
        "Tenant-prefixed storage artifact, path-guessing denial en policy/RLS bewijs.",
      testIds: [
        "FG-STORAGE-001",
        "FG-STORAGE-002",
        "FG-STORAGE-006",
        "FG-STORAGE-007",
      ],
      requiresGoNoGoApproval: true,
    },
    {
      id: "FG-POST-PORTAL-ACCEPTANCE",
      label: "Klantportaal en personeelsapp live acceptance",
      risk: "P0/P1",
      owner: "Portal engineering",
      acceptedUntil: "Voor uitnodiging eerste externe portalgebruiker",
      targetEvidence:
        "Live Playwright artifacts voor wrong-host, module-off, downloads, media en planning refresh.",
      testIds: [
        "FG-PORTAL-C-001",
        "FG-PORTAL-C-004",
        "FG-PORTAL-P-003",
        "FG-PORTAL-P-005",
      ],
      requiresGoNoGoApproval: true,
    },
    {
      id: "FG-POST-MIGRATION-SMOKE",
      label: "Lege database en staging-copy migration smoke artifacts",
      risk: "P0/P1",
      owner: "Platform engineering",
      acceptedUntil: "Voor main-to-staging promotie met schemawijziging",
      targetEvidence:
        "artifacts/migration-smoke JSON voor empty-database en staging-copy.",
      testIds: ["FG-MIG-001", "FG-MIG-002", "FG-MIG-003"],
      requiresGoNoGoApproval: true,
    },
    {
      id: "FG-POST-AUDIT-CENTRALIZATION",
      label: "Security/audit centralisatie en denial events",
      risk: "P1",
      owner: "Platform engineering",
      acceptedUntil: "Voor eerste externe tenant security review",
      targetEvidence:
        "Security dashboard toont support, download, PDF, module-denial en storage-denial events per tenant.",
      testIds: ["FG-AUDIT-001", "FG-AUDIT-002", "FG-AUDIT-004", "FG-OPS-005"],
      requiresGoNoGoApproval: true,
    },
    {
      id: "FG-POST-MATERIAL-INVENTORY",
      label: "Materialen en inventaris productroadmap",
      risk: "P1/P2",
      owner: "Product engineering",
      acceptedUntil: "Na SaaS proof of aparte roadmap",
      targetEvidence:
        "Module/RBAC/storage/audit tests zodra de volledige module wordt geactiveerd voor externe tenants.",
      testIds: ["FG-MODULE-001", "FG-AUDIT-001"],
      requiresGoNoGoApproval: true,
    },
  ];

  const hardBlocked = requirements.some(
    (requirement) => requirement.status === "blocked",
  );
  const allReady = requirements.every(
    (requirement) => requirement.status === "ok",
  );
  const status: PlatformSmokeStatus = hardBlocked
    ? "blocked"
    : allReady
      ? "ok"
      : "warning";
  const decision: PlatformFinalExternalTenantGate["decision"] = hardBlocked
    ? "blocked"
    : allReady
      ? "ready"
      : "conditional-go";

  return {
    status,
    decision,
    summary:
      decision === "blocked"
        ? "Final gate heeft blokkerende punten voordat een externe tenant veilig kan starten."
        : "Final gate is conditioneel: open runtime/hardening punten zijn expliciet post-launch geaccepteerd met owner en bewijsdoel.",
    command: "pnpm fieldgrid:sprint16-final-gate:check",
    checklist: "docs/fieldgrid-first-external-tenant-checklist.md",
    reportDirectory: "artifacts/final-gate",
    requirements,
    postLaunchExceptions,
  };
}

function buildPlatformAdminReleaseGate(input: {
  checks: PlatformSmokeCheck[];
  liveSmokes: PlatformLiveSmokeTarget[];
  migrationSmoke: PlatformMigrationSmokeStatus;
  mutatingChecks: PlatformMutatingSmokeCheck[];
  finalExternalTenantGate: PlatformFinalExternalTenantGate;
}): PlatformAdminReleaseGate {
  const checkById = new Map(input.checks.map((check) => [check.id, check]));
  const liveSmokeById = new Map(
    input.liveSmokes.map((smoke) => [smoke.id, smoke]),
  );
  const mutatingById = new Map(
    input.mutatingChecks.map((check) => [check.id, check]),
  );
  const hostSmokeStatus =
    liveSmokeById.get("FG-LIVE-HOST")?.status ??
    checkById.get("FG-SMOKE-HOST")?.status ??
    "manual";
  const loginStatus =
    checkById.get("FG-SMOKE-LOGIN")?.status === "ok" ? "manual" : "blocked";
  const lifecycleStatus =
    mutatingById.get("FG-MUTATE-LIFECYCLE")?.status ?? "manual";
  const auditStatus =
    checkById.get("FG-SMOKE-AUDIT")?.status === "ok" ? "manual" : "blocked";

  const items: PlatformAdminReleaseGateItem[] = [
    {
      id: "FG-PA-GATE-ROLES",
      label: "Runtime tests voor platform owner, admin en support",
      status: loginStatus,
      owner: "Platform engineering",
      persona: "owner",
      host: "admin.fieldgrid.nl",
      route: "/platform",
      command:
        "Run platform owner/admin/support Playwright smoke met drie ingelogde accounts.",
      evidence:
        "Screenshots en trace artifacts voor /platform, /platform/security, /platform/users en support-only denials.",
      testIds: [
        "FG-PLATFORM-001",
        "FG-PLATFORM-002",
        "FG-PLATFORM-003",
        "FG-SUPPORT-001",
      ],
      nextAction:
        "Bevestig owner/admin/support autorisaties op staging en voeg artifacts toe aan artifacts/platform-admin-final-gate.",
      blocksRelease: true,
    },
    {
      id: "FG-PA-GATE-HOST-FIRST",
      label: `${STAGING_PILOT_TENANT_SLUG} pilot host-first checks`,
      status: hostSmokeStatus,
      owner: "Platform engineering",
      persona: "tenant-pilot",
      host: STAGING_PILOT_TENANT_HOST,
      route: "/, /klant, /personeel",
      command:
        `Playwright host-first smoke voor ${STAGING_PILOT_TENANT_SLUG} plus wrong-host denial.`,
      evidence:
        "Browser traces tonen dat hostcontext leidend is en directe tenant-id routes niet lekken.",
      testIds: ["FG-HOST-001", "FG-HOST-002", "FG-HOST-003", "FG-DATA-001"],
      nextAction:
        `Draai host-first smoke met ${STAGING_PILOT_TENANT_SLUG} en noteer run-id in het releaseformulier.`,
      blocksRelease: true,
    },
    {
      id: "FG-PA-GATE-ENTERPRISE-CUSTOM-DOMAIN",
      label: "Enterprise custom-domain staging test",
      status: hostSmokeStatus === "ok" ? "manual" : "blocked",
      owner: "Platform engineering",
      persona: "enterprise",
      host: "enterprise-demo custom domain",
      route: "/admin",
      command:
        "Voeg een Enterprise custom domain toe, verifieer DNS/TLS en open tenant via dat domein.",
      evidence:
        "tenant_domains check artifact plus browser screenshot op custom domain.",
      testIds: ["FG-HOST-006", "FG-PLATFORM-004", "FG-OPS-008"],
      nextAction:
        "Gebruik een staging custom domain met DNS TXT en Caddy on-demand TLS voordat productie wordt vrijgegeven.",
      blocksRelease: true,
    },
    {
      id: "FG-PA-GATE-NON-ENTERPRISE-DENIAL",
      label: "Non-Enterprise custom-domain denial",
      status: "manual",
      owner: "Platform engineering",
      persona: "non-enterprise",
      host: "starter/professional tenant",
      route: "/platform/tenants/:tenantId?tab=domains",
      command:
        "Probeer custom domain toe te voegen op non-Enterprise tenant en bevestig server-side denial.",
      evidence:
        "UI-disabled screenshot plus server action/audit denial artifact.",
      testIds: ["FG-HOST-006", "FG-PLATFORM-005", "FG-AUDIT-001"],
      nextAction:
        "Leg denied action en audit-event vast met Starter of Professional tenant.",
      blocksRelease: true,
    },
    {
      id: "FG-PA-GATE-CADDY-ASK",
      label: "Caddy ask endpoint staging test",
      status: "manual",
      owner: "Platform engineering",
      persona: "platform",
      host: "api/internal",
      route: "/internal/caddy/ask-domain",
      command:
        "curl ask-domain voor verified Enterprise, pending, disabled, non-Enterprise en onbekend domein.",
      evidence:
        "HTTP 200 alleen voor verified/active Enterprise domain; alle andere requests 403.",
      testIds: ["FG-HOST-006", "FG-OPS-008", "FG-AUDIT-004"],
      nextAction:
        "Draai vanaf de VPS of CI met interne API URL en voeg statusmatrix toe aan het gate artifact.",
      blocksRelease: true,
    },
    {
      id: "FG-PA-GATE-LIFECYCLE",
      label: "Tenant lifecycle smoke",
      status: lifecycleStatus,
      owner: "Platform engineering",
      persona: "platform",
      host: "admin.fieldgrid.nl",
      route: "/platform/tenants/:tenantId",
      command:
        `Suspend/reactivate/archive/retry smoke op ${STAGING_PILOT_TENANT_SLUG} met rollback.`,
      evidence: "Mutating smoke run met marker-scoped cleanup en audit-events.",
      testIds: ["FG-LIFE-001", "FG-LIFE-002", "FG-PLATFORM-004"],
      nextAction:
        `Voer alleen uit met ${STAGING_MUTATING_SMOKE_CONFIRM}.`,
      blocksRelease: true,
    },
    {
      id: "FG-PA-GATE-SUBSCRIPTION-DOWNGRADE",
      label: "Subscription downgrade smoke",
      status: "manual",
      owner: "Platform engineering",
      persona: "platform",
      host: "admin.fieldgrid.nl",
      route: "/platform/subscriptions",
      command:
        "Downgrade Enterprise naar Professional/Starter en bevestig disabled_plan voor custom domains.",
      evidence:
        "Subscription update artifact, disabled custom-domain status en audit-event.",
      testIds: ["FG-OPS-003", "FG-HOST-006", "FG-AUDIT-001"],
      nextAction: "Gebruik demo Enterprise tenant en herstel plan na de smoke.",
      blocksRelease: true,
    },
    {
      id: "FG-PA-GATE-TICKETS",
      label: "Ticket lifecycle smoke",
      status: "manual",
      owner: "Support operations",
      persona: "support",
      host: "admin.fieldgrid.nl",
      route: "/platform/tickets",
      command:
        "Maak platformticket, voeg interne notitie toe, wijzig status/SLA en sluit ticket.",
      evidence: "Ticketdetail screenshot en platform_ticket_* audit-events.",
      testIds: ["FG-SUPPORT-001", "FG-SUPPORT-004", "FG-AUDIT-001"],
      nextAction:
        "Draai ticket lifecycle met supportaccount en bevestig owner/admin toegang.",
      blocksRelease: true,
    },
    {
      id: "FG-PA-GATE-NOTIFICATIONS",
      label: "Meldingen smoke",
      status: "manual",
      owner: "Support operations",
      persona: "admin",
      host: "admin.fieldgrid.nl",
      route: "/platform/notifications",
      command:
        "Maak template dispatch voor specifieke tenant owners en controleer ontvangersnapshot.",
      evidence:
        "Recipient preview, dispatch history en platform_notification_dispatch_created audit-event.",
      testIds: ["FG-PORTAL-C-004", "FG-AUDIT-001", "FG-PLATFORM-005"],
      nextAction:
        "Gebruik een interne stagingtemplate en verstuur niet naar productieadressen.",
      blocksRelease: true,
    },
    {
      id: "FG-PA-GATE-AUDIT-EXPORT",
      label: "Audit export smoke",
      status: auditStatus,
      owner: "Platform engineering",
      persona: "admin",
      host: "admin.fieldgrid.nl",
      route: "/api/platform/security/export",
      command:
        "Download CSV met tenant, actor, severity en supportGrant filters.",
      evidence: "CSV artifact met expected headers en gefilterde auditregels.",
      testIds: ["FG-AUDIT-001", "FG-AUDIT-002", "FG-AUDIT-004"],
      nextAction:
        "Draai export op staging en controleer dat metadata geen cross-tenant data lekt.",
      blocksRelease: true,
    },
    {
      id: "FG-PA-GATE-MOBILE-SCREENSHOTS",
      label: "Mobile screenshots",
      status: "manual",
      owner: "Platform engineering",
      persona: "ci",
      host: "admin.fieldgrid.nl",
      route:
        "/platform, /platform/tenants, tenantdetail, domains, tickets, security",
      command: "pnpm fieldgrid:platform-phase13-visual-smoke",
      evidence:
        "390px, 768px en 1440px screenshots plus phase13-visual-smoke.json.",
      testIds: ["FG-OPS-008", "FG-PLATFORM-001"],
      nextAction:
        "Draai met FIELDGRID_PLATFORM_PHASE13_COOKIE en tenant detail path.",
      blocksRelease: true,
    },
    {
      id: "FG-PA-GATE-BUILD-TYPECHECK",
      label: "Build en typecheck volledig groen",
      status: "manual",
      owner: "Platform engineering",
      persona: "ci",
      host: "CI",
      route: "workspace",
      command: "pnpm run typecheck && pnpm -r --if-present run build",
      evidence: "CI job op Node 24 met schone pnpm install.",
      testIds: ["FG-OPS-008"],
      nextAction: "Blokkeer release als typecheck of build faalt.",
      blocksRelease: true,
    },
  ];

  const exceptions: PlatformAdminReleaseGateException[] = [
    {
      id: "FG-PA-EXCEPTION-RUNTIME-ARTIFACTS",
      label: "Live runtime artifacts ontbreken in repository",
      severity: "P0",
      owner: "Platform engineering",
      acceptedUntil:
        "Voor promotie van main naar staging en voor eerste productie-tenant",
      targetEvidence:
        "artifacts/platform-admin-final-gate met role, host-first, lifecycle, subscription en domain smoke JSON.",
      goNoGoRequired: true,
    },
    {
      id: "FG-PA-EXCEPTION-MOBILE-ARTIFACTS",
      label: "Mobile screenshots moeten per release opnieuw worden vastgelegd",
      severity: "P1",
      owner: "Platform engineering",
      acceptedUntil: "Voor releasecandidate markering",
      targetEvidence:
        "artifacts/platform-mobile-polish/phase13-visual-smoke.json plus screenshots.",
      goNoGoRequired: true,
    },
  ];

  const blockedItems = items.filter(
    (item) => item.blocksRelease && item.status === "blocked",
  );
  const openManualItems = items.filter(
    (item) => item.blocksRelease && item.status !== "ok",
  );
  const status: PlatformSmokeStatus =
    blockedItems.length > 0
      ? "blocked"
      : openManualItems.length > 0
        ? "warning"
        : "ok";
  const decision: PlatformAdminReleaseGate["decision"] =
    blockedItems.length > 0
      ? "blocked"
      : openManualItems.length > 0
        ? "conditional-go"
        : "ready";

  return {
    status,
    decision,
    summary:
      decision === "ready"
        ? "Platform-admin release gate is volledig groen."
        : decision === "blocked"
          ? "Platform-admin release gate heeft blokkerende runtimepunten."
          : "Platform-admin release gate is conditioneel: handmatige stagingbewijzen moeten aan het releaseformulier worden gekoppeld.",
    command: "pnpm fieldgrid:platform-admin-final-gate:check",
    checklist: "docs/fieldgrid-platform-admin-phase-14-final-gate.md",
    reportDirectory: "artifacts/platform-admin-final-gate",
    items,
    exceptions,
    requiredCommands: [
      "pnpm fieldgrid:platform-admin-final-gate:check",
      "pnpm run typecheck && pnpm -r --if-present run build",
      "pnpm fieldgrid:platform-phase13-visual-smoke",
      "pnpm fieldgrid:sprint15-staging-smoke:run-read-only",
      "pnpm fieldgrid:sprint7-migration-smoke --run --target all",
    ],
  };
}

function buildStagingPromotionGate(input: {
  runHistory: PlatformSmokeRunHistoryEntry[];
  liveSmokes: PlatformLiveSmokeTarget[];
  migrationSmoke: PlatformMigrationSmokeStatus;
  finalExternalTenantGate: PlatformFinalExternalTenantGate;
  platformAdminReleaseGate: PlatformAdminReleaseGate;
}): PlatformStagingPromotionGate {
  const stagingEvidenceRuns = input.runHistory.filter(
    (run) => run.kind === "staging-smoke" && run.artifactPath,
  );
  const migrationEvidenceRuns = input.runHistory.filter(
    (run) => run.kind === "migration-smoke" && run.artifactPath,
  );
  const liveBlocked = input.liveSmokes.some(
    (smoke) => smoke.status === "blocked",
  );
  const liveReady =
    input.liveSmokes.length > 0 &&
    input.liveSmokes.every((smoke) => smoke.status === "ok");

  const signals: PlatformStagingPromotionGateSignal[] = [
    {
      id: "FG-OPS-CI-MIGRATION-ORDER",
      label: "Migratievolgorde en naming",
      status: "manual" as const,
      owner: "Platform engineering",
      command: "pnpm fieldgrid:migration-order-check:check",
      evidence:
        "CI bewaakt legacy numerieke migraties, timestamp-cutover en nieuwe naming.",
      nextAction: "Laat de CI-check groen zijn voordat main naar staging gaat.",
      testIds: ["FG-MIG-001", "FG-MIG-002", "FG-MIG-003"],
      blocksPromotion: true,
    },
    {
      id: "FG-OPS-CI-TEST-LAYERS",
      label: "Security/UI/DB/live testlagen",
      status: "manual" as const,
      owner: "Platform engineering",
      command: "pnpm fieldgrid:test-layers:check",
      evidence:
        "Testlagenmanifest splitst security guards, UI contracttests, DB/migration smoke en live E2E.",
      nextAction:
        "Draai minimaal de security- en DB-lagen voor risicovolle PR's.",
      testIds: ["FG-RBAC-001", "FG-STORAGE-001", "FG-OPS-008"],
      blocksPromotion: true,
    },
    {
      id: "FG-OPS-CI-RUN-HISTORY",
      label: "Run history evidence",
      status:
        stagingEvidenceRuns.length > 0 && migrationEvidenceRuns.length > 0
          ? "ok"
          : "warning",
      owner: "Platform operations",
      command:
        "pnpm fieldgrid:sprint15-staging-smoke:run-read-only && pnpm fieldgrid:sprint7-migration-smoke --run --target all",
      evidence: `${stagingEvidenceRuns.length} staging-smoke artifact(s), ${migrationEvidenceRuns.length} migration-smoke artifact(s).`,
      nextAction:
        "Koppel de laatste JSON artifacts aan de release en controleer dat ze in run history verschijnen.",
      testIds: ["FG-LIVE-HOST", "FG-LIVE-STORAGE", "FG-OPS-008"],
      blocksPromotion: true,
    },
    {
      id: "FG-OPS-CI-LIVE-E2E",
      label: "Live E2E targets",
      status: liveBlocked ? "blocked" : liveReady ? "ok" : "manual",
      owner: "Platform operations",
      command: "pnpm fieldgrid:sprint15-staging-smoke:run-read-only",
      evidence: `${input.liveSmokes.filter((smoke) => smoke.status === "ok").length}/${input.liveSmokes.length} live smoke targets groen.`,
      nextAction:
        "Draai host, login, storage/download, portaal en personeelsplanning smokes op staging.",
      testIds: [
        "FG-LIVE-HOST",
        "FG-LIVE-LOGIN",
        "FG-LIVE-STORAGE",
        "FG-LIVE-PERSONNEL-PLANNING",
      ],
      blocksPromotion: true,
    },
    {
      id: "FG-OPS-CI-MIGRATION-SMOKE",
      label: "Migration smoke evidence",
      status: input.migrationSmoke.latestRun
        ? input.migrationSmoke.status
        : "warning",
      owner: "Platform engineering",
      command: "pnpm fieldgrid:sprint7-migration-smoke --run --target all",
      evidence: input.migrationSmoke.latestRun
        ? `Laatste artifact: ${input.migrationSmoke.latestRun.artifactPath ?? input.migrationSmoke.latestRun.source}`
        : "Nog geen migration-smoke artifact in run history.",
      nextAction:
        "Draai lege database en staging-copy smoke voor migratie-PR's.",
      testIds: ["FG-MIG-001", "FG-MIG-002", "FG-MIG-003"],
      blocksPromotion: true,
    },
    {
      id: "FG-OPS-CI-FINAL-GATES",
      label: "Final en platform-admin gates",
      status:
        input.finalExternalTenantGate.status === "blocked" ||
        input.platformAdminReleaseGate.status === "blocked"
          ? "blocked"
          : input.finalExternalTenantGate.status === "ok" &&
              input.platformAdminReleaseGate.status === "ok"
            ? "ok"
            : "warning",
      owner: "Platform engineering",
      command:
        "pnpm fieldgrid:sprint16-final-gate:check && pnpm fieldgrid:platform-admin-final-gate:check",
      evidence: `${input.finalExternalTenantGate.decision}; platform-admin ${input.platformAdminReleaseGate.decision}.`,
      nextAction:
        "Los blokkerende gate-items op of leg handmatige evidence met owner vast.",
      testIds: [
        "FG-FINAL-STAGING-COPY",
        "FG-FINAL-EXTERNAL-TENANT",
        "FG-PA-GATE-HOST-FIRST",
      ],
      blocksPromotion: true,
    },
  ];

  const blockingSignals = signals.filter(
    (signal) => signal.blocksPromotion && signal.status === "blocked",
  );
  const openSignals = signals.filter((signal) => signal.status !== "ok");
  const status: PlatformSmokeStatus =
    blockingSignals.length > 0
      ? "blocked"
      : openSignals.length > 0
        ? "warning"
        : "ok";
  const decision: PlatformStagingPromotionGate["decision"] =
    status === "ok"
      ? "ready"
      : status === "blocked"
        ? "blocked"
        : "conditional-go";

  return {
    status,
    decision,
    summary:
      decision === "ready"
        ? "Staging promotion gate is groen met gekoppelde runtime evidence."
        : decision === "blocked"
          ? "Staging promotion gate heeft blokkerende signalen voor main -> staging."
          : "Staging promotion gate is conditioneel: CI-signalen en runtime evidence moeten aan de release worden gekoppeld.",
    command: "pnpm fieldgrid:staging-promotion-gate:check",
    checklist: "docs/fieldgrid-staging-promotion-checklist.md",
    reportDirectory: "artifacts/staging-promotion-gate",
    evidenceDirectories: [
      "artifacts/staging-smoke",
      "artifacts/migration-smoke",
      "artifacts/platform-admin-final-gate",
      "artifacts/final-gate",
      "artifacts/staging-promotion-gate",
    ],
    signals,
    requiredCommands: [
      "pnpm fieldgrid:migration-order-check:check",
      "pnpm fieldgrid:test-layers:check",
      "pnpm fieldgrid:sprint7-migration-smoke:check",
      "pnpm fieldgrid:sprint15-staging-smoke:check",
      "pnpm fieldgrid:staging-promotion-gate:check",
    ],
    evidenceRuns: [...stagingEvidenceRuns, ...migrationEvidenceRuns].slice(
      0,
      6,
    ),
  };
}

export async function buildPlatformStagingSmokeDashboard(): Promise<PlatformStagingSmokeDashboard> {
  const [snapshot] = await db
    .select({
      tenants: sql<number>`(SELECT count(*) FROM ${tenantsTable})::int`,
      activeTenants: sql<number>`(SELECT count(*) FROM ${tenantsTable} WHERE status IN ('trial', 'active') AND is_active = true)::int`,
      pilotTenants: sql<number>`(
        SELECT count(*)
        FROM ${tenantsTable}
        WHERE slug = ${STAGING_PILOT_TENANT_SLUG}
          AND status IN ('trial', 'active')
          AND is_active = true
      )::int`,
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
    pilotTenants: countValue(snapshot?.pilotTenants),
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
  const documentSurface =
    totals.documents + totals.reports + totals.quotes + totals.invoices;

  const checks = [
    makeCheck({
      id: "FG-SMOKE-HOST",
      label: "Host en domeinen",
      status:
        platformHostKnown &&
        stagingHostKnown &&
        totals.verifiedTenantDomains > 0
          ? "ok"
          : "warning",
      summary: `${totals.verifiedTenantDomains}/${totals.tenantDomains} tenantdomeinen verified`,
      detail:
        "Controleert platform.fieldgrid.nl, staging.fieldgrid.nl en geverifieerde tenantdomeinen zonder hostcontext te overschrijven.",
      testIds: ["FG-HOST-001", "FG-HOST-002", "FG-HOST-003", "FG-HOST-004"],
      nextAction:
        "Voer Playwright host-first smoke uit voor platform-, staging- en tenanthosts.",
    }),
    makeCheck({
      id: "FG-SMOKE-LOGIN",
      label: "Login en identiteit",
      status:
        totals.activePlatformUsers > 0 && totals.activeTenantUsers > 0
          ? "ok"
          : "blocked",
      summary: `${totals.activePlatformUsers} actieve platformgebruiker(s), ${totals.activeTenantUsers} actieve tenantgebruiker(s)`,
      detail:
        "Bewijst dat platform- en tenantidentiteit aanwezig zijn voor operationele staging-smokes.",
      testIds: [
        "FG-PLATFORM-001",
        "FG-PLATFORM-002",
        "FG-PLATFORM-003",
        "FG-RBAC-001",
      ],
      nextAction:
        `Controleer handmatig login voor platform owner en ${STAGING_PILOT_TENANT_SLUG} actoren.`,
    }),
    makeCheck({
      id: "FG-SMOKE-MODULES",
      label: "Modules",
      status:
        totals.moduleCatalog > 0 && totals.tenantsWithEnabledModules > 0
          ? "ok"
          : "warning",
      summary: `${totals.enabledTenantModules} tenantmodule-koppelingen actief over ${totals.tenantsWithEnabledModules} tenant(s)`,
      detail:
        "Smoke voor plan/module seed en tenant-entitlements voordat module-off tests naar staging gaan.",
      testIds: [
        "FG-MODULE-001",
        "FG-MODULE-002",
        "FG-MODULE-003",
        "FG-MODULE-005",
      ],
      nextAction:
        "Controleer module-off denial via UI, directe URL, server action en API.",
    }),
    makeCheck({
      id: "FG-SMOKE-SECTORS",
      label: "Sectoren",
      status:
        totals.tenantSectors > 0 && totals.tenantSectorSettings > 0
          ? "ok"
          : "warning",
      summary: `${totals.tenantSectors} actieve tenantsectoren en ${totals.tenantSectorSettings} policyrecord(s)`,
      detail:
        "Controleert dat tenantsectoren en sectorpolicy beschikbaar zijn voor harde server-side validatie.",
      testIds: [
        "FG-SECTOR-001",
        "FG-SECTOR-002",
        "FG-SECTOR-003",
        "FG-SECTOR-006",
      ],
      nextAction: `Draai sector happy/denial smoke voor ${STAGING_PILOT_TENANT_SLUG} en wrong-host denial.`,
    }),
    makeCheck({
      id: "FG-SMOKE-STORAGE",
      label: "Storage",
      status:
        totals.documents === 0
          ? "manual"
          : totals.legacyDocumentPaths === 0
            ? "ok"
            : "warning",
      summary: `${totals.tenantPrefixedDocuments}/${totals.documents} documenten tenant-prefixed, ${totals.legacyDocumentPaths} legacy pad(en)`,
      detail:
        "Read-only indicatie of documentstorage tenant-prefixed is; fysieke Supabase policytests blijven apart verplicht.",
      testIds: [
        "FG-STORAGE-001",
        "FG-STORAGE-002",
        "FG-STORAGE-006",
        "FG-STORAGE-007",
      ],
      nextAction:
        "Voer signed URL/path guessing smoke uit en plan legacy storage backfill waar nodig.",
    }),
    makeCheck({
      id: "FG-SMOKE-PDF-DOWNLOADS",
      label: "PDF en downloads",
      status:
        documentSurface > 0 && totals.downloadAuditEvents > 0 ? "ok" : "manual",
      summary: `${documentSurface} downloadbare records, ${totals.downloadAuditEvents} download/PDF audit-event(s)`,
      detail:
        "Koppelt document/report/quote/invoice oppervlak aan auditbewijs voor PDF- en downloadpaden.",
      testIds: [
        "FG-DATA-004",
        "FG-DATA-005",
        "FG-DATA-006",
        "FG-DATA-007",
        "FG-AUDIT-001",
      ],
      nextAction:
        `Download document, report, quote en invoice via ${STAGING_PILOT_TENANT_SLUG} en bevestig audit plus wrong-host denial.`,
    }),
    makeCheck({
      id: "FG-SMOKE-MIGRATIONS",
      label: "Migraties",
      status: totals.migrationHistoryTables >= 2 ? "ok" : "warning",
      summary: `${totals.migrationHistoryTables}/2 migration history tables gevonden`,
      detail:
        "Controleert of Drizzle- en SQL-migration history aanwezig zijn; staging-copy smoke blijft het harde bewijs.",
      testIds: ["FG-MIG-001", "FG-MIG-002", "FG-MIG-003"],
      nextAction:
        "Draai lege database smoke en staging-copy smoke voor elke migratie-PR.",
    }),
    makeCheck({
      id: "FG-SMOKE-SUPPORT",
      label: "Support grants",
      status: totals.activeSupportGrants > 0 ? "ok" : "manual",
      summary: `${totals.activeSupportGrants} actieve supportgrant(s), ${totals.supportAuditEvents} support audit-event(s)`,
      detail:
        "Laat zien of break-glass/supporttoegang operationeel en auditbaar is op staging.",
      testIds: [
        "FG-SUPPORT-001",
        "FG-SUPPORT-002",
        "FG-SUPPORT-003",
        "FG-SUPPORT-004",
        "FG-SUPPORT-005",
      ],
      nextAction:
        `Maak een korte dedicated supportgrant voor ${STAGING_PILOT_TENANT_SLUG} en test verlopen/verkeerde tenant denial.`,
    }),
    makeCheck({
      id: "FG-SMOKE-AUDIT",
      label: "Audit",
      status:
        totals.auditEvents + totals.supportAuditEvents > 0 ? "ok" : "manual",
      summary: `${totals.auditEvents} tenant/platform audit-event(s), ${totals.supportAuditEvents} support audit-event(s)`,
      detail:
        "Read-only operationele indicatie dat security-, support- en downloadsmokes auditsporen kunnen opleveren.",
      testIds: ["FG-AUDIT-001", "FG-AUDIT-002", "FG-AUDIT-003", "FG-AUDIT-004"],
      nextAction:
        "Controleer tenant-audit isolation en platform-only audit via het securitydashboard.",
    }),
  ];
  const generatedAt = new Date().toISOString();
  const reportHistory = await readSmokeRunReports();
  const runHistory = [
    buildCurrentRunHistory(generatedAt, checks),
    ...reportHistory,
  ];
  const liveSmokes = buildLiveSmokes(checks, totals);
  const migrationSmoke = buildMigrationSmokeStatus(totals, runHistory);
  const mutatingChecks = buildMutatingChecks(totals);
  const finalExternalTenantGate = buildFinalExternalTenantGate({
    checks,
    liveSmokes,
    migrationSmoke,
    mutatingChecks,
  });
  const platformAdminReleaseGate = buildPlatformAdminReleaseGate({
    checks,
    liveSmokes,
    migrationSmoke,
    mutatingChecks,
    finalExternalTenantGate,
  });
  const stagingPromotionGate = buildStagingPromotionGate({
    runHistory,
    liveSmokes,
    migrationSmoke,
    finalExternalTenantGate,
    platformAdminReleaseGate,
  });

  return {
    generatedAt,
    environment: {
      platformHost,
      stagingHost,
      pilotTenantSlug: STAGING_PILOT_TENANT_SLUG,
      pilotTenantHost: STAGING_PILOT_TENANT_HOST,
      platformHostKnown,
      stagingHostKnown,
    },
    totals,
    checks,
    runHistory,
    liveSmokes,
    migrationSmoke,
    mutatingChecks,
    finalExternalTenantGate,
    platformAdminReleaseGate,
    stagingPromotionGate,
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
      "docs/fieldgrid-sprint-16-final-gate.md",
      "docs/fieldgrid-platform-admin-phase-14-final-gate.md",
      "docs/fieldgrid-phase-4-ops-ci-teststructure.md",
    ],
  };
}
