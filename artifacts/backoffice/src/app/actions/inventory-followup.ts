"use server";

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { getCurrentBackofficeUser, requireCurrentTenantId } from "@/lib/auth/tenant";

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; message: string; fieldErrors?: Record<string, string> };

export type InventoryIssueStatus = "new" | "in_progress" | "waiting_supplier" | "resolved" | "unresolvable" | "cancelled";
export type InventoryIssueSeverity = "low" | "normal" | "high" | "urgent";
export type InventoryMaintenanceEventType = "inspection" | "maintenance" | "repair";
export type InventoryMaintenanceStatus = "scheduled" | "due" | "completed" | "cancelled";

export type InventoryIssueRow = {
  id: string;
  inventoryItemId: string;
  inventoryCode: string;
  inventoryName: string;
  assignmentId: string | null;
  assignmentCode: string | null;
  objectName: string | null;
  personnelName: string | null;
  reportedByName: string | null;
  severity: InventoryIssueSeverity | string;
  status: InventoryIssueStatus | string;
  description: string;
  resolutionNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type InventoryMaintenanceRow = {
  id: string;
  inventoryItemId: string;
  inventoryCode: string;
  inventoryName: string;
  eventType: InventoryMaintenanceEventType | string;
  status: InventoryMaintenanceStatus | string;
  scheduledAt: string | null;
  dueDate: string | null;
  performedAt: string | null;
  performedByName: string | null;
  notes: string | null;
  createdAt: string;
};

export type InventoryIssueDetail = InventoryIssueRow & {
  inventoryStatus: string;
  inventoryLocationName: string | null;
  inventoryObjectId: string | null;
  inventoryPersonnelId: string | null;
  maintenanceEvents: InventoryMaintenanceRow[];
};

export type InventoryFollowupSummary = {
  openIssueCount: number;
  urgentIssueCount: number;
  nextMaintenanceDueDate: string | null;
  overdueMaintenanceCount: number;
};

export type InventoryIssueUpdateInput = {
  status?: string | null;
  resolutionNotes?: string | null;
};

export type InventoryMaintenanceInput = {
  inventoryItemId: string;
  eventType?: string | null;
  status?: string | null;
  dueDate?: string | null;
  performedAt?: string | null;
  notes?: string | null;
};

type SqlResult<T> = { rows?: T[] };

const ISSUE_STATUSES = new Set(["new", "in_progress", "waiting_supplier", "resolved", "unresolvable", "cancelled"]);
const MAINTENANCE_EVENT_TYPES = new Set(["inspection", "maintenance", "repair"]);
const MAINTENANCE_STATUSES = new Set(["scheduled", "due", "completed", "cancelled"]);
const CLOSED_ISSUE_STATUSES = new Set(["resolved", "unresolvable", "cancelled"]);

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

function normalizeDate(value: unknown, label: string): string | null {
  const raw = cleanText(value);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`${label} moet een geldige datum zijn.`);
  return raw;
}

function normalizeDateTime(value: unknown, label: string): string | null {
  const raw = cleanText(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} moet een geldige datum/tijd zijn.`);
  return parsed.toISOString();
}

async function requireFollowupWrite(action: string): Promise<void> {
  if (await hasPermission("inventory", action)) return;
  if (await hasPermission("inventory", "manage")) return;
  throw new Error(`Forbidden: inventory:${action}`);
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

async function enqueueManagementNotification(input: {
  tenantId: string;
  title: string;
  body: string;
  href: string;
  idempotencyKey: string;
  payload?: Record<string, unknown>;
}) {
  await db.execute(sql`
    INSERT INTO notification_delivery_queue (
      tenant_id, event_key, channel, recipient_type, title, body, payload, idempotency_key
    ) VALUES (
      ${input.tenantId}::uuid,
      'inventory.issue.reported',
      'in_app',
      'management',
      ${input.title},
      ${input.body},
      ${JSON.stringify({ href: input.href, ...(input.payload ?? {}) })}::jsonb,
      ${input.idempotencyKey}
    )
    ON CONFLICT (idempotency_key) DO NOTHING
  `);
}

function revalidateInventoryFollowup(itemId?: string | null, issueId?: string | null) {
  revalidatePath("/inventory");
  revalidatePath("/inventory/issues");
  if (issueId) revalidatePath(`/inventory/issues/${issueId}`);
  if (itemId) revalidatePath(`/inventory/${itemId}`);
  revalidatePath("/objects");
  revalidatePath("/personnel");
}

export async function listInventoryIssues(params: {
  status?: string;
  itemId?: string;
} = {}): Promise<InventoryIssueRow[]> {
  await requirePermission("inventory", "view");
  const tenantId = await requireCurrentTenantId();
  const status = cleanText(params.status) ?? "open";
  const itemId = cleanText(params.itemId);
  const statusWhere = status === "all"
    ? sql`true`
    : status === "open"
      ? sql`issue.status NOT IN ('resolved', 'unresolvable', 'cancelled')`
      : ISSUE_STATUSES.has(status)
        ? sql`issue.status = ${status}`
        : sql`issue.status NOT IN ('resolved', 'unresolvable', 'cancelled')`;

  return rowsFrom<InventoryIssueRow>(await db.execute(sql`
    SELECT issue.id,
           issue.inventory_item_id::text AS "inventoryItemId",
           item.code AS "inventoryCode",
           item.name AS "inventoryName",
           issue.assignment_id::text AS "assignmentId",
           assignments.code AS "assignmentCode",
           objects.name AS "objectName",
           trim(concat(context_personnel.first_name, ' ', context_personnel.last_name)) AS "personnelName",
           trim(concat(reporter.first_name, ' ', reporter.last_name)) AS "reportedByName",
           issue.severity,
           issue.status,
           issue.description,
           issue.resolution_notes AS "resolutionNotes",
           issue.created_at::text AS "createdAt",
           issue.resolved_at::text AS "resolvedAt"
    FROM inventory_issues issue
    JOIN inventory_items item ON item.id = issue.inventory_item_id AND item.tenant_id = issue.tenant_id
    LEFT JOIN assignments ON assignments.id = issue.assignment_id AND assignments.tenant_id = issue.tenant_id
    LEFT JOIN objects ON objects.id = COALESCE(issue.object_id, item.current_object_id) AND objects.tenant_id = issue.tenant_id
    LEFT JOIN personnel context_personnel ON context_personnel.id = COALESCE(issue.personnel_id, item.current_personnel_id) AND context_personnel.tenant_id = issue.tenant_id
    LEFT JOIN personnel reporter ON reporter.user_id = issue.reported_by AND reporter.tenant_id = issue.tenant_id
    WHERE issue.tenant_id = ${tenantId}::uuid
      AND (${itemId}::uuid IS NULL OR issue.inventory_item_id = ${itemId}::uuid)
      AND ${statusWhere}
    ORDER BY CASE issue.severity WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
             issue.created_at DESC
    LIMIT 300
  `));
}

export async function getInventoryIssueDetail(issueId: string): Promise<InventoryIssueDetail | null> {
  await requirePermission("inventory", "view");
  const tenantId = await requireCurrentTenantId();

  const [issue] = rowsFrom<InventoryIssueDetail>(await db.execute(sql`
    SELECT issue.id,
           issue.inventory_item_id::text AS "inventoryItemId",
           item.code AS "inventoryCode",
           item.name AS "inventoryName",
           item.status AS "inventoryStatus",
           locations.name AS "inventoryLocationName",
           item.current_object_id::text AS "inventoryObjectId",
           item.current_personnel_id::text AS "inventoryPersonnelId",
           issue.assignment_id::text AS "assignmentId",
           assignments.code AS "assignmentCode",
           objects.name AS "objectName",
           trim(concat(context_personnel.first_name, ' ', context_personnel.last_name)) AS "personnelName",
           trim(concat(reporter.first_name, ' ', reporter.last_name)) AS "reportedByName",
           issue.severity,
           issue.status,
           issue.description,
           issue.resolution_notes AS "resolutionNotes",
           issue.created_at::text AS "createdAt",
           issue.resolved_at::text AS "resolvedAt"
    FROM inventory_issues issue
    JOIN inventory_items item ON item.id = issue.inventory_item_id AND item.tenant_id = issue.tenant_id
    LEFT JOIN stock_locations locations ON locations.id = item.current_stock_location_id AND locations.tenant_id = issue.tenant_id
    LEFT JOIN assignments ON assignments.id = issue.assignment_id AND assignments.tenant_id = issue.tenant_id
    LEFT JOIN objects ON objects.id = COALESCE(issue.object_id, item.current_object_id) AND objects.tenant_id = issue.tenant_id
    LEFT JOIN personnel context_personnel ON context_personnel.id = COALESCE(issue.personnel_id, item.current_personnel_id) AND context_personnel.tenant_id = issue.tenant_id
    LEFT JOIN personnel reporter ON reporter.user_id = issue.reported_by AND reporter.tenant_id = issue.tenant_id
    WHERE issue.tenant_id = ${tenantId}::uuid
      AND issue.id = ${issueId}::uuid
    LIMIT 1
  `));

  if (!issue) return null;

  const maintenanceEvents = rowsFrom<InventoryMaintenanceRow>(await db.execute(sql`
    SELECT event.id,
           event.inventory_item_id::text AS "inventoryItemId",
           item.code AS "inventoryCode",
           item.name AS "inventoryName",
           event.event_type AS "eventType",
           event.status,
           event.scheduled_at::text AS "scheduledAt",
           event.due_date::text AS "dueDate",
           event.performed_at::text AS "performedAt",
           trim(concat(personnel.first_name, ' ', personnel.last_name)) AS "performedByName",
           event.notes,
           event.created_at::text AS "createdAt"
    FROM inventory_maintenance_events event
    JOIN inventory_items item ON item.id = event.inventory_item_id AND item.tenant_id = event.tenant_id
    LEFT JOIN personnel ON personnel.id = event.performed_by AND personnel.tenant_id = event.tenant_id
    WHERE event.tenant_id = ${tenantId}::uuid
      AND event.inventory_item_id = ${issue.inventoryItemId}::uuid
    ORDER BY COALESCE(event.performed_at, event.scheduled_at, event.created_at) DESC
    LIMIT 50
  `));

  return { ...issue, maintenanceEvents };
}

export async function getInventoryFollowupSummary(itemId: string): Promise<InventoryFollowupSummary> {
  await requirePermission("inventory", "view");
  const tenantId = await requireCurrentTenantId();

  const [issueStats] = rowsFrom<{ openIssueCount: number; urgentIssueCount: number }>(await db.execute(sql`
    SELECT count(*) FILTER (WHERE status NOT IN ('resolved', 'unresolvable', 'cancelled'))::int AS "openIssueCount",
           count(*) FILTER (WHERE status NOT IN ('resolved', 'unresolvable', 'cancelled') AND severity IN ('urgent', 'high'))::int AS "urgentIssueCount"
    FROM inventory_issues
    WHERE tenant_id = ${tenantId}::uuid
      AND inventory_item_id = ${itemId}::uuid
  `));

  const [maintenanceStats] = rowsFrom<{ nextMaintenanceDueDate: string | null; overdueMaintenanceCount: number }>(await db.execute(sql`
    SELECT (min(due_date) FILTER (WHERE status IN ('scheduled', 'due') AND due_date IS NOT NULL))::text AS "nextMaintenanceDueDate",
           count(*) FILTER (WHERE status IN ('scheduled', 'due') AND due_date < current_date)::int AS "overdueMaintenanceCount"
    FROM inventory_maintenance_events
    WHERE tenant_id = ${tenantId}::uuid
      AND inventory_item_id = ${itemId}::uuid
  `));

  return {
    openIssueCount: issueStats?.openIssueCount ?? 0,
    urgentIssueCount: issueStats?.urgentIssueCount ?? 0,
    nextMaintenanceDueDate: maintenanceStats?.nextMaintenanceDueDate ?? null,
    overdueMaintenanceCount: maintenanceStats?.overdueMaintenanceCount ?? 0,
  };
}

export async function updateInventoryIssueStatus(
  issueId: string,
  input: InventoryIssueUpdateInput,
): Promise<ActionResult> {
  try {
    await requireFollowupWrite("resolve_issue");
    const tenantId = await requireCurrentTenantId();
    const userId = await requireActorId();
    const status = cleanText(input.status) ?? "in_progress";
    const resolutionNotes = cleanText(input.resolutionNotes);

    if (!ISSUE_STATUSES.has(status)) return { success: false, message: "Ongeldige storingsstatus." };
    if (CLOSED_ISSUE_STATUSES.has(status) && !resolutionNotes) {
      return { success: false, message: "Een afrondingsnotitie is verplicht bij sluiten of annuleren." };
    }

    const [updated] = rowsFrom<{ id: string; inventoryItemId: string; code: string }>(await db.execute(sql`
      UPDATE inventory_issues issue
      SET status = ${status},
          resolution_notes = ${resolutionNotes},
          resolved_by = CASE WHEN ${status} IN ('resolved', 'unresolvable', 'cancelled') THEN ${userId}::uuid ELSE NULL END,
          resolved_at = CASE WHEN ${status} IN ('resolved', 'unresolvable', 'cancelled') THEN now() ELSE NULL END,
          updated_at = now()
      FROM inventory_items item
      WHERE issue.inventory_item_id = item.id
        AND issue.tenant_id = item.tenant_id
        AND issue.tenant_id = ${tenantId}::uuid
        AND issue.id = ${issueId}::uuid
      RETURNING issue.id, issue.inventory_item_id::text AS "inventoryItemId", item.code
    `));

    if (!updated) return { success: false, message: "Storing niet gevonden." };

    await writeTenantAuditLog({
      tenantId,
      userId,
      action: CLOSED_ISSUE_STATUSES.has(status) ? "inventory_issue_closed" : "inventory_issue_status_updated",
      resource: "inventory_issues",
      resourceId: updated.id,
      metadata: { code: updated.code, status, hasResolutionNotes: Boolean(resolutionNotes) },
    });

    revalidateInventoryFollowup(updated.inventoryItemId, updated.id);
    return { success: true };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
}

export async function createInventoryMaintenanceEvent(
  input: InventoryMaintenanceInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireFollowupWrite("manage_maintenance");
    const tenantId = await requireCurrentTenantId();
    const userId = await requireActorId();
    const inventoryItemId = cleanText(input.inventoryItemId);
    if (!inventoryItemId) return { success: false, message: "Inventarisitem ontbreekt." };

    const eventType = cleanText(input.eventType) ?? "maintenance";
    const status = cleanText(input.status) ?? "scheduled";
    const dueDate = normalizeDate(input.dueDate, "Vervaldatum");
    const performedAt = normalizeDateTime(input.performedAt, "Uitgevoerd op");
    const notes = cleanText(input.notes);

    if (!MAINTENANCE_EVENT_TYPES.has(eventType)) return { success: false, message: "Ongeldig onderhoudstype." };
    if (!MAINTENANCE_STATUSES.has(status)) return { success: false, message: "Ongeldige onderhoudsstatus." };
    if (status === "completed" && !performedAt) return { success: false, message: "Uitvoerdatum is verplicht bij voltooid onderhoud." };

    const result = await db.transaction(async (tx) => {
      const [item] = rowsFrom<{ id: string; code: string }>(await tx.execute(sql`
        SELECT id, code
        FROM inventory_items
        WHERE tenant_id = ${tenantId}::uuid
          AND id = ${inventoryItemId}::uuid
          AND archived_at IS NULL
        LIMIT 1
      `));
      if (!item) throw new Error("Inventarisitem niet gevonden.");

      const [created] = rowsFrom<{ id: string }>(await tx.execute(sql`
        INSERT INTO inventory_maintenance_events (
          tenant_id, inventory_item_id, event_type, status, scheduled_at, due_date,
          performed_at, notes, created_by
        ) VALUES (
          ${tenantId}::uuid,
          ${inventoryItemId}::uuid,
          ${eventType},
          ${status},
          CASE WHEN ${status} IN ('scheduled', 'due') THEN now() ELSE NULL END,
          ${dueDate}::date,
          ${performedAt}::timestamptz,
          ${notes},
          ${userId}::uuid
        )
        RETURNING id
      `));
      if (!created) throw new Error("Onderhoud kon niet worden opgeslagen.");

      if (eventType === "inspection" && status === "completed") {
        await tx.execute(sql`
          UPDATE inventory_items
          SET last_inspection_date = COALESCE(${performedAt}::date, current_date),
              next_inspection_date = COALESCE(${dueDate}::date, next_inspection_date),
              updated_at = now()
          WHERE tenant_id = ${tenantId}::uuid
            AND id = ${inventoryItemId}::uuid
        `);
      }

      return { ...created, code: item.code };
    });

    await writeTenantAuditLog({
      tenantId,
      userId,
      action: status === "completed" ? "inventory_maintenance_completed" : "inventory_maintenance_scheduled",
      resource: "inventory_maintenance_events",
      resourceId: result.id,
      metadata: { code: result.code, eventType, status, dueDate, hasNotes: Boolean(notes) },
    });

    revalidateInventoryFollowup(inventoryItemId);
    return { success: true, data: { id: result.id } };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
}

export async function notifyInventoryIssueReported(input: {
  tenantId: string;
  issueId: string;
  inventoryCode: string;
  inventoryName: string;
  severity: string;
}) {
  await enqueueManagementNotification({
    tenantId: input.tenantId,
    title: `Nieuwe inventarisstoring ${input.inventoryCode}`,
    body: `${input.inventoryName} is gemeld met prioriteit ${input.severity}.`,
    href: `/inventory/issues/${input.issueId}`,
    idempotencyKey: `inventory_issue_reported:${input.issueId}`,
    payload: {
      issueId: input.issueId,
      inventoryCode: input.inventoryCode,
      severity: input.severity,
    },
  });
}
