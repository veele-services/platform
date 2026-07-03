"use server";

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import { approveReport, type ActionResult } from "./reports";

type SqlResult<T> = { rows?: T[] } | T[];

function rowsFrom<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const maybeRows = (result as SqlResult<T> | null)?.rows;
  return Array.isArray(maybeRows) ? maybeRows : [];
}

function reviewMessage(materialCount: number, inventoryCount: number): string {
  const parts: string[] = [];
  if (materialCount > 0) {
    parts.push(`${materialCount} materiaalregel${materialCount === 1 ? "" : "s"}`);
  }
  if (inventoryCount > 0) {
    parts.push(`${inventoryCount} inventarisregel${inventoryCount === 1 ? "" : "s"}`);
  }
  return `Beoordeel eerst ${parts.join(" en ")} voordat je dit rapport goedkeurt.`;
}

export async function approveReportAfterMaterialReview(reportId: string): Promise<ActionResult> {
  const tenantId = await requireCurrentTenantId();
  const [pendingMaterial] = rowsFrom<{ count: number }>(await db.execute(sql`
    SELECT count(usage.id)::int AS count
    FROM reports
    JOIN assignments ON assignments.id = reports.assignment_id
    JOIN assignment_material_usage usage ON usage.assignment_id = assignments.id
    WHERE reports.id = ${reportId}::uuid
      AND assignments.tenant_id = ${tenantId}::uuid
      AND usage.approval_status = 'pending'
  `));

  const [pendingInventory] = rowsFrom<{ count: number }>(await db.execute(sql`
    SELECT count(link.id)::int AS count
    FROM reports
    JOIN assignments ON assignments.id = reports.assignment_id
    JOIN assignment_inventory_items link ON link.assignment_id = assignments.id
    WHERE reports.id = ${reportId}::uuid
      AND assignments.tenant_id = ${tenantId}::uuid
      AND link.approval_status = 'pending'
  `));

  const pendingMaterialCount = pendingMaterial?.count ?? 0;
  const pendingInventoryCount = pendingInventory?.count ?? 0;
  if (pendingMaterialCount > 0 || pendingInventoryCount > 0) {
    return {
      success: false,
      message: reviewMessage(pendingMaterialCount, pendingInventoryCount),
    };
  }

  return approveReport(reportId);
}
