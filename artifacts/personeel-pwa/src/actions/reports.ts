"use server";

import { db } from "@workspace/db";
import {
  reportsTable,
  assignmentsTable,
  assignmentPersonnelTable,
  assignmentReportNoteAttachmentsTable,
  assignmentReportNotesTable,
  personnelTable,
  organizationSettingsTable,
} from "@workspace/db";
import { eq, and, inArray, desc, asc } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { sendEmail, buildReportSubmittedEmail } from "@/lib/email";

export type ReportNoteAttachment = {
  id:          string;
  storagePath: string;
  signedUrl:   string | null;
  fileName:    string;
  mimeType:    string | null;
  fileSize:    number | null;
  createdAt:   string;
};

export type ReportNote = {
  id:          string;
  body:        string;
  authorName:  string;
  createdAt:   string;
  attachments: ReportNoteAttachment[];
};

export type ReportNoteAttachmentInput = {
  storagePath: string;
  fileName:    string;
  mimeType?:   string | null;
  fileSize?:   number | null;
};

export type ReportNoteInput = {
  body:         string;
  attachments?: ReportNoteAttachmentInput[];
};

const LOCKED_REPORT_NOTE_STATUSES = new Set([
  "invoice_ready",
  "invoiced",
  "paid",
  "closed",
]);

// ─── Types ─────────────────────────────────────────────────────────────────────

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

async function getAuthAndPersonnel(): Promise<{ userId: string; personnelId: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select({ id: personnelTable.id })
    .from(personnelTable)
    .where(eq(personnelTable.userId, user.id))
    .limit(1);

  if (!row) return null;
  return { userId: user.id, personnelId: row.id };
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

async function createSignedAttachmentUrl(storagePath: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.storage
      .from("assignment-photos")
      .createSignedUrl(storagePath, 3600);

    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

function normalizeAttachmentInput(
  assignmentId: string,
  input: ReportNoteAttachmentInput,
): ReportNoteAttachmentInput | null {
  const storagePath = input.storagePath.trim();
  const fileName = input.fileName.trim();
  const prefix = `${assignmentId}/report-notes/`;

  if (!storagePath || !storagePath.startsWith(prefix)) return null;
  if (!fileName) return null;

  return {
    storagePath,
    fileName,
    mimeType: input.mimeType?.trim() || null,
    fileSize: Number.isFinite(input.fileSize ?? NaN) ? Math.max(0, Math.round(input.fileSize!)) : null,
  };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

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

// ─── Report status map ────────────────────────────────────────────────────────

/**
 * Batch-fetch report statuses for a list of assignment IDs, scoped to the
 * logged-in user. Returns a map of assignmentId -> report status string.
 * Used by the assignment overview to show "ingediend/goedgekeurd/afgewezen" badges.
 */
export async function getReportNotesForAssignment(
  assignmentId: string,
): Promise<ReportNote[]> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return [];

  const linked = await isLinkedToAssignment(auth.personnelId, assignmentId);
  if (!linked) return [];

  const notes = await db
    .select({
      id:        assignmentReportNotesTable.id,
      body:      assignmentReportNotesTable.body,
      createdAt: assignmentReportNotesTable.createdAt,
    })
    .from(assignmentReportNotesTable)
    .where(eq(assignmentReportNotesTable.assignmentId, assignmentId))
    .orderBy(desc(assignmentReportNotesTable.createdAt));

  if (notes.length === 0) return [];

  const noteIds = notes.map((note) => note.id);
  const attachmentRows = await db
    .select({
      id:          assignmentReportNoteAttachmentsTable.id,
      noteId:      assignmentReportNoteAttachmentsTable.noteId,
      storagePath: assignmentReportNoteAttachmentsTable.storagePath,
      fileName:    assignmentReportNoteAttachmentsTable.fileName,
      mimeType:    assignmentReportNoteAttachmentsTable.mimeType,
      fileSize:    assignmentReportNoteAttachmentsTable.fileSize,
      createdAt:   assignmentReportNoteAttachmentsTable.createdAt,
    })
    .from(assignmentReportNoteAttachmentsTable)
    .where(inArray(assignmentReportNoteAttachmentsTable.noteId, noteIds))
    .orderBy(asc(assignmentReportNoteAttachmentsTable.createdAt));

  const attachments = await Promise.all(
    attachmentRows.map(async (attachment) => ({
      id:          attachment.id,
      noteId:      attachment.noteId,
      storagePath: attachment.storagePath,
      signedUrl:   await createSignedAttachmentUrl(attachment.storagePath),
      fileName:    attachment.fileName,
      mimeType:    attachment.mimeType ?? null,
      fileSize:    attachment.fileSize ?? null,
      createdAt:   attachment.createdAt.toISOString(),
    })),
  );

  return notes.map((note) => ({
    id:          note.id,
    body:        note.body,
    authorName:  "Veele Services",
    createdAt:   note.createdAt.toISOString(),
    attachments: attachments
      .filter((attachment) => attachment.noteId === note.id)
      .map(({ noteId: _noteId, ...attachment }) => attachment),
  }));
}

export async function getMyReportStatusMap(
  assignmentIds: string[],
): Promise<Record<string, string>> {
  if (assignmentIds.length === 0) return {};

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};

  const rows = await db
    .select({
      assignmentId: reportsTable.assignmentId,
      status:       reportsTable.status,
    })
    .from(reportsTable)
    .where(
      and(
        eq(reportsTable.submittedBy, user.id),
        inArray(reportsTable.assignmentId, assignmentIds),
      ),
    );

  return Object.fromEntries(rows.map((r) => [r.assignmentId, r.status]));
}

// ─── Pending assignments query ─────────────────────────────────────────────────

export type AssignmentAwaitingReport = {
  id:            string;
  code:          string;
  title:         string;
  scheduledDate: string | null;
  status:        "completed" | "not_completed";
};

/**
 * Fetch assignments that are in 'completed' or 'not_completed' status
 * and do not yet have a report submitted by the logged-in user.
 * Used in the /uren page to prompt workers to log their hours.
 */
export async function getMyAssignmentsAwaitingReport(): Promise<AssignmentAwaitingReport[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const personnelId = await getPersonnelId();
  if (!personnelId) return [];

  // Fetch assignments linked to this worker that are awaiting a report
  const { data: apRows } = await supabase
    .from("assignment_personnel")
    .select(`
      assignments!inner(
        id, code, title, scheduled_date, status
      )
    `)
    .eq("personnel_id", personnelId)
    .eq("status", "assigned")
    .in("assignments.status", ["completed", "not_completed"]);

  if (!apRows || apRows.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidates = (apRows as any[]).map((row) => {
    const a = row.assignments;
    return {
      id:            a.id as string,
      code:          (a.code ?? "") as string,
      title:         a.title as string,
      scheduledDate: (a.scheduled_date ?? null) as string | null,
      status:        a.status as "completed" | "not_completed",
    };
  });

  if (candidates.length === 0) return [];

  // Filter out assignments that already have a report from this user
  const assignmentIds = candidates.map((c) => c.id);
  const existingReports = await db
    .select({ assignmentId: reportsTable.assignmentId })
    .from(reportsTable)
    .where(
      and(
        eq(reportsTable.submittedBy, user.id),
        inArray(reportsTable.assignmentId, assignmentIds),
      ),
    );

  const reportedIds = new Set(existingReports.map((r) => r.assignmentId));

  return candidates
    .filter((c) => !reportedIds.has(c.id))
    .sort((a, b) => (b.scheduledDate ?? "").localeCompare(a.scheduledDate ?? ""));
}

// ─── Mutations ──────────────────────────────────────────────────────────────

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
export async function addReportNote(
  assignmentId: string,
  input: ReportNoteInput,
): Promise<{ success: boolean; note?: ReportNote; error?: string }> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return { success: false, error: "Niet ingelogd" };

  const linked = await isLinkedToAssignment(auth.personnelId, assignmentId);
  if (!linked) return { success: false, error: "Niet gekoppeld aan deze opdracht" };

  const body = input.body.trim();
  if (!body) return { success: false, error: "Notitie is verplicht" };

  const [assignment] = await db
    .select({ status: assignmentsTable.status })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, assignmentId))
    .limit(1);

  if (!assignment) return { success: false, error: "Opdracht niet gevonden" };
  if (LOCKED_REPORT_NOTE_STATUSES.has(assignment.status)) {
    return { success: false, error: "Deze werkbon is afgesloten voor rapportage" };
  }

  const normalizedAttachments = (input.attachments ?? []).map((attachment) =>
    normalizeAttachmentInput(assignmentId, attachment),
  );
  if (normalizedAttachments.some((attachment) => attachment === null)) {
    return { success: false, error: "Bijlage kon niet worden gekoppeld" };
  }

  try {
    const { note, attachments } = await db.transaction(async (tx) => {
      const [createdNote] = await tx
        .insert(assignmentReportNotesTable)
        .values({
          assignmentId,
          body,
          createdBy: auth.userId,
        })
        .returning({
          id:        assignmentReportNotesTable.id,
          body:      assignmentReportNotesTable.body,
          createdAt: assignmentReportNotesTable.createdAt,
        });

      const createdAttachments = normalizedAttachments.length > 0
        ? await tx
            .insert(assignmentReportNoteAttachmentsTable)
            .values(normalizedAttachments.map((attachment) => ({
              noteId:      createdNote!.id,
              assignmentId,
              storagePath: attachment!.storagePath,
              fileName:    attachment!.fileName,
              mimeType:    attachment!.mimeType ?? null,
              fileSize:    attachment!.fileSize ?? null,
              uploadedBy:   auth.userId,
            })))
            .returning({
              id:          assignmentReportNoteAttachmentsTable.id,
              storagePath: assignmentReportNoteAttachmentsTable.storagePath,
              fileName:    assignmentReportNoteAttachmentsTable.fileName,
              mimeType:    assignmentReportNoteAttachmentsTable.mimeType,
              fileSize:    assignmentReportNoteAttachmentsTable.fileSize,
              createdAt:   assignmentReportNoteAttachmentsTable.createdAt,
            })
        : [];

      return { note: createdNote!, attachments: createdAttachments };
    });

    const signedAttachments = await Promise.all(
      attachments.map(async (attachment) => ({
        id:          attachment.id,
        storagePath: attachment.storagePath,
        signedUrl:   await createSignedAttachmentUrl(attachment.storagePath),
        fileName:    attachment.fileName,
        mimeType:    attachment.mimeType ?? null,
        fileSize:    attachment.fileSize ?? null,
        createdAt:   attachment.createdAt.toISOString(),
      })),
    );

    revalidatePath(`/opdrachten/${assignmentId}`);
    return {
      success: true,
      note:    {
        id:          note.id,
        body:        note.body,
        authorName:  "Veele Services",
        createdAt:   note.createdAt.toISOString(),
        attachments: signedAttachments,
      },
    };
  } catch {
    return { success: false, error: "Notitie opslaan mislukt" };
  }
}

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

    // Notify org admin — fire-and-forget
    const [person] = await db
      .select({ firstName: personnelTable.firstName, lastName: personnelTable.lastName })
      .from(personnelTable)
      .where(eq(personnelTable.id, personnelId))
      .limit(1);

    void (async () => {
      const [orgSettings] = await db
        .select({ emailAfzender: organizationSettingsTable.emailAfzender })
        .from(organizationSettingsTable)
        .limit(1);
      if (orgSettings?.emailAfzender) {
        const [assignment] = await db
          .select({ title: assignmentsTable.title })
          .from(assignmentsTable)
          .where(eq(assignmentsTable.id, assignmentId))
          .limit(1);
        const { subject, html } = buildReportSubmittedEmail({
          personnelName:   `${person?.firstName ?? ""} ${person?.lastName ?? ""}`.trim(),
          assignmentTitle: assignment?.title ?? assignmentId,
          assignmentId,
        });
        await sendEmail({ to: orgSettings.emailAfzender, subject, html });
      }
    })();

    revalidatePath("/opdrachten");
    revalidatePath(`/opdrachten/${assignmentId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Rapport indienen mislukt. Probeer het opnieuw." };
  }
}
