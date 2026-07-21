"use server";

import { beginOfflineOperation, completeOfflineOperation, db, isTenantModuleEnabled } from "@workspace/db";
import { randomUUID } from "node:crypto";
import {
  assignmentPersonnelTable,
  assignmentsTable,
  personnelTable,
} from "@workspace/db";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { OfflineActionResult } from "@/lib/offline/offline-action-contract";
import {
  normalizeOfflineServerActionError,
  permanentOfflineActionFailure,
} from "@/lib/offline/offline-action-errors.server";
import {
  personnelWorkOrderIsSigned,
  SIGNED_WORK_ORDER_LOCK_MESSAGE,
} from "@/lib/work-order-lock";

export type InventoryUsageType = "used" | "rented" | "issued" | "returned" | "defect_found";

export type InventoryCatalogOption = {
  id: string;
  code: string;
  name: string;
  status: string;
  currentLocationName: string | null;
};

export type InventoryUsageItem = {
  id: string;
  inventoryItemId: string;
  inventoryCode: string;
  name: string;
  usageType: InventoryUsageType | string;
  quantity: number;
  periodLabel?: string | null;
  notes?: string | null;
  approvalStatus: string;
};

export type InventoryUsageInput = {
  inventoryItemId: string;
  usageType?: string | null;
  quantity?: string | number | null;
  periodLabel?: string | null;
  notes?: string | null;
  expectedParticipantVersion?: number | null;
  clientMutationId?: string | null;
};

type PersonnelBasic = { userId: string; personnelId: string; tenantId: string };
type AssignmentAccess = {
  status: string;
  objectId: string | null;
  customerSignedAt: Date | null;
  customerSignatureDataUrl: string | null;
};
type DbExecutor = { execute: (query: SQL) => Promise<unknown> };
type SqlResult<T> = { rows?: T[] };

const LOCKED_STATUSES = new Set([
  "report_submitted",
  "report_approved",
  "invoice_ready",
  "invoiced",
  "paid",
  "closed",
]);

const USAGE_TYPES = new Set(["used", "rented", "issued", "returned", "defect_found"]);

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

function parsePositiveDecimal(value: string | number | null | undefined, fallback: number): string {
  if (value === null || value === undefined || value === "") return fallback.toFixed(3);
  const parsed = typeof value === "number"
    ? value
    : Number.parseFloat(String(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback.toFixed(3);
  return parsed.toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function toNumber(value: string | null): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeUsageType(value: unknown): InventoryUsageType {
  const raw = cleanText(value);
  return USAGE_TYPES.has(raw ?? "") ? raw as InventoryUsageType : "used";
}

async function getAuthAndPersonnel(): Promise<PersonnelBasic | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select({ id: personnelTable.id, tenantId: personnelTable.tenantId })
    .from(personnelTable)
    .where(and(eq(personnelTable.userId, user.id), eq(personnelTable.isActive, true)))
    .limit(1);

  if (!row) return null;
  if (!(await isTenantModuleEnabled(row.tenantId, "personnel_portal"))) return null;
  if (!(await isTenantModuleEnabled(row.tenantId, "inventory"))) return null;

  return { userId: user.id, personnelId: row.id, tenantId: row.tenantId };
}

async function getLinkedAssignmentAccess(
  personnelId: string,
  tenantId: string,
  assignmentId: string,
): Promise<AssignmentAccess | null> {
  const [row] = await db
    .select({
      status: assignmentsTable.status,
      objectId: assignmentsTable.objectId,
      customerSignedAt: assignmentsTable.customerSignedAt,
      customerSignatureDataUrl: assignmentsTable.customerSignatureDataUrl,
    })
    .from(assignmentPersonnelTable)
    .innerJoin(assignmentsTable, eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id))
    .where(
      and(
        eq(assignmentPersonnelTable.personnelId, personnelId),
        eq(assignmentPersonnelTable.assignmentId, assignmentId),
        eq(assignmentPersonnelTable.status, "assigned"),
        eq(assignmentsTable.tenantId, tenantId),
      ),
    )
    .limit(1);

  return row ?? null;
}

async function assertLinkedAndEditable(
  personnelId: string,
  tenantId: string,
  assignmentId: string,
): Promise<{ ok: true; assignment: AssignmentAccess } | { ok: false; error: string }> {
  const assignment = await getLinkedAssignmentAccess(personnelId, tenantId, assignmentId);
  if (!assignment) return { ok: false, error: "Niet gekoppeld aan deze opdracht" };
  if (personnelWorkOrderIsSigned(assignment)) {
    return { ok: false, error: SIGNED_WORK_ORDER_LOCK_MESSAGE };
  }
  if (LOCKED_STATUSES.has(assignment.status)) {
    return { ok: false, error: "Deze werkbon is afgesloten voor inventarisregistratie" };
  }
  return { ok: true, assignment };
}

function revalidateAssignmentPaths(assignmentId: string) {
  revalidatePath(`/opdrachten/${assignmentId}`);
  revalidatePath(`/opdrachten/${assignmentId}/inventaris`);
}

async function getInventoryForTenant(
  tx: DbExecutor,
  tenantId: string,
  inventoryItemId: string,
): Promise<{ id: string; code: string; name: string; status: string } | null> {
  const [item] = rowsFrom<{ id: string; code: string; name: string; status: string }>(await tx.execute(sql`
    SELECT id, code, name, status
    FROM inventory_items
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ${inventoryItemId}::uuid
      AND is_active = true
      AND archived_at IS NULL
    LIMIT 1
  `));
  return item ?? null;
}

export async function listInventoryCatalogForAssignment(
  assignmentId: string,
): Promise<InventoryCatalogOption[]> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return [];

  const assignment = await getLinkedAssignmentAccess(auth.personnelId, auth.tenantId, assignmentId);
  if (!assignment) return [];

  return rowsFrom<InventoryCatalogOption>(await db.execute(sql`
    SELECT item.id,
           item.code,
           item.name,
           item.status,
           stock_locations.name AS "currentLocationName"
    FROM inventory_items item
    LEFT JOIN stock_locations ON stock_locations.id = item.current_stock_location_id AND stock_locations.tenant_id = item.tenant_id
    WHERE item.tenant_id = ${auth.tenantId}::uuid
      AND item.is_active = true
      AND item.archived_at IS NULL
      AND (
        item.current_personnel_id = ${auth.personnelId}::uuid
        OR (${assignment.objectId}::uuid IS NOT NULL AND item.current_object_id = ${assignment.objectId}::uuid)
        OR item.status IN ('available', 'in_use', 'assigned_to_object', 'assigned_to_personnel')
      )
    ORDER BY item.code ASC
    LIMIT 300
  `));
}

export async function getInventoryUsageForAssignment(
  assignmentId: string,
): Promise<InventoryUsageItem[]> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return [];

  const assignment = await getLinkedAssignmentAccess(auth.personnelId, auth.tenantId, assignmentId);
  if (!assignment) return [];

  const rows = rowsFrom<{
    id: string;
    inventoryItemId: string;
    inventoryCode: string;
    name: string;
    usageType: string;
    quantity: string | null;
    periodLabel: string | null;
    notes: string | null;
    approvalStatus: string;
  }>(await db.execute(sql`
    SELECT link.id,
           link.inventory_item_id::text AS "inventoryItemId",
           item.code AS "inventoryCode",
           item.name,
           link.usage_type AS "usageType",
           COALESCE(link.registered_quantity, 1)::text AS quantity,
           link.registered_period_label AS "periodLabel",
           link.notes,
           link.approval_status AS "approvalStatus"
    FROM assignment_inventory_items link
    JOIN inventory_items item ON item.id = link.inventory_item_id AND item.tenant_id = link.tenant_id
    WHERE link.tenant_id = ${auth.tenantId}::uuid
      AND link.assignment_id = ${assignmentId}::uuid
    ORDER BY link.attached_at ASC
  `));

  return rows.map((row) => ({
    id: row.id,
    inventoryItemId: row.inventoryItemId,
    inventoryCode: row.inventoryCode,
    name: row.name,
    usageType: row.usageType,
    quantity: toNumber(row.quantity),
    periodLabel: row.periodLabel,
    notes: row.notes,
    approvalStatus: row.approvalStatus,
  }));
}

export async function addInventoryUsage(
  assignmentId: string,
  input: InventoryUsageInput,
): Promise<OfflineActionResult<{ id: string }>> {
  try {
    return await addInventoryUsageInternal(assignmentId, input);
  } catch (error) {
    return normalizeOfflineServerActionError(error, "Inventaris opslaan mislukt. Probeer het later opnieuw.");
  }
}

async function addInventoryUsageInternal(
  assignmentId: string,
  input: InventoryUsageInput,
): Promise<OfflineActionResult<{ id: string }>> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return permanentOfflineActionFailure("Inventarismodule niet beschikbaar of niet ingelogd", "authentication_required");

  const access = await assertLinkedAndEditable(auth.personnelId, auth.tenantId, assignmentId);
  if (!access.ok) return permanentOfflineActionFailure(access.error, "business_rule_rejected");

  const inventoryItemId = cleanText(input.inventoryItemId);
  if (!inventoryItemId) return permanentOfflineActionFailure("Kies een inventarisitem", "validation_failed");

  const usageType = normalizeUsageType(input.usageType);
  const quantity = parsePositiveDecimal(input.quantity, 1);
  const periodLabel = cleanText(input.periodLabel)?.slice(0, 80) ?? null;
  const notes = cleanText(input.notes);

  const [execution] = rowsFrom<{ version: number }>(await db.execute(sql`
    SELECT version FROM assignment_participant_executions
    WHERE tenant_id = ${auth.tenantId}::uuid AND assignment_id = ${assignmentId}::uuid
      AND personnel_id = ${auth.personnelId}::uuid AND participant_status <> 'removed'
    LIMIT 1
  `));
  if (!execution) return permanentOfflineActionFailure("Uitvoering niet gevonden", "execution_not_found");
  const expectedVersion = input.expectedParticipantVersion ?? Number(execution.version);
  const operationId = input.clientMutationId?.trim() || randomUUID();

  try {
    const row = await db.transaction(async (tx) => {
      const exec = tx as unknown as DbExecutor;
      const replay = await beginOfflineOperation<{ id: string; participantVersion?: number }>(exec, {
        tenantId: auth.tenantId, assignmentId, personnelId: auth.personnelId,
        actorUserId: auth.userId, operationId, operationType: "add-inventory-usage",
        expectedVersion,
        payload: { inventoryItemId, usageType, quantity, periodLabel, notes },
      });
      if (replay) return { ...replay, participantVersion: replay.participantVersion ?? expectedVersion };
      const item = await getInventoryForTenant(exec, auth.tenantId, inventoryItemId);
      if (!item) throw new Error("Inventarisitem niet gevonden");

      const [created] = rowsFrom<{ id: string }>(await exec.execute(sql`
        INSERT INTO assignment_inventory_items (
          tenant_id,
          assignment_id,
          inventory_item_id,
          usage_type,
          registered_quantity,
          registered_period_label,
          invoiceable,
          customer_visible,
          approval_status,
          attached_by,
          notes
        ) VALUES (
          ${auth.tenantId}::uuid,
          ${assignmentId}::uuid,
          ${inventoryItemId}::uuid,
          ${usageType},
          ${quantity}::numeric,
          ${periodLabel},
          false,
          false,
          'pending',
          ${auth.userId}::uuid,
          ${notes}
        )
        ON CONFLICT (tenant_id, assignment_id, inventory_item_id)
        DO UPDATE SET usage_type = EXCLUDED.usage_type,
                      registered_quantity = EXCLUDED.registered_quantity,
                      registered_period_label = EXCLUDED.registered_period_label,
                      invoiceable = false,
                      customer_visible = false,
                      approval_status = 'pending',
                      approval_reason = NULL,
                      approved_quantity = NULL,
                      approved_unit_price = NULL,
                      approved_vat_rate = NULL,
                      approved_by = NULL,
                      approved_at = NULL,
                      attached_by = EXCLUDED.attached_by,
                      attached_at = now(),
                      notes = EXCLUDED.notes
        RETURNING id
      `));
      if (!created) throw new Error("Inventaris opslaan mislukt");

      await exec.execute(sql`
        INSERT INTO inventory_movements (
          tenant_id,
          inventory_item_id,
          movement_type,
          assignment_id,
          reason,
          created_by,
          notes
        ) VALUES (
          ${auth.tenantId}::uuid,
          ${inventoryItemId}::uuid,
          'corrected',
          ${assignmentId}::uuid,
          ${`Geregistreerd op werkbon als ${usageType}`},
          ${auth.userId}::uuid,
          ${notes}
        )
      `);

      await completeOfflineOperation(exec, {
        tenantId: auth.tenantId, actorUserId: auth.userId, operationId,
        response: { id: created.id, participantVersion: expectedVersion },
      });

      return { ...created, participantVersion: expectedVersion };
    });

    revalidateAssignmentPaths(assignmentId);
    return { success: true, id: row.id, participantVersion: row.participantVersion };
  } catch (error) {
    return normalizeOfflineServerActionError(error, "Inventaris opslaan mislukt. Probeer het later opnieuw.");
  }
}
