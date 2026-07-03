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

export async function approveReportAfterMaterialReview(reportId: string): Promise<ActionResult> {
  const tenantId = await requireCurrentTenantId();
  const [pending] = rowsFrom<{ count: number }>(await db.execute(sql`
    SELECT count(usage.id)::int AS count
    FROM reports
    JOIN assignments ON assignments.id = reports.assignment_id
    JOIN assignment_material_usage usage ON usage.assignment_id = assignments.id
    WHERE reports.id = ${reportId}::uuid
      AND assignments.tenant_id = ${tenantId}::uuid
      AND usage.approval_status = 'pending'
  `));

  const pendingCount = pending?.count ?? 0;
  if (pendingCount > 0) {
    return {
      success: false,
      message: `Beoordeel eerst ${pendingCount} materiaalregel${pendingCount === 1 ? "" : "s"} voordat je dit rapport goedkeurt.`,
    };
  }

  return approveReport(reportId);
}
