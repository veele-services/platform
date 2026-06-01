"use server";

import { db } from "@workspace/db";
import {
  quotesTable,
  assignmentsTable,
  assignmentTasksTable,
  customersTable,
  taskCodesTable,
  auditLogTable,
  ASSIGNMENT_STATUS_TRANSITIONS,
  type AssignmentStatus,
  type QuoteStatus,
} from "@workspace/db";
import { eq, ilike, or, and, asc, desc, sql, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, hasPermission } from "@/lib/auth/permissions";
import { sendEmail, buildQuoteSentEmail } from "@/lib/email";
import type { ActionResult } from "./customers";

export type { ActionResult, QuoteStatus };

const PAGE_SIZE = 25;

// ─── Types ────────────────────────────────────────────────────────────────────

export type QuoteRow = {
  id:             string;
  quoteNumber:    string;
  customerId:     string;
  customerName:   string;
  assignmentId:   string;
  assignmentCode: string;
  amount:         string;
  validityDate:   string;
  status:         QuoteStatus;
  isExpired:      boolean;
  createdAt:      string;
};

export type QuoteDetail = {
  id:              string;
  quoteNumber:     string;
  customerId:      string;
  customerName:    string;
  customerAddress: string | null;
  customerCity:    string | null;
  customerEmail:   string | null;
  assignmentId:    string;
  assignmentCode:  string;
  assignmentTitle: string;
  amount:          string;
  validityDate:    string;
  status:          QuoteStatus;
  isExpired:       boolean;
  notes:           string | null;
  rejectionReason: string | null;
  approvedBy:      string | null;
  approvedAt:      string | null;
  createdAt:       string;
  updatedAt:       string;
  lineItems: Array<{
    taskCodeCode: string | null;
    taskCodeName: string | null;
    price:        string | null;
    invoiceable:  boolean;
  }>;
};

export type QuoteSummary = {
  draftCount:    number;
  sentCount:     number;
  approvedCount: number;
  rejectedCount: number;
  expiredCount:  number;
  totalCount:    number;
};

export type AssignmentQuoteData = {
  suggestedAmount: number;
  defaultValidityDate: string;
  lineItems: Array<{
    taskCodeCode: string | null;
    taskCodeName: string | null;
    price: string | null;
    invoiceable: boolean;
  }>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function isExpired(status: string, validityDate: string): boolean {
  return status === "sent" && validityDate < todayString();
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getPendingQuotesCount(): Promise<number> {
  const canRead = await hasPermission("quotes", "read");
  if (!canRead) return 0;

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(quotesTable)
    .where(eq(quotesTable.status, "sent"));

  return result?.count ?? 0;
}

export async function getQuoteSummary(): Promise<QuoteSummary> {
  const canRead = await hasPermission("quotes", "read");
  if (!canRead) {
    return { draftCount: 0, sentCount: 0, approvedCount: 0, rejectedCount: 0, expiredCount: 0, totalCount: 0 };
  }

  const today = todayString();

  const [counts] = await db
    .select({
      draftCount:    sql<number>`count(*) FILTER (WHERE status = 'draft')::int`,
      sentCount:     sql<number>`count(*) FILTER (WHERE status = 'sent' AND validity_date >= ${today})::int`,
      approvedCount: sql<number>`count(*) FILTER (WHERE status = 'approved')::int`,
      rejectedCount: sql<number>`count(*) FILTER (WHERE status = 'rejected')::int`,
      expiredCount:  sql<number>`count(*) FILTER (WHERE status IN ('expired') OR (status = 'sent' AND validity_date < ${today}))::int`,
      totalCount:    sql<number>`count(*)::int`,
    })
    .from(quotesTable);

  return {
    draftCount:    counts?.draftCount    ?? 0,
    sentCount:     counts?.sentCount     ?? 0,
    approvedCount: counts?.approvedCount ?? 0,
    rejectedCount: counts?.rejectedCount ?? 0,
    expiredCount:  counts?.expiredCount  ?? 0,
    totalCount:    counts?.totalCount    ?? 0,
  };
}

export async function listQuotes(params: {
  page?:   number;
  search?: string;
  status?: string;
}): Promise<{ rows: QuoteRow[]; total: number }> {
  const canRead = await hasPermission("quotes", "read");
  if (!canRead) return { rows: [], total: 0 };

  const { page = 1, search = "", status = "" } = params;

  const conditions = [];
  if (search.trim()) {
    conditions.push(
      or(
        ilike(quotesTable.quoteNumber,   `%${search.trim()}%`),
        ilike(customersTable.name,       `%${search.trim()}%`),
        ilike(assignmentsTable.code,     `%${search.trim()}%`),
      ),
    );
  }
  if (status && ["draft", "sent", "approved", "rejected", "expired"].includes(status)) {
    if (status === "expired") {
      conditions.push(
        or(
          eq(quotesTable.status, "expired"),
          and(
            eq(quotesTable.status, "sent"),
            lt(quotesTable.validityDate, todayString()),
          ),
        ),
      );
    } else {
      conditions.push(eq(quotesTable.status, status));
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id:             quotesTable.id,
        quoteNumber:    quotesTable.quoteNumber,
        customerId:     quotesTable.customerId,
        customerName:   customersTable.name,
        assignmentId:   quotesTable.assignmentId,
        assignmentCode: assignmentsTable.code,
        amount:         quotesTable.amount,
        validityDate:   quotesTable.validityDate,
        status:         quotesTable.status,
        createdAt:      quotesTable.createdAt,
      })
      .from(quotesTable)
      .leftJoin(customersTable,   eq(quotesTable.customerId,   customersTable.id))
      .leftJoin(assignmentsTable, eq(quotesTable.assignmentId, assignmentsTable.id))
      .where(where)
      .orderBy(desc(quotesTable.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(quotesTable)
      .leftJoin(customersTable,   eq(quotesTable.customerId,   customersTable.id))
      .leftJoin(assignmentsTable, eq(quotesTable.assignmentId, assignmentsTable.id))
      .where(where),
  ]);

  const today = todayString();

  return {
    rows: rows.map((r) => ({
      id:             r.id,
      quoteNumber:    r.quoteNumber,
      customerId:     r.customerId,
      customerName:   r.customerName ?? "",
      assignmentId:   r.assignmentId,
      assignmentCode: r.assignmentCode ?? "",
      amount:         r.amount ?? "0",
      validityDate:   r.validityDate ?? "",
      status:         r.status as QuoteStatus,
      isExpired:      isExpired(r.status ?? "", r.validityDate ?? ""),
      createdAt:      r.createdAt.toISOString(),
    })),
    total: count ?? 0,
  };
}

export async function getQuote(id: string): Promise<QuoteDetail | null> {
  const canRead = await hasPermission("quotes", "read");
  if (!canRead) return null;

  const [row] = await db
    .select({
      id:              quotesTable.id,
      quoteNumber:     quotesTable.quoteNumber,
      customerId:      quotesTable.customerId,
      customerName:    customersTable.name,
      customerAddress: customersTable.address,
      customerCity:    customersTable.city,
      customerEmail:   customersTable.contactEmail,
      assignmentId:    quotesTable.assignmentId,
      assignmentCode:  assignmentsTable.code,
      assignmentTitle: assignmentsTable.title,
      amount:          quotesTable.amount,
      validityDate:    quotesTable.validityDate,
      status:          quotesTable.status,
      notes:           quotesTable.notes,
      rejectionReason: quotesTable.rejectionReason,
      approvedBy:      quotesTable.approvedBy,
      approvedAt:      quotesTable.approvedAt,
      createdAt:       quotesTable.createdAt,
      updatedAt:       quotesTable.updatedAt,
    })
    .from(quotesTable)
    .leftJoin(customersTable,   eq(quotesTable.customerId,   customersTable.id))
    .leftJoin(assignmentsTable, eq(quotesTable.assignmentId, assignmentsTable.id))
    .where(eq(quotesTable.id, id))
    .limit(1);

  if (!row) return null;

  const lineItems = await db
    .select({
      taskCodeCode: taskCodesTable.code,
      taskCodeName: taskCodesTable.name,
      price:        taskCodesTable.price,
      invoiceable:  taskCodesTable.invoiceable,
    })
    .from(assignmentTasksTable)
    .leftJoin(taskCodesTable, eq(assignmentTasksTable.taskCodeId, taskCodesTable.id))
    .where(eq(assignmentTasksTable.assignmentId, row.assignmentId))
    .orderBy(asc(assignmentTasksTable.sortOrder));

  const today = todayString();

  return {
    id:              row.id,
    quoteNumber:     row.quoteNumber,
    customerId:      row.customerId,
    customerName:    row.customerName    ?? "",
    customerAddress: row.customerAddress ?? null,
    customerCity:    row.customerCity    ?? null,
    customerEmail:   row.customerEmail   ?? null,
    assignmentId:    row.assignmentId,
    assignmentCode:  row.assignmentCode  ?? "",
    assignmentTitle: row.assignmentTitle ?? "",
    amount:          row.amount          ?? "0",
    validityDate:    row.validityDate    ?? "",
    status:          row.status as QuoteStatus,
    isExpired:       isExpired(row.status ?? "", row.validityDate ?? ""),
    notes:           row.notes           ?? null,
    rejectionReason: row.rejectionReason ?? null,
    approvedBy:      row.approvedBy      ?? null,
    approvedAt:      row.approvedAt      ? row.approvedAt.toISOString() : null,
    createdAt:       row.createdAt.toISOString(),
    updatedAt:       row.updatedAt.toISOString(),
    lineItems: lineItems.map((li) => ({
      taskCodeCode: li.taskCodeCode ?? null,
      taskCodeName: li.taskCodeName ?? null,
      price:        li.price        ?? null,
      invoiceable:  li.invoiceable ?? false,
    })),
  };
}

export async function getQuoteForAssignment(assignmentId: string): Promise<{
  id: string;
  quoteNumber: string;
  status: QuoteStatus;
  isExpired: boolean;
  amount: string;
  validityDate: string;
} | null> {
  const canRead = await hasPermission("quotes", "read");
  if (!canRead) return null;

  const [row] = await db
    .select({
      id:           quotesTable.id,
      quoteNumber:  quotesTable.quoteNumber,
      status:       quotesTable.status,
      amount:       quotesTable.amount,
      validityDate: quotesTable.validityDate,
    })
    .from(quotesTable)
    .where(eq(quotesTable.assignmentId, assignmentId))
    .orderBy(desc(quotesTable.createdAt))
    .limit(1);

  if (!row) return null;

  return {
    id:           row.id,
    quoteNumber:  row.quoteNumber,
    status:       row.status as QuoteStatus,
    isExpired:    isExpired(row.status ?? "", row.validityDate ?? ""),
    amount:       row.amount       ?? "0",
    validityDate: row.validityDate ?? "",
  };
}

export async function getAssignmentQuoteData(assignmentId: string): Promise<AssignmentQuoteData | null> {
  const canRead = await hasPermission("quotes", "read");
  if (!canRead) return null;

  const tasks = await db
    .select({
      taskCodeCode: taskCodesTable.code,
      taskCodeName: taskCodesTable.name,
      price:        taskCodesTable.price,
      invoiceable:  taskCodesTable.invoiceable,
    })
    .from(assignmentTasksTable)
    .leftJoin(taskCodesTable, eq(assignmentTasksTable.taskCodeId, taskCodesTable.id))
    .where(eq(assignmentTasksTable.assignmentId, assignmentId))
    .orderBy(asc(assignmentTasksTable.sortOrder));

  const suggestedAmount = tasks
    .filter((t) => t.invoiceable && t.price)
    .reduce((sum, t) => sum + parseFloat(t.price ?? "0"), 0);

  // Default validity: today + 30 days
  const d = new Date();
  d.setDate(d.getDate() + 30);
  const defaultValidityDate = d.toISOString().slice(0, 10);

  return {
    suggestedAmount,
    defaultValidityDate,
    lineItems: tasks.map((t) => ({
      taskCodeCode: t.taskCodeCode ?? null,
      taskCodeName: t.taskCodeName ?? null,
      price:        t.price        ?? null,
      invoiceable:  t.invoiceable ?? false,
    })),
  };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createQuote(
  assignmentId: string,
  data: { amount: number; validityDate: string; notes?: string },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission("quotes", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  // Validate assignment is in review status
  const [assignment] = await db
    .select({ id: assignmentsTable.id, status: assignmentsTable.status, customerId: assignmentsTable.customerId })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, assignmentId))
    .limit(1);

  if (!assignment) return { success: false, message: "Opdracht niet gevonden." };
  if (assignment.status !== "review") {
    return { success: false, message: "Offerte kan alleen worden aangemaakt voor opdrachten met status 'review'." };
  }

  const [quote] = await db
    .insert(quotesTable)
    .values({
      assignmentId,
      customerId:   assignment.customerId,
      amount:       data.amount.toFixed(2),
      validityDate: data.validityDate,
      notes:        data.notes?.trim() || null,
      createdBy:    user.id,
    })
    .returning({ id: quotesTable.id });

  if (!quote) return { success: false, message: "Offerte aanmaken mislukt." };

  // Advance assignment → quote_preparation
  await db
    .update(assignmentsTable)
    .set({ status: "quote_preparation" })
    .where(eq(assignmentsTable.id, assignmentId));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "create_quote",
    resource:   "quotes",
    resourceId: quote.id,
    metadata:   { assignmentId, amount: data.amount },
  });

  revalidatePath("/quotes");
  revalidatePath(`/assignments/${assignmentId}`);

  return { success: true, data: { id: quote.id } };
}

export async function sendQuote(id: string): Promise<ActionResult> {
  await requirePermission("quotes", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [quote] = await db
    .select({ id: quotesTable.id, status: quotesTable.status, assignmentId: quotesTable.assignmentId })
    .from(quotesTable)
    .where(eq(quotesTable.id, id))
    .limit(1);

  if (!quote) return { success: false, message: "Offerte niet gevonden." };
  if (quote.status !== "draft") {
    return { success: false, message: "Alleen concept-offertes kunnen worden verzonden." };
  }

  await db
    .update(quotesTable)
    .set({ status: "sent" })
    .where(eq(quotesTable.id, id));

  // Advance assignment → awaiting_approval
  await db
    .update(assignmentsTable)
    .set({ status: "awaiting_approval" })
    .where(eq(assignmentsTable.id, quote.assignmentId));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "send_quote",
    resource:   "quotes",
    resourceId: id,
    metadata:   { assignmentId: quote.assignmentId },
  });

  // Notify customer — fire-and-forget
  void (async () => {
    const [full] = await db
      .select({
        quoteNumber:  quotesTable.quoteNumber,
        amount:       quotesTable.amount,
        validityDate: quotesTable.validityDate,
        customerName: customersTable.name,
        customerEmail: customersTable.contactEmail,
      })
      .from(quotesTable)
      .leftJoin(customersTable, eq(quotesTable.customerId, customersTable.id))
      .where(eq(quotesTable.id, id))
      .limit(1);
    if (full?.customerEmail) {
      const { subject, html } = buildQuoteSentEmail({
        customerName: full.customerName ?? "",
        quoteNumber:  full.quoteNumber,
        amount:       full.amount ?? "0",
        validityDate: full.validityDate ?? "",
        quoteId:      id,
      });
      await sendEmail({ to: full.customerEmail, subject, html });
    }
  })();

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
  revalidatePath(`/assignments/${quote.assignmentId}`);

  return { success: true };
}

export async function approveQuote(id: string): Promise<ActionResult> {
  await requirePermission("quotes", "approve");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [quote] = await db
    .select({ id: quotesTable.id, status: quotesTable.status, assignmentId: quotesTable.assignmentId })
    .from(quotesTable)
    .where(eq(quotesTable.id, id))
    .limit(1);

  if (!quote) return { success: false, message: "Offerte niet gevonden." };
  if (quote.status !== "sent") {
    return { success: false, message: "Alleen verzonden offertes kunnen worden goedgekeurd." };
  }

  await db
    .update(quotesTable)
    .set({ status: "approved", approvedBy: user.id, approvedAt: new Date() })
    .where(eq(quotesTable.id, id));

  // Advance assignment: awaiting_approval → approved → plannable
  await db
    .update(assignmentsTable)
    .set({ status: "approved" })
    .where(eq(assignmentsTable.id, quote.assignmentId));

  await db
    .update(assignmentsTable)
    .set({ status: "plannable" })
    .where(eq(assignmentsTable.id, quote.assignmentId));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "approve_quote",
    resource:   "quotes",
    resourceId: id,
    metadata:   { assignmentId: quote.assignmentId },
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
  revalidatePath(`/assignments/${quote.assignmentId}`);

  return { success: true };
}

export async function rejectQuote(id: string, reason: string): Promise<ActionResult> {
  await requirePermission("quotes", "approve");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [quote] = await db
    .select({ id: quotesTable.id, status: quotesTable.status, assignmentId: quotesTable.assignmentId })
    .from(quotesTable)
    .where(eq(quotesTable.id, id))
    .limit(1);

  if (!quote) return { success: false, message: "Offerte niet gevonden." };
  if (!["draft", "sent"].includes(quote.status)) {
    return { success: false, message: "Alleen concept- of verzonden offertes kunnen worden afgewezen." };
  }

  await db
    .update(quotesTable)
    .set({ status: "rejected", rejectionReason: reason.trim() || null })
    .where(eq(quotesTable.id, id));

  // Revert assignment back to review
  await db
    .update(assignmentsTable)
    .set({ status: "review" })
    .where(eq(assignmentsTable.id, quote.assignmentId));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "reject_quote",
    resource:   "quotes",
    resourceId: id,
    metadata:   { assignmentId: quote.assignmentId, reason },
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
  revalidatePath(`/assignments/${quote.assignmentId}`);

  return { success: true };
}
