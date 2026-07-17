import { pool } from "./connection";
import { getCanonicalPlanningEligibility } from "./planning-eligibility";

export type InterestSelectionStatus = "selected" | "reserve" | "cancelled";

const ACTIVE_ASSIGNMENT_PERSONNEL_STATUSES = ["assigned"] as const;

export type InterestSelectionStaffingResult = {
  assignmentId: string;
  personnelId: string;
  responseId: string;
  tenantId: string;
  status: InterestSelectionStatus;
  canonicalAssignmentLinked: boolean;
  assignedCount: number;
  requiredPersonnelCount: number;
  assignmentStatus: string;
  idempotent: boolean;
};

export async function selectInterestCandidateCanonically(input: {
  tenantId: string;
  assignmentId: string;
  personnelId: string;
  status: InterestSelectionStatus;
  actorUserId: string;
}): Promise<InterestSelectionStaffingResult> {
  const { tenantId, assignmentId, personnelId, status, actorUserId } = input;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const assignmentResult = await client.query<{
      id: string;
      tenant_id: string;
      status: string;
      required_personnel_count: number;
      scheduled_date: string | null;
      scheduled_start: string | null;
      scheduled_end: string | null;
    }>(
      `SELECT id, tenant_id, status, required_personnel_count, scheduled_date, scheduled_start, scheduled_end
         FROM public.assignments
        WHERE id = $1 AND tenant_id = $2 AND is_active = true
        FOR UPDATE`,
      [assignmentId, tenantId],
    );
    const assignment = assignmentResult.rows[0];
    if (!assignment) throw Object.assign(new Error("Opdracht niet gevonden."), { code: "assignment_not_found" });

    const eligibility = status === "selected"
      ? await getCanonicalPlanningEligibility(assignmentId)
      : null;
    if (status === "selected") {
      const candidate = eligibility?.candidates.find((row) => row.personnelId === personnelId);
      if (!candidate?.eligible) {
        throw Object.assign(new Error("Medewerker voldoet niet aan de canonieke beschikbaarheids- en geschiktheidscontrole."), {
          code: "canonical_eligibility_failed",
        });
      }
    }

    const responseResult = await client.query<{
      id: string;
      status: string;
      tenant_id: string;
      personnel_id: string;
      assignment_id: string;
    }>(
      `SELECT r.id, r.status, r.tenant_id, r.personnel_id, r.assignment_id
         FROM public.assignment_interest_responses r
        WHERE r.assignment_id = $1
          AND r.personnel_id = $2
          AND r.tenant_id = $3
        ORDER BY r.created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [assignmentId, personnelId, tenantId],
    );
    const response = responseResult.rows[0];
    if (!response) throw Object.assign(new Error("Deze medewerker heeft nog geen interesse-uitnodiging voor deze opdracht."), { code: "response_not_found" });

    const personnelResult = await client.query<{ id: string }>(
      `SELECT id
         FROM public.personnel
        WHERE id = $1 AND tenant_id = $2 AND is_active = true
        FOR UPDATE`,
      [personnelId, tenantId],
    );
    if (!personnelResult.rows[0]) throw Object.assign(new Error("Medewerker niet gevonden of inactief."), { code: "personnel_not_active" });

    await client.query(
      `SELECT ap.id
         FROM public.assignment_personnel ap
         JOIN public.assignments a ON a.id = ap.assignment_id AND a.tenant_id = $2
        WHERE ap.assignment_id = $1
        FOR UPDATE`,
      [assignmentId, tenantId],
    );

    let canonicalAssignmentLinked = false;
    const idempotent = response.status === status || (status === "selected" && response.status === "confirmed");

    if (status === "reserve") {
      await client.query(
        `UPDATE public.assignment_interest_responses
            SET status = 'reserve', selected_at = COALESCE(selected_at, now()), updated_at = now()
          WHERE id = $1`,
        [response.id],
      );
    } else if (status === "cancelled") {
      await client.query(
        `UPDATE public.assignment_interest_responses
            SET status = 'cancelled', selected_at = NULL, updated_at = now()
          WHERE id = $1`,
        [response.id],
      );
      const executionResult = await client.query<{ id: string; participant_status: string }>(
        `SELECT id, participant_status
           FROM public.assignment_participant_executions
          WHERE assignment_id = $1 AND personnel_id = $2 AND tenant_id = $3
          FOR UPDATE`,
        [assignmentId, personnelId, tenantId],
      );
      const execution = executionResult.rows[0];
      if (execution && !["planned", "removed"].includes(execution.participant_status)) {
        throw Object.assign(new Error("Medewerker kan niet worden afgemeld nadat uitvoering is gestart."), { code: "assignment_execution_started" });
      }

      await client.query(
        `UPDATE public.assignment_personnel
            SET status = 'cancelled', updated_at = now()
          WHERE assignment_id = $1 AND personnel_id = $2 AND status = 'assigned'`,
        [assignmentId, personnelId],
      );
      await client.query(
        `UPDATE public.assignment_participant_executions
            SET participant_status = 'removed', removed_at = COALESCE(removed_at, now()), updated_at = now(),
                audit_metadata = COALESCE(audit_metadata, '{}'::jsonb) || jsonb_build_object('removed_by', $4::text, 'reason', 'interest_cancelled_before_execution')
          WHERE assignment_id = $1 AND personnel_id = $2 AND tenant_id = $3 AND participant_status = 'planned'`,
        [assignmentId, personnelId, tenantId, actorUserId],
      );
    } else {
      const assignedCountResult = await client.query<{ count: string }>(
        `SELECT count(*)::int AS count
           FROM public.assignment_personnel
          WHERE assignment_id = $1 AND status = ANY($2::text[])`,
        [assignmentId, [...ACTIVE_ASSIGNMENT_PERSONNEL_STATUSES]],
      );
      const assignedCountBefore = Number(assignedCountResult.rows[0]?.count ?? 0);
      const alreadyLinkedResult = await client.query<{ id: string }>(
        `SELECT id FROM public.assignment_personnel
          WHERE assignment_id = $1 AND personnel_id = $2 AND status = 'assigned'
          LIMIT 1`,
        [assignmentId, personnelId],
      );
      const alreadyLinked = Boolean(alreadyLinkedResult.rows[0]);
      if (!alreadyLinked && assignedCountBefore >= assignment.required_personnel_count) {
        throw Object.assign(new Error("Deze opdracht is al volledig bezet."), { code: "assignment_capacity_full" });
      }

      await client.query(
        `INSERT INTO public.assignment_personnel (assignment_id, personnel_id, status, assigned_by)
         VALUES ($1, $2, 'assigned', $3)
         ON CONFLICT (assignment_id, personnel_id)
         DO UPDATE SET status = 'assigned', assigned_by = EXCLUDED.assigned_by, assigned_at = COALESCE(public.assignment_personnel.assigned_at, now())`,
        [assignmentId, personnelId, actorUserId],
      );
      canonicalAssignmentLinked = true;
      await client.query(
        `UPDATE public.assignment_interest_responses
            SET status = 'confirmed', selected_at = COALESCE(selected_at, now()), updated_at = now()
          WHERE id = $1`,
        [response.id],
      );
    }

    const finalCountResult = await client.query<{ count: string }>(
      `SELECT count(*)::int AS count
         FROM public.assignment_personnel
        WHERE assignment_id = $1 AND status = ANY($2::text[])`,
      [assignmentId, [...ACTIVE_ASSIGNMENT_PERSONNEL_STATUSES]],
    );
    const assignedCount = Number(finalCountResult.rows[0]?.count ?? 0);
    const shouldSchedule = assignedCount >= assignment.required_personnel_count;
    const nextStatus = shouldSchedule && ["requested", "plannable"].includes(assignment.status)
      ? "scheduled"
      : (!shouldSchedule && assignment.status === "scheduled" ? "plannable" : assignment.status);

    if (nextStatus !== assignment.status) {
      await client.query(
        `UPDATE public.assignments SET status = $3, updated_at = now() WHERE id = $1 AND tenant_id = $2`,
        [assignmentId, tenantId, nextStatus],
      );
    }

    await client.query(
      `INSERT INTO public.audit_log (tenant_id, user_id, action, resource, resource_id, metadata)
       VALUES ($1, $2, $3, 'assignments', $4, $5::jsonb)`,
      [tenantId, actorUserId, `assignment_interest_${status}`, assignmentId, JSON.stringify({ personnelId, responseId: response.id, assignedCount, requiredPersonnelCount: assignment.required_personnel_count, canonicalAssignmentLinked })],
    );

    await client.query("COMMIT");
    return { assignmentId, personnelId, responseId: response.id, tenantId, status, canonicalAssignmentLinked, assignedCount, requiredPersonnelCount: assignment.required_personnel_count, assignmentStatus: nextStatus, idempotent };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
