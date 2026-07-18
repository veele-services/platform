import { pool } from "./connection";

export type StaffingLifecycleAction = "assign" | "unassign";

export type StaffingLifecycleResult = {
  assignmentPersonnelId: string;
  staffingStatus: string;
  lifecycleVersion: number;
  assignedCount: number;
  requiredPersonnelCount: number;
  assignmentStatus: string;
  idempotent: boolean;
};

export async function transitionAssignmentStaffing(input: {
  tenantId: string;
  assignmentId: string;
  personnelId: string;
  actorUserId: string;
  action: StaffingLifecycleAction;
  reason?: string | null;
  expectedVersion?: number | null;
}): Promise<StaffingLifecycleResult> {
  const result = await pool.query(
    `select * from public.transition_assignment_staffing($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.tenantId,
      input.assignmentId,
      input.personnelId,
      input.actorUserId,
      input.action,
      input.reason?.trim() || null,
      input.expectedVersion ?? null,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Staffing transition returned no result");
  return {
    assignmentPersonnelId: row.assignment_personnel_id,
    staffingStatus: row.staffing_status,
    lifecycleVersion: Number(row.lifecycle_version),
    assignedCount: Number(row.assigned_count),
    requiredPersonnelCount: Number(row.required_personnel_count),
    assignmentStatus: row.assignment_status,
    idempotent: Boolean(row.idempotent),
  };
}

export async function cancelAssignmentStaffing(input: {
  tenantId: string;
  assignmentId: string;
  actorUserId: string;
  reason: string;
}): Promise<{ cancelledLinks: number; assignmentStatus: string; idempotent: boolean }> {
  const result = await pool.query(
    `select * from public.cancel_assignment_staffing($1, $2, $3, $4)`,
    [input.tenantId, input.assignmentId, input.actorUserId, input.reason.trim()],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Assignment cancellation returned no result");
  return {
    cancelledLinks: Number(row.cancelled_links),
    assignmentStatus: row.assignment_status,
    idempotent: Boolean(row.idempotent),
  };
}
