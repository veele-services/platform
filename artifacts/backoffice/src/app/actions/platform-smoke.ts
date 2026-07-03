"use server";

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
  minimumGreen: string[];
  playbooks: string[];
};

function makeCheck(input: PlatformSmokeCheck): PlatformSmokeCheck {
  return input;
}

function countValue(value: unknown): number {
  return Number(value ?? 0);
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

  return {
    generatedAt: new Date().toISOString(),
    environment: { platformHost, stagingHost, platformHostKnown, stagingHostKnown },
    totals,
    checks,
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
