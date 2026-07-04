import { headers } from "next/headers";
import {
  db,
  isFieldgridSubdomain,
  isPlatformHost,
  normalizeHost,
  requireTenantModule,
  TENANT_RUNTIME_ACTIVE_STATUSES,
  tenantDomainsTable,
  tenantsTable,
  type FieldgridModuleKey,
} from "@workspace/db";
import { and, eq, inArray, ne } from "drizzle-orm";

type PortalHostTenantResolution =
  | { kind: "tenant"; tenantId: string }
  | { kind: "platform" }
  | { kind: "blocked" }
  | { kind: "none" };

function firstForwardedValue(value: string | null): string {
  return (value ?? "").split(",")[0]?.trim() ?? "";
}

async function requestHost(): Promise<string> {
  const requestHeaders = await headers();
  return firstForwardedValue(requestHeaders.get("x-forwarded-host")) || requestHeaders.get("host") || "";
}

export async function resolvePortalTenantFromHost(): Promise<PortalHostTenantResolution> {
  const normalizedHost = normalizeHost(await requestHost());
  if (!normalizedHost) return { kind: "none" };
  if (isPlatformHost(normalizedHost)) return { kind: "platform" };

  const [tenant] = await db
    .select({ tenantId: tenantsTable.id })
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

  if (tenant) return { kind: "tenant", tenantId: tenant.tenantId };
  if (isFieldgridSubdomain(normalizedHost)) return { kind: "blocked" };
  return { kind: "none" };
}

export async function getCurrentPortalTenantId(): Promise<string | null> {
  const resolution = await resolvePortalTenantFromHost();
  return resolution.kind === "tenant" ? resolution.tenantId : null;
}

export async function requireCurrentPortalModule(moduleKey: FieldgridModuleKey): Promise<string | null> {
  const tenantId = await getCurrentPortalTenantId();
  if (!tenantId) return null;

  try {
    await requireTenantModule(tenantId, moduleKey);
    return tenantId;
  } catch {
    return null;
  }
}

export async function requireCurrentCustomerPortalTenantId(): Promise<string | null> {
  return requireCurrentPortalModule("customer_portal");
}
