import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const runtimeRoots = ["artifacts", "lib"];

const TABLES = {
  organizationSettingsTable: {
    kind: "organization_settings",
    sqlName: "organization_settings",
  },
  tenantDomainsTable: {
    kind: "tenant_domains",
    sqlName: "tenant_domains",
  },
};
const tableByKind = new Map(
  Object.entries(TABLES).map(([exportName, value]) => [
    value.kind,
    { ...value, exportName },
  ]),
);
const tableBySqlName = new Map(
  [...tableByKind.values()].map((value) => [value.sqlName, value.kind]),
);

const organizationReadMethods = new Set([
  "crossJoin",
  "crossJoinLateral",
  "from",
  "fullJoin",
  "fullJoinLateral",
  "innerJoin",
  "innerJoinLateral",
  "leftJoin",
  "leftJoinLateral",
  "rightJoin",
  "rightJoinLateral",
]);
const rawSqlMethods = new Set(["execute", "query", "raw", "unsafe"]);
const mutationMethods = new Set(["delete", "insert", "update"]);

// This inventory is intentionally exhaustive. A new or moved query fails until
// a reviewer records its exact trusted source (or its exact global-query hash).
// Entries are ordered as they appear in each file.
const trusted = (key, binding, reason) => ({
  key,
  mode: "trusted-binding",
  binding,
  reason,
});
const globalRead = (key, digest, reason) => ({
  key,
  mode: "exact-global",
  digest,
  reason,
});
const reviewedQueryInventory = new Map([
  [
    "artifacts/api-server/src/middleware/auth.ts",
    [
      trusted(
        "resolveTenantByHost:tenant_domains:from:1",
        "domain=normalizedHost",
        "Normalized request host resolves the tenant before authenticated API access.",
      ),
    ],
  ],
  [
    "artifacts/api-server/src/lib/notification-worker.ts",
    [
      trusted(
        "checkPaymentReminderLifecycle:organization_settings:leftJoin:1",
        "tenantId=item.tenant_id",
        "The durable worker rechecks payment-reminder settings against the queue item's persisted tenant immediately before provider delivery.",
      ),
    ],
  ],
  [
    "artifacts/api-server/src/routes/expired-quotes.ts",
    [
      trusted(
        "<module>:organization_settings:leftJoin:1",
        "tenantId=quotesTable.tenantId",
        "Job settings are joined to the quote's persisted tenant.",
      ),
    ],
  ],
  [
    "artifacts/api-server/src/routes/payment-reminders.ts",
    [
      trusted(
        "<module>:organization_settings:leftJoin:1",
        "tenantId=invoicesTable.tenantId",
        "Job settings are joined to the invoice's persisted tenant.",
      ),
      trusted(
        "<module>:organization_settings:from:1",
        "tenantId=invoiceTenantId",
        "The exclusive invoice-row transaction rechecks settings before creating the tenant-bound outbox item.",
      ),
    ],
  ],
  [
    "artifacts/backoffice/src/app/actions/knowledgebase.ts",
    [
      trusted(
        "getTenantKnowledgebaseAuthoringState:organization_settings:from:1",
        "tenantId=tenantId",
        "Tenant ID is obtained from the authenticated backoffice context.",
      ),
      trusted(
        "getTenantProductExperienceSettings:organization_settings:from:1",
        "tenantId=tenantId",
        "Tenant ID is obtained from the authenticated backoffice context.",
      ),
      trusted(
        "saveTenantProductExperienceSettings:organization_settings:from:1",
        "tenantId=tenantId",
        "Tenant ID is obtained from the authenticated backoffice context.",
      ),
    ],
  ],
  [
    "artifacts/backoffice/src/app/actions/planning.ts",
    [
      trusted(
        "getPlanningBoardData:organization_settings:from:1",
        "tenantId=tenantId",
        "Tenant ID is obtained from the authenticated planning context.",
      ),
      trusted(
        "scheduleAssignmentOnBoard:organization_settings:from:1",
        "tenantId=tenantId",
        "Tenant ID is obtained from the authenticated planning context.",
      ),
    ],
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-accelerators.ts",
    [
      globalRead(
        "listDomainCounts:tenant_domains:from:1",
        "84aecccd2bf4653b0fd7",
        "Platform-admin aggregate intentionally groups domain counts for every tenant.",
      ),
    ],
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-dashboard.ts",
    [
      globalRead(
        "getPlatformDashboardSignals:tenant_domains:from:1",
        "11892d082990ac5d4181",
        "Platform-admin dashboard intentionally lists cross-tenant domain health.",
      ),
    ],
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-provisioning.ts",
    [
      trusted(
        "readOnboardingPreflight:tenant_domains:from:1",
        "domain=primaryDomain",
        "Platform provisioning checks global uniqueness of a normalized primary domain.",
      ),
    ],
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-settings.ts",
    [
      globalRead(
        "getMailSnapshot:organization_settings:from:1",
        "73851c1d32a322c92850",
        "Private snapshot helper is called only after platform-admin authorization.",
      ),
    ],
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-tenants.ts",
    [
      trusted(
        "listPlatformTenantDomains:tenant_domains:from:1",
        "tenantId=tenantId",
        "Platform-admin detail action binds the selected tenant ID.",
      ),
      trusted(
        "updatePlatformTenantDomain:tenant_domains:from:1",
        "tenantId=tenantId",
        "Platform-admin mutation reloads the domain under the selected tenant.",
      ),
    ],
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-tickets.ts",
    [
      globalRead(
        "selectTicketRows:tenant_domains:leftJoin:1",
        "05cc445ba4b8bd92fffa",
        "Platform-admin ticket list resolves optional domain labels across tenants.",
      ),
      globalRead(
        "getLinkOptions:tenant_domains:from:1",
        "b2ff0c71b5e104a29b2d",
        "Platform-admin ticket linking intentionally lists domains across tenants.",
      ),
    ],
  ],
  [
    "artifacts/backoffice/src/app/actions/quotes.ts",
    [
      trusted(
        "processExpiredQuotes:organization_settings:from:1",
        "tenantId=tenantId",
        "Tenant ID is obtained from the authenticated backoffice context.",
      ),
    ],
  ],
  [
    "artifacts/backoffice/src/app/actions/reports.ts",
    [
      trusted(
        "submitReport:organization_settings:from:1",
        "tenantId=tenantId",
        "Tenant ID is obtained from the authenticated backoffice context.",
      ),
      trusted(
        "approveReport:organization_settings:leftJoin:1",
        "tenantId=assignmentsTable.tenantId",
        "Settings follow the tenant-bound assignment join.",
      ),
      trusted(
        "rejectReport:organization_settings:leftJoin:1",
        "tenantId=assignmentsTable.tenantId",
        "Settings follow the tenant-bound assignment join.",
      ),
    ],
  ],
  [
    "artifacts/backoffice/src/app/actions/settings.ts",
    [
      trusted(
        "getOrganizationSettings:organization_settings:from:1",
        "tenantId=tenantId",
        "Tenant ID is obtained from the authenticated settings context.",
      ),
      trusted(
        "updateMailSettings:organization_settings:from:1",
        "tenantId=tenantId",
        "Tenant ID is obtained from the authenticated settings context.",
      ),
      trusted(
        "sendTestNotification:organization_settings:from:1",
        "tenantId=tenantId",
        "Tenant ID is obtained from the authenticated settings context.",
      ),
    ],
  ],
  [
    "artifacts/backoffice/src/app/actions/tenant-first-run.ts",
    [
      trusted(
        "upsertOrganizationSettings:organization_settings:from:1",
        "tenantId=tenantId",
        "Tenant ID is obtained from the authenticated first-run context.",
      ),
      trusted(
        "loadFirstRunSnapshot:organization_settings:from:1",
        "tenantId=tenantId",
        "Tenant ID is obtained from the authenticated first-run context.",
      ),
    ],
  ],
  [
    "artifacts/backoffice/src/lib/auth/tenant-resolver.ts",
    [
      trusted(
        "resolveTenantByHost:tenant_domains:from:1",
        "domain=normalizedHost",
        "Normalized request host resolves the tenant before backoffice access.",
      ),
    ],
  ],
  [
    "artifacts/backoffice/src/lib/planning/eta-engine.ts",
    [
      trusted(
        "loadPlanningSettings:organization_settings:from:1",
        "tenantId=tenantId",
        "Caller supplies the already-authorized planning tenant.",
      ),
    ],
  ],
  [
    "artifacts/backoffice/src/lib/planning/routes/route-cache.ts",
    [
      trusted(
        "getRouteCacheTtlHours:organization_settings:from:1",
        "tenantId=tenantId",
        "Caller supplies the already-authorized planning tenant.",
      ),
    ],
  ],
  [
    "artifacts/backoffice/src/lib/tenant-application-origin.ts",
    [
      trusted(
        "tenantApplicationOrigin:tenant_domains:from:1",
        "tenantId=tenantId",
        "Caller supplies the tenant whose application origin is requested.",
      ),
    ],
  ],
  [
    "artifacts/klant-pwa/src/actions/assignments.ts",
    [
      trusted(
        "approveQuote:organization_settings:from:1",
        "tenantId=identity.tenantId",
        "Tenant ID comes from the authenticated customer identity.",
      ),
      trusted(
        "rejectQuote:organization_settings:from:1",
        "tenantId=identity.tenantId",
        "Tenant ID comes from the authenticated customer identity.",
      ),
    ],
  ],
  [
    "artifacts/klant-pwa/src/actions/feature-requests.ts",
    [
      trusted(
        "loadContext:organization_settings:from:1",
        "tenantId=identity.tenantId",
        "Tenant ID comes from the authenticated customer identity.",
      ),
    ],
  ],
  [
    "artifacts/klant-pwa/src/lib/auth/tenant.ts",
    [
      trusted(
        "resolvePortalTenantFromHost:tenant_domains:from:1",
        "domain=normalizedHost",
        "Normalized request host resolves the customer-portal tenant.",
      ),
    ],
  ],
  [
    "artifacts/personeel-pwa/src/actions/availability.ts",
    [
      trusted(
        "getAvailabilityAdvanceDays:organization_settings:from:1",
        "tenantId=tenantId",
        "Tenant ID comes from the authenticated personnel identity.",
      ),
    ],
  ],
  [
    "artifacts/personeel-pwa/src/actions/feature-requests.ts",
    [
      trusted(
        "loadContext:organization_settings:from:1",
        "tenantId=tenantId",
        "Tenant ID comes from the authenticated personnel identity.",
      ),
    ],
  ],
  [
    "artifacts/personeel-pwa/src/actions/leave.ts",
    [
      trusted(
        "requestLeave:organization_settings:from:1",
        "tenantId=person.tenantId",
        "Tenant ID is loaded from the authenticated personnel record.",
      ),
    ],
  ],
  [
    "artifacts/personeel-pwa/src/actions/reports.ts",
    [
      trusted(
        "submitMyReport:organization_settings:from:1",
        "tenantId=identity.tenantId",
        "Tenant ID comes from the authenticated personnel identity.",
      ),
    ],
  ],
  [
    "artifacts/personeel-pwa/src/lib/auth/tenant.ts",
    [
      trusted(
        "resolvePortalTenantFromHost:tenant_domains:from:1",
        "domain=normalizedHost",
        "Normalized request host resolves the personnel-portal tenant.",
      ),
    ],
  ],
  [
    "lib/db/src/custom-domains.ts",
    [
      trusted(
        "isCustomDomainAllowedForCaddy:tenant_domains:from:1",
        "domain=normalizedHost",
        "Normalized host is the unique lookup key for the Caddy allow check.",
      ),
    ],
  ],
  [
    "lib/db/src/email-service.ts",
    [
      trusted(
        "getTenantProvider:organization_settings:from:1",
        "tenantId=tenantId",
        "Message tenant ID selects the tenant-specific provider.",
      ),
    ],
  ],
  [
    "lib/db/src/tenant-branding.ts",
    [
      trusted(
        "getTenantBranding:organization_settings:leftJoin:1",
        "tenantId=tenantsTable.id",
        "Settings follow the tenant selected by trusted tenant ID or slug.",
      ),
    ],
  ],
  [
    "lib/db/src/tenant-provisioning.ts",
    [
      trusted(
        "assertTenantProvisioningIsUnique:tenant_domains:from:1",
        "domain=input.primaryDomain",
        "Provisioning checks the validated primary domain for global uniqueness.",
      ),
    ],
  ],
]);

const reviewedScopeDigests = new Map([
  [
    "artifacts/api-server/src/middleware/auth.ts#resolveTenantByHost:tenant_domains:from:1",
    "6b0e30261d93c950f507",
  ],
  [
    "artifacts/api-server/src/lib/notification-worker.ts#checkPaymentReminderLifecycle:organization_settings:leftJoin:1",
    "d25be7ecc9ce2c6cc7fb",
  ],
  [
    "artifacts/api-server/src/routes/expired-quotes.ts#<module>:organization_settings:leftJoin:1",
    "b674e9e1f9c3dcbb26b8",
  ],
  [
    "artifacts/api-server/src/routes/payment-reminders.ts#<module>:organization_settings:leftJoin:1",
    "148626a0a97a2c5f1608",
  ],
  [
    "artifacts/api-server/src/routes/payment-reminders.ts#<module>:organization_settings:from:1",
    "148626a0a97a2c5f1608",
  ],
  [
    "artifacts/backoffice/src/app/actions/knowledgebase.ts#getTenantKnowledgebaseAuthoringState:organization_settings:from:1",
    "d6dd36d12c1f5d58173a",
  ],
  [
    "artifacts/backoffice/src/app/actions/knowledgebase.ts#getTenantProductExperienceSettings:organization_settings:from:1",
    "bd7ab334026e6dad5ffa",
  ],
  [
    "artifacts/backoffice/src/app/actions/knowledgebase.ts#saveTenantProductExperienceSettings:organization_settings:from:1",
    "05e806c6f3844eabc463",
  ],
  [
    "artifacts/backoffice/src/app/actions/planning.ts#getPlanningBoardData:organization_settings:from:1",
    "5835ec7f21a938b29018",
  ],
  [
    "artifacts/backoffice/src/app/actions/planning.ts#scheduleAssignmentOnBoard:organization_settings:from:1",
    "07ab7c897c2642cb5122",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-accelerators.ts#listDomainCounts:tenant_domains:from:1",
    "19745106d7d9d86d35f6",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-dashboard.ts#getPlatformDashboardSignals:tenant_domains:from:1",
    "418e749831811c3ccaca",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-provisioning.ts#readOnboardingPreflight:tenant_domains:from:1",
    "fadbadb64ab381d65571",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-settings.ts#getMailSnapshot:organization_settings:from:1",
    "fd14f91e736c4bfff030",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-tenants.ts#listPlatformTenantDomains:tenant_domains:from:1",
    "fbef51bda391e0bc92c5",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-tenants.ts#updatePlatformTenantDomain:tenant_domains:from:1",
    "56d72a4cf43089443ce7",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-tickets.ts#selectTicketRows:tenant_domains:leftJoin:1",
    "5356ab98e1efeec28a0c",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-tickets.ts#getLinkOptions:tenant_domains:from:1",
    "1573d48f4fb030e7b7c2",
  ],
  [
    "artifacts/backoffice/src/app/actions/quotes.ts#processExpiredQuotes:organization_settings:from:1",
    "aedc86ae8e7f7bd55650",
  ],
  [
    "artifacts/backoffice/src/app/actions/reports.ts#submitReport:organization_settings:from:1",
    "bf88e118d03b4d56e79c",
  ],
  [
    "artifacts/backoffice/src/app/actions/reports.ts#approveReport:organization_settings:leftJoin:1",
    "da8d35693321681603a0",
  ],
  [
    "artifacts/backoffice/src/app/actions/reports.ts#rejectReport:organization_settings:leftJoin:1",
    "34eb6504099a39aff807",
  ],
  [
    "artifacts/backoffice/src/app/actions/settings.ts#getOrganizationSettings:organization_settings:from:1",
    "a036760f311b2a1bb66d",
  ],
  [
    "artifacts/backoffice/src/app/actions/settings.ts#updateMailSettings:organization_settings:from:1",
    "e1ca41960701396f78d9",
  ],
  [
    "artifacts/backoffice/src/app/actions/settings.ts#sendTestNotification:organization_settings:from:1",
    "922f4a1fb46af6eec102",
  ],
  [
    "artifacts/backoffice/src/app/actions/tenant-first-run.ts#upsertOrganizationSettings:organization_settings:from:1",
    "9066f0a1e03c5c028e88",
  ],
  [
    "artifacts/backoffice/src/app/actions/tenant-first-run.ts#loadFirstRunSnapshot:organization_settings:from:1",
    "c0571f94773873b17b19",
  ],
  [
    "artifacts/backoffice/src/lib/auth/tenant-resolver.ts#resolveTenantByHost:tenant_domains:from:1",
    "dabc1f760f58f32c50d8",
  ],
  [
    "artifacts/backoffice/src/lib/planning/eta-engine.ts#loadPlanningSettings:organization_settings:from:1",
    "6096b4c4845704d8fb76",
  ],
  [
    "artifacts/backoffice/src/lib/planning/routes/route-cache.ts#getRouteCacheTtlHours:organization_settings:from:1",
    "09055e9f823816de9a24",
  ],
  [
    "artifacts/backoffice/src/lib/tenant-application-origin.ts#tenantApplicationOrigin:tenant_domains:from:1",
    "c3ea645a1246451603cc",
  ],
  [
    "artifacts/klant-pwa/src/actions/assignments.ts#approveQuote:organization_settings:from:1",
    "95ff0c7aa7cbbbd00062",
  ],
  [
    "artifacts/klant-pwa/src/actions/assignments.ts#rejectQuote:organization_settings:from:1",
    "400c8de0e939d54ed8e2",
  ],
  [
    "artifacts/klant-pwa/src/actions/feature-requests.ts#loadContext:organization_settings:from:1",
    "61a4284d12a2bc3d06f3",
  ],
  [
    "artifacts/klant-pwa/src/lib/auth/tenant.ts#resolvePortalTenantFromHost:tenant_domains:from:1",
    "18c93b4f5282b2f0877b",
  ],
  [
    "artifacts/personeel-pwa/src/actions/availability.ts#getAvailabilityAdvanceDays:organization_settings:from:1",
    "46172c95dd585cacdb5f",
  ],
  [
    "artifacts/personeel-pwa/src/actions/feature-requests.ts#loadContext:organization_settings:from:1",
    "946acddf1eb8ee4483b8",
  ],
  [
    "artifacts/personeel-pwa/src/actions/leave.ts#requestLeave:organization_settings:from:1",
    "83e0ae55f2de17129862",
  ],
  [
    "artifacts/personeel-pwa/src/actions/reports.ts#submitMyReport:organization_settings:from:1",
    "8f7510f94e29daf66a26",
  ],
  [
    "artifacts/personeel-pwa/src/lib/auth/tenant.ts#resolvePortalTenantFromHost:tenant_domains:from:1",
    "18c93b4f5282b2f0877b",
  ],
  [
    "lib/db/src/custom-domains.ts#isCustomDomainAllowedForCaddy:tenant_domains:from:1",
    "25add06d299d6c7e064a",
  ],
  [
    "lib/db/src/email-service.ts#getTenantProvider:organization_settings:from:1",
    "ce2af9d507e76e8ad506",
  ],
  [
    "lib/db/src/tenant-branding.ts#getTenantBranding:organization_settings:leftJoin:1",
    "47b4b411db0827893bd3",
  ],
  [
    "lib/db/src/tenant-provisioning.ts#assertTenantProvisioningIsUnique:tenant_domains:from:1",
    "aad21c7f8a422222c7b5",
  ],
]);

// Cross-tenant reads are only valid in their reviewed platform-admin file
// context. Hashing the complete file prevents moving a private helper behind an
// unguarded call site while leaving the query and helper bodies unchanged.
const reviewedExactGlobalFileDigests = new Map([
  [
    "artifacts/backoffice/src/app/actions/platform-accelerators.ts",
    "a5e845f852d863517032",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-dashboard.ts",
    "6bde32a42ec922e7c504",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-settings.ts",
    "bfc08c98c756a8dec0cf",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-tickets.ts",
    "5a6ddaa236b2d5880010",
  ],
]);

for (const [relativePath, entries] of reviewedQueryInventory) {
  for (const entry of entries) {
    entry.scopeDigest = reviewedScopeDigests.get(
      `${relativePath}#${entry.key}`,
    );
    if (entry.mode === "exact-global") {
      entry.fileDigest = reviewedExactGlobalFileDigests.get(relativePath);
    }
  }
}

// Raw tenant_domains reads are reviewed separately because they cannot safely
// inherit the rules for Drizzle table objects. Every entry must have an exact
// normalized AST hash and a documented security context.
const reviewedRawTenantDomainInventory = new Map([
  [
    "artifacts/backoffice/src/app/actions/platform-notifications.ts",
    [
      {
        functionName: "readinessStatusSql",
        digest: "eb9ae70a9f70fe10e65d",
        context: "platform-admin-global",
        reason:
          "Exact correlated readiness fragment is used only by the platform-admin notification overview.",
      },
    ],
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-smoke.ts",
    [
      {
        functionName: "buildPlatformStagingSmokeDashboard",
        digest: "d824941e9f8200e477ef",
        context: "platform-admin-global",
        reason:
          "Platform staging smoke intentionally counts all non-reserved tenant domains.",
      },
      {
        functionName: "buildPlatformStagingSmokeDashboard",
        digest: "b38a25a53e2e927ede19",
        context: "platform-admin-global",
        reason:
          "Platform staging smoke intentionally counts all verified tenant domains.",
      },
    ],
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-tenants.ts",
    [
      {
        functionName: "tenantListDomainStatusSql",
        digest: "2b080227aa14507e9cdc",
        context: "platform-admin-global",
        reason:
          "Exact correlated status fragment is limited to the platform tenant list.",
      },
      {
        functionName: "tenantListReadinessSql",
        digest: "1cac0e93bc2e0751b0db",
        context: "platform-admin-global",
        reason:
          "Exact correlated readiness fragment is limited to the platform tenant list.",
      },
      {
        functionName: "platformTenantListConditions",
        digest: "12b912d121d4a989e36b",
        context: "platform-admin-global",
        reason:
          "Platform-admin filter searches the reviewed domain column across tenant rows.",
      },
      {
        functionName: "listPlatformTenants",
        digest: "cfa292dc01af686423fc",
        context: "platform-admin-global",
        reason:
          "Correlated platform list subquery selects the primary domain of each tenant.",
      },
      {
        functionName: "listPlatformTenantList",
        digest: "a73388e769a939d5200b",
        context: "platform-admin-global",
        reason:
          "Correlated platform list subquery counts verified domains per tenant.",
      },
      {
        functionName: "getPlatformTenantDetail",
        digest: "cfa292dc01af686423fc",
        context: "tenant-bound",
        reason:
          "Correlated detail subquery is constrained by the selected platform tenant row.",
      },
      {
        functionName: "getPlatformTenantUsage",
        digest: "2bed79c703eda3d62afd",
        context: "tenant-bound",
        reason:
          "Usage count includes an exact tenant_id predicate with the selected tenant ID.",
      },
      {
        functionName: "listPlatformSubscriptionDashboard",
        digest: "83258e502013c8f4e583",
        context: "platform-admin-global",
        reason:
          "Platform subscription dashboard correlates domain readiness to each tenant.",
      },
      {
        functionName: "listPlatformSubscriptionDashboard",
        digest: "ff9b9b6062f3d4b096d9",
        context: "platform-admin-global",
        reason:
          "Platform subscription dashboard correlates verified domains to each tenant.",
      },
      {
        functionName: "listPlatformTenantListFallback",
        digest: "61760fd1ba3a73b1ea18",
        context: "platform-admin-global",
        reason:
          "Fallback platform list computes exact correlated domain state per tenant.",
      },
      {
        functionName: "listPlatformTenantListFallback",
        digest: "a73388e769a939d5200b",
        context: "platform-admin-global",
        reason: "Fallback platform list counts verified domains per tenant.",
      },
      {
        functionName: "updatePlatformTenantPlan",
        digest: "1c526d096593f308480b",
        context: "tenant-bound",
        reason:
          "Plan update readiness check is constrained to the selected tenant ID.",
      },
    ],
  ],
]);

const reviewedRawScopeDigests = new Map([
  [
    "artifacts/backoffice/src/app/actions/platform-notifications.ts#readinessStatusSql:eb9ae70a9f70fe10e65d",
    "01461c40b602419a56b7",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-smoke.ts#buildPlatformStagingSmokeDashboard:d824941e9f8200e477ef",
    "152bb1a6960d8f8d0ab5",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-smoke.ts#buildPlatformStagingSmokeDashboard:b38a25a53e2e927ede19",
    "152bb1a6960d8f8d0ab5",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-tenants.ts#tenantListDomainStatusSql:2b080227aa14507e9cdc",
    "6fdca58f0ec5a25a0c72",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-tenants.ts#tenantListReadinessSql:1cac0e93bc2e0751b0db",
    "545749f2079cedabb164",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-tenants.ts#platformTenantListConditions:12b912d121d4a989e36b",
    "2aa0e3c1ad5c91df0a27",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-tenants.ts#listPlatformTenants:cfa292dc01af686423fc",
    "7d1fe2b405f713030f94",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-tenants.ts#listPlatformTenantList:a73388e769a939d5200b",
    "c2ab8a66b8d8aaf1fffc",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-tenants.ts#getPlatformTenantDetail:cfa292dc01af686423fc",
    "c92d39bc2db7ce42ac70",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-tenants.ts#getPlatformTenantUsage:2bed79c703eda3d62afd",
    "0e1d2e13182dabe11554",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-tenants.ts#listPlatformSubscriptionDashboard:83258e502013c8f4e583",
    "5e9177afebd1439a067f",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-tenants.ts#listPlatformSubscriptionDashboard:ff9b9b6062f3d4b096d9",
    "5e9177afebd1439a067f",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-tenants.ts#listPlatformTenantListFallback:61760fd1ba3a73b1ea18",
    "b394b3631d96e622e5f0",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-tenants.ts#listPlatformTenantListFallback:a73388e769a939d5200b",
    "b394b3631d96e622e5f0",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-tenants.ts#updatePlatformTenantPlan:1c526d096593f308480b",
    "0f4ca9dff912e21f6928",
  ],
]);
const reviewedRawFileDigests = new Map([
  [
    "artifacts/backoffice/src/app/actions/platform-notifications.ts",
    "9c026d3e6eb551b25823",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-smoke.ts",
    "e74db38fc70d131a607f",
  ],
  [
    "artifacts/backoffice/src/app/actions/platform-tenants.ts",
    "086044fab4530fc5d76f",
  ],
]);

for (const [relativePath, entries] of reviewedRawTenantDomainInventory) {
  for (const entry of entries) {
    const key = `${relativePath}#${entry.functionName}:${entry.digest}`;
    entry.scopeDigest = reviewedRawScopeDigests.get(key);
    entry.fileDigest = reviewedRawFileDigests.get(relativePath);
  }
}

function runtimeSourceFiles(relativeDirectory) {
  const absoluteDirectory = path.join(repositoryRoot, relativeDirectory);
  return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap(
    (entry) => {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) return runtimeSourceFiles(relativePath);
      if (!entry.isFile() || !/\.tsx?$/u.test(entry.name)) return [];
      return [relativePath];
    },
  );
}

function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}

function unwrapExpression(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isAwaitExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function memberName(expression) {
  const unwrapped = unwrapExpression(expression);
  if (ts.isIdentifier(unwrapped)) return unwrapped.text;
  if (ts.isPropertyAccessExpression(unwrapped)) return unwrapped.name.text;
  if (
    ts.isElementAccessExpression(unwrapped) &&
    unwrapped.argumentExpression &&
    ts.isStringLiteralLike(unwrapped.argumentExpression)
  ) {
    return unwrapped.argumentExpression.text;
  }
  return null;
}

function normalizeExpression(node, sourceFile) {
  return unwrapExpression(node)
    .getText(sourceFile)
    .replace(/\s+/gu, "")
    .replace(/;$/u, "");
}

function astDigest(node, sourceFile) {
  return createHash("sha256")
    .update(normalizeExpression(node, sourceFile))
    .digest("hex")
    .slice(0, 20);
}

function containingFunction(node) {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) {
      return { name: current.name.text, node: current };
    }
    if (ts.isMethodDeclaration(current) && current.name) {
      return { name: current.name.getText(), node: current };
    }
    if (ts.isFunctionExpression(current) || ts.isArrowFunction(current)) {
      if (
        ts.isVariableDeclaration(current.parent) &&
        ts.isIdentifier(current.parent.name)
      ) {
        return { name: current.parent.name.text, node: current };
      }
      if (ts.isPropertyAssignment(current.parent)) {
        return { name: current.parent.name.getText(), node: current };
      }
    }
    current = current.parent;
  }
  return { name: "<module>", node: null };
}

function collectBindings(sourceFile) {
  const tableIdentifiers = new Map();
  const namespaceIdentifiers = new Set();
  const sensitiveStringIdentifiers = new Map();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    const bindings = statement.importClause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      const moduleName = ts.isStringLiteralLike(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : "";
      if (
        moduleName === "@workspace/db" ||
        moduleName.startsWith("@workspace/db/") ||
        /^(?:\.\.\/|\.\/)schema(?:\/|$)/u.test(moduleName)
      ) {
        namespaceIdentifiers.add(bindings.name.text);
      }
      continue;
    }
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      const table = TABLES[importedName];
      if (table) tableIdentifiers.set(element.name.text, table.kind);
    }
  }

  const tableKind = (node) => {
    const expression = unwrapExpression(node);
    if (ts.isIdentifier(expression)) {
      return tableIdentifiers.get(expression.text) ?? null;
    }
    if (
      ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      namespaceIdentifiers.has(expression.expression.text)
    ) {
      return TABLES[expression.name.text]?.kind ?? null;
    }
    if (
      ts.isElementAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      namespaceIdentifiers.has(expression.expression.text) &&
      expression.argumentExpression &&
      ts.isStringLiteralLike(expression.argumentExpression)
    ) {
      return TABLES[expression.argumentExpression.text]?.kind ?? null;
    }
    return null;
  };

  const sensitiveStringKind = (node) => {
    const expression = unwrapExpression(node);
    if (ts.isStringLiteralLike(expression)) {
      return tableBySqlName.get(expression.text.trim().toLowerCase()) ?? null;
    }
    if (ts.isIdentifier(expression)) {
      return sensitiveStringIdentifiers.get(expression.text) ?? null;
    }
    return null;
  };

  let changed = true;
  while (changed) {
    changed = false;
    visit(sourceFile, (node) => {
      if (!ts.isVariableDeclaration(node) || !node.initializer) return;

      if (ts.isIdentifier(node.name)) {
        const directKind = tableKind(node.initializer);
        const initializer = unwrapExpression(node.initializer);
        const aliasedKind =
          ts.isCallExpression(initializer) &&
          ["alias", "aliasedTable", "pgTableAlias"].includes(
            memberName(initializer.expression) ?? "",
          ) &&
          initializer.arguments[0]
            ? tableKind(initializer.arguments[0])
            : null;
        const kind = directKind ?? aliasedKind;
        if (kind && tableIdentifiers.get(node.name.text) !== kind) {
          tableIdentifiers.set(node.name.text, kind);
          changed = true;
        }

        const stringKind = sensitiveStringKind(node.initializer);
        if (
          stringKind &&
          sensitiveStringIdentifiers.get(node.name.text) !== stringKind
        ) {
          sensitiveStringIdentifiers.set(node.name.text, stringKind);
          changed = true;
        }
        return;
      }

      if (!ts.isObjectBindingPattern(node.name)) return;
      const initializer = unwrapExpression(node.initializer);
      if (
        !ts.isIdentifier(initializer) ||
        !namespaceIdentifiers.has(initializer.text)
      ) {
        return;
      }
      for (const element of node.name.elements) {
        const propertyName =
          element.propertyName && ts.isIdentifier(element.propertyName)
            ? element.propertyName.text
            : ts.isIdentifier(element.name)
              ? element.name.text
              : null;
        const kind = propertyName ? TABLES[propertyName]?.kind : null;
        if (
          kind &&
          ts.isIdentifier(element.name) &&
          tableIdentifiers.get(element.name.text) !== kind
        ) {
          tableIdentifiers.set(element.name.text, kind);
          changed = true;
        }
      }
    });
  }

  const allowedAliasInitializers = new Set();
  visit(sourceFile, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      ts.isIdentifier(unwrapExpression(node.initializer)) &&
      namespaceIdentifiers.has(unwrapExpression(node.initializer).text) &&
      node.name.elements.some(
        (element) =>
          ts.isIdentifier(element.name) &&
          tableIdentifiers.has(element.name.text),
      )
    ) {
      allowedAliasInitializers.add(node);
      return;
    }
    if (
      !ts.isVariableDeclaration(node) ||
      !ts.isIdentifier(node.name) ||
      !node.initializer ||
      !tableIdentifiers.has(node.name.text)
    ) {
      return;
    }
    const initializer = unwrapExpression(node.initializer);
    if (tableKind(initializer)) {
      allowedAliasInitializers.add(node.initializer);
      return;
    }
    if (
      ts.isCallExpression(initializer) &&
      ["alias", "aliasedTable", "pgTableAlias"].includes(
        memberName(initializer.expression) ?? "",
      ) &&
      initializer.arguments[0] &&
      tableKind(initializer.arguments[0])
    ) {
      allowedAliasInitializers.add(node.initializer);
    }
  });

  return {
    allowedAliasInitializers,
    namespaceIdentifiers,
    sensitiveStringKind,
    tableIdentifiers,
    tableKind,
  };
}

function containsNode(container, candidate) {
  return container.pos <= candidate.pos && container.end >= candidate.end;
}

function isIdentifierValueReference(node) {
  let current = node.parent;
  while (current) {
    if (ts.isTypeNode(current)) return false;
    current = current.parent;
  }
  const parent = node.parent;
  if (!parent) return true;
  if (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isMethodDeclaration(parent) && parent.name === node) ||
    (ts.isPropertyDeclaration(parent) && parent.name === node) ||
    (ts.isVariableDeclaration(parent) && parent.name === node) ||
    (ts.isParameter(parent) && parent.name === node) ||
    (ts.isBindingElement(parent) &&
      (parent.name === node || parent.propertyName === node)) ||
    ts.isImportSpecifier(parent) ||
    ts.isNamespaceImport(parent) ||
    ts.isImportClause(parent)
  ) {
    return false;
  }
  return true;
}

function sensitiveTableReference(node, bindings) {
  if (ts.isPropertyAccessExpression(node)) {
    return TABLES[node.name.text]?.kind ?? null;
  }
  if (
    ts.isElementAccessExpression(node) &&
    node.argumentExpression &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    return TABLES[node.argumentExpression.text]?.kind ?? null;
  }
  if (ts.isBindingElement(node)) {
    const propertyName = node.propertyName ?? node.name;
    if (ts.isIdentifier(propertyName)) {
      return TABLES[propertyName.text]?.kind ?? null;
    }
  }
  if (ts.isIdentifier(node) && isIdentifierValueReference(node)) {
    if (bindings.namespaceIdentifiers.has(node.text)) {
      const parent = node.parent;
      if (
        (ts.isPropertyAccessExpression(parent) && parent.expression === node) ||
        (ts.isElementAccessExpression(parent) &&
          parent.expression === node &&
          parent.argumentExpression &&
          ts.isStringLiteralLike(parent.argumentExpression))
      ) {
        return null;
      }
      return "sensitive_schema_namespace";
    }
    return bindings.tableIdentifiers.get(node.text) ?? null;
  }
  return null;
}

function queryChainRoot(node) {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    if (
      (ts.isPropertyAccessExpression(parent) ||
        ts.isElementAccessExpression(parent)) &&
      parent.expression === current
    ) {
      current = parent;
      continue;
    }
    if (ts.isCallExpression(parent) && parent.expression === current) {
      current = parent;
      continue;
    }
    if (
      (ts.isAwaitExpression(parent) ||
        ts.isParenthesizedExpression(parent) ||
        ts.isAsExpression(parent) ||
        ts.isNonNullExpression(parent) ||
        ts.isSatisfiesExpression(parent) ||
        ts.isTypeAssertionExpression(parent)) &&
      parent.expression === current
    ) {
      current = parent;
      continue;
    }
    break;
  }
  return current;
}

function queryChainCalls(root) {
  const calls = [];
  let current = unwrapExpression(root);
  while (ts.isCallExpression(current)) {
    calls.push(current);
    const callee = unwrapExpression(current.expression);
    if (
      !ts.isPropertyAccessExpression(callee) &&
      !ts.isElementAccessExpression(callee)
    ) {
      break;
    }
    current = unwrapExpression(callee.expression);
  }
  return calls;
}

function topLevelConjuncts(node) {
  const expression = unwrapExpression(node);
  if (
    ts.isCallExpression(expression) &&
    memberName(expression.expression) === "and"
  ) {
    return expression.arguments.flatMap(topLevelConjuncts);
  }
  return [expression];
}

function sensitiveColumn(node, bindings) {
  const expression = unwrapExpression(node);
  if (ts.isPropertyAccessExpression(expression)) {
    const kind = bindings.tableKind(expression.expression);
    return kind ? { kind, column: expression.name.text } : null;
  }
  if (
    ts.isElementAccessExpression(expression) &&
    expression.argumentExpression &&
    ts.isStringLiteralLike(expression.argumentExpression)
  ) {
    const kind = bindings.tableKind(expression.expression);
    return kind ? { kind, column: expression.argumentExpression.text } : null;
  }
  return null;
}

function bindingFromPredicate(predicate, expectedKind, bindings, sourceFile) {
  const expression = unwrapExpression(predicate);
  if (
    !ts.isCallExpression(expression) ||
    memberName(expression.expression) !== "eq" ||
    expression.arguments.length !== 2
  ) {
    return null;
  }

  const [left, right] = expression.arguments;
  const leftColumn = sensitiveColumn(left, bindings);
  const rightColumn = sensitiveColumn(right, bindings);
  if (leftColumn?.kind === expectedKind && rightColumn?.kind !== expectedKind) {
    return `${leftColumn.column}=${normalizeExpression(right, sourceFile)}`;
  }
  if (rightColumn?.kind === expectedKind && leftColumn?.kind !== expectedKind) {
    return `${rightColumn.column}=${normalizeExpression(left, sourceFile)}`;
  }
  return null;
}

function operationBindings(operation, root, bindings, sourceFile) {
  const predicates = [];
  if (operation.method === "from") {
    for (const call of queryChainCalls(root)) {
      const method = memberName(call.expression);
      if (method === "where" && call.arguments[0]) {
        predicates.push(...topLevelConjuncts(call.arguments[0]));
      }
      if (
        method &&
        organizationReadMethods.has(method) &&
        method !== "from" &&
        call.arguments[1]
      ) {
        predicates.push(...topLevelConjuncts(call.arguments[1]));
      }
    }
  } else if (operation.node.arguments[1]) {
    predicates.push(...topLevelConjuncts(operation.node.arguments[1]));
  }

  return [
    ...new Set(
      predicates
        .map((predicate) =>
          bindingFromPredicate(predicate, operation.kind, bindings, sourceFile),
        )
        .filter(Boolean),
    ),
  ].sort();
}

function chainContainsUndefinedFilter(root) {
  return queryChainCalls(root).some((call) => {
    if (memberName(call.expression) !== "where") return false;
    return call.arguments.some((argument) => {
      let unsafe = false;
      visit(argument, (candidate) => {
        if (
          (ts.isIdentifier(candidate) && candidate.text === "undefined") ||
          (ts.isVoidExpression(candidate) &&
            ts.isNumericLiteral(candidate.expression))
        ) {
          unsafe = true;
        }
      });
      return unsafe;
    });
  });
}

function isUnconditionalJoin(operation) {
  if (operation.method === "from" || !operation.node.arguments[1]) return false;
  const predicate = unwrapExpression(operation.node.arguments[1]);
  if (predicate.kind === ts.SyntaxKind.TrueKeyword) return true;
  return Boolean(
    ts.isTaggedTemplateExpression(predicate) &&
    predicate.template.getText().replaceAll("`", "").trim().toLowerCase() ===
      "true",
  );
}

function rawKindsInText(value) {
  const kinds = new Set();
  for (const [sqlName, kind] of tableBySqlName) {
    if (new RegExp(`\\b${sqlName}\\b`, "iu").test(value)) kinds.add(kind);
  }
  return kinds;
}

function taggedTemplateRawKinds(node, bindings) {
  const kinds = rawKindsInText(node.template.getText());
  if (ts.isTemplateExpression(node.template)) {
    for (const span of node.template.templateSpans) {
      const tableKind = bindings.tableKind(span.expression);
      const stringKind = bindings.sensitiveStringKind(span.expression);
      if (tableKind) kinds.add(tableKind);
      if (stringKind) kinds.add(stringKind);
    }
  }
  return kinds;
}

function analyzeSource(relativePath, source) {
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const bindings = collectBindings(sourceFile);
  const fileDigest = astDigest(sourceFile, sourceFile);
  const operations = [];
  const directStringReads = [];
  const rawReferences = [];
  const dynamicRawCalls = [];
  const mutationRoots = [];
  const schemaReferenceRoots = [];
  const schemaConfigRoots = [];

  visit(sourceFile, (node) => {
    if (ts.isTaggedTemplateExpression(node)) {
      const kinds = taggedTemplateRawKinds(node, bindings);
      if (kinds.size > 0) {
        const fn = containingFunction(node);
        rawReferences.push({
          digest: astDigest(node, sourceFile),
          fileDigest,
          form: "tagged-template",
          functionName: fn.name,
          kinds: [...kinds].sort(),
          line:
            sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
              .line + 1,
          node,
          scopeDigest: astDigest(fn.node ?? sourceFile, sourceFile),
        });
      }
    }

    if (!ts.isCallExpression(node)) return;
    const method = memberName(node.expression);
    if (relativePath === "lib/db/src/connection.ts" && method === "drizzle") {
      schemaConfigRoots.push(node);
    }
    if (
      relativePath.startsWith("lib/db/src/schema/") &&
      (method === "foreignKey" || method === "references")
    ) {
      schemaReferenceRoots.push(node);
    }
    if (method === "raw") {
      dynamicRawCalls.push({
        line:
          sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
            .line + 1,
      });
    }

    if (method === "from" && node.arguments[0]) {
      const kind = bindings.sensitiveStringKind(node.arguments[0]);
      if (kind) {
        directStringReads.push({
          kind,
          line:
            sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
              .line + 1,
        });
      }
    }

    if (
      method &&
      mutationMethods.has(method) &&
      node.arguments[0] &&
      bindings.tableKind(node.arguments[0])
    ) {
      mutationRoots.push(queryChainRoot(node));
    }

    if (method && rawSqlMethods.has(method) && node.arguments[0]) {
      const argument = unwrapExpression(node.arguments[0]);
      if (ts.isStringLiteralLike(argument)) {
        const kinds = rawKindsInText(argument.text);
        if (kinds.size > 0) {
          const fn = containingFunction(node);
          rawReferences.push({
            digest: astDigest(argument, sourceFile),
            fileDigest,
            form: "string",
            functionName: fn.name,
            kinds: [...kinds].sort(),
            line:
              sourceFile.getLineAndCharacterOfPosition(
                node.getStart(sourceFile),
              ).line + 1,
            node: argument,
            scopeDigest: astDigest(fn.node ?? sourceFile, sourceFile),
          });
        }
      }
    }

    if (!method || !organizationReadMethods.has(method) || !node.arguments[0]) {
      return;
    }
    const kind = bindings.tableKind(node.arguments[0]);
    if (!kind) return;
    const root = queryChainRoot(node);
    const fn = containingFunction(root);
    const operation = { kind, method, node };
    operations.push({
      bindings: operationBindings(operation, root, bindings, sourceFile),
      digest: astDigest(root, sourceFile),
      fileDigest,
      functionName: fn.name,
      kind,
      line:
        sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          .line + 1,
      method,
      root,
      scopeDigest: astDigest(fn.node ?? sourceFile, sourceFile),
      unconditionalJoin: isUnconditionalJoin(operation),
      undefinedWhere: chainContainsUndefinedFilter(root),
    });
  });

  const uniqueRawReferences = rawReferences.filter(
    (reference, index, values) =>
      values.findIndex(
        (candidate) =>
          candidate.node.pos === reference.node.pos &&
          candidate.node.end === reference.node.end,
      ) === index,
  );
  const coveredNodes = [
    ...operations.map((operation) => operation.root),
    ...uniqueRawReferences.map((reference) => reference.node),
    ...mutationRoots,
    ...schemaReferenceRoots,
    ...schemaConfigRoots,
    ...bindings.allowedAliasInitializers,
  ];
  const unaccountedSensitiveReferences = [];
  visit(sourceFile, (node) => {
    const kind = sensitiveTableReference(node, bindings);
    if (!kind || coveredNodes.some((covered) => containsNode(covered, node))) {
      return;
    }
    unaccountedSensitiveReferences.push({
      kind,
      line:
        sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          .line + 1,
      text: normalizeExpression(node, sourceFile),
    });
  });

  return {
    directStringReads,
    dynamicRawCalls,
    operations: operations.sort((left, right) => left.line - right.line),
    parseDiagnostics: sourceFile.parseDiagnostics ?? [],
    rawReferences: uniqueRawReferences,
    sourceFile,
    unaccountedSensitiveReferences,
  };
}

function inventoryEntryKey(entry) {
  return `${entry.functionName}:${entry.kind}:${entry.method}`;
}

function indexedEntries(entries) {
  const occurrences = new Map();
  return entries.map((entry) => {
    const base = inventoryEntryKey(entry);
    const occurrence = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, occurrence);
    return { ...entry, inventoryKey: `${base}:${occurrence}` };
  });
}

function queryFindings(
  relativePath,
  analysis,
  inventory = reviewedQueryInventory,
) {
  const findings = [];
  for (const diagnostic of analysis.parseDiagnostics) {
    findings.push(`${relativePath}: TypeScript parse error ${diagnostic.code}`);
  }
  for (const call of analysis.directStringReads) {
    findings.push(
      `${relativePath}:${call.line}: direct string access to ${call.kind} is forbidden`,
    );
  }
  for (const call of analysis.dynamicRawCalls) {
    findings.push(
      `${relativePath}:${call.line}: dynamic raw SQL identifier is forbidden`,
    );
  }
  for (const reference of analysis.unaccountedSensitiveReferences) {
    findings.push(
      `${relativePath}:${reference.line}: dynamic or unreviewed ${reference.kind} table use (${reference.text})`,
    );
  }

  const expected = new Map(
    (inventory.get(relativePath) ?? []).map((entry) => [entry.key, entry]),
  );
  const actual = indexedEntries(analysis.operations);
  for (const operation of actual) {
    const location = `${relativePath}:${operation.line} (${operation.functionName})`;
    const reviewed = expected.get(operation.inventoryKey);
    if (!reviewed) {
      findings.push(
        `${location}: unreviewed ${operation.kind} ${operation.method} query (${operation.inventoryKey})`,
      );
      continue;
    }
    expected.delete(operation.inventoryKey);
    if (!reviewed.scopeDigest) {
      findings.push(
        `${location}: reviewed scope digest missing (${operation.scopeDigest})`,
      );
    } else if (reviewed.scopeDigest !== operation.scopeDigest) {
      findings.push(
        `${location}: trusted source scope changed (${operation.scopeDigest}); explicit rereview required`,
      );
    }
    if (operation.unconditionalJoin) {
      findings.push(`${location}: unconditional sensitive-table join`);
    }
    if (operation.undefinedWhere) {
      findings.push(`${location}: optional where can remove tenant scope`);
    }
    if (reviewed.mode === "trusted-binding") {
      if (!reviewed.reason?.trim()) {
        findings.push(`${location}: trusted binding has no review rationale`);
      }
      if (!operation.bindings.includes(reviewed.binding)) {
        findings.push(
          `${location}: expected top-level trusted binding ${reviewed.binding}; found ${operation.bindings.join(", ") || "none"}`,
        );
      }
    } else if (reviewed.mode === "exact-global") {
      if (!reviewed.reason?.trim()) {
        findings.push(`${location}: global read has no review rationale`);
      }
      if (operation.digest !== reviewed.digest) {
        findings.push(
          `${location}: global read changed (${operation.digest}); explicit rereview required`,
        );
      }
      if (!reviewed.fileDigest) {
        findings.push(
          `${location}: reviewed global file digest missing (${operation.fileDigest})`,
        );
      } else if (reviewed.fileDigest !== operation.fileDigest) {
        findings.push(
          `${location}: global authorization context changed (${operation.fileDigest}); explicit rereview required`,
        );
      }
    } else {
      findings.push(`${location}: unknown inventory mode`);
    }
  }
  for (const entry of expected.values()) {
    findings.push(`${relativePath}: reviewed query missing (${entry.key})`);
  }
  return findings;
}

function rawFindings(
  relativePath,
  analysis,
  inventory = reviewedRawTenantDomainInventory,
) {
  const findings = [];
  const expected = new Map(
    (inventory.get(relativePath) ?? []).map((entry) => [
      `${entry.functionName}:${entry.digest}`,
      entry,
    ]),
  );
  for (const reference of analysis.rawReferences) {
    const location = `${relativePath}:${reference.line} (${reference.functionName})`;
    if (reference.kinds.includes("organization_settings")) {
      findings.push(`${location}: raw organization_settings SQL is forbidden`);
    }
    if (!reference.kinds.includes("tenant_domains")) continue;
    const key = `${reference.functionName}:${reference.digest}`;
    const reviewed = expected.get(key);
    if (!reviewed) {
      findings.push(
        `${location}: unreviewed raw tenant_domains read (${reference.digest})`,
      );
      continue;
    }
    expected.delete(key);
    if (
      ![
        "platform-admin-global",
        "tenant-bound",
        "public-domain-resolution",
      ].includes(reviewed.context) ||
      !reviewed.reason?.trim()
    ) {
      findings.push(
        `${location}: raw tenant_domains context is not documented`,
      );
    }
    if (
      !reviewed.scopeDigest ||
      reviewed.scopeDigest !== reference.scopeDigest
    ) {
      findings.push(
        `${location}: raw query scope changed (${reference.scopeDigest}); explicit rereview required`,
      );
    }
    if (!reviewed.fileDigest || reviewed.fileDigest !== reference.fileDigest) {
      findings.push(
        `${location}: raw authorization context changed (${reference.fileDigest}); explicit rereview required`,
      );
    }
  }
  for (const entry of expected.values()) {
    findings.push(
      `${relativePath}: reviewed raw tenant_domains read missing (${entry.functionName}:${entry.digest})`,
    );
  }
  return findings;
}

function analyzeRuntime() {
  return runtimeRoots
    .flatMap(runtimeSourceFiles)
    .sort()
    .map((relativePath) => ({
      analysis: analyzeSource(
        relativePath,
        readFileSync(path.join(repositoryRoot, relativePath), "utf8"),
      ),
      relativePath,
    }));
}

test("all sensitive Drizzle reads have an exact reviewed binding inventory", () => {
  const files = analyzeRuntime();
  const findings = files.flatMap(({ relativePath, analysis }) =>
    queryFindings(relativePath, analysis),
  );
  assert.deepEqual(
    findings,
    [],
    `Current query inventory:\n${JSON.stringify(
      Object.fromEntries(
        files
          .filter(({ analysis }) => analysis.operations.length > 0)
          .map(({ relativePath, analysis }) => [
            relativePath,
            indexedEntries(analysis.operations).map((entry) => ({
              bindings: entry.bindings,
              digest: entry.digest,
              fileDigest: entry.fileDigest,
              key: entry.inventoryKey,
              line: entry.line,
              scopeDigest: entry.scopeDigest,
            })),
          ]),
      ),
      null,
      2,
    )}`,
  );
});

test("raw sensitive-table reads are forbidden or separately inventoried", () => {
  const files = analyzeRuntime();
  const findings = files.flatMap(({ relativePath, analysis }) =>
    rawFindings(relativePath, analysis),
  );
  assert.deepEqual(
    findings,
    [],
    `Current raw inventory:\n${JSON.stringify(
      Object.fromEntries(
        files
          .filter(({ analysis }) => analysis.rawReferences.length > 0)
          .map(({ relativePath, analysis }) => [
            relativePath,
            analysis.rawReferences.map((entry) => ({
              digest: entry.digest,
              fileDigest: entry.fileDigest,
              form: entry.form,
              functionName: entry.functionName,
              kinds: entry.kinds,
              line: entry.line,
              scopeDigest: entry.scopeDigest,
            })),
          ]),
      ),
      null,
      2,
    )}`,
  );
});

function fixtureFindings(source, inventory = new Map()) {
  const analysis = analyzeSource("fixture.ts", source);
  return [
    ...queryFindings("fixture.ts", analysis, inventory),
    ...rawFindings("fixture.ts", analysis, new Map()),
  ].join("\n");
}

function oneFixtureInventory(entry, analysis) {
  return new Map([
    [
      "fixture.ts",
      [
        {
          reason: "Fixture-specific trusted source.",
          scopeDigest: analysis.operations[0]?.scopeDigest,
          key: entry.key,
          ...entry,
        },
      ],
    ],
  ]);
}

test("the gate rejects attacker-derived tenant ids and aliases", () => {
  const directBody = analyzeSource(
    "fixture.ts",
    `
      import { organizationSettingsTable } from "@workspace/db";
      db.select().from(organizationSettingsTable)
        .where(eq(organizationSettingsTable.tenantId, req.body.tenantId));
    `,
  );
  const directEntry = indexedEntries(directBody.operations)[0];
  const directInventory = oneFixtureInventory(
    {
      binding: "tenantId=tenantId",
      key: directEntry.inventoryKey,
      mode: "trusted-binding",
    },
    directBody,
  );
  assert.match(
    [
      ...queryFindings("fixture.ts", directBody, directInventory),
      ...rawFindings("fixture.ts", directBody, new Map()),
    ].join("\n"),
    /expected top-level trusted binding tenantId=tenantId/u,
  );

  const aliasedBody = analyzeSource(
    "fixture.ts",
    `
      import { organizationSettingsTable as settings } from "@workspace/db";
      const tenantId = req.body.tenantId;
      db.select().from(settings).where(eq(settings.tenantId, tenantId));
    `,
  );
  const aliasedEntry = indexedEntries(aliasedBody.operations)[0];
  const aliasedInventory = oneFixtureInventory(
    {
      binding: "tenantId=identity.tenantId",
      key: aliasedEntry.inventoryKey,
      mode: "trusted-binding",
    },
    aliasedBody,
  );
  assert.match(
    queryFindings("fixture.ts", aliasedBody, aliasedInventory).join("\n"),
    /expected top-level trusted binding tenantId=identity\.tenantId/u,
  );
});

test("the gate never accepts a tenant predicate below OR or NOT", () => {
  for (const predicate of [
    "or(sql`true`, eq(settings.tenantId, tenantId))",
    "not(eq(settings.tenantId, tenantId))",
  ]) {
    const analysis = analyzeSource(
      "fixture.ts",
      `
        import { organizationSettingsTable as settings } from "@workspace/db";
        db.select().from(settings).where(${predicate});
      `,
    );
    const entry = indexedEntries(analysis.operations)[0];
    const inventory = oneFixtureInventory(
      {
        binding: "tenantId=tenantId",
        key: entry.inventoryKey,
        mode: "trusted-binding",
      },
      analysis,
    );
    assert.match(
      queryFindings("fixture.ts", analysis, inventory).join("\n"),
      /found none/u,
    );
  }
});

test("the gate resolves namespace and Drizzle aliases for tenant_domains", () => {
  const analysis = analyzeSource(
    "fixture.ts",
    `
      import * as schema from "@workspace/db";
      import { alias } from "drizzle-orm/pg-core";
      const domains = alias(schema.tenantDomainsTable, "domains");
      db.select().from(domains).where(eq(domains.tenantId, req.body.tenantId));
    `,
  );
  const entry = indexedEntries(analysis.operations)[0];
  assert.equal(entry.kind, "tenant_domains");
  const inventory = oneFixtureInventory(
    {
      binding: "tenantId=identity.tenantId",
      key: entry.inventoryKey,
      mode: "trusted-binding",
    },
    analysis,
  );
  assert.match(
    queryFindings("fixture.ts", analysis, inventory).join("\n"),
    /expected top-level trusted binding tenantId=identity\.tenantId/u,
  );
});

test("raw tenant_domains and dynamic table identifiers fail closed", () => {
  const raw = fixtureFindings(`
    await db.execute(sql\`select * from tenant_domains\`);
  `);
  assert.match(raw, /unreviewed raw tenant_domains read/u);

  const interpolated = fixtureFindings(`
    import { tenantDomainsTable } from "@workspace/db";
    await db.execute(sql\`select * from \${tenantDomainsTable}\`);
  `);
  assert.match(interpolated, /unreviewed raw tenant_domains read/u);

  const dynamic = fixtureFindings(`
    const tableName = req.body.table;
    await db.execute(sql.raw(tableName));
  `);
  assert.match(dynamic, /dynamic raw SQL identifier is forbidden/u);

  const aliasedString = fixtureFindings(`
    const tableName = "tenant_domains";
    await supabase.from(tableName).select("*");
  `);
  assert.match(aliasedString, /direct string access to tenant_domains/u);

  for (const hiddenRead of [
    `
      import { organizationSettingsTable } from "@workspace/db";
      const tables = { settings: organizationSettingsTable };
      await db.select().from(tables.settings);
    `,
    `
      import { organizationSettingsTable } from "@workspace/db";
      const tableForRead = () => organizationSettingsTable;
      await db.select().from(tableForRead());
    `,
    `
      import { tenantDomainsTable } from "@workspace/db";
      let selectedTable;
      selectedTable = tenantDomainsTable;
      await db.select().from(selectedTable);
    `,
    `
      import * as schema from "@workspace/db";
      const schemaForRead = () => schema;
      await db.select().from(schemaForRead().organizationSettingsTable);
    `,
    `
      import * as schema from "@workspace/db";
      const schemaForRead = () => schema;
      await db.select().from(schemaForRead()[req.body.table]);
    `,
    `
      const { tenantDomainsTable: domains } = loadSchema();
      await db.select().from(domains);
    `,
  ]) {
    assert.match(
      fixtureFindings(hiddenRead),
      /dynamic or unreviewed (organization_settings|tenant_domains|sensitive_schema_namespace) table use/u,
    );
  }
});

test("a reviewed top-level binding remains a legitimate control", () => {
  const analysis = analyzeSource(
    "fixture.ts",
    `
      import { organizationSettingsTable as settings } from "@workspace/db";
      db.select().from(settings)
        .where(and(eq(settings.tenantId, identity.tenantId), eq(settings.smtpEnabled, true)));
    `,
  );
  const entry = indexedEntries(analysis.operations)[0];
  const inventory = oneFixtureInventory(
    {
      binding: "tenantId=identity.tenantId",
      key: entry.inventoryKey,
      mode: "trusted-binding",
    },
    analysis,
  );
  assert.deepEqual(queryFindings("fixture.ts", analysis, inventory), []);
});
