import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import {
  db,
  isFieldgridSubdomain,
  isPlatformHost,
  normalizeHost,
  personnelTable,
  requireTenantModule,
  TENANT_RUNTIME_ACTIVE_STATUSES,
  tenantDomainsTable,
  tenantsTable,
  type FieldgridModuleKey,
} from "@workspace/db";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";

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

function singleTenantId(rows: { tenantId: string }[]): string | null {
  const tenantIds = [...new Set(rows.map((row) => row.tenantId).filter(Boolean))];
  return tenantIds.length === 1 ? tenantIds[0] : null;
}

async function resolveAuthenticatedPersonnelTenantId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const byUserId = await db
      .select({ tenantId: personnelTable.tenantId })
      .from(personnelTable)
      .innerJoin(tenantsTable, eq(personnelTable.tenantId, tenantsTable.id))
      .where(
        and(
          eq(personnelTable.userId, user.id),
          eq(personnelTable.isActive, true),
          eq(tenantsTable.isActive, true),
          inArray(tenantsTable.status, [...TENANT_RUNTIME_ACTIVE_STATUSES]),
        ),
      )
      .limit(2);

    const tenantIdByUserId = singleTenantId(byUserId);
    if (tenantIdByUserId) return tenantIdByUserId;

    const email = user.email?.trim().toLowerCase();
    if (!email) return null;

    const byEmail = await db
      .select({ tenantId: personnelTable.tenantId })
      .from(personnelTable)
      .innerJoin(tenantsTable, eq(personnelTable.tenantId, tenantsTable.id))
      .where(
        and(
          sql`lower(${personnelTable.email}) = ${email}`,
          isNull(personnelTable.userId),
          eq(personnelTable.isActive, true),
          eq(tenantsTable.isActive, true),
          inArray(tenantsTable.status, [...TENANT_RUNTIME_ACTIVE_STATUSES]),
        ),
      )
      .limit(2);

    return singleTenantId(byEmail);
  } catch {
    return null;
  }
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
  if (resolution.kind === "tenant") return resolution.tenantId;
  if (resolution.kind === "platform" || resolution.kind === "none") {
    return resolveAuthenticatedPersonnelTenantId();
  }
  return null;
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

export async function requireCurrentPersonnelPortalTenantId(): Promise<string | null> {
  return requireCurrentPortalModule("personnel_portal");
}
