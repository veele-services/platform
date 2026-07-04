"use server";

import { db } from "@workspace/db";
import {
  quotesTable,
  assignmentsTable,
  assignmentTasksTable,
  customersTable,
  taskCodesTable,
  auditLogTable,
  organizationSettingsTable,
  ASSIGNMENT_STATUS_TRANSITIONS,
  type AssignmentStatus,
  type QuoteStatus,
} from "@workspace/db";
import { eq, ilike, or, and, asc, desc, sql, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, hasPermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import { sendEmail, buildQuoteExpiredEmail } from "@/lib/email";
import { emitDomainEvent } from "@workspace/db/events";
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

type SnapshotTaskLineItemRow = {
  snapshotCode: string | null;
  snapshotName: string | null;
  snapshotPrice: string | null;
  snapshotInvoiceable: boolean | null;
  taskCodeCode: string | null;
  taskCodeName: string | null;
  price: string | null;
  invoiceable: boolean | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function isExpired(status: string, validityDate: string): boolean {
  return status === "sent" && validityDate < todayString();
}

function formatEuro(value: string | null | undefined): string {
  const number = Number.parseFloat(value ?? "0");
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(
    Number.isFinite(number) ? number : 0,
  );
}

function resolveSnapshotTaskLineItem(row: SnapshotTaskLineItemRow) {
  return {
    taskCodeCode: row.snapshotCode ?? row.taskCodeCode ?? null,
    taskCodeName: row.snapshotName ?? row.taskCodeName ?? null,
    price:        row.snapshotPrice ?? row.price ?? null,
    invoiceable:  row.snapshotInvoiceable ?? row.invoiceable ?? false,
  };
}

async function getQuoteAssignmentForCurrentTenant(
  quoteId: string,
): Promise<{ assignmentId: string; status: QuoteStatus } | null> {
  const tenantId = await requireCurrentTenantId();
  const [quote] = await db
    .select({ assignmentId: quotesTable.assignmentId, status: quotesTable.status })
    .from(quotesTable)
    .innerJoin(assignmentsTable, eq(quotesTable.assignmentId, assignmentsTable.id))
    .where(and(eq(quotesTable.id, quoteId), eq(assignmentsTable.tenantId, tenantId)))
    .limit(1);

  return quote ? { assignmentId: quote.assignmentId, status: quote.status as QuoteStatus } : null;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getPendingQuotesCount(): Promise<number> {
  const canRead = await hasPermission("quotes", "read");
  if (!canRead) return 0;

  const tenantId = await requireCurrentTenantId();

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(quotesTable)
    .innerJoin(assignmentsTable, eq(quotesTable.assignmentId, assignmentsTable.id))
    .where(and(eq(quotesTable.status, "sent"), eq(assignmentsTable.tenantId, tenantId)));

  return result?.count ?? 0;
}

export async function getQuoteSummary(): Promise<QuoteSummary> {
  const canRead = await hasPermission("quotes", "read");
  if (!canRead) {
    return { draftCount: 0, sentCount: 0, approvedCount: 0, rejectedCount: 0, expiredCount: 0, totalCount: 0 };
  }

  const tenantId = await requireCurrentTenantId();
  const today = todayString();

  const [counts] = await db
    .select({
      draftCount:    sql<number>`count(*) FILTER (WHERE ${quotesTable.status} = 'draft')::int`,
      sentCount:     sql<number>`count(*) FILTER (WHERE ${quotesTable.status} = 'sent' AND ${quotesTable.validityDate} >= ${today})::int`,
      approvedCount: sql<number>`count(*) FILTER (WHERE ${quotesTable.status} = 'approved')::int`,
      rejectedCount: sql<number>`count(*) FILTER (WHERE ${quotesTable.status} = 'rejected')::int`,
      expiredCount:  sql<number>`count(*) FILTER (WHERE ${quotesTable.status} IN ('expired') OR (${quotesTable.status} = 'sent' AND ${quotesTable.validityDate} < ${today}))::int`,
      totalCount:    sql<number>`count(*)::int`,
    })
    .from(quotesTable)
    .innerJoin(assignmentsTable, eq(quotesTable.assignmentId, assignmentsTable.id))
    .where(eq(assignmentsTable.tenantId, tenantId));

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

  const tenantId = await requireCurrentTenantId();
  const { page = 1, search = "", status = "" } = params;

  const conditions = [eq(assignmentsTable.tenantId, tenantId)];
  if (search.trim()) {
    const searchCondition = or(
      ilike(quotesTable.quoteNumber, `%${search.trim()}%`),
      ilike(customersTable.name,     `%${search.trim()}%`),
      ilike(assignmentsTable.code,   `%${search.trim()}%`),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  if (status && ["draft", "sent", "approved", "rejected", "expired"].includes(status)) {
    if (status === "expired") {
      const expiredCondition = or(
        eq(quotesTable.status, "expired"),
        and(
          eq(quotesTable.status, "sent"),
          lt(quotesTable.validityDate, todayString()),
        ),
      );
      if (expiredCondition) conditions.push(expiredCondition);
    } else {
      conditions.push(eq(quotesTable.status, status));
    }
  }

  const where = and(...conditions);

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
      .innerJoin(assignmentsTable, eq(quotesTable.assignmentId, assignmentsTable.id))
      .where(where)
      .orderBy(desc(quotesTable.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(quotesTable)
      .leftJoin(customersTable,   eq(quotesTable.customerId,   customersTable.id))
      .innerJoin(assignmentsTable, eq(quotesTable.assignmentId, assignmentsTable.id))
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

  const tenantId = await requireCurrentTenantId();

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
    .innerJoin(assignmentsTable, eq(quotesTable.assignmentId, assignmentsTable.id))
    .where(and(eq(quotesTable.id, id), eq(assignmentsTable.tenantId, tenantId)))
    .limit(1);

  if (!row) return null;

  const lineItems = await db
    .select({
      snapshotCode:        assignmentTasksTable.taskCodeCode,
      snapshotName:        assignmentTasksTable.taskCodeName,
      snapshotPrice:       assignmentTasksTable.taskCodePrice,
      snapshotInvoiceable: assignmentTasksTable.taskCodeInvoiceable,
      taskCodeCode:        taskCodesTable.code,
      taskCodeName:        taskCodesTable.name,
      price:               taskCodesTable.price,
      invoiceable:         taskCodesTable.invoiceable,
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
    lineItems:       lineItems.map(resolveSnapshotTaskLineItem),
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

  const tenantId = await requireCurrentTenantId();

  const [row] = await db
    .select({
      id:           quotesTable.id,
      quoteNumber:  quotesTable.quoteNumber,
      status:       quotesTable.status,
      amount:       quotesTable.amount,
      validityDate: quotesTable.validityDate,
    })
    .from(quotesTable)
    .innerJoin(assignmentsTable, eq(quotesTable.assignmentId, assignmentsTable.id))
    .where(and(eq(quotesTable.assignmentId, assignmentId), eq(assignmentsTable.tenantId, tenantId)))
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

  const tenantId = await requireCurrentTenantId();

  const [assignment] = await db
    .select({ id: assignmentsTable.id })
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, tenantId)))
    .limit(1);

  if (!assignment) return null;

  const tasks = await db
    .select({
      snapshotCode:        assignmentTasksTable.taskCodeCode,
      snapshotName:        assignmentTasksTable.taskCodeName,
      snapshotPrice:       assignmentTasksTable.taskCodePrice,
      snapshotInvoiceable: assignmentTasksTable.taskCodeInvoiceable,
      taskCodeCode:        taskCodesTable.code,
      taskCodeName:        taskCodesTable.name,
      price:               taskCodesTable.price,
      invoiceable:         taskCodesTable.invoiceable,
    })
    .from(assignmentTasksTable)
    .leftJoin(taskCodesTable, eq(assignmentTasksTable.taskCodeId, taskCodesTable.id))
    .where(eq(assignmentTasksTable.assignmentId, assignmentId))
    .orderBy(asc(assignmentTasksTable.sortOrder));

  const lineItems = tasks.map(resolveSnapshotTaskLineItem);
  const suggestedAmount = lineItems
    .filter((t) => t.invoiceable && t.price)
    .reduce((sum, t) => sum + parseFloat(t.price ?? "0"), 0);

  // Default validity: today + 30 days
  const d = new Date();
  d.setDate(d.getDate() + 30);
  const defaultValidityDate = d.toISOString().slice(0, 10);

  return {
    suggestedAmount,
    defaultValidityDate,
    lineItems,
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

  const tenantId = await requireCurrentTenantId();

  // Validate assignment is in review status and belongs to the current tenant.
  const [assignment] = await db
    .select({ id: assignmentsTable.id, status: assignmentsTable.status, customerId: assignmentsTable.customerId })
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, assignmentId), eq(assignmentsTable.tenantId, tenantId)))
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

  const tenantId = await requireCurrentTenantId();

  const [quote] = await db
    .select({
      id: quotesTable.id,
      status: quotesTable.status,
      assignmentId: quotesTable.assignmentId,
      assignmentCode: assignmentsTable.code,
      assignmentTitle: assignmentsTable.title,
      customerId: quotesTable.customerId,
      customerName: customersTable.name,
      quoteNumber: quotesTable.quoteNumber,
      amount: quotesTable.amount,
      validityDate: quotesTable.validityDate,
    })
    .from(quotesTable)
    .innerJoin(assignmentsTable, eq(quotesTable.assignmentId, assignmentsTable.id))
    .innerJoin(customersTable, eq(quotesTable.customerId, customersTable.id))
    .where(and(eq(quotesTable.id, id), eq(assignmentsTable.tenantId, tenantId)))
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
    tenantId,
    userId:     user.id,
    action:     "send_quote",
    resource:   "quotes",
    resourceId: id,
    metadata:   { assignmentId: quote.assignmentId },
  });

  await emitDomainEvent({
    eventKey: "quote_sent_to_customer",
    tenantId,
    actorUserId: user.id,
    audience: "customer",
    aggregate: { type: "quote", id },
    recipients: { customerIds: [quote.customerId] },
    payload: {
      quoteId: id,
      quoteNumber: quote.quoteNumber,
      assignmentId: quote.assignmentId,
      amount: quote.amount ?? "0",
      validityDate: quote.validityDate ?? "",
      quote: {
        id,
        number: quote.quoteNumber,
        amount: formatEuro(quote.amount),
        valid_until: quote.validityDate ?? "",
      },
      assignment: {
        id: quote.assignmentId,
        code: quote.assignmentCode,
        title: quote.assignmentTitle,
      },
      customer: {
        id: quote.customerId,
        name: quote.customerName ?? "klant",
      },
      recipient: {
        name: quote.customerName ?? "klant",
      },
      href: "/offertes",
    },
    fallback: {
      title: `Offerte ${quote.quoteNumber} staat klaar`,
      body: "Er staat een nieuwe offerte klaar in het klantportaal.",
      category: "quotes",
      href: "/offertes",
      sourceLabel: "Veele Services",
      emailSubject: `Offerte ${quote.quoteNumber} staat klaar`,
      emailHtml: `
        <h2>Uw offerte staat klaar</h2>
        <p>Er staat een nieuwe offerte klaar in het klantportaal.</p>
        <p><strong>Offertenummer:</strong> ${quote.quoteNumber}</p>
        <p><strong>Bedrag:</strong> ${quote.amount ?? "0"}</p>
        <p><strong>Geldig tot:</strong> ${quote.validityDate ?? "-"}</p>
      `,
    },
    audit: false,
  });

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

  const quote = await getQuoteAssignmentForCurrentTenant(id);

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

  const quote = await getQuoteAssignmentForCurrentTenant(id);

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

/**
 * Finds all 'sent' quotes past their validity_date, marks them 'expired',
 * and sends an expiry notification to the customer (if enabled in org settings).
 *
 * Intended to be called from a daily cron / admin webhook.
 * Returns the number of quotes expired and emails sent.
 */
export async function processExpiredQuotes(): Promise<ActionResult<{ expired: number; notified: number }>> {
  await requirePermission("quotes", "write");

  const tenantId = await requireCurrentTenantId();
  const today = todayString();

  const expirableQuotes = await db
    .select({
      id:            quotesTable.id,
      quoteNumber:   quotesTable.quoteNumber,
      assignmentId:  quotesTable.assignmentId,
      amount:        quotesTable.amount,
      customerName:  customersTable.name,
      customerEmail: customersTable.contactEmail,
    })
    .from(quotesTable)
    .innerJoin(assignmentsTable, eq(quotesTable.assignmentId, assignmentsTable.id))
    .leftJoin(customersTable, eq(quotesTable.customerId, customersTable.id))
    .where(
      and(
        eq(assignmentsTable.tenantId, tenantId),
        eq(quotesTable.status, "sent"),
        lt(quotesTable.validityDate, today),
      ),
    );

  if (expirableQuotes.length === 0) {
    return { success: true, data: { expired: 0, notified: 0 } };
  }

  const [orgSettings] = await db
    .select({ notifEnabled: organizationSettingsTable.notifOfferteVerlopen })
    .from(organizationSettingsTable)
    .limit(1);

  for (const q of expirableQuotes) {
    await db
      .update(quotesTable)
      .set({ status: "expired" })
      .where(eq(quotesTable.id, q.id));
  }

  let notified = 0;

  if (orgSettings?.notifEnabled) {
    for (const q of expirableQuotes) {
      if (!q.customerEmail) continue;
      const { subject, html } = buildQuoteExpiredEmail({
        customerName: q.customerName ?? "",
        quoteNumber:  q.quoteNumber,
        amount:       q.amount ?? "0",
      });
      await sendEmail({ to: q.customerEmail, subject, html });
      notified++;
    }
  }

  revalidatePath("/quotes");

  return { success: true, data: { expired: expirableQuotes.length, notified } };
}
