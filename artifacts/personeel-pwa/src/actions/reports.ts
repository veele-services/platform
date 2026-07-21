"use server";

import { randomUUID } from "node:crypto";

import { db } from "@workspace/db";
import {
  reportsTable,
  assignmentsTable,
  assignmentPersonnelTable,
  assignmentParticipantExecutionsTable,
  assignmentReportNoteAttachmentsTable,
  assignmentReportNotesTable,
  personnelTable,
  organizationSettingsTable,
  tenantsTable,
  beginOfflineOperation,
  completeOfflineOperation,
  getAssignmentChecklistCompletionIssues,
} from "@workspace/db";
import { eq, and, inArray, desc, asc, ne, isNull } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { sendEmail, buildReportSubmittedEmail } from "@/lib/email";
import {
  ASSIGNMENT_MEDIA_BUCKET,
  MAX_REPORT_NOTE_ATTACHMENTS,
  buildReportNoteAttachmentPath,
  isReportNoteAttachmentPath,
  validateAssignmentMediaDescriptor,
} from "@/lib/uploads/assignment-media";
import type { OfflineActionResult } from "@/lib/offline/offline-action-contract";
import {
  normalizeOfflineServerActionError,
  permanentOfflineActionFailure,
} from "@/lib/offline/offline-action-errors.server";
import {
  personnelWorkOrderIsSigned,
  SIGNED_WORK_ORDER_LOCK_MESSAGE,
} from "@/lib/work-order-lock";

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

export type PrepareReportNoteUploadInput = {
  clientId: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number;
};

export type PreparedReportNoteUpload = {
  clientId:    string;
  storagePath: string;
  signedUrl:   string;
  token:       string;
  fileName:    string;
  mimeType:    string;
  fileSize:    number;
};

export type ReportNoteInput = {
  body:         string;
  attachments?: ReportNoteAttachmentInput[];
  expectedParticipantVersion?: number | null;
  clientMutationId?: string | null;
};

const LOCKED_REPORT_NOTE_STATUSES = new Set([
  "invoice_ready",
  "invoiced",
  "paid",
  "closed",
]);

const DEFAULT_PUBLIC_REPORT_AUTHOR = "Backoffice";

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

async function getPersonnelIdentity(): Promise<{ userId: string; personnelId: string; tenantId: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select({ id: personnelTable.id, tenantId: personnelTable.tenantId })
    .from(personnelTable)
    .where(and(eq(personnelTable.userId, user.id), eq(personnelTable.isActive, true)))
    .limit(1);

  return row ? { userId: user.id, personnelId: row.id, tenantId: row.tenantId } : null;
}

async function getPersonnelId(): Promise<string | null> {
  return (await getPersonnelIdentity())?.personnelId ?? null;
}

async function getAuthAndPersonnel(): Promise<{ userId: string; personnelId: string; tenantId: string } | null> {
  return getPersonnelIdentity();
}

/**
 * Verify that this personnel member has a confirmed (status='assigned') link
 * to the given assignment. Returns true if linked.
 */
async function getLinkedAssignmentExecution(
  personnelId: string,
  tenantId: string,
  assignmentId: string,
): Promise<{ assignmentPersonnelId: string; executionId: string | null } | null> {
  const [row] = await db
    .select({ assignmentPersonnelId: assignmentPersonnelTable.id, executionId: assignmentParticipantExecutionsTable.id })
    .from(assignmentPersonnelTable)
    .innerJoin(assignmentsTable, eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id))
    .leftJoin(
      assignmentParticipantExecutionsTable,
      and(
        eq(assignmentParticipantExecutionsTable.assignmentPersonnelId, assignmentPersonnelTable.id),
        ne(assignmentParticipantExecutionsTable.participantStatus, "removed"),
      ),
    )
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

async function isLinkedToAssignment(
  personnelId: string,
  tenantId: string,
  assignmentId: string,
): Promise<boolean> {
  return Boolean(await getLinkedAssignmentExecution(personnelId, tenantId, assignmentId));
}

async function createSignedAttachmentUrl(
  storagePath: string,
  tenantId: string,
  assignmentId: string,
): Promise<string | null> {
  if (!isReportNoteAttachmentPath(tenantId, assignmentId, storagePath)) return null;

  try {
    const admin = createAdminClient();
    const { data } = await admin.storage
      .from(ASSIGNMENT_MEDIA_BUCKET)
      .createSignedUrl(storagePath, 3600);

    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

async function getAssignmentTenantName(assignmentId: string): Promise<string> {
  const [row] = await db
    .select({ tenantName: tenantsTable.name })
    .from(assignmentsTable)
    .innerJoin(tenantsTable, eq(assignmentsTable.tenantId, tenantsTable.id))
    .where(eq(assignmentsTable.id, assignmentId))
    .limit(1);

  return row?.tenantName ?? DEFAULT_PUBLIC_REPORT_AUTHOR;
}

function normalizeAttachmentInput(
  tenantId: string,
  assignmentId: string,
  input: ReportNoteAttachmentInput,
): ReportNoteAttachmentInput | null {
  const storagePath = input.storagePath.trim();
  const fileName = input.fileName.trim();

  if (!storagePath || !isReportNoteAttachmentPath(tenantId, assignmentId, storagePath)) return null;
  if (!fileName) return null;

  const validation = validateAssignmentMediaDescriptor({
    fileName,
    mimeType: input.mimeType ?? null,
    fileSize: input.fileSize ?? null,
  });
  if (!validation.valid) return null;

  return {
    storagePath,
    fileName: validation.fileName,
    mimeType: validation.mimeType,
    fileSize: validation.fileSize,
  };
}

function uniqueUploadId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

async function verifyUploadedAssignmentMedia(input: {
  storagePath: string;
  mimeType: string;
  fileSize: number;
}): Promise<boolean> {
  const parts = input.storagePath.split("/");
  const fileName = parts.pop();
  const prefix = parts.join("/");
  if (!fileName || !prefix) return false;

  const { data, error } = await createAdminClient()
    .storage
    .from(ASSIGNMENT_MEDIA_BUCKET)
    .list(prefix, { limit: 20, search: fileName });

  if (error || !data) return false;
  const object = data.find((item) => item.name === fileName);
  if (!object) return false;

  const metadata = object.metadata as
    | { mimetype?: unknown; mimeType?: unknown; size?: unknown; contentLength?: unknown }
    | null
    | undefined;
  const storedMimeType = String(metadata?.mimetype ?? metadata?.mimeType ?? "").toLowerCase();
  const storedSize = Number(metadata?.size ?? metadata?.contentLength);

  if (storedMimeType && storedMimeType !== input.mimeType.toLowerCase()) return false;
  if (Number.isFinite(storedSize) && storedSize > 0 && Math.abs(storedSize - input.fileSize) > 1024) {
    return false;
  }

  return true;
}

export async function prepareReportNoteAttachmentUploads(
  assignmentId: string,
  files: PrepareReportNoteUploadInput[],
): Promise<{ success: boolean; uploads?: PreparedReportNoteUpload[]; error?: string }> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return { success: false, error: "Niet ingelogd" };

  const linked = await isLinkedToAssignment(auth.personnelId, auth.tenantId, assignmentId);
  if (!linked) return { success: false, error: "Niet gekoppeld aan deze opdracht" };

  if (files.length === 0) return { success: true, uploads: [] };
  if (files.length > MAX_REPORT_NOTE_ATTACHMENTS) {
    return { success: false, error: `Maximaal ${MAX_REPORT_NOTE_ATTACHMENTS} bijlagen per notitie toegestaan` };
  }

  const [assignment] = await db
    .select({
      status: assignmentsTable.status,
      tenantId: assignmentsTable.tenantId,
      customerSignedAt: assignmentsTable.customerSignedAt,
      customerSignatureDataUrl: assignmentsTable.customerSignatureDataUrl,
    })
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, auth.tenantId)))
    .limit(1);

  if (!assignment) return { success: false, error: "Opdracht niet gevonden" };
  if (personnelWorkOrderIsSigned(assignment)) {
    return { success: false, error: SIGNED_WORK_ORDER_LOCK_MESSAGE };
  }
  if (LOCKED_REPORT_NOTE_STATUSES.has(assignment.status)) {
    return { success: false, error: "Deze werkbon is afgesloten voor rapportage" };
  }

  const [execution] = await db
    .select({ version: assignmentParticipantExecutionsTable.version })
    .from(assignmentParticipantExecutionsTable)
    .where(and(
      eq(assignmentParticipantExecutionsTable.tenantId, auth.tenantId),
      eq(assignmentParticipantExecutionsTable.assignmentId, assignmentId),
      eq(assignmentParticipantExecutionsTable.personnelId, auth.personnelId),
      ne(assignmentParticipantExecutionsTable.participantStatus, "removed"),
    ))
    .limit(1);
  if (!execution) return { success: false, error: "Uitvoering niet gevonden" };

  const admin = createAdminClient();
  const uploads: PreparedReportNoteUpload[] = [];

  for (const file of files) {
    const validation = validateAssignmentMediaDescriptor({
      fileName: file.fileName,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
    });

    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const storagePath = buildReportNoteAttachmentPath(
      auth.tenantId,
      assignmentId,
      validation.fileName,
      uniqueUploadId(),
    );

    const { data, error } = await admin.storage
      .from(ASSIGNMENT_MEDIA_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      return { success: false, error: "Upload voorbereiden mislukt" };
    }

    uploads.push({
      clientId:    file.clientId,
      storagePath,
      signedUrl:   data.signedUrl,
      token:       data.token,
      fileName:    validation.fileName,
      mimeType:    validation.mimeType,
      fileSize:    validation.fileSize,
    });
  }

  return { success: true, uploads };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Fetch the report for an assignment, scoped to the logged-in personnel member.
 * Returns null if no report exists or the personnel member is not linked.
 */
export async function getMyReportForAssignment(
  assignmentId: string,
): Promise<MyReport | null> {
  const identity = await getPersonnelIdentity();
  if (!identity) return null;

  const linked = await isLinkedToAssignment(identity.personnelId, identity.tenantId, assignmentId);
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

  const linked = await isLinkedToAssignment(auth.personnelId, auth.tenantId, assignmentId);
  if (!linked) return [];

  const [publicAuthorName, notes] = await Promise.all([
    getAssignmentTenantName(assignmentId),
    db
      .select({
        id:        assignmentReportNotesTable.id,
        body:      assignmentReportNotesTable.body,
        createdAt: assignmentReportNotesTable.createdAt,
      })
      .from(assignmentReportNotesTable)
      .where(eq(assignmentReportNotesTable.assignmentId, assignmentId))
      .orderBy(desc(assignmentReportNotesTable.createdAt)),
  ]);

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
      signedUrl:   await createSignedAttachmentUrl(attachment.storagePath, auth.tenantId, assignmentId),
      fileName:    attachment.fileName,
      mimeType:    attachment.mimeType ?? null,
      fileSize:    attachment.fileSize ?? null,
      createdAt:   attachment.createdAt.toISOString(),
    })),
  );

  return notes.map((note) => ({
    id:          note.id,
    body:        note.body,
    authorName:  publicAuthorName,
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

  const identity = await getPersonnelIdentity();
  if (!identity) return {};

  const rows = await db
    .select({
      assignmentId: reportsTable.assignmentId,
      status:       reportsTable.status,
    })
    .from(reportsTable)
    .innerJoin(assignmentsTable, eq(reportsTable.assignmentId, assignmentsTable.id))
    .where(
      and(
        eq(reportsTable.submittedBy, identity.userId),
        eq(assignmentsTable.tenantId, identity.tenantId),
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

  const identity = await getPersonnelIdentity();
  if (!identity) return [];

  const candidates = await db
    .select({
      id:            assignmentsTable.id,
      code:          assignmentsTable.code,
      title:         assignmentsTable.title,
      scheduledDate: assignmentsTable.scheduledDate,
      status:        assignmentsTable.status,
    })
    .from(assignmentPersonnelTable)
    .innerJoin(assignmentsTable, eq(assignmentPersonnelTable.assignmentId, assignmentsTable.id))
    .where(
      and(
        eq(assignmentPersonnelTable.personnelId, identity.personnelId),
        eq(assignmentPersonnelTable.status, "assigned"),
        eq(assignmentsTable.tenantId, identity.tenantId),
        inArray(assignmentsTable.status, ["completed", "not_completed"]),
        isNull(assignmentsTable.customerSignedAt),
        isNull(assignmentsTable.customerSignatureDataUrl),
      ),
    )
    .then((rows) =>
      rows.map((row) => ({
        id:            row.id,
        code:          row.code ?? "",
        title:         row.title,
        scheduledDate: row.scheduledDate ?? null,
        status:        row.status as "completed" | "not_completed",
      })),
    );

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
): Promise<OfflineActionResult<{ note: ReportNote }>> {
  try {
    return await addReportNoteInternal(assignmentId, input);
  } catch (error) {
    return normalizeOfflineServerActionError(error, "Notitie opslaan mislukt. Probeer het later opnieuw.");
  }
}

async function addReportNoteInternal(
  assignmentId: string,
  input: ReportNoteInput,
): Promise<OfflineActionResult<{ note: ReportNote }>> {
  const auth = await getAuthAndPersonnel();
  if (!auth) return permanentOfflineActionFailure("Niet ingelogd", "authentication_required");

  const linked = await isLinkedToAssignment(auth.personnelId, auth.tenantId, assignmentId);
  if (!linked) return permanentOfflineActionFailure("Niet gekoppeld aan deze opdracht", "assignment_not_available");

  const body = input.body.trim();
  if (!body) return permanentOfflineActionFailure("Notitie is verplicht", "validation_failed");

  const [assignment] = await db
    .select({
      status: assignmentsTable.status,
      customerSignedAt: assignmentsTable.customerSignedAt,
      customerSignatureDataUrl: assignmentsTable.customerSignatureDataUrl,
    })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, assignmentId))
    .limit(1);

  if (!assignment) return permanentOfflineActionFailure("Opdracht niet gevonden", "assignment_not_found");
  if (personnelWorkOrderIsSigned(assignment)) {
    return permanentOfflineActionFailure(SIGNED_WORK_ORDER_LOCK_MESSAGE, "business_rule_rejected");
  }
  if (LOCKED_REPORT_NOTE_STATUSES.has(assignment.status)) {
    return permanentOfflineActionFailure("Deze werkbon is afgesloten voor rapportage", "business_rule_rejected");
  }

  const [execution] = await db
    .select({ version: assignmentParticipantExecutionsTable.version })
    .from(assignmentParticipantExecutionsTable)
    .where(and(
      eq(assignmentParticipantExecutionsTable.tenantId, auth.tenantId),
      eq(assignmentParticipantExecutionsTable.assignmentId, assignmentId),
      eq(assignmentParticipantExecutionsTable.personnelId, auth.personnelId),
      ne(assignmentParticipantExecutionsTable.participantStatus, "removed"),
    ))
    .limit(1);
  if (!execution) return permanentOfflineActionFailure("Uitvoering niet gevonden", "execution_not_found");
  const expectedVersion = input.expectedParticipantVersion ?? Number(execution.version);

  const attachmentInput = input.attachments ?? [];
  if (attachmentInput.length > MAX_REPORT_NOTE_ATTACHMENTS) {
    return permanentOfflineActionFailure(`Maximaal ${MAX_REPORT_NOTE_ATTACHMENTS} bijlagen per notitie toegestaan`, "validation_failed");
  }

  const normalizedAttachments = attachmentInput.map((attachment) =>
    normalizeAttachmentInput(auth.tenantId, assignmentId, attachment),
  );
  if (normalizedAttachments.some((attachment) => attachment === null)) {
    return permanentOfflineActionFailure("Bijlage kon niet worden gekoppeld", "validation_failed");
  }

  for (const attachment of normalizedAttachments) {
    if (!attachment) continue;
    const exists = await verifyUploadedAssignmentMedia({
      storagePath: attachment.storagePath,
      mimeType: attachment.mimeType ?? "",
      fileSize: attachment.fileSize ?? 0,
    });
    if (!exists) {
      return permanentOfflineActionFailure("Bijlage is nog niet correct geupload. Probeer opnieuw.", "validation_failed");
    }
  }

  try {
    const { note, attachments, participantVersion } = await db.transaction(async (tx) => {
      const operationId = input.clientMutationId?.trim() || randomUUID();
      const replay = await beginOfflineOperation<{ noteId: string; participantVersion?: number }>(tx, {
        tenantId: auth.tenantId,
        assignmentId,
        personnelId: auth.personnelId,
        actorUserId: auth.userId,
        operationId,
        operationType: "add-report-note",
        expectedVersion,
        payload: { body, attachments: normalizedAttachments },
      });
      if (replay) {
        const [existingNote] = await tx.select({
          id: assignmentReportNotesTable.id,
          body: assignmentReportNotesTable.body,
          createdAt: assignmentReportNotesTable.createdAt,
        }).from(assignmentReportNotesTable).where(eq(assignmentReportNotesTable.id, replay.noteId)).limit(1);
        const existingAttachments = await tx.select({
          id: assignmentReportNoteAttachmentsTable.id,
          storagePath: assignmentReportNoteAttachmentsTable.storagePath,
          fileName: assignmentReportNoteAttachmentsTable.fileName,
          mimeType: assignmentReportNoteAttachmentsTable.mimeType,
          fileSize: assignmentReportNoteAttachmentsTable.fileSize,
          createdAt: assignmentReportNoteAttachmentsTable.createdAt,
        }).from(assignmentReportNoteAttachmentsTable).where(eq(assignmentReportNoteAttachmentsTable.noteId, replay.noteId));
        if (!existingNote) throw new Error("Canonical offline note ontbreekt");
        return { note: existingNote, attachments: existingAttachments, participantVersion: replay.participantVersion ?? expectedVersion };
      }
      const [createdNote] = await tx
        .insert(assignmentReportNotesTable)
        .values({
          assignmentId,
          body,
          createdBy: auth.userId,
          clientMutationId: operationId,
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

      await completeOfflineOperation(tx, {
        tenantId: auth.tenantId,
        actorUserId: auth.userId,
        operationId,
        response: { noteId: createdNote!.id, participantVersion: expectedVersion },
      });

      return { note: createdNote!, attachments: createdAttachments, participantVersion: expectedVersion };
    });

    const signedAttachments = await Promise.all(
      attachments.map(async (attachment) => ({
        id:          attachment.id,
        storagePath: attachment.storagePath,
        signedUrl:   await createSignedAttachmentUrl(attachment.storagePath, auth.tenantId, assignmentId),
        fileName:    attachment.fileName,
        mimeType:    attachment.mimeType ?? null,
        fileSize:    attachment.fileSize ?? null,
        createdAt:   attachment.createdAt.toISOString(),
      })),
    );
    const publicAuthorName = await getAssignmentTenantName(assignmentId);

    revalidatePath(`/opdrachten/${assignmentId}`);
    return {
      success: true,
      participantVersion,
      note:    {
        id:          note.id,
        body:        note.body,
        authorName:  publicAuthorName,
        createdAt:   note.createdAt.toISOString(),
        attachments: signedAttachments,
      },
    };
  } catch (error) {
    return normalizeOfflineServerActionError(error, "Notitie opslaan mislukt. Probeer het later opnieuw.");
  }
}

export async function submitMyReport(
  assignmentId: string,
  data: SubmitReportData,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  const identity = await getPersonnelIdentity();
  if (!identity) return { success: false, error: "Personeelsprofiel niet gevonden" };

  const linked = await getLinkedAssignmentExecution(identity.personnelId, identity.tenantId, assignmentId);
  if (!linked) return { success: false, error: "U bent niet gekoppeld aan deze opdracht" };

  // Validate content
  const content = data.content.trim();
  if (!content) return { success: false, error: "Verslag is verplicht" };

  // Fetch assignment and check status
  const [assignment] = await db
    .select({
      status: assignmentsTable.status,
      customerSignedAt: assignmentsTable.customerSignedAt,
      customerSignatureDataUrl: assignmentsTable.customerSignatureDataUrl,
    })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, assignmentId))
    .limit(1);

  if (!assignment) return { success: false, error: "Opdracht niet gevonden" };
  if (personnelWorkOrderIsSigned(assignment)) {
    return { success: false, error: SIGNED_WORK_ORDER_LOCK_MESSAGE };
  }
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

  const checklistIssues = await getAssignmentChecklistCompletionIssues({
    tenantId: identity.tenantId,
    assignmentId,
    blockingMoment: "before_report_submit",
  });
  if (checklistIssues.length > 0) {
    return {
      success: false,
      error: checklistIssues.slice(0, 3).map((issue) => issue.message).join(" "),
    };
  }

  const hoursWorked  = data.hoursWorked.trim() || null;
  const submitterNotes = data.submitterNotes.trim() || null;

  try {
    await db.insert(reportsTable).values({
      assignmentId,
      submittedBy:   user.id,
      assignmentParticipantExecutionId: linked.executionId,
      assignmentPersonnelId: linked.assignmentPersonnelId,
      personnelId: identity.personnelId,
      visibilityScope: "internal_until_approved",
      status:        "submitted",
      content,
      hoursWorked,
      submitterNotes,
    });

    // Advance assignment to report_submitted (works from both 'completed' and 'not_completed')
    await db
      .update(assignmentsTable)
      .set({ status: "report_submitted", updatedAt: new Date() })
      .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, identity.tenantId)));

    // Notify org admin — fire-and-forget
    const [person] = await db
      .select({ firstName: personnelTable.firstName, lastName: personnelTable.lastName })
      .from(personnelTable)
      .where(and(eq(personnelTable.id, identity.personnelId), eq(personnelTable.tenantId, identity.tenantId)))
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
        await sendEmail({
          to: orgSettings.emailAfzender,
          subject,
          html,
          tenantId: identity.tenantId,
          purpose: "report_submitted",
        });
      }
    })();

    revalidatePath("/opdrachten");
    revalidatePath(`/opdrachten/${assignmentId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Rapport indienen mislukt. Probeer het opnieuw." };
  }
}
