import { and, eq, inArray } from "drizzle-orm";
import { db } from "./index";
import { getTenantPlanSnapshot } from "./tenant-entitlements";
import {
  planLimitsTable,
  tenantDomainsTable,
  tenantsTable,
} from "./schema";
import {
  isPlatformHost,
  isTenantRuntimeActive,
  normalizeHost,
} from "./tenant-context";

export const ROUTABLE_TENANT_DOMAIN_STATUSES = ["verified", "active"] as const;
export const CUSTOM_DOMAIN_TYPE = "custom_domain";
export const FIELDGRID_SUBDOMAIN_TYPE = "fieldgrid_subdomain";

const CUSTOM_DOMAIN_PLAN_KEYS = new Set<string>(["enterprise"]);

export function customDomainTxtName(domain: string): string {
  return `_fieldgrid-verification.${normalizeHost(domain)}`;
}

export function customDomainVerificationValue(token: string): string {
  return `fieldgrid-site-verification=${token}`;
}

export async function canTenantUseCustomDomains(tenantId: string): Promise<boolean> {
  const snapshot = await getTenantPlanSnapshot(tenantId);
  if (CUSTOM_DOMAIN_PLAN_KEYS.has(snapshot.plan)) return true;
  if (!snapshot.planId) return false;

  const [limit] = await db
    .select({ isEnabled: planLimitsTable.isEnabled })
    .from(planLimitsTable)
    .where(and(eq(planLimitsTable.planId, snapshot.planId), eq(planLimitsTable.key, "custom_domains")))
    .limit(1);

  return limit?.isEnabled ?? false;
}

export async function isCustomDomainAllowedForCaddy(host: string): Promise<boolean> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost || isPlatformHost(normalizedHost)) return false;

  const [row] = await db
    .select({
      tenantId: tenantsTable.id,
      isActive: tenantsTable.isActive,
      status: tenantsTable.status,
      verificationStatus: tenantDomainsTable.verificationStatus,
      disabledAt: tenantDomainsTable.disabledAt,
    })
    .from(tenantDomainsTable)
    .innerJoin(tenantsTable, eq(tenantDomainsTable.tenantId, tenantsTable.id))
    .where(
      and(
        eq(tenantDomainsTable.domain, normalizedHost),
        eq(tenantDomainsTable.type, CUSTOM_DOMAIN_TYPE),
        inArray(tenantDomainsTable.verificationStatus, [...ROUTABLE_TENANT_DOMAIN_STATUSES]),
      ),
    )
    .limit(1);

  if (!row || row.disabledAt || !isTenantRuntimeActive(row)) return false;
  return canTenantUseCustomDomains(row.tenantId);
}
