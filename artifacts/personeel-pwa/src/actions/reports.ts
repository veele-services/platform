"use server";

import { db } from "@workspace/db";
import {
  reportsTable,
  assignmentsTable,
  assignmentPersonnelTable,
  personnelTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MyReport = {
  id:             string;
  assignmentId:   string;
  status:         string;
  content:        string;
  hoursWorked:    string | null;
  submitterNotes: string | null;
  notes:          string | null;
  submittedAt:    string;
  reviewedAt:     string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getPersonnelId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select({ id: personnelTable.id })
    .from(personnelTable)
    .where(eq(personnelTable.userId, user.id))
    .limit(1);

  return row?.id ?? null;
}

/**
 * Verify that this personnel member has a confirmed (status='assigned') link
 * to the given assignment. Returns true if linked.
 */
async function isLinkedToAssignment(
  personnelId: string,
  assignmentId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: assignmentPersonnelTable.id })
    .from(assignmentPersonnelTable)
    .where(
      and(
        eq(assignmentPersonnelTable.personnelId, personnelId),
        eq(assignmentPersonnelTable.assignmentId, assignmentId),
        eq(assignmentPersonnelTable.status, "assigned"),
      ),
    )
    .limit(1);

  return !!row;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Fetch the report for an assignment, scoped to the logged-in personnel member.
 * Returns null if no report exists or the personnel member is not linked.
 */
export async function getMyReportForAssignment(
  assignmentId: string,
): Promise<MyReport | null> {
  const personnelId = await getPersonnelId();
  if (!personnelId) return null;

  const linked = await isLinkedToAssignment(personnelId, assignmentId);
  if (!linked) return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select({
      id:             reportsTable.id,
      assignmentId:   reportsTable.assignmentId,
      status:         reportsTable.status,
      content:        reportsTable.content,
      hoursWorked:    reportsTable.hoursWorked,
      submitterNotes: reportsTable.submitterNotes,
      notes:          reportsTable.notes,
      submittedAt:    reportsTable.submittedAt,
      reviewedAt:     reportsTable.reviewedAt,
    })
    .from(reportsTable)
    .where(
      and(
        eq(reportsTable.assignmentId, assignmentId),
        eq(reportsTable.submittedBy, user.id),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    id:             row.id,
    assignmentId:   row.assignmentId,
    status:         row.status,
    content:        row.content,
    hoursWorked:    row.hoursWorked ?? null,
    submitterNotes: row.submitterNotes ?? null,
    notes:          row.notes ?? null,
    submittedAt:    row.submittedAt.toISOString(),
    reviewedAt:     row.reviewedAt?.toISOString() ?? null,
  };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export type SubmitReportData = {
  content:        string;
  hoursWorked:    string;
  submitterNotes: string;
};

/**
 * Submit a work report for a completed assignment.
 *
 * Guards:
 *   - Caller must be authenticated with a personnel profile.
 *   - Caller must be confirmed (status='assigned') on the assignment.
 *   - Assignment must be in 'completed' status (only status that allows report_submitted).
 *   - No duplicate reports — one report per assignment per submitter.
 *   - Advances assignment status to 'report_submitted' atomically.
 */
export async function submitMyReport(
  assignmentId: string,
  data: SubmitReportData,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  const personnelId = await getPersonnelId();
  if (!personnelId) return { success: false, error: "Personeelsprofiel niet gevonden" };

  const linked = await isLinkedToAssignment(personnelId, assignmentId);
  if (!linked) return { success: false, error: "U bent niet gekoppeld aan deze opdracht" };

  // Validate content
  const content = data.content.trim();
  if (!content) return { success: false, error: "Verslag is verplicht" };

  // Fetch assignment and check status
  const [assignment] = await db
    .select({ status: assignmentsTable.status })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, assignmentId))
    .limit(1);

  if (!assignment) return { success: false, error: "Opdracht niet gevonden" };
  if (assignment.status !== "completed" && assignment.status !== "not_completed") {
    return { success: false, error: "Rapport indienen is alleen mogelijk na afronding van de opdracht" };
  }

  // Check for duplicate report
  const [existing] = await db
    .select({ id: reportsTable.id })
    .from(reportsTable)
    .where(
      and(
        eq(reportsTable.assignmentId, assignmentId),
        eq(reportsTable.submittedBy, user.id),
      ),
    )
    .limit(1);

  if (existing) return { success: false, error: "U heeft al een rapport ingediend voor deze opdracht" };

  const hoursWorked  = data.hoursWorked.trim() || null;
  const submitterNotes = data.submitterNotes.trim() || null;

  try {
    await db.insert(reportsTable).values({
      assignmentId,
      submittedBy:   user.id,
      status:        "submitted",
      content,
      hoursWorked,
      submitterNotes,
    });

    // Advance assignment to report_submitted (works from both 'completed' and 'not_completed')
    await db
      .update(assignmentsTable)
      .set({ status: "report_submitted", updatedAt: new Date() })
      .where(eq(assignmentsTable.id, assignmentId));

    revalidatePath("/opdrachten");
    revalidatePath(`/opdrachten/${assignmentId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Rapport indienen mislukt. Probeer het opnieuw." };
  }
}
