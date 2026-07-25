import { pool } from "./connection";
import { getCanonicalPlanningEligibility } from "./planning-eligibility";

export type InterestSelectionStatus = "selected" | "reserve" | "cancelled";

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

type StaffingRpcRow = {
  assignment_personnel_id: string;
  staffing_status: string;
  lifecycle_version: string | number;
  assigned_count: string | number;
  required_personnel_count: string | number;
  assignment_status: string;
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

  const eligibility = status === "selected"
    ? await getCanonicalPlanningEligibility(tenantId, assignmentId)
    : null;
  if (status === "selected") {
    const candidate = eligibility?.candidates.find((row) => row.personnelId === personnelId);
    if (!candidate?.eligible) {
      throw Object.assign(
        new Error("Medewerker voldoet niet aan de canonieke beschikbaarheids- en geschiktheidscontrole."),
        { code: "canonical_eligibility_failed" },
      );
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const assignmentResult = await client.query<{
      id: string;
      tenant_id: string;
      status: string;
      required_personnel_count: number;
    }>(
      `SELECT id, tenant_id, status, required_personnel_count
         FROM public.assignments
        WHERE id = $1 AND tenant_id = $2 AND is_active = true
        FOR UPDATE`,
      [assignmentId, tenantId],
    );
    const assignment = assignmentResult.rows[0];
    if (!assignment) {
      throw Object.assign(new Error("Opdracht niet gevonden."), { code: "assignment_not_found" });
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
    if (!response) {
      throw Object.assign(
        new Error("Deze medewerker heeft nog geen interesse-uitnodiging voor deze opdracht."),
        { code: "response_not_found" },
      );
    }

    const personnelResult = await client.query<{ id: string }>(
      `SELECT id
         FROM public.personnel
        WHERE id = $1 AND tenant_id = $2
        FOR UPDATE`,
      [personnelId, tenantId],
    );
    if (!personnelResult.rows[0]) {
      throw Object.assign(new Error("Medewerker niet gevonden."), { code: "personnel_not_found" });
    }

    await client.query(
      `SELECT id
         FROM public.assignment_personnel
        WHERE assignment_id = $1
        ORDER BY personnel_id, assigned_at, id
        FOR UPDATE`,
      [assignmentId],
    );

    const responseAlreadyFinal =
      response.status === status
      || (status === "selected" && response.status === "confirmed");
    let transition: StaffingRpcRow | null = null;

    if (status === "selected") {
      const transitionResult = await client.query<StaffingRpcRow>(
        `SELECT * FROM public.transition_assignment_staffing($1, $2, $3, $4, 'assign', NULL, NULL)`,
        [tenantId, assignmentId, personnelId, actorUserId],
      );
      transition = transitionResult.rows[0] ?? null;
      await client.query(
        `UPDATE public.assignment_interest_responses
            SET status = 'confirmed',
                selected_at = COALESCE(selected_at, now()),
                updated_at = now()
          WHERE id = $1`,
        [response.id],
      );
    } else if (status === "reserve") {
      const activeLink = await client.query<{ id: string }>(
        `SELECT id
           FROM public.assignment_personnel
          WHERE assignment_id = $1
            AND personnel_id = $2
            AND status IN ('assigned','suggested')
          LIMIT 1`,
        [assignmentId, personnelId],
      );
      if (activeLink.rows[0]) {
        const transitionResult = await client.query<StaffingRpcRow>(
          `SELECT * FROM public.transition_assignment_staffing($1, $2, $3, $4, 'unassign', $5, NULL)`,
          [tenantId, assignmentId, personnelId, actorUserId, "Naar de reservelijst verplaatst"],
        );
        transition = transitionResult.rows[0] ?? null;
      }
      await client.query(
        `UPDATE public.assignment_interest_responses
            SET status = 'reserve',
                selected_at = COALESCE(selected_at, now()),
                updated_at = now()
          WHERE id = $1`,
        [response.id],
      );
    } else {
      await client.query(
        `UPDATE public.assignment_interest_responses
            SET status = 'cancelled',
                updated_at = now()
          WHERE id = $1`,
        [response.id],
      );

      const activeLink = await client.query<{ id: string }>(
        `SELECT id
           FROM public.assignment_personnel
          WHERE assignment_id = $1
            AND personnel_id = $2
            AND status IN ('assigned','suggested')
          LIMIT 1`,
        [assignmentId, personnelId],
      );
      if (activeLink.rows[0]) {
        const transitionResult = await client.query<StaffingRpcRow>(
          `SELECT * FROM public.transition_assignment_staffing($1, $2, $3, $4, 'unassign', $5, NULL)`,
          [tenantId, assignmentId, personnelId, actorUserId, "Interesseselectie geannuleerd"],
        );
        transition = transitionResult.rows[0] ?? null;
      }
    }

    const countResult = await client.query<{ count: string }>(
      `SELECT count(*)::integer AS count
         FROM public.assignment_personnel
        WHERE assignment_id = $1 AND status = 'assigned'`,
      [assignmentId],
    );
    const assignedCount = transition
      ? Number(transition.assigned_count)
      : Number(countResult.rows[0]?.count ?? 0);
    const requiredPersonnelCount = transition
      ? Number(transition.required_personnel_count)
      : assignment.required_personnel_count;
    const assignmentStatus = transition?.assignment_status ?? assignment.status;
    const canonicalAssignmentLinked = transition?.staffing_status === "assigned";
    const idempotent = responseAlreadyFinal && (transition?.idempotent ?? true);

    if (!idempotent) {
      await client.query(
        `INSERT INTO public.audit_log (tenant_id, user_id, action, resource, resource_id, metadata)
         VALUES ($1, $2, $3, 'assignments', $4, $5::jsonb)`,
        [
          tenantId,
          actorUserId,
          `assignment_interest_${status}`,
          assignmentId,
          JSON.stringify({
            personnelId,
            responseId: response.id,
            assignmentPersonnelId: transition?.assignment_personnel_id ?? null,
            assignedCount,
            requiredPersonnelCount,
            canonicalAssignmentLinked,
          }),
        ],
      );
    }

    await client.query("COMMIT");
    return {
      assignmentId,
      personnelId,
      responseId: response.id,
      tenantId,
      status,
      canonicalAssignmentLinked,
      assignedCount,
      requiredPersonnelCount,
      assignmentStatus,
      idempotent,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    const detail =
      typeof error === "object" &&
      error !== null &&
      "detail" in error &&
      typeof error.detail === "string"
        ? error.detail
        : null;
    if (detail === "assignment_capacity_full") {
      throw Object.assign(new Error("Deze opdracht is al volledig bezet."), {
        code: "assignment_capacity_full",
      });
    }
    throw error;
  } finally {
    client.release();
  }
}
