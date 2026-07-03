"use server";

import { db, isTenantModuleEnabled } from "@workspace/db";
import { personnelTable } from "@workspace/db";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";

export type InventoryScanStatus = "allowed" | "login_required" | "not_found" | "denied";

export type InventoryScanItem = {
  id: string;
  code: string;
  name: string;
  status: string;
  type: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  currentLocationName: string | null;
  currentObjectName: string | null;
  currentPersonnelName: string | null;
  nextInspectionDate: string | null;
  relatedAssignmentId: string | null;
  relatedAssignmentCode: string | null;
};

export type InventoryScanResult =
  | { status: "allowed"; item: InventoryScanItem }
  | { status: "login_required" }
  | { status: "not_found"; message: string }
  | { status: "denied"; message: string };

export type InventoryCodeResolveResult =
  | { status: "allowed"; qrToken: string }
  | { status: "login_required" }
  | { status: "not_found"; message: string }
  | { status: "denied"; message: string };

type PersonnelBasic = { userId: string; personnelId: string; tenantId: string };
type SqlResult<T> = { rows?: T[] };

function rowsFrom<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const maybeRows = (result as SqlResult<T>).rows;
    return Array.isArray(maybeRows) ? maybeRows : [];
  }
  return [];
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeInventoryCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

async function getAuthAndPersonnel(): Promise<PersonnelBasic | "login_required" | "denied"> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "login_required";

  const [row] = await db
    .select({ id: personnelTable.id, tenantId: personnelTable.tenantId })
    .from(personnelTable)
    .where(and(eq(personnelTable.userId, user.id), eq(personnelTable.isActive, true)))
    .limit(1);

  if (!row) return "denied";
  if (!(await isTenantModuleEnabled(row.tenantId, "personnel_portal"))) return "denied";
  if (!(await isTenantModuleEnabled(row.tenantId, "inventory"))) return "denied";

  return { userId: user.id, personnelId: row.id, tenantId: row.tenantId };
}

async function writeScanAuditLog(input: {
  tenantId: string;
  userId: string;
  action: string;
  resourceId?: string | null;
  metadata?: unknown;
}) {
  await db.execute(sql`
    INSERT INTO audit_log (tenant_id, user_id, action, resource, resource_id, metadata)
    VALUES (
      ${input.tenantId}::uuid,
      ${input.userId}::uuid,
      ${input.action},
      'inventory_items',
      ${input.resourceId ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
  `);
}

async function getRelatedAssignment(
  tenantId: string,
  personnelId: string,
  itemId: string,
  objectId: string | null,
): Promise<{ id: string; code: string } | null> {
  const [row] = rowsFrom<{ id: string; code: string }>(await db.execute(sql`
    SELECT a.id,
           a.code
    FROM assignment_personnel ap
    JOIN assignments a ON a.id = ap.assignment_id AND a.tenant_id = ${tenantId}::uuid
    LEFT JOIN assignment_inventory_items link
      ON link.tenant_id = a.tenant_id
     AND link.assignment_id = a.id
     AND link.inventory_item_id = ${itemId}::uuid
    WHERE ap.personnel_id = ${personnelId}::uuid
      AND ap.status = 'assigned'
      AND (
        (${objectId}::uuid IS NOT NULL AND a.object_id = ${objectId}::uuid)
        OR link.id IS NOT NULL
      )
    ORDER BY a.scheduled_date DESC NULLS LAST, a.created_at DESC
    LIMIT 1
  `));

  return row ?? null;
}

async function isScanAllowedForPersonnel(input: {
  tenantId: string;
  personnelId: string;
  itemId: string;
  currentPersonnelId: string | null;
  currentObjectId: string | null;
}): Promise<{ allowed: boolean; relatedAssignment: { id: string; code: string } | null }> {
  if (input.currentPersonnelId === input.personnelId) {
    return { allowed: true, relatedAssignment: null };
  }

  const relatedAssignment = await getRelatedAssignment(
    input.tenantId,
    input.personnelId,
    input.itemId,
    input.currentObjectId,
  );

  return { allowed: Boolean(relatedAssignment), relatedAssignment };
}

async function getInventoryByWhere(
  tenantId: string,
  whereClause: SQL,
): Promise<(InventoryScanItem & { qrToken: string; currentPersonnelId: string | null; currentObjectId: string | null }) | null> {
  const [item] = rowsFrom<InventoryScanItem & { qrToken: string; currentPersonnelId: string | null; currentObjectId: string | null }>(await db.execute(sql`
    SELECT item.id,
           item.code,
           item.name,
           item.status,
           item.type,
           item.brand,
           item.model,
           item.serial_number AS "serialNumber",
           item.qr_token AS "qrToken",
           item.current_personnel_id::text AS "currentPersonnelId",
           item.current_object_id::text AS "currentObjectId",
           stock_locations.name AS "currentLocationName",
           objects.name AS "currentObjectName",
           trim(concat(personnel.first_name, ' ', personnel.last_name)) AS "currentPersonnelName",
           item.next_inspection_date::text AS "nextInspectionDate",
           NULL::text AS "relatedAssignmentId",
           NULL::text AS "relatedAssignmentCode"
    FROM inventory_items item
    LEFT JOIN stock_locations ON stock_locations.id = item.current_stock_location_id AND stock_locations.tenant_id = item.tenant_id
    LEFT JOIN objects ON objects.id = item.current_object_id AND objects.tenant_id = item.tenant_id
    LEFT JOIN personnel ON personnel.id = item.current_personnel_id AND personnel.tenant_id = item.tenant_id
    WHERE item.tenant_id = ${tenantId}::uuid
      AND item.is_active = true
      AND item.archived_at IS NULL
      AND ${whereClause}
    LIMIT 1
  `));

  return item ?? null;
}

export async function getInventoryScanResult(token: string): Promise<InventoryScanResult> {
  const qrToken = cleanText(token);
  if (!qrToken) return { status: "not_found", message: "Inventarisitem niet gevonden." };

  const auth = await getAuthAndPersonnel();
  if (auth === "login_required") return { status: "login_required" };
  if (auth === "denied") return { status: "denied", message: "Je hebt geen toegang tot inventarisscans." };

  const item = await getInventoryByWhere(auth.tenantId, sql`item.qr_token = ${qrToken}`);
  if (!item) {
    await writeScanAuditLog({
      tenantId: auth.tenantId,
      userId: auth.userId,
      action: "inventory_item_scan_not_found",
      metadata: { tokenPrefix: qrToken.slice(0, 8), tokenLength: qrToken.length },
    });
    return { status: "not_found", message: "Inventarisitem niet gevonden." };
  }

  const access = await isScanAllowedForPersonnel({
    tenantId: auth.tenantId,
    personnelId: auth.personnelId,
    itemId: item.id,
    currentPersonnelId: item.currentPersonnelId,
    currentObjectId: item.currentObjectId,
  });

  if (!access.allowed) {
    await writeScanAuditLog({
      tenantId: auth.tenantId,
      userId: auth.userId,
      action: "inventory_item_scan_denied",
      resourceId: item.id,
      metadata: { code: item.code, reason: "no_personnel_or_assignment_scope" },
    });
    return { status: "denied", message: "Je hebt geen toegang tot dit inventarisitem." };
  }

  await writeScanAuditLog({
    tenantId: auth.tenantId,
    userId: auth.userId,
    action: "inventory_item_scanned",
    resourceId: item.id,
    metadata: {
      code: item.code,
      via: "qr_token",
      relatedAssignmentId: access.relatedAssignment?.id ?? null,
    },
  });

  return {
    status: "allowed",
    item: {
      id: item.id,
      code: item.code,
      name: item.name,
      status: item.status,
      type: item.type,
      brand: item.brand,
      model: item.model,
      serialNumber: item.serialNumber,
      currentLocationName: item.currentLocationName,
      currentObjectName: item.currentObjectName,
      currentPersonnelName: item.currentPersonnelName,
      nextInspectionDate: item.nextInspectionDate,
      relatedAssignmentId: access.relatedAssignment?.id ?? null,
      relatedAssignmentCode: access.relatedAssignment?.code ?? null,
    },
  };
}

export async function resolveInventoryScanCode(code: string): Promise<InventoryCodeResolveResult> {
  const normalizedCode = normalizeInventoryCode(code);
  if (!normalizedCode) return { status: "not_found", message: "Vul een inventariscode in." };

  const auth = await getAuthAndPersonnel();
  if (auth === "login_required") return { status: "login_required" };
  if (auth === "denied") return { status: "denied", message: "Je hebt geen toegang tot inventarisscans." };

  const item = await getInventoryByWhere(auth.tenantId, sql`upper(item.code) = ${normalizedCode}`);
  if (!item) return { status: "not_found", message: "Inventariscode niet gevonden." };

  const access = await isScanAllowedForPersonnel({
    tenantId: auth.tenantId,
    personnelId: auth.personnelId,
    itemId: item.id,
    currentPersonnelId: item.currentPersonnelId,
    currentObjectId: item.currentObjectId,
  });

  if (!access.allowed) {
    await writeScanAuditLog({
      tenantId: auth.tenantId,
      userId: auth.userId,
      action: "inventory_item_scan_denied",
      resourceId: item.id,
      metadata: { code: item.code, via: "manual_code", reason: "no_personnel_or_assignment_scope" },
    });
    return { status: "denied", message: "Je hebt geen toegang tot dit inventarisitem." };
  }

  return { status: "allowed", qrToken: item.qrToken };
}
