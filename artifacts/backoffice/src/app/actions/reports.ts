"use server";

import { db } from "@workspace/db";
import {
  reportsTable,
  assignmentsTable,
  assignmentPersonnelTable,
  customersTable,
  objectsTable,
  personnelTable,
  auditLogTable,
  organizationSettingsTable,
  ASSIGNMENT_STATUS_TRANSITIONS,
  type ReportStatus,
  type AssignmentStatus,
} from "@workspace/db";
import { alias } from "drizzle-orm/pg-core";
import { eq, ilike, or, and, desc, sql, exists } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, hasPermission } from "@/lib/auth/permissions";
import {
  sendEmail,
  buildReportSubmittedEmail,
  buildReportApprovedEmail,
  buildReportRejectedEmail,
} from "@/lib/email";
import type { ActionResult } from "./customers";

export type { ActionResult, ReportStatus };

const PAGE_SIZE = 25;

// ─── Aliases for double personnel join ────────────────────────────────────────

const submitterPersonnel = alias(personnelTable, "submitter_personnel");
const reviewerPersonnel  = alias(personnelTable, "reviewer_personnel");

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReportRow = {
  id:               string;
  assignmentId:     string;
  assignmentCode:   string;
  assignmentTitle:  string;
  customerName:     string;
  status:           ReportStatus;
  submittedAt:      string;
  submittedByName:  string;
  hoursWorked:      string | null;
};

export type ReportDetail = {
  id:               string;
  assignmentId:     string;
  assignmentCode:   string;
  assignmentTitle:  string;
  customerName:     string;
  objectName:       string | null;
  scheduledDate:    string | null;
  status:           ReportStatus;
  content:          string;
  hoursWorked:      string | null;
  submitterNotes:   string | null;
  notes:            string | null;
  submittedBy:      string;
  submittedByName:  string;
  submittedAt:      string;
  reviewedBy:       string | null;
  reviewedByName:   string | null;
  reviewedAt:       string | null;
  createdAt:        string;
};

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Returns true if the current user may see all reports.
 * Management/Administration (reports:write) see everything.
 * All other roles see only their own submitted reports.
 */
async function canSeeAllReports(): Promise<boolean> {
  return hasPermission("reports", "write");
}

export async function listReports(params: {
  page?:   number;
  search?: string;
  status?: string;
}): Promise<{ rows: ReportRow[]; total: number }> {
  const canRead = await hasPermission("reports", "read");
  if (!canRead) return { rows: [], total: 0 };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { rows: [], total: 0 };

  const seeAll = await canSeeAllReports();

  const { page = 1, search = "", status = "" } = params;

  const conditions = [];

  // Non-management users only see their own submitted reports
  if (!seeAll) {
    conditions.push(eq(reportsTable.submittedBy, user.id));
  }

  if (search.trim()) {
    conditions.push(
      or(
        ilike(assignmentsTable.title, `%${search.trim()}%`),
        ilike(assignmentsTable.code,  `%${search.trim()}%`),
        ilike(customersTable.name,    `%${search.trim()}%`),
      ),
    );
  }
  if (status && (["draft", "submitted", "approved", "rejected"] as string[]).includes(status)) {
    conditions.push(eq(reportsTable.status, status));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id:              reportsTable.id,
        assignmentId:    reportsTable.assignmentId,
        assignmentCode:  assignmentsTable.code,
        assignmentTitle: assignmentsTable.title,
        customerName:    customersTable.name,
        status:          reportsTable.status,
        submittedAt:     reportsTable.submittedAt,
        submittedBy:     reportsTable.submittedBy,
        submitterFirst:  submitterPersonnel.firstName,
        submitterLast:   submitterPersonnel.lastName,
        hoursWorked:     reportsTable.hoursWorked,
      })
      .from(reportsTable)
      .innerJoin(assignmentsTable, eq(reportsTable.assignmentId, assignmentsTable.id))
      .leftJoin(customersTable, eq(assignmentsTable.customerId, customersTable.id))
      .leftJoin(submitterPersonnel, eq(submitterPersonnel.userId, reportsTable.submittedBy))
      .where(where)
      .orderBy(desc(reportsTable.submittedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(reportsTable)
      .innerJoin(assignmentsTable, eq(reportsTable.assignmentId, assignmentsTable.id))
      .leftJoin(customersTable, eq(assignmentsTable.customerId, customersTable.id))
      .where(where),
  ]);

  return {
    rows: rows.map((r) => ({
      id:              r.id,
      assignmentId:    r.assignmentId,
      assignmentCode:  r.assignmentCode,
      assignmentTitle: r.assignmentTitle,
      customerName:    r.customerName ?? "",
      status:          r.status as ReportStatus,
      submittedAt:     r.submittedAt.toISOString(),
      submittedByName: r.submitterFirst && r.submitterLast
        ? `${r.submitterFirst} ${r.submitterLast}`.trim()
        : r.submittedBy.slice(0, 8) + "…",
      hoursWorked:     r.hoursWorked ?? null,
    })),
    total: count,
  };
}

function mapReportDetail(row: {
  id: string;
  assignmentId: string;
  assignmentCode: string;
  assignmentTitle: string;
  customerName: string | null;
  objectName: string | null;
  scheduledDate: string | null;
  status: string;
  content: string;
  hoursWorked: string | null;
  submitterNotes: string | null;
  notes: string | null;
  submittedBy: string;
  submitterFirst: string | null;
  submitterLast: string | null;
  submittedAt: Date;
  reviewedBy: string | null;
  reviewerFirst: string | null;
  reviewerLast: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}): ReportDetail {
  return {
    id:              row.id,
    assignmentId:    row.assignmentId,
    assignmentCode:  row.assignmentCode,
    assignmentTitle: row.assignmentTitle,
    customerName:    row.customerName ?? "",
    objectName:      row.objectName ?? null,
    scheduledDate:   row.scheduledDate ?? null,
    status:          row.status as ReportStatus,
    content:         row.content,
    hoursWorked:     row.hoursWorked ?? null,
    submitterNotes:  row.submitterNotes ?? null,
    notes:           row.notes ?? null,
    submittedBy:     row.submittedBy,
    submittedByName: row.submitterFirst && row.submitterLast
      ? `${row.submitterFirst} ${row.submitterLast}`.trim()
      : row.submittedBy.slice(0, 8) + "…",
    submittedAt:     row.submittedAt.toISOString(),
    reviewedBy:      row.reviewedBy ?? null,
    reviewedByName:  row.reviewerFirst && row.reviewerLast
      ? `${row.reviewerFirst} ${row.reviewerLast}`.trim()
      : row.reviewedBy ? row.reviewedBy.slice(0, 8) + "…" : null,
    reviewedAt:      row.reviewedAt?.toISOString() ?? null,
    createdAt:       row.createdAt.toISOString(),
  };
}

const REPORT_DETAIL_SELECT = {
  id:              reportsTable.id,
  assignmentId:    reportsTable.assignmentId,
  assignmentCode:  assignmentsTable.code,
  assignmentTitle: assignmentsTable.title,
  customerName:    customersTable.name,
  objectName:      objectsTable.name,
  scheduledDate:   assignmentsTable.scheduledDate,
  status:          reportsTable.status,
  content:         reportsTable.content,
  hoursWorked:     reportsTable.hoursWorked,
  submitterNotes:  reportsTable.submitterNotes,
  notes:           reportsTable.notes,
  submittedBy:     reportsTable.submittedBy,
  submitterFirst:  submitterPersonnel.firstName,
  submitterLast:   submitterPersonnel.lastName,
  submittedAt:     reportsTable.submittedAt,
  reviewedBy:      reportsTable.reviewedBy,
  reviewerFirst:   reviewerPersonnel.firstName,
  reviewerLast:    reviewerPersonnel.lastName,
  reviewedAt:      reportsTable.reviewedAt,
  createdAt:       reportsTable.createdAt,
} as const;

function detailBaseQuery() {
  return db
    .select(REPORT_DETAIL_SELECT)
    .from(reportsTable)
    .innerJoin(assignmentsTable, eq(reportsTable.assignmentId, assignmentsTable.id))
    .leftJoin(customersTable, eq(assignmentsTable.customerId, customersTable.id))
    .leftJoin(objectsTable,   eq(assignmentsTable.objectId,   objectsTable.id))
    .leftJoin(submitterPersonnel, eq(submitterPersonnel.userId, reportsTable.submittedBy))
    .leftJoin(reviewerPersonnel,  eq(reviewerPersonnel.userId,  reportsTable.reviewedBy!));
}

export async function getReport(id: string): Promise<ReportDetail | null> {
  const canRead = await hasPermission("reports", "read");
  if (!canRead) return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const seeAll = await canSeeAllReports();

  const conditions = [eq(reportsTable.id, id)];
  if (!seeAll) {
    // Non-management users may only read their own reports
    conditions.push(eq(reportsTable.submittedBy, user.id));
  }

  const [row] = await detailBaseQuery()
    .where(and(...conditions))
    .limit(1);

  return row ? mapReportDetail(row) : null;
}

/**
 * Returns the most recent report for an assignment (latest submitted_at).
 * Non-management users only see their own report for the assignment.
 * Returns null if no matching report exists.
 */
export async function getReportForAssignment(assignmentId: string): Promise<ReportDetail | null> {
  const canRead = await hasPermission("reports", "read");
  if (!canRead) return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const seeAll = await canSeeAllReports();

  const conditions = [eq(reportsTable.assignmentId, assignmentId)];
  if (!seeAll) {
    conditions.push(eq(reportsTable.submittedBy, user.id));
  }

  const [row] = await detailBaseQuery()
    .where(and(...conditions))
    .orderBy(desc(reportsTable.submittedAt))
    .limit(1);

  return row ? mapReportDetail(row) : null;
}

export async function getPendingReportsCount(): Promise<number> {
  const canRead = await hasPermission("reports", "read");
  if (!canRead) return 0;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reportsTable)
    .where(eq(reportsTable.status, "submitted"));

  return count ?? 0;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function submitReport(
  assignmentId: string,
  content: string,
  hoursWorked: string | null,
  submitterNotes: string | null,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission("reports", "submit");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return { success: false, message: "Rapportinhoud is verplicht.", fieldErrors: { content: "Verplicht veld." } };
  }

  // Verify assignment is in 'completed' status
  const [assignment] = await db
    .select({ status: assignmentsTable.status, title: assignmentsTable.title })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, assignmentId))
    .limit(1);

  if (!assignment) return { success: false, message: "Opdracht niet gevonden." };

  const currentStatus = assignment.status as AssignmentStatus;
  const allowedNext = ASSIGNMENT_STATUS_TRANSITIONS[currentStatus];
  if (!allowedNext.includes("report_submitted")) {
    return { success: false, message: `Rapport indienen is niet mogelijk vanuit status "${currentStatus}".` };
  }

  // Verify the user is assigned to this assignment — unless they have write access
  // (management/admin may submit on behalf of field workers)
  const canWriteAssignments = await hasPermission("assignments", "write");
  if (!canWriteAssignments) {
    const [membership] = await db
      .select({ id: assignmentPersonnelTable.id })
      .from(assignmentPersonnelTable)
      .innerJoin(personnelTable, eq(personnelTable.id, assignmentPersonnelTable.personnelId))
      .where(
        and(
          eq(assignmentPersonnelTable.assignmentId, assignmentId),
          eq(personnelTable.userId, user.id),
          // Only confirmed (assigned) links may submit reports — not self-applied candidates
          eq(assignmentPersonnelTable.status, "assigned"),
        ),
      )
      .limit(1);

    if (!membership) {
      return { success: false, message: "U bent niet gekoppeld aan deze opdracht." };
    }
  }

  try {
    const [created] = await db
      .insert(reportsTable)
      .values({
        assignmentId,
        submittedBy:     user.id,
        status:          "submitted",
        content:         trimmedContent,
        hoursWorked:     hoursWorked?.trim() || null,
        submitterNotes:  submitterNotes?.trim() || null,
      })
      .returning({ id: reportsTable.id });

    // Advance assignment status to report_submitted
    await db
      .update(assignmentsTable)
      .set({ status: "report_submitted", updatedAt: new Date() })
      .where(eq(assignmentsTable.id, assignmentId));

    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "submit_report",
      resource:   "reports",
      resourceId: created!.id,
      metadata:   { assignmentId, assignmentTitle: assignment.title },
    });

    // Notify admin (org sender address) — fire-and-forget, never blocks the action
    void (async () => {
      const [orgSettings] = await db
        .select({ emailAfzender: organizationSettingsTable.emailAfzender })
        .from(organizationSettingsTable)
        .limit(1);
      if (orgSettings?.emailAfzender) {
        const { subject, html } = buildReportSubmittedEmail({
          assignmentTitle: assignment.title,
          assignmentId,
          reportId:        created!.id,
        });
        await sendEmail({ to: orgSettings.emailAfzender, subject, html });
      }
    })();

    revalidatePath(`/assignments/${assignmentId}`);
    revalidatePath("/reports");
    return { success: true, data: { id: created!.id } };
  } catch {
    return { success: false, message: "Rapport indienen mislukt." };
  }
}

export async function approveReport(reportId: string): Promise<ActionResult> {
  await requirePermission("reports", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [report] = await db
    .select({ assignmentId: reportsTable.assignmentId, status: reportsTable.status })
    .from(reportsTable)
    .where(eq(reportsTable.id, reportId))
    .limit(1);

  if (!report) return { success: false, message: "Rapport niet gevonden." };
  if (report.status !== "submitted") {
    return { success: false, message: "Alleen ingediende rapporten kunnen worden goedgekeurd." };
  }

  await db
    .update(reportsTable)
    .set({ status: "approved", reviewedBy: user.id, reviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(reportsTable.id, reportId));

  // Advance assignment status to report_approved
  await db
    .update(assignmentsTable)
    .set({ status: "report_approved", updatedAt: new Date() })
    .where(eq(assignmentsTable.id, report.assignmentId));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "approve_report",
    resource:   "reports",
    resourceId: reportId,
    metadata:   { assignmentId: report.assignmentId },
  });

  // Notify the submitter — fire-and-forget
  void (async () => {
    const [detail] = await db
      .select({
        submittedBy:     reportsTable.submittedBy,
        assignmentTitle: assignmentsTable.title,
        personnelEmail:  personnelTable.email,
        personnelFirst:  personnelTable.firstName,
        notifEnabled:    organizationSettingsTable.notifRapportGoedgekeurd,
      })
      .from(reportsTable)
      .innerJoin(assignmentsTable, eq(reportsTable.assignmentId, assignmentsTable.id))
      .leftJoin(personnelTable,    eq(personnelTable.userId, reportsTable.submittedBy))
      .leftJoin(organizationSettingsTable, sql`true`)
      .where(eq(reportsTable.id, reportId))
      .limit(1);

    if (detail?.notifEnabled && detail.personnelEmail) {
      const { subject, html } = buildReportApprovedEmail({
        firstName:       detail.personnelFirst ?? "medewerker",
        assignmentTitle: detail.assignmentTitle,
        reportId,
      });
      await sendEmail({ to: detail.personnelEmail, subject, html });
    }
  })();

  revalidatePath(`/reports/${reportId}`);
  revalidatePath("/reports");
  revalidatePath(`/assignments/${report.assignmentId}`);
  return { success: true };
}

export async function rejectReport(reportId: string, notes: string): Promise<ActionResult> {
  await requirePermission("reports", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const trimmedNotes = notes.trim();
  if (!trimmedNotes) {
    return { success: false, message: "Geef een reden op voor de afwijzing." };
  }

  const [report] = await db
    .select({ assignmentId: reportsTable.assignmentId, status: reportsTable.status })
    .from(reportsTable)
    .where(eq(reportsTable.id, reportId))
    .limit(1);

  if (!report) return { success: false, message: "Rapport niet gevonden." };
  if (report.status !== "submitted") {
    return { success: false, message: "Alleen ingediende rapporten kunnen worden afgewezen." };
  }

  await db
    .update(reportsTable)
    .set({
      status:     "rejected",
      notes:      trimmedNotes,
      reviewedBy: user.id,
      reviewedAt: new Date(),
      updatedAt:  new Date(),
    })
    .where(eq(reportsTable.id, reportId));

  // Revert assignment status back to completed so a new report can be submitted
  await db
    .update(assignmentsTable)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(assignmentsTable.id, report.assignmentId));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "reject_report",
    resource:   "reports",
    resourceId: reportId,
    metadata:   { assignmentId: report.assignmentId, notes: trimmedNotes },
  });

  // Notify the submitter — fire-and-forget
  void (async () => {
    const [detail] = await db
      .select({
        assignmentTitle: assignmentsTable.title,
        personnelEmail:  personnelTable.email,
        personnelFirst:  personnelTable.firstName,
        notifEnabled:    organizationSettingsTable.notifRapportAfgekeurd,
      })
      .from(reportsTable)
      .innerJoin(assignmentsTable, eq(reportsTable.assignmentId, assignmentsTable.id))
      .leftJoin(personnelTable,    eq(personnelTable.userId, reportsTable.submittedBy))
      .leftJoin(organizationSettingsTable, sql`true`)
      .where(eq(reportsTable.id, reportId))
      .limit(1);

    if (detail?.notifEnabled && detail.personnelEmail) {
      const { subject, html } = buildReportRejectedEmail({
        firstName:       detail.personnelFirst ?? "medewerker",
        assignmentTitle: detail.assignmentTitle,
        reportId,
        reason:          trimmedNotes,
      });
      await sendEmail({ to: detail.personnelEmail, subject, html });
    }
  })();

  revalidatePath(`/reports/${reportId}`);
  revalidatePath("/reports");
  revalidatePath(`/assignments/${report.assignmentId}`);
  return { success: true };
}
