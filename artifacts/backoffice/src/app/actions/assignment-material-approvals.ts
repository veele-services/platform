"use server";

import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { hasPermission } from "@/lib/auth/permissions";
import { getCurrentBackofficeUser, requireCurrentTenantId } from "@/lib/auth/tenant";

export type AssignmentMaterialApprovalRow = {
  id: string;
  assignmentId: string;
  materialId: string | null;
  materialCode: string | null;
  registeredName: string;
  registeredQuantity: string;
  registeredUnitLabel: string | null;
  approvedName: string | null;
  approvedQuantity: string | null;
  approvedUnitLabel: string | null;
  approvedUnitPrice: string | null;
  approvedVatRate: string | null;
  suggestedUnitPrice: string;
  suggestedVatRate: string;
  suggestedInvoiceable: boolean;
  invoiceable: boolean;
  customerVisible: boolean;
  approvalStatus: "pending" | "approved" | "rejected" | string;
  approvalReason: string | null;
  usesStock: boolean;
  isOther: boolean;
  stockLocationName: string | null;
  createdAt: string;
};

export type AssignmentMaterialApprovalInput = {
  approvedName: string;
  approvedQuantity: string;
  approvedUnitLabel?: string | null;
  approvedUnitPrice: string;
  approvedVatRate: string;
  invoiceable: boolean;
  customerVisible: boolean;
  approvalStatus: "approved" | "rejected";
  reason: string;
};

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; message: string; fieldErrors?: Record<string, string> };

type SqlResult<T> = { rows?: T[] };
type DbExecutor = { execute: (query: SQL) => Promise<unknown> };

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
  if (options.min !== undefined && parsed < options.min) throw new Error(`${label} mag niet lager zijn dan ${options.min}.`);
  if (options.max !== undefined && parsed > options.max) throw new Error(`${label} mag niet hoger zijn dan ${options.max}.`);

  const scale = options.scale ?? 2;
  return parsed.toFixed(scale).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function toMoney(value: string | null | undefined): string {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

async function hasMaterialApprovalPermission(): Promise<boolean> {
  return (
    await hasPermission("materials", "approve_usage") ||
    await hasPermission("materials", "invoice_usage") ||
    await hasPermission("materials", "manage")
  );
}

async function requireMaterialApprovalPermission(): Promise<void> {
  if (await hasMaterialApprovalPermission()) return;
  throw new Error("Geen toegang tot materiaalgoedkeuring.");
}

async function requireActorId(): Promise<string> {
  const user = await getCurrentBackofficeUser();
  if (!user) throw new Error("Geen ingelogde gebruiker gevonden.");
  return user.id;
}

function revalidateAssignmentMaterialApproval(assignmentId: string): void {
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
      'assignment_material_usage',
      ${input.resourceId},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
  `);
}

export async function canApproveAssignmentMaterials(): Promise<boolean> {
  return hasMaterialApprovalPermission();
}

export async function listAssignmentMaterialApprovals(
  assignmentId: string,
): Promise<AssignmentMaterialApprovalRow[]> {
  await requireMaterialApprovalPermission();
  const tenantId = await requireCurrentTenantId();

  return rowsFrom<AssignmentMaterialApprovalRow>(await db.execute(sql`
    SELECT usage.id,
           usage.assignment_id::text AS "assignmentId",
           usage.material_id::text AS "materialId",
           COALESCE(usage.material_code_snapshot, materials.code) AS "materialCode",
           COALESCE(usage.registered_name, usage.name) AS "registeredName",
           COALESCE(usage.registered_quantity, usage.quantity, 1)::text AS "registeredQuantity",
           COALESCE(usage.registered_unit_label, usage.unit_label, materials.unit, 'stuk') AS "registeredUnitLabel",
           usage.approved_name AS "approvedName",
           usage.approved_quantity::text AS "approvedQuantity",
           usage.approved_unit_label AS "approvedUnitLabel",
           usage.approved_unit_price::text AS "approvedUnitPrice",
           usage.approved_vat_rate::text AS "approvedVatRate",
           COALESCE(materials.sale_price, usage.approved_unit_price, usage.unit_price, 0)::text AS "suggestedUnitPrice",
           COALESCE(materials.vat_rate, usage.approved_vat_rate, 21)::text AS "suggestedVatRate",
           COALESCE(materials.default_invoiceable, usage.invoiceable, false) AS "suggestedInvoiceable",
           usage.invoiceable,
           usage.customer_visible AS "customerVisible",
           usage.approval_status AS "approvalStatus",
           usage.approval_reason AS "approvalReason",
           usage.uses_stock AS "usesStock",
           usage.is_other AS "isOther",
           stock_locations.name AS "stockLocationName",
           usage.created_at::text AS "createdAt"
    FROM assignment_material_usage usage
    JOIN assignments ON assignments.id = usage.assignment_id
    LEFT JOIN materials ON materials.id = usage.material_id AND materials.tenant_id = assignments.tenant_id
    LEFT JOIN stock_locations ON stock_locations.id = usage.stock_location_id AND stock_locations.tenant_id = assignments.tenant_id
    WHERE assignments.tenant_id = ${tenantId}::uuid
      AND assignments.id = ${assignmentId}::uuid
    ORDER BY usage.created_at ASC
  `));
}

async function getMaterialUsageForApproval(
  tx: DbExecutor,
  tenantId: string,
  assignmentId: string,
  usageId: string,
): Promise<AssignmentMaterialApprovalRow | null> {
  const [row] = rowsFrom<AssignmentMaterialApprovalRow>(await tx.execute(sql`
    SELECT usage.id,
           usage.assignment_id::text AS "assignmentId",
           usage.material_id::text AS "materialId",
           COALESCE(usage.material_code_snapshot, materials.code) AS "materialCode",
           COALESCE(usage.registered_name, usage.name) AS "registeredName",
           COALESCE(usage.registered_quantity, usage.quantity, 1)::text AS "registeredQuantity",
           COALESCE(usage.registered_unit_label, usage.unit_label, materials.unit, 'stuk') AS "registeredUnitLabel",
           usage.approved_name AS "approvedName",
           usage.approved_quantity::text AS "approvedQuantity",
           usage.approved_unit_label AS "approvedUnitLabel",
           usage.approved_unit_price::text AS "approvedUnitPrice",
           usage.approved_vat_rate::text AS "approvedVatRate",
           COALESCE(materials.sale_price, usage.approved_unit_price, usage.unit_price, 0)::text AS "suggestedUnitPrice",
           COALESCE(materials.vat_rate, usage.approved_vat_rate, 21)::text AS "suggestedVatRate",
           COALESCE(materials.default_invoiceable, usage.invoiceable, false) AS "suggestedInvoiceable",
           usage.invoiceable,
           usage.customer_visible AS "customerVisible",
           usage.approval_status AS "approvalStatus",
           usage.approval_reason AS "approvalReason",
           usage.uses_stock AS "usesStock",
           usage.is_other AS "isOther",
           stock_locations.name AS "stockLocationName",
           usage.created_at::text AS "createdAt"
    FROM assignment_material_usage usage
    JOIN assignments ON assignments.id = usage.assignment_id
    LEFT JOIN materials ON materials.id = usage.material_id AND materials.tenant_id = assignments.tenant_id
    LEFT JOIN stock_locations ON stock_locations.id = usage.stock_location_id AND stock_locations.tenant_id = assignments.tenant_id
    WHERE assignments.tenant_id = ${tenantId}::uuid
      AND assignments.id = ${assignmentId}::uuid
      AND usage.id = ${usageId}::uuid
    LIMIT 1
  `));

  return row ?? null;
}

export async function approveAssignmentMaterialUsage(
  assignmentId: string,
  usageId: string,
  input: AssignmentMaterialApprovalInput,
): Promise<ActionResult> {
  await requireMaterialApprovalPermission();
  const tenantId = await requireCurrentTenantId();
  const userId = await requireActorId();

  try {
    const reason = requireText(input.reason, "Reden");
    const status = input.approvalStatus === "rejected" ? "rejected" : "approved";
    const approvedName = requireText(input.approvedName, "Omschrijving");
    const approvedQuantity = normalizeDecimal(input.approvedQuantity, "Aantal", {
      required: true,
      min: 0.001,
      scale: 3,
    });
    const approvedUnitLabel = requireText(input.approvedUnitLabel ?? "stuk", "Eenheid").slice(0, 40);
    const approvedUnitPrice = normalizeDecimal(input.approvedUnitPrice, "Verkoopprijs per stuk", {
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

    await db.transaction(async (tx) => {
      const exec = tx as unknown as DbExecutor;
      const existing = await getMaterialUsageForApproval(exec, tenantId, assignmentId, usageId);
      if (!existing) throw new Error("Materiaalregel niet gevonden.");

      const invoiceable = status === "approved" && input.invoiceable === true;
      const customerVisible = status === "approved" && input.customerVisible === true;

      await exec.execute(sql`
        UPDATE assignment_material_usage
        SET approved_name = ${approvedName},
            approved_quantity = ${approvedQuantity}::numeric,
            approved_unit_label = ${approvedUnitLabel},
            approved_unit_price = ${approvedUnitPrice}::numeric,
            approved_vat_rate = ${approvedVatRate}::numeric,
            invoiceable = ${invoiceable},
            customer_visible = ${customerVisible},
            approval_status = ${status},
            approved_by = ${userId}::uuid,
            approved_at = now(),
            approval_reason = ${reason},
            updated_at = now()
        WHERE id = ${usageId}::uuid
          AND assignment_id = ${assignmentId}::uuid
      `);

      await writeTenantAuditLog({
        tenantId,
        userId,
        action: status === "approved"
          ? "assignment_material_usage_approved"
          : "assignment_material_usage_rejected",
        resourceId: usageId,
        metadata: {
          assignmentId,
          materialCode: existing.materialCode,
          previousApprovalStatus: existing.approvalStatus,
          approvedName,
          approvedQuantity,
          approvedUnitLabel,
          approvedUnitPrice: toMoney(approvedUnitPrice),
          approvedVatRate,
          invoiceable,
          customerVisible,
          reason,
        },
      });
    });

    revalidateAssignmentMaterialApproval(assignmentId);
    return { success: true };
  } catch (error) {
    return { success: false, message: (error as Error).message };
  }
}
