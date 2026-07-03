"use server";

import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { getCurrentBackofficeUser, requireCurrentTenantId } from "@/lib/auth/tenant";

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; message: string; fieldErrors?: Record<string, string> };

const ASSIGNMENT_INVENTORY_USAGE_TYPES = [
  "used",
  "rented",
  "issued",
  "returned",
  "defect_found",
] as const;

export type AssignmentInventoryUsageType = (typeof ASSIGNMENT_INVENTORY_USAGE_TYPES)[number];

export type AssignmentInventoryLinkRow = {
  id: string;
  assignmentId: string;
  inventoryItemId: string;
  inventoryCode: string;
  inventoryName: string;
  inventoryStatus: string;
  currentLocationName: string | null;
  usageType: AssignmentInventoryUsageType | string;
  registeredQuantity: string;
  registeredPeriodLabel: string | null;
  invoiceable: boolean;
  customerVisible: boolean;
  approvedQuantity: string | null;
  approvedUnitPrice: string | null;
  approvedVatRate: string | null;
  approvalStatus: "pending" | "approved" | "rejected" | string;
  approvalReason: string | null;
  notes: string | null;
  attachedAt: string;
};

export type AssignmentInventoryOption = {
  id: string;
  code: string;
  name: string;
  status: string;
  currentLocationName: string | null;
  currentObjectName: string | null;
  currentPersonnelName: string | null;
};

export type AssignmentInventoryAttachInput = {
  inventoryItemId: string;
  usageType?: string | null;
  registeredQuantity?: string | null;
  registeredPeriodLabel?: string | null;
  notes?: string | null;
};

export type AssignmentInventoryApprovalInput = {
  approvedQuantity: string;
  approvedUnitPrice: string;
  approvedVatRate: string;
  invoiceable: boolean;
  customerVisible: boolean;
  approvalStatus: "approved" | "rejected";
  reason: string;
};

type SqlResult<T> = { rows?: T[] } | T[];
type DbExecutor = { execute: (query: SQL) => Promise<unknown> };

function rowsFrom<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const maybeRows = (result as SqlResult<T> | null)?.rows;
  return Array.isArray(maybeRows) ? maybeRows : [];
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requireText(value: unknown, label: string): string {
  const trimmed = cleanText(value);
  if (!trimmed) throw new Error(`${label} is verplicht.`);
  return trimmed;
}

function normalizeDecimal(
  value: unknown,
  label: string,
  options: { scale?: number; min?: number; max?: number; required?: boolean } = {},
): string | null {
  const raw = cleanText(value);
  if (!raw) {
    if (options.required) throw new Error(`${label} is verplicht.`);
    return null;
  }

  const parsed = Number(raw.replace(",", "."));
  if (!Number.isFinite(parsed)) throw new Error(`${label} moet een geldig getal zijn.`);
  if (options.min !== undefined && parsed < options.min) {
    throw new Error(`${label} mag niet lager zijn dan ${options.min}.`);
  }
  if (options.max !== undefined && parsed > options.max) {
    throw new Error(`${label} mag niet hoger zijn dan ${options.max}.`);
  }

  const scale = options.scale ?? 2;
  return parsed.toFixed(scale).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function normalizeUsageType(value: unknown): AssignmentInventoryUsageType {
  const raw = cleanText(value);
  return ASSIGNMENT_INVENTORY_USAGE_TYPES.includes(raw as AssignmentInventoryUsageType)
    ? raw as AssignmentInventoryUsageType
    : "used";
}

function toMoney(value: string | null | undefined): string {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

async function hasInventoryAttachPermission(): Promise<boolean> {
  return (
    await hasPermission("inventory", "use_on_assignment") ||
    await hasPermission("inventory", "update") ||
    await hasPermission("inventory", "manage")
  );
}

async function hasInventoryApprovalPermission(): Promise<boolean> {
  return (
    await hasPermission("inventory", "approve_usage") ||
    await hasPermission("inventory", "invoice_usage") ||
    await hasPermission("inventory", "manage")
  );
}

async function requireInventoryAttachPermission(): Promise<void> {
  if (await hasInventoryAttachPermission()) return;
  throw new Error("Geen toegang om inventaris aan werkbonnen te koppelen.");
}

async function requireInventoryApprovalPermission(): Promise<void> {
  if (await hasInventoryApprovalPermission()) return;
  throw new Error("Geen toegang tot inventarisgoedkeuring.");
}

async function requireActorId(): Promise<string> {
  const user = await getCurrentBackofficeUser();
  if (!user) throw new Error("Geen ingelogde gebruiker gevonden.");
  return user.id;
}

function revalidateAssignmentInventory(assignmentId: string): void {
  revalidatePath(`/assignments/${assignmentId}`);
  revalidatePath("/reports");
  revalidatePath("/invoices");
}

async function writeTenantAuditLog(input: {
  tenantId: string;
  userId: string;
  action: string;
  resourceId: string;
  metadata: unknown;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO audit_log (tenant_id, user_id, action, resource, resource_id, metadata)
    VALUES (
      ${input.tenantId}::uuid,
      ${input.userId}::uuid,
      ${input.action},
      'assignment_inventory_items',
      ${input.resourceId},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
  `);
}

export async function canAttachAssignmentInventory(): Promise<boolean> {
  return hasInventoryAttachPermission();
}

export async function canApproveAssignmentInventory(): Promise<boolean> {
  return hasInventoryApprovalPermission();
}

async function assertAssignmentForTenant(
  tx: DbExecutor,
  tenantId: string,
  assignmentId: string,
): Promise<{ id: string; code: string; title: string } | null> {
  const [assignment] = rowsFrom<{ id: string; code: string; title: string }>(await tx.execute(sql`
    SELECT id, code, title
    FROM assignments
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ${assignmentId}::uuid
    LIMIT 1
  `));
  return assignment ?? null;
}

async function getInventoryItemForTenant(
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

export async function listAssignmentInventoryLinks(
  assignmentId: string,
): Promise<AssignmentInventoryLinkRow[]> {
  await requirePermission("inventory", "view");
  const tenantId = await requireCurrentTenantId();

  return rowsFrom<AssignmentInventoryLinkRow>(await db.execute(sql`
    SELECT link.id,
           link.assignment_id::text AS "assignmentId",
           link.inventory_item_id::text AS "inventoryItemId",
           item.code AS "inventoryCode",
           item.name AS "inventoryName",
           item.status AS "inventoryStatus",
           stock_locations.name AS "currentLocationName",
           link.usage_type AS "usageType",
           COALESCE(link.registered_quantity, 1)::text AS "registeredQuantity",
           link.registered_period_label AS "registeredPeriodLabel",
           link.invoiceable,
           link.customer_visible AS "customerVisible",
           link.approved_quantity::text AS "approvedQuantity",
           link.approved_unit_price::text AS "approvedUnitPrice",
           link.approved_vat_rate::text AS "approvedVatRate",
           link.approval_status AS "approvalStatus",
           link.approval_reason AS "approvalReason",
           link.notes,
           link.attached_at::text AS "attachedAt"
    FROM assignment_inventory_items link
    JOIN assignments ON assignments.id = link.assignment_id AND assignments.tenant_id = link.tenant_id
    JOIN inventory_items item ON item.id = link.inventory_item_id AND item.tenant_id = link.tenant_id
    LEFT JOIN stock_locations ON stock_locations.id = item.current_stock_location_id AND stock_locations.tenant_id = link.tenant_id
    WHERE link.tenant_id = ${tenantId}::uuid
      AND link.assignment_id = ${assignmentId}::uuid
    ORDER BY link.attached_at ASC
  `));
}

export async function listAttachableInventoryForAssignment(
  assignmentId: string,
): Promise<AssignmentInventoryOption[]> {
  await requirePermission("inventory", "view");
  const tenantId = await requireCurrentTenantId();

  return rowsFrom<AssignmentInventoryOption>(await db.execute(sql`
    SELECT item.id,
           item.code,
           item.name,
           item.status,
           stock_locations.name AS "currentLocationName",
           objects.name AS "currentObjectName",
           trim(concat(personnel.first_name, ' ', personnel.last_name)) AS "currentPersonnelName"
    FROM inventory_items item
    JOIN assignments ON assignments.tenant_id = item.tenant_id AND assignments.id = ${assignmentId}::uuid
    LEFT JOIN stock_locations ON stock_locations.id = item.current_stock_location_id AND stock_locations.tenant_id = item.tenant_id
    LEFT JOIN objects ON objects.id = item.current_object_id AND objects.tenant_id = item.tenant_id
    LEFT JOIN personnel ON personnel.id = item.current_personnel_id AND personnel.tenant_id = item.tenant_id
    WHERE item.tenant_id = ${tenantId}::uuid
      AND item.is_active = true
      AND item.archived_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM assignment_inventory_items existing
        WHERE existing.tenant_id = item.tenant_id
          AND existing.assignment_id = assignments.id
          AND existing.inventory_item_id = item.id
      )
    ORDER BY item.code ASC
    LIMIT 400
  `));
}

export async function attachInventoryToAssignment(
  assignmentId: string,
  input: AssignmentInventoryAttachInput,
): Promise<ActionResult<{ id: string }>> {
  await requireInventoryAttachPermission();
  const tenantId = await requireCurrentTenantId();
  const userId = await requireActorId();

  try {
    const inventoryItemId = requireText(input.inventoryItemId, "Inventarisitem");
    const usageType = normalizeUsageType(input.usageType);
    const registeredQuantity = normalizeDecimal(input.registeredQuantity ?? "1", "Aantal", {
      required: true,
      min: 0.001,
      scale: 3,
    });
    const periodLabel = cleanText(input.registeredPeriodLabel)?.slice(0, 80) ?? null;
    const notes = cleanText(input.notes);

    if (!registeredQuantity) throw new Error("Aantal is verplicht.");

    const created = await db.transaction(async (tx) => {
      const exec = tx as unknown as DbExecutor;
      const assignment = await assertAssignmentForTenant(exec, tenantId, assignmentId);
      if (!assignment) throw new Error("Opdracht niet gevonden binnen deze tenant.");

      const item = await getInventoryItemForTenant(exec, tenantId, inventoryItemId);
      if (!item) throw new Error("Inventarisitem niet gevonden binnen deze tenant.");

      const [link] = rowsFrom<{ id: string }>(await exec.execute(sql`
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
          ${tenantId}::uuid,
          ${assignmentId}::uuid,
          ${inventoryItemId}::uuid,
          ${usageType},
          ${registeredQuantity}::numeric,
          ${periodLabel},
          false,
          false,
          'pending',
          ${userId}::uuid,
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
      if (!link) throw new Error("Inventariskoppeling kon niet worden opgeslagen.");

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
          ${tenantId}::uuid,
          ${inventoryItemId}::uuid,
          'corrected',
          ${assignmentId}::uuid,
          ${`Gekoppeld aan werkbon als ${usageType}`},
          ${userId}::uuid,
          ${notes}
        )
      `);

      return { ...link, assignment, item };
    });

    await writeTenantAuditLog({
      tenantId,
      userId,
      action: "assignment_inventory_attached",
      resourceId: created.id,
      metadata: {
        assignmentId,
        assignmentCode: created.assignment.code,
        inventoryItemId,
        inventoryCode: created.item.code,
        usageType,
        registeredQuantity,
        registeredPeriodLabel: periodLabel,
      },
    });

    revalidateAssignmentInventory(assignmentId);
    return { success: true, data: { id: created.id } };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
}

export async function approveAssignmentInventoryUsage(
  assignmentId: string,
  linkId: string,
  input: AssignmentInventoryApprovalInput,
): Promise<ActionResult> {
  await requireInventoryApprovalPermission();
  const tenantId = await requireCurrentTenantId();
  const userId = await requireActorId();

  try {
    const status = input.approvalStatus === "rejected" ? "rejected" : "approved";
    const reason = requireText(input.reason, "Reden");
    const approvedQuantity = normalizeDecimal(input.approvedQuantity, "Aantal", {
      required: true,
      min: 0.001,
      scale: 3,
    });
    const approvedUnitPrice = normalizeDecimal(input.approvedUnitPrice, "Prijs", {
      required: true,
      min: 0,
      scale: 2,
    });
    const approvedVatRate = normalizeDecimal(input.approvedVatRate, "BTW", {
      required: true,
      min: 0,
      max: 100,
      scale: 2,
    });

    if (!approvedQuantity || !approvedUnitPrice || !approvedVatRate) {
      throw new Error("Aantal, prijs en BTW zijn verplicht.");
    }

    const updated = await db.transaction(async (tx) => {
      const exec = tx as unknown as DbExecutor;
      const [existing] = rowsFrom<AssignmentInventoryLinkRow>(await exec.execute(sql`
        SELECT link.id,
               link.assignment_id::text AS "assignmentId",
               link.inventory_item_id::text AS "inventoryItemId",
               item.code AS "inventoryCode",
               item.name AS "inventoryName",
               item.status AS "inventoryStatus",
               stock_locations.name AS "currentLocationName",
               link.usage_type AS "usageType",
               COALESCE(link.registered_quantity, 1)::text AS "registeredQuantity",
               link.registered_period_label AS "registeredPeriodLabel",
               link.invoiceable,
               link.customer_visible AS "customerVisible",
               link.approved_quantity::text AS "approvedQuantity",
               link.approved_unit_price::text AS "approvedUnitPrice",
               link.approved_vat_rate::text AS "approvedVatRate",
               link.approval_status AS "approvalStatus",
               link.approval_reason AS "approvalReason",
               link.notes,
               link.attached_at::text AS "attachedAt"
        FROM assignment_inventory_items link
        JOIN inventory_items item ON item.id = link.inventory_item_id AND item.tenant_id = link.tenant_id
        LEFT JOIN stock_locations ON stock_locations.id = item.current_stock_location_id AND stock_locations.tenant_id = link.tenant_id
        WHERE link.tenant_id = ${tenantId}::uuid
          AND link.assignment_id = ${assignmentId}::uuid
          AND link.id = ${linkId}::uuid
        LIMIT 1
      `));
      if (!existing) throw new Error("Inventarisregel niet gevonden.");

      const invoiceable = status === "approved" && input.invoiceable === true;
      const customerVisible = status === "approved" && input.customerVisible === true;

      await exec.execute(sql`
        UPDATE assignment_inventory_items
        SET approved_quantity = ${approvedQuantity}::numeric,
            approved_unit_price = ${approvedUnitPrice}::numeric,
            approved_vat_rate = ${approvedVatRate}::numeric,
            invoiceable = ${invoiceable},
            customer_visible = ${customerVisible},
            approval_status = ${status},
            approval_reason = ${reason},
            approved_by = ${userId}::uuid,
            approved_at = now()
        WHERE tenant_id = ${tenantId}::uuid
          AND assignment_id = ${assignmentId}::uuid
          AND id = ${linkId}::uuid
      `);

      return { existing, invoiceable, customerVisible };
    });

    await writeTenantAuditLog({
      tenantId,
      userId,
      action: status === "approved"
        ? "assignment_inventory_usage_approved"
        : "assignment_inventory_usage_rejected",
      resourceId: linkId,
      metadata: {
        assignmentId,
        inventoryCode: updated.existing.inventoryCode,
        usageType: updated.existing.usageType,
        previousApprovalStatus: updated.existing.approvalStatus,
        approvedQuantity,
        approvedUnitPrice: toMoney(approvedUnitPrice),
        approvedVatRate,
        invoiceable: updated.invoiceable,
        customerVisible: updated.customerVisible,
        reason,
      },
    });

    revalidateAssignmentInventory(assignmentId);
    return { success: true };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
}

export async function removeAssignmentInventoryLink(
  assignmentId: string,
  linkId: string,
): Promise<ActionResult> {
  await requireInventoryAttachPermission();
  const tenantId = await requireCurrentTenantId();
  const userId = await requireActorId();

  const [removed] = rowsFrom<{ id: string; inventoryCode: string; usageType: string }>(await db.execute(sql`
    DELETE FROM assignment_inventory_items link
    USING inventory_items item
    WHERE link.inventory_item_id = item.id
      AND link.tenant_id = item.tenant_id
      AND link.tenant_id = ${tenantId}::uuid
      AND link.assignment_id = ${assignmentId}::uuid
      AND link.id = ${linkId}::uuid
    RETURNING link.id, item.code AS "inventoryCode", link.usage_type AS "usageType"
  `));

  if (!removed) {
    return { success: false, message: "Inventarisregel niet gevonden." };
  }

  await writeTenantAuditLog({
    tenantId,
    userId,
    action: "assignment_inventory_detached",
    resourceId: removed.id,
    metadata: { assignmentId, inventoryCode: removed.inventoryCode, usageType: removed.usageType },
  });

  revalidateAssignmentInventory(assignmentId);
  return { success: true };
}
