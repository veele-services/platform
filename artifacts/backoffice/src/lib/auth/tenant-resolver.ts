import {
  db,
  isFieldgridHostAllowedForRuntimeEnvironment,
  isFieldgridSubdomain as sharedIsFieldgridSubdomain,
  isTenantDomainAllowedForRuntimeEnvironment,
  isPlatformHost as sharedIsPlatformHost,
  normalizeHost as sharedNormalizeHost,
  TENANT_RUNTIME_ACTIVE_STATUSES,
  tenantDomainsTable,
  tenantsTable,
  type ResolvedTenantContext,
} from "@workspace/db";
import { and, eq, inArray, ne } from "drizzle-orm";

export const normalizeHost = sharedNormalizeHost;
export const isPlatformHost = sharedIsPlatformHost;
export const isFieldgridSubdomain = sharedIsFieldgridSubdomain;

export type ResolvedTenant = ResolvedTenantContext;

export async function resolveTenantByHost(
  host: string,
): Promise<ResolvedTenant | null> {
  const normalizedHost = normalizeHost(host);
  if (
    !normalizedHost ||
    !isFieldgridHostAllowedForRuntimeEnvironment(normalizedHost)
  ) {
    return null;
  }
  if (isPlatformHost(normalizedHost)) return null;
  if (
    !isTenantDomainAllowedForRuntimeEnvironment(normalizedHost)
  ) {
    return null;
  }

  const [tenant] = await db
    .select({
      id: tenantsTable.id,
      slug: tenantsTable.slug,
      name: tenantsTable.name,
      isActive: tenantsTable.isActive,
      status: tenantsTable.status,
      planKey: tenantsTable.planKey,
      domainType: tenantDomainsTable.type,
      tlsStatus: tenantDomainsTable.tlsStatus,
    })
    .from(tenantDomainsTable)
    .innerJoin(tenantsTable, eq(tenantDomainsTable.tenantId, tenantsTable.id))
    .where(
      and(
        eq(tenantDomainsTable.domain, normalizedHost),
        inArray(tenantDomainsTable.verificationStatus, ["verified", "active"]),
        ne(tenantDomainsTable.type, "platform_reserved"),
        eq(tenantsTable.isActive, true),
        inArray(tenantsTable.status, [...TENANT_RUNTIME_ACTIVE_STATUSES]),
      ),
    )
    .limit(1);

  if (tenant?.domainType === "custom_domain" && tenant.tlsStatus !== "active") {
    return null;
  }
  return tenant ?? null;
}

export async function requireTenantByHost(
  host: string,
): Promise<ResolvedTenant> {
  const tenant = await resolveTenantByHost(host);
  if (!tenant) {
    throw new Error("Geen actieve tenant gevonden voor deze host.");
  }
  return tenant;
}
