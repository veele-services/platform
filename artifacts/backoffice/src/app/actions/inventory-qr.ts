"use server";

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { getCurrentBackofficeUser, requireCurrentTenantId } from "@/lib/auth/tenant";

export type InventoryQrLabel = {
  id: string;
  code: string;
  name: string;
  status: string;
  qrToken: string;
  qrGeneratedAt: string | null;
  archivedAt: string | null;
};

export type InventoryQrActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; message: string };

type SqlResult<T> = { rows?: T[] };

function rowsFrom<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const maybeRows = (result as SqlResult<T>).rows;
    return Array.isArray(maybeRows) ? maybeRows : [];
  }
  return [];
}

function makeQrToken(): string {
  return `inv_${randomUUID().replace(/-/g, "")}`;
}

async function requireQrRotationPermission(): Promise<void> {
  if (await hasPermission("inventory", "generate_qr")) return;
  if (await hasPermission("inventory", "update")) return;
  if (await hasPermission("inventory", "manage")) return;
  throw new Error("Forbidden: inventory:generate_qr");
}

async function requireActorId(): Promise<string> {
  const user = await getCurrentBackofficeUser();
  if (!user) throw new Error("Geen ingelogde gebruiker gevonden.");
  return user.id;
}

async function writeTenantAuditLog(input: {
  tenantId: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string | null;
  metadata?: unknown;
}) {
  await db.execute(sql`
    INSERT INTO audit_log (tenant_id, user_id, action, resource, resource_id, metadata)
    VALUES (
      ${input.tenantId}::uuid,
      ${input.userId}::uuid,
      ${input.action},
      ${input.resource},
      ${input.resourceId ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
  `);
}

export async function getInventoryQrLabel(itemId: string): Promise<InventoryQrLabel | null> {
  await requirePermission("inventory", "view");
  const tenantId = await requireCurrentTenantId();

  const [item] = rowsFrom<InventoryQrLabel>(await db.execute(sql`
    SELECT id,
           code,
           name,
           status,
           qr_token AS "qrToken",
           qr_generated_at::text AS "qrGeneratedAt",
           archived_at::text AS "archivedAt"
    FROM inventory_items
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ${itemId}::uuid
    LIMIT 1
  `));

  return item ?? null;
}

export async function rotateInventoryQrToken(itemId: string): Promise<InventoryQrActionResult<{ qrToken: string }>> {
  try {
    await requireQrRotationPermission();
    const tenantId = await requireCurrentTenantId();
    const userId = await requireActorId();
    const qrToken = makeQrToken();

    const [updated] = rowsFrom<{ id: string; code: string; name: string; qrToken: string }>(await db.execute(sql`
      UPDATE inventory_items
      SET qr_token = ${qrToken},
          qr_generated_at = now(),
          updated_at = now()
      WHERE tenant_id = ${tenantId}::uuid
        AND id = ${itemId}::uuid
        AND archived_at IS NULL
      RETURNING id, code, name, qr_token AS "qrToken"
    `));

    if (!updated) return { success: false, message: "Inventarisitem niet gevonden of gearchiveerd." };

    await writeTenantAuditLog({
      tenantId,
      userId,
      action: "inventory_qr_token_rotated",
      resource: "inventory_items",
      resourceId: updated.id,
      metadata: {
        code: updated.code,
        name: updated.name,
        tokenPrefix: updated.qrToken.slice(0, 8),
        tokenLength: updated.qrToken.length,
      },
    });

    revalidatePath("/inventory");
    revalidatePath(`/inventory/${itemId}`);
    revalidatePath(`/inventory/${itemId}/qr`);

    return { success: true, data: { qrToken: updated.qrToken } };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
}
