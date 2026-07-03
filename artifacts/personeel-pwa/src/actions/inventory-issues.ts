"use server";

import { db, isTenantModuleEnabled } from "@workspace/db";
import { personnelTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type InventoryIssueSeverity = "low" | "normal" | "high" | "urgent";

export type ReportInventoryIssueInput = {
  inventoryItemId: string;
  assignmentId?: string | null;
  severity?: string | null;
  description?: string | null;
  evidenceNote?: string | null;
};

type PersonnelBasic = { userId: string; personnelId: string; tenantId: string };
type SqlResult<T> = { rows?: T[] } | T[];

const SEVERITIES = new Set(["low", "normal", "high", "urgent"]);

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

function normalizeSeverity(value: unknown): InventoryIssueSeverity {
  const raw = cleanText(value);
  return SEVERITIES.has(raw ?? "") ? raw as InventoryIssueSeverity : "normal";
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
  issueId: string;
  inventoryCode: string;
  inventoryName: string;
  severity: string;
}) {
  await db.execute(sql`
    INSERT INTO notification_delivery_queue (
      tenant_id, event_key, channel, recipient_type, title, body, payload, idempotency_key
    ) VALUES (
      ${input.tenantId}::uuid,
      'inventory.issue.reported',
      'in_app',
      'management',
      ${`Nieuwe inventarisstoring ${input.inventoryCode}`},
      ${`${input.inventoryName} is gemeld met prioriteit ${input.severity}.`},
      ${JSON.stringify({ href: `/inventory/issues/${input.issueId}`, issueId: input.issueId, inventoryCode: input.inventoryCode, severity: input.severity })}::jsonb,
      ${`inventory_issue_reported:${input.issueId}`}
    )
    ON CONFLICT (idempotency_key) DO NOTHING
  `);
}

async function getScopedInventoryItem(input: {
  tenantId: string;
  personnelId: string;
  inventoryItemId: string;
  assignmentId: string | null;
}): Promise<{
  id: string;
  code: string;
  name: string;
  currentObjectId: string | null;
  currentPersonnelId: string | null;
  scopedAssignmentId: string | null;
} | null> {
  const [item] = rowsFrom<{
    id: string;
    code: string;
    name: string;
    currentObjectId: string | null;
    currentPersonnelId: string | null;
    scopedAssignmentId: string | null;
  }>(await db.execute(sql`
    SELECT item.id,
           item.code,
           item.name,
           item.current_object_id::text AS "currentObjectId",
           item.current_personnel_id::text AS "currentPersonnelId",
           scoped_assignment.id::text AS "scopedAssignmentId"
    FROM inventory_items item
    LEFT JOIN LATERAL (
      SELECT a.id
      FROM assignment_personnel ap
      JOIN assignments a ON a.id = ap.assignment_id AND a.tenant_id = item.tenant_id
      LEFT JOIN assignment_inventory_items link
        ON link.tenant_id = a.tenant_id
       AND link.assignment_id = a.id
       AND link.inventory_item_id = item.id
      WHERE ap.personnel_id = ${input.personnelId}::uuid
        AND ap.status = 'assigned'
        AND (${input.assignmentId}::uuid IS NULL OR a.id = ${input.assignmentId}::uuid)
        AND (
          item.current_personnel_id = ${input.personnelId}::uuid
          OR (item.current_object_id IS NOT NULL AND a.object_id = item.current_object_id)
          OR link.id IS NOT NULL
        )
      ORDER BY a.scheduled_date DESC NULLS LAST, a.created_at DESC
      LIMIT 1
    ) scoped_assignment ON true
    WHERE item.tenant_id = ${input.tenantId}::uuid
      AND item.id = ${input.inventoryItemId}::uuid
      AND item.is_active = true
      AND item.archived_at IS NULL
      AND (
        item.current_personnel_id = ${input.personnelId}::uuid
        OR scoped_assignment.id IS NOT NULL
      )
    LIMIT 1
  `));

  return item ?? null;
}

function revalidateIssuePaths(assignmentId: string | null) {
  revalidatePath("/scan/inventory");
  if (assignmentId) {
    revalidatePath(`/opdrachten/${assignmentId}`);
    revalidatePath(`/opdrachten/${assignmentId}/inventaris`);
  }
}

export async function reportInventoryIssue(
  input: ReportInventoryIssueInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return { success: false, error: "Inventarismodule niet beschikbaar of niet ingelogd" };

  const inventoryItemId = cleanText(input.inventoryItemId);
  if (!inventoryItemId) return { success: false, error: "Inventarisitem ontbreekt" };

  const assignmentId = cleanText(input.assignmentId);
  const severity = normalizeSeverity(input.severity);
  const description = cleanText(input.description);
  const evidenceNote = cleanText(input.evidenceNote);
  if (!description || description.length < 8) {
    return { success: false, error: "Beschrijf de storing met minimaal 8 tekens" };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const item = await getScopedInventoryItem({
        tenantId: auth.tenantId,
        personnelId: auth.personnelId,
        inventoryItemId,
        assignmentId,
      });
      if (!item) throw new Error("Je hebt geen toegang tot dit inventarisitem");

      const [created] = rowsFrom<{ id: string }>(await tx.execute(sql`
        INSERT INTO inventory_issues (
          tenant_id, inventory_item_id, assignment_id, object_id, personnel_id,
          reported_by, severity, status, description
        ) VALUES (
          ${auth.tenantId}::uuid,
          ${inventoryItemId}::uuid,
          ${item.scopedAssignmentId ?? assignmentId}::uuid,
          ${item.currentObjectId}::uuid,
          ${item.currentPersonnelId ?? auth.personnelId}::uuid,
          ${auth.userId}::uuid,
          ${severity},
          'new',
          ${evidenceNote ? `${description}\n\nBewijs/media-notitie: ${evidenceNote}` : description}
        )
        RETURNING id
      `));
      if (!created) throw new Error("Storing opslaan mislukt");

      await tx.execute(sql`
        UPDATE inventory_items
        SET status = CASE WHEN status IN ('archived', 'disposed', 'lost') THEN status ELSE 'defect' END,
            updated_at = now()
        WHERE tenant_id = ${auth.tenantId}::uuid
          AND id = ${inventoryItemId}::uuid
      `);

      return { ...created, item };
    });

    await writeTenantAuditLog({
      tenantId: auth.tenantId,
      userId: auth.userId,
      action: "inventory_issue_reported",
      resource: "inventory_issues",
      resourceId: result.id,
      metadata: {
        inventoryItemId,
        inventoryCode: result.item.code,
        severity,
        assignmentId: result.item.scopedAssignmentId ?? assignmentId,
        hasEvidenceNote: Boolean(evidenceNote),
      },
    });

    await enqueueManagementNotification({
      tenantId: auth.tenantId,
      issueId: result.id,
      inventoryCode: result.item.code,
      inventoryName: result.item.name,
      severity,
    });

    revalidateIssuePaths(result.item.scopedAssignmentId ?? assignmentId);
    return { success: true, id: result.id };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
