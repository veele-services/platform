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

export type MaterialStockSourceOption = {
  id: string;
  name: string;
  locationType: "object" | "personnel" | string;
  quantity: number;
};

export type MaterialCatalogOption = {
  id: string;
  code: string;
  name: string;
  unit: string;
  defaultInvoiceable: boolean;
  stockLocations: MaterialStockSourceOption[];
};

export type MaterialUsageItem = {
  id: string;
  materialId?: string | null;
  materialCode?: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  unitLabel?: string;
  notes?: string | null;
  createdBy?: string;
  usesStock?: boolean;
  stockLocationName?: string | null;
  isOther?: boolean;
  approvalStatus?: string;
};

export type MaterialUsageInput = {
  materialId?: string | null;
  name: string;
  quantity?: string | number | null;
  unitLabel?: string | null;
  notes?: string | null;
  usesStock?: boolean;
  stockLocationId?: string | null;
  isOther?: boolean;
  clientMutationId?: string | null;
  expectedParticipantVersion?: number | null;
  /** Legacy field is ignored for personnel safety; management prices material later. */
  unitPrice?: string | number | null;
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

function negateDecimal(value: string): string {
  return String(toNumber(value) * -1);
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
  if (!(await isTenantModuleEnabled(row.tenantId, "materials"))) return null;

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
    return { ok: false, error: "Deze werkbon is afgesloten voor materiaalregistratie" };
  }
  return { ok: true, assignment };
}

function revalidateAssignmentPaths(assignmentId: string) {
  revalidatePath(`/opdrachten/${assignmentId}`);
  revalidatePath(`/opdrachten/${assignmentId}/materiaal`);
}

async function findExistingMutation(
  tenantId: string,
  assignmentId: string,
  userId: string,
  clientMutationId: string | null,
): Promise<string | null> {
  if (!clientMutationId) return null;
  const [existing] = rowsFrom<{ id: string }>(await db.execute(sql`
    SELECT id
    FROM assignment_material_usage
    WHERE tenant_id = ${tenantId}::uuid
      AND assignment_id = ${assignmentId}::uuid
      AND created_by = ${userId}::uuid
      AND client_mutation_id = ${clientMutationId}
    LIMIT 1
  `));
  return existing?.id ?? null;
}

async function applyBalanceDelta(
  tx: DbExecutor,
  tenantId: string,
  materialId: string,
  stockLocationId: string,
  delta: string,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO material_stock_balances (tenant_id, material_id, stock_location_id, quantity, last_movement_at)
    VALUES (${tenantId}::uuid, ${materialId}::uuid, ${stockLocationId}::uuid, ${delta}::numeric, now())
    ON CONFLICT (tenant_id, material_id, stock_location_id)
    DO UPDATE SET quantity = material_stock_balances.quantity + EXCLUDED.quantity,
                  last_movement_at = now(),
                  updated_at = now()
  `);
}

async function getMaterialForTenant(
  tx: DbExecutor,
  tenantId: string,
  materialId: string,
): Promise<{ id: string; code: string; name: string; unit: string; defaultInvoiceable: boolean } | null> {
  const [material] = rowsFrom<{ id: string; code: string; name: string; unit: string; defaultInvoiceable: boolean }>(await tx.execute(sql`
    SELECT id,
           code,
           name,
           unit,
           default_invoiceable AS "defaultInvoiceable"
    FROM materials
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ${materialId}::uuid
      AND is_active = true
      AND archived_at IS NULL
    LIMIT 1
  `));
  return material ?? null;
}

async function getAllowedStockLocation(
  tx: DbExecutor,
  input: {
    tenantId: string;
    stockLocationId: string;
    personnelId: string;
    objectId: string | null;
  },
): Promise<{ id: string; name: string } | null> {
  const [location] = rowsFrom<{ id: string; name: string }>(await tx.execute(sql`
    SELECT id, name
    FROM stock_locations
    WHERE tenant_id = ${input.tenantId}::uuid
      AND id = ${input.stockLocationId}::uuid
      AND archived_at IS NULL
      AND is_active = true
      AND (
        (location_type = 'personnel' AND personnel_id = ${input.personnelId}::uuid)
        OR (${input.objectId}::uuid IS NOT NULL AND location_type = 'object' AND object_id = ${input.objectId}::uuid)
      )
    LIMIT 1
  `));
  return location ?? null;
}

export async function listMaterialCatalogForAssignment(
  assignmentId: string,
): Promise<MaterialCatalogOption[]> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return [];

  const assignment = await getLinkedAssignmentAccess(auth.personnelId, auth.tenantId, assignmentId);
  if (!assignment) return [];

  const materials = rowsFrom<Omit<MaterialCatalogOption, "stockLocations">>(await db.execute(sql`
    SELECT id,
           code,
           name,
           unit,
           default_invoiceable AS "defaultInvoiceable"
    FROM materials
    WHERE tenant_id = ${auth.tenantId}::uuid
      AND is_active = true
      AND archived_at IS NULL
    ORDER BY code ASC
    LIMIT 300
  `));

  const stockRows = rowsFrom<{
    materialId: string;
    id: string;
    name: string;
    locationType: string;
    quantity: string | null;
  }>(await db.execute(sql`
    SELECT b.material_id::text AS "materialId",
           l.id,
           l.name,
           l.location_type AS "locationType",
           b.quantity::text AS quantity
    FROM material_stock_balances b
    JOIN stock_locations l ON l.id = b.stock_location_id AND l.tenant_id = b.tenant_id
    WHERE b.tenant_id = ${auth.tenantId}::uuid
      AND l.archived_at IS NULL
      AND l.is_active = true
      AND (
        (l.location_type = 'personnel' AND l.personnel_id = ${auth.personnelId}::uuid)
        OR (${assignment.objectId}::uuid IS NOT NULL AND l.location_type = 'object' AND l.object_id = ${assignment.objectId}::uuid)
      )
    ORDER BY l.location_type ASC, l.name ASC
  `));

  const locationsByMaterial = new Map<string, MaterialStockSourceOption[]>();
  for (const row of stockRows) {
    const current = locationsByMaterial.get(row.materialId) ?? [];
    current.push({
      id: row.id,
      name: row.name,
      locationType: row.locationType,
      quantity: toNumber(row.quantity),
    });
    locationsByMaterial.set(row.materialId, current);
  }

  return materials.map((material) => ({
    ...material,
    stockLocations: locationsByMaterial.get(material.id) ?? [],
  }));
}

export async function getMaterialUsageForAssignment(
  assignmentId: string,
): Promise<MaterialUsageItem[]> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return [];

  const assignment = await getLinkedAssignmentAccess(auth.personnelId, auth.tenantId, assignmentId);
  if (!assignment) return [];

  const rows = rowsFrom<{
    id: string;
    materialId: string | null;
    materialCode: string | null;
    name: string;
    quantity: string | null;
    unitLabel: string | null;
    notes: string | null;
    createdBy: string;
    usesStock: boolean;
    stockLocationName: string | null;
    isOther: boolean;
    approvalStatus: string;
  }>(await db.execute(sql`
    SELECT usage.id,
           usage.material_id::text AS "materialId",
           usage.material_code_snapshot AS "materialCode",
           COALESCE(usage.registered_name, usage.name) AS name,
           COALESCE(usage.registered_quantity, usage.quantity)::text AS quantity,
           COALESCE(usage.registered_unit_label, usage.unit_label) AS "unitLabel",
           usage.notes,
           usage.created_by::text AS "createdBy",
           usage.uses_stock AS "usesStock",
           stock_locations.name AS "stockLocationName",
           usage.is_other AS "isOther",
           usage.approval_status AS "approvalStatus"
    FROM assignment_material_usage usage
    LEFT JOIN stock_locations ON stock_locations.id = usage.stock_location_id
    WHERE usage.tenant_id = ${auth.tenantId}::uuid
      AND usage.assignment_id = ${assignmentId}::uuid
    ORDER BY usage.created_at ASC
  `));

  return rows.map((row) => ({
    id: row.id,
    materialId: row.materialId,
    materialCode: row.materialCode,
    name: row.name,
    quantity: toNumber(row.quantity),
    unitPrice: 0,
    unitLabel: row.unitLabel ?? undefined,
    notes: row.notes ?? null,
    createdBy: row.createdBy,
    usesStock: row.usesStock,
    stockLocationName: row.stockLocationName,
    isOther: row.isOther,
    approvalStatus: row.approvalStatus,
  }));
}

export async function addMaterialUsage(
  assignmentId: string,
  input: MaterialUsageInput,
): Promise<OfflineActionResult<{ id: string }>> {
  try {
    return await addMaterialUsageInternal(assignmentId, input);
  } catch (error) {
    return normalizeOfflineServerActionError(error, "Materiaal opslaan mislukt. Probeer het later opnieuw.");
  }
}

async function addMaterialUsageInternal(
  assignmentId: string,
  input: MaterialUsageInput,
): Promise<OfflineActionResult<{ id: string }>> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return permanentOfflineActionFailure("Materiaalmodule niet beschikbaar of niet ingelogd", "authentication_required");

  const access = await assertLinkedAndEditable(auth.personnelId, auth.tenantId, assignmentId);
  if (!access.ok) return permanentOfflineActionFailure(access.error, "business_rule_rejected");

  const clientMutationId = cleanText(input.clientMutationId)?.slice(0, 512) ?? randomUUID();

  const quantity = parsePositiveDecimal(input.quantity, 1);
  const materialId = cleanText(input.materialId);
  const wantsStock = input.usesStock === true;
  const isOther = input.isOther === true || !materialId;
  const [execution] = rowsFrom<{ version: number }>(await db.execute(sql`
    SELECT version FROM assignment_participant_executions
    WHERE tenant_id = ${auth.tenantId}::uuid AND assignment_id = ${assignmentId}::uuid
      AND personnel_id = ${auth.personnelId}::uuid AND participant_status <> 'removed'
    LIMIT 1
  `));
  if (!execution) return permanentOfflineActionFailure("Uitvoering niet gevonden", "execution_not_found");
  const expectedVersion = input.expectedParticipantVersion ?? Number(execution.version);

  try {
    const row = await db.transaction(async (tx) => {
      const exec = tx as unknown as DbExecutor;
      const replay = await beginOfflineOperation<{ id: string; participantVersion?: number }>(exec, {
        tenantId: auth.tenantId, assignmentId, personnelId: auth.personnelId,
        actorUserId: auth.userId, operationId: clientMutationId, operationType: "add-material-usage",
        expectedVersion,
        payload: { materialId, quantity, wantsStock, isOther, name: input.name, stockLocationId: input.stockLocationId ?? null },
      });
      if (replay) return { ...replay, participantVersion: replay.participantVersion ?? expectedVersion };
      const material = materialId ? await getMaterialForTenant(exec, auth.tenantId, materialId) : null;
      if (!isOther && !material) throw new Error("Materiaal niet gevonden");
      if (wantsStock && !material) throw new Error("Voorraadverbruik kan alleen met catalogusmateriaal");

      const registeredName = isOther
        ? cleanText(input.name)
        : material?.name ?? cleanText(input.name);
      if (!registeredName) throw new Error("Materiaalnaam is verplicht");

      const unitLabel = cleanText(input.unitLabel) ?? material?.unit ?? "stuk";
      let stockLocationId: string | null = null;
      let stockMovementId: string | null = null;

      if (wantsStock) {
        stockLocationId = cleanText(input.stockLocationId);
        if (!stockLocationId) throw new Error("Kies een voorraadlocatie");
        const location = await getAllowedStockLocation(exec, {
          tenantId: auth.tenantId,
          stockLocationId,
          personnelId: auth.personnelId,
          objectId: access.assignment.objectId,
        });
        if (!location) throw new Error("Voorraadlocatie niet toegestaan");

        const [movement] = rowsFrom<{ id: string }>(await exec.execute(sql`
          INSERT INTO material_stock_movements (
            tenant_id,
            material_id,
            from_stock_location_id,
            quantity,
            movement_type,
            reason,
            assignment_id,
            personnel_id,
            created_by,
            notes
          ) VALUES (
            ${auth.tenantId}::uuid,
            ${material!.id}::uuid,
            ${stockLocationId}::uuid,
            ${quantity}::numeric,
            'used_on_assignment',
            'Verbruikt op werkbon',
            ${assignmentId}::uuid,
            ${auth.personnelId}::uuid,
            ${auth.userId}::uuid,
            ${cleanText(input.notes)}
          )
          RETURNING id
        `));
        if (!movement) throw new Error("Voorraadmutatie opslaan mislukt");
        stockMovementId = movement.id;
        await applyBalanceDelta(exec, auth.tenantId, material!.id, stockLocationId, negateDecimal(quantity));
      }

      const [created] = rowsFrom<{ id: string }>(await exec.execute(sql`
        INSERT INTO assignment_material_usage (
          tenant_id,
          assignment_id,
          material_id,
          material_code_snapshot,
          registered_name,
          registered_quantity,
          registered_unit_label,
          stock_location_id,
          stock_movement_id,
          uses_stock,
          is_other,
          name,
          quantity,
          unit_price,
          unit_label,
          notes,
          created_by,
          client_mutation_id
        ) VALUES (
          ${auth.tenantId}::uuid,
          ${assignmentId}::uuid,
          ${material?.id ?? null}::uuid,
          ${material?.code ?? null},
          ${registeredName},
          ${quantity}::numeric,
          ${unitLabel.slice(0, 40)},
          ${stockLocationId}::uuid,
          ${stockMovementId}::uuid,
          ${wantsStock},
          ${isOther},
          ${registeredName},
          ${quantity}::numeric,
          0,
          ${unitLabel.slice(0, 40)},
          ${cleanText(input.notes)},
          ${auth.userId}::uuid,
          ${clientMutationId}
        )
        RETURNING id
      `));

      if (!created) throw new Error("Materiaal opslaan mislukt");
      await completeOfflineOperation(exec, {
        tenantId: auth.tenantId, actorUserId: auth.userId,
        operationId: clientMutationId, response: { id: created.id, participantVersion: expectedVersion },
      });
      return { ...created, participantVersion: expectedVersion };
    });

    revalidateAssignmentPaths(assignmentId);
    return { success: true, id: row.id, participantVersion: row.participantVersion };
  } catch (error) {
    try {
      const retryId = await findExistingMutation(auth.tenantId, assignmentId, auth.userId, clientMutationId);
      if (retryId) return { success: true, id: retryId, participantVersion: expectedVersion };
    } catch (diagnosticError) {
      console.error("material mutation recovery lookup failed", { assignmentId, diagnosticError });
    }
    return normalizeOfflineServerActionError(error, "Materiaal opslaan mislukt. Probeer het later opnieuw.");
  }
}

export async function deleteMaterialUsage(
  assignmentId: string,
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return { success: false, error: "Niet ingelogd" };

  const access = await assertLinkedAndEditable(auth.personnelId, auth.tenantId, assignmentId);
  if (!access.ok) return { success: false, error: access.error };

  try {
    await db.transaction(async (tx) => {
      const exec = tx as unknown as DbExecutor;
      const [item] = rowsFrom<{
        assignmentId: string;
        materialId: string | null;
        stockLocationId: string | null;
        quantity: string | null;
        createdBy: string;
        usesStock: boolean;
      }>(await exec.execute(sql`
        SELECT assignment_id::text AS "assignmentId",
               material_id::text AS "materialId",
               stock_location_id::text AS "stockLocationId",
               COALESCE(registered_quantity, quantity)::text AS quantity,
               created_by::text AS "createdBy",
               uses_stock AS "usesStock"
        FROM assignment_material_usage
        WHERE tenant_id = ${auth.tenantId}::uuid
          AND id = ${id}::uuid
        LIMIT 1
      `));

      if (!item || item.assignmentId !== assignmentId) throw new Error("Materiaal niet gevonden");
      if (item.createdBy !== auth.userId) throw new Error("Geen toegang");

      if (item.usesStock && item.materialId && item.stockLocationId && item.quantity) {
        await exec.execute(sql`
          INSERT INTO material_stock_movements (
            tenant_id,
            material_id,
            to_stock_location_id,
            quantity,
            movement_type,
            reason,
            assignment_id,
            personnel_id,
            created_by,
            notes
          ) VALUES (
            ${auth.tenantId}::uuid,
            ${item.materialId}::uuid,
            ${item.stockLocationId}::uuid,
            ${item.quantity}::numeric,
            'returned',
            'Materiaalregistratie verwijderd',
            ${assignmentId}::uuid,
            ${auth.personnelId}::uuid,
            ${auth.userId}::uuid,
            'Automatische voorraadcorrectie bij verwijderen'
          )
        `);
        await applyBalanceDelta(exec, auth.tenantId, item.materialId, item.stockLocationId, item.quantity);
      }

      await exec.execute(sql`
        DELETE FROM assignment_material_usage
        WHERE tenant_id = ${auth.tenantId}::uuid
          AND id = ${id}::uuid
      `);
    });

    revalidateAssignmentPaths(assignmentId);
    return { success: true };
  } catch (error) {
    return normalizeOfflineServerActionError(error, "Materiaal verwijderen mislukt. Probeer het later opnieuw.");
  }
}
