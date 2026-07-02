"use server";

import { db } from "@workspace/db";
import { tenantsTable } from "@workspace/db";
import { asc, sql } from "drizzle-orm";
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

  return db
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
      primaryDomain: sql<string | null>`(
        SELECT td.domain
        FROM tenant_domains td
        WHERE td.tenant_id = ${tenantsTable.id}
          AND td.type <> 'platform_reserved'
          AND td.verification_status = 'verified'
        ORDER BY td.is_primary DESC, td.created_at ASC
        LIMIT 1
      )`,
    })
    .from(tenantsTable)
    .orderBy(asc(tenantsTable.name));
}
