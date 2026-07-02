"use server";

import { db } from "@workspace/db";
import { tenantDomainsTable, tenantsTable, tenantUsersTable } from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";
import { requirePlatformAdmin } from "@/lib/auth/platform";

export type PlatformTenantRow = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  userCount: number;
  primaryDomain: string | null;
};

export async function listPlatformTenants(): Promise<PlatformTenantRow[]> {
  await requirePlatformAdmin();

  const rows = await db
    .select({
      id: tenantsTable.id,
      slug: tenantsTable.slug,
      name: tenantsTable.name,
      isActive: tenantsTable.isActive,
      userCount: sql<number>`(
        SELECT COUNT(*)
        FROM tenant_users tu
        WHERE tu.tenant_id = ${tenantsTable.id}
          AND tu.status = 'active'
      )::int`,
      primaryDomain: tenantDomainsTable.domain,
    })
    .from(tenantsTable)
    .leftJoin(tenantDomainsTable, eq(tenantDomainsTable.tenantId, tenantsTable.id))
    .orderBy(asc(tenantsTable.name));

  const byTenant = new Map<string, PlatformTenantRow>();
  for (const row of rows) {
    const existing = byTenant.get(row.id);
    if (!existing) {
      byTenant.set(row.id, {
        id: row.id,
        slug: row.slug,
        name: row.name,
        isActive: row.isActive,
        userCount: row.userCount,
        primaryDomain: row.primaryDomain,
      });
      continue;
    }

    if (!existing.primaryDomain && row.primaryDomain) {
      existing.primaryDomain = row.primaryDomain;
    }
  }

  return [...byTenant.values()];
}
