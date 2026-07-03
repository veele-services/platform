"use server";

import { db } from "@workspace/db";
import { supportAccessGrantsTable, tenantsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requirePlatformSupportUser } from "@/lib/auth/platform";
import type { SupportAccessGrantRow } from "./platform";

export async function listCurrentSupportAccessGrants(): Promise<SupportAccessGrantRow[]> {
  const platformUser = await requirePlatformSupportUser();

  const rows = await db
    .select({
      id: supportAccessGrantsTable.id,
      tenantId: supportAccessGrantsTable.tenantId,
      tenantName: tenantsTable.name,
      platformUserId: supportAccessGrantsTable.platformUserId,
      reason: supportAccessGrantsTable.reason,
      startsAt: supportAccessGrantsTable.startsAt,
      expiresAt: supportAccessGrantsTable.expiresAt,
      revokedAt: supportAccessGrantsTable.revokedAt,
      createdAt: supportAccessGrantsTable.createdAt,
    })
    .from(supportAccessGrantsTable)
    .innerJoin(tenantsTable, eq(supportAccessGrantsTable.tenantId, tenantsTable.id))
    .where(eq(supportAccessGrantsTable.platformUserId, platformUser.id))
    .orderBy(desc(supportAccessGrantsTable.createdAt))
    .limit(100);

  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    platformUserId: row.platformUserId,
    reason: row.reason,
    startsAt: row.startsAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}
