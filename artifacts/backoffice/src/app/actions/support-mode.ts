"use server";

import { db } from "@workspace/db";
import { supportAccessGrantsTable, tenantsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requirePlatformSupportUser } from "@/lib/auth/platform";
import type { SupportAccessGrantRow } from "./platform";

function supportGrantStatus(input: {
  startsAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
}): SupportAccessGrantRow["status"] {
  const now = new Date();
  if (input.revokedAt) return "revoked";
  if (input.startsAt > now) return "scheduled";
  if (input.expiresAt <= now) return "expired";
  return "active";
}

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

  return rows.map((row) => {
    const status = supportGrantStatus(row);
    return {
      id: row.id,
      tenantId: row.tenantId,
      tenantName: row.tenantName,
      platformUserId: row.platformUserId,
      reason: row.reason,
      scope: "tenant",
      startsAt: row.startsAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      status,
      isActive: status === "active",
      ttlMinutes: Math.max(0, Math.ceil((row.expiresAt.getTime() - row.startsAt.getTime()) / 60000)),
    };
  });
}
