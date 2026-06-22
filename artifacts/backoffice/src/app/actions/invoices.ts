"use server";

import { db } from "@workspace/db";
import {
  invoicesTable,
  assignmentsTable,
  customersTable,
  objectsTable,
  paymentsTable,
  auditLogTable,
  ASSIGNMENT_STATUS_TRANSITIONS,
  type AssignmentStatus,
  type InvoiceStatus,
} from "@workspace/db";
import { eq, ilike, or, and, asc, desc, sql, inArray, lt } from "drizzle-orm";
import { emitInvoiceWorkflowEvent } from "@workspace/db/workflow-events";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, hasPermission } from "@/lib/auth/permissions";
import { sendEmailWithResult, buildInvoiceEmail, buildPaymentReminderEmail, klantPortalUrl } from "@/lib/email";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { calculateInvoiceProposalForAssignment, type InvoiceProposalLineItem } from "@/lib/invoice-proposals";
import type { ActionResult } from "./customers";

export type { ActionResult, InvoiceStatus };

const PAGE_SIZE = 25;

async function notifyInvoiceWorkflow(input: Parameters<typeof emitInvoiceWorkflowEvent>[0]) {
  try {
    await emitInvoiceWorkflowEvent(input);
  } catch (error) {
    console.error("invoice workflow notification failed", {
      eventKey: input.eventKey,
      invoiceId: input.invoiceId,
      error,
    });
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type InvoiceRow = {
  id:             string;
  invoiceNumber:  string;
  customerId:     string;
  customerName:   string;
  assignmentId:   string;
  assignmentCode: string;
  amount:         string;
  vatPercentage:  string;
  vatAmount:      string;
  totalAmount:    string;
  status:         InvoiceStatus;
  dueDate:        string;
  paidDate:       string | null;
  createdAt:      string;
};

export type InvoiceDetail = {
  id:                  string;
  invoiceNumber:       string;
  customerId:          string;
  customerName:        string;
  customerAddress:     string | null;
  customerCity:        string | null;
  customerPostalCode:  string | null;
  customerEmail:       string | null;
  assignmentId:        string;
  assignmentCode:      string;
  assignmentTitle:     string;
  scheduledDate:       string | null;
  objectName:          string | null;
  amount:              string;
  vatPercentage:       string;
  vatAmount:           string;
  totalAmount:         string;
  status:              InvoiceStatus;
  dueDate:             string;
  paidDate:            string | null;
  notes:               string | null;
  createdAt:           string;
  updatedAt:           string;
  lineItems: InvoiceProposalLineItem[];
};

export type InvoiceSummary = {
  draftCount:    number;
  draftAmount:   string;
  sentCount:     number;
  sentAmount:    string;
  paidTotal:     string;
  paidThisMonth: string;
  totalCount:    number;
};

export type InvoiceStatusEvent = {
  action:    string;
  label:     string;
  timestamp: string;
};

export type AssignmentInvoiceData = {
  customerId:      string;
  customerName:    string;
  assignmentTitle: string;
  assignmentCode:  string;
  suggestedAmount: string;
  lineItems: InvoiceProposalLineItem[];
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listInvoices(params: {
  page?:   number;
  search?: string;
  status?: string;
}): Promise<{ rows: InvoiceRow[]; total: number }> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return { rows: [], total: 0 };

  const { page = 1, search = "", status = "" } = params;

  const conditions = [];
  if (search.trim()) {
    conditions.push(
      or(
        ilike(invoicesTable.invoiceNumber, `%${search.trim()}%`),
        ilike(customersTable.name,         `%${search.trim()}%`),
        ilike(assignmentsTable.code,       `%${search.trim()}%`),
      ),
    );
  }
  if (status && (["draft", "sent", "paid", "cancelled"] as string[]).includes(status)) {
    conditions.push(eq(invoicesTable.status, status));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id:             invoicesTable.id,
        invoiceNumber:  invoicesTable.invoiceNumber,
        customerId:     invoicesTable.customerId,
        customerName:   customersTable.name,
        assignmentId:   invoicesTable.assignmentId,
        assignmentCode: assignmentsTable.code,
        amount:         invoicesTable.amount,
        vatPercentage:  invoicesTable.vatPercentage,
        vatAmount:      invoicesTable.vatAmount,
        totalAmount:    invoicesTable.totalAmount,
        status:         invoicesTable.status,
        dueDate:        invoicesTable.dueDate,
        paidDate:       invoicesTable.paidDate,
        createdAt:      invoicesTable.createdAt,
      })
      .from(invoicesTable)
      .innerJoin(customersTable,   eq(invoicesTable.customerId,   customersTable.id))
      .innerJoin(assignmentsTable, eq(invoicesTable.assignmentId, assignmentsTable.id))
      .where(where)
      .orderBy(desc(invoicesTable.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(invoicesTable)
      .innerJoin(customersTable,   eq(invoicesTable.customerId,   customersTable.id))
      .innerJoin(assignmentsTable, eq(invoicesTable.assignmentId, assignmentsTable.id))
      .where(where),
  ]);

  return {
    rows: rows.map((r) => ({
      id:             r.id,
      invoiceNumber:  r.invoiceNumber,
      customerId:     r.customerId,
      customerName:   r.customerName ?? "",
      assignmentId:   r.assignmentId,
      assignmentCode: r.assignmentCode,
      amount:         r.amount ?? "0",
      vatPercentage:  r.vatPercentage ?? "21",
      vatAmount:      r.vatAmount ?? "0",
      totalAmount:    r.totalAmount ?? "0",
      status:         r.status as InvoiceStatus,
      dueDate:        r.dueDate,
      paidDate:       r.paidDate ?? null,
      createdAt:      r.createdAt.toISOString(),
    })),
    total: count,
  };
}

export async function getInvoice(id: string): Promise<InvoiceDetail | null> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return null;

  const [row] = await db
    .select({
      id:                 invoicesTable.id,
      invoiceNumber:      invoicesTable.invoiceNumber,
      customerId:         invoicesTable.customerId,
      customerName:       customersTable.name,
      customerAddress:    customersTable.address,
      customerCity:       customersTable.city,
      customerPostalCode: customersTable.postalCode,
      customerEmail:      customersTable.contactEmail,
      assignmentId:       invoicesTable.assignmentId,
      assignmentCode:     assignmentsTable.code,
      assignmentTitle:    assignmentsTable.title,
      scheduledDate:      assignmentsTable.scheduledDate,
      objectName:         objectsTable.name,
      amount:             invoicesTable.amount,
      vatPercentage:      invoicesTable.vatPercentage,
      vatAmount:          invoicesTable.vatAmount,
      totalAmount:        invoicesTable.totalAmount,
      status:             invoicesTable.status,
      dueDate:            invoicesTable.dueDate,
      paidDate:           invoicesTable.paidDate,
      notes:              invoicesTable.notes,
      createdAt:          invoicesTable.createdAt,
      updatedAt:          invoicesTable.updatedAt,
    })
    .from(invoicesTable)
    .innerJoin(customersTable,   eq(invoicesTable.customerId,   customersTable.id))
    .innerJoin(assignmentsTable, eq(invoicesTable.assignmentId, assignmentsTable.id))
    .leftJoin(objectsTable,      eq(assignmentsTable.objectId,  objectsTable.id))
    .where(eq(invoicesTable.id, id))
    .limit(1);

  if (!row) return null;

  const proposal = await calculateInvoiceProposalForAssignment(row.assignmentId, parseFloat(row.vatPercentage ?? "21"));

  return {
    id:                 row.id,
    invoiceNumber:      row.invoiceNumber,
    customerId:         row.customerId,
    customerName:       row.customerName ?? "",
    customerAddress:    row.customerAddress ?? null,
    customerCity:       row.customerCity ?? null,
    customerPostalCode: row.customerPostalCode ?? null,
    customerEmail:      row.customerEmail ?? null,
    assignmentId:       row.assignmentId,
    assignmentCode:     row.assignmentCode,
    assignmentTitle:    row.assignmentTitle,
    scheduledDate:      row.scheduledDate ?? null,
    objectName:         row.objectName ?? null,
    amount:             row.amount ?? "0",
    vatPercentage:      row.vatPercentage ?? "21",
    vatAmount:          row.vatAmount ?? "0",
    totalAmount:        row.totalAmount ?? "0",
    status:             row.status as InvoiceStatus,
    dueDate:            row.dueDate,
    paidDate:           row.paidDate ?? null,
    notes:              row.notes ?? null,
    createdAt:          row.createdAt.toISOString(),
    updatedAt:          row.updatedAt.toISOString(),
    lineItems: proposal.lineItems,
  };
}

/**
 * Returns prefilled data for the create-invoice form:
 * customer info + suggested amount from invoiceable task codes.
 */
export async function getAssignmentInvoiceData(
  assignmentId: string,
): Promise<AssignmentInvoiceData | null> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return null;

  const [row] = await db
    .select({
      customerId:      assignmentsTable.customerId,
      customerName:    customersTable.name,
      assignmentTitle: assignmentsTable.title,
      assignmentCode:  assignmentsTable.code,
    })
    .from(assignmentsTable)
    .innerJoin(customersTable, eq(assignmentsTable.customerId, customersTable.id))
    .where(eq(assignmentsTable.id, assignmentId))
    .limit(1);

  if (!row) return null;

  const proposal = await calculateInvoiceProposalForAssignment(assignmentId);

  return {
    customerId:      row.customerId,
    customerName:    row.customerName ?? "",
    assignmentTitle: row.assignmentTitle,
    assignmentCode:  row.assignmentCode,
    suggestedAmount: proposal.amount,
    lineItems: proposal.lineItems,
  };
}

export async function getOutstandingInvoicesCount(): Promise<number> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return 0;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invoicesTable)
    .where(inArray(invoicesTable.status, ["draft", "sent"]));

  return count ?? 0;
}

export async function getOverdueInvoicesCount(): Promise<number> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return 0;

  const today = new Date().toISOString().slice(0, 10);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.status, "sent"), lt(invoicesTable.dueDate, today)));

  return count ?? 0;
}

export type SendRemindersResult = { sent: number; skippedNoEmail: number; failedSend: number };

export async function sendPaymentReminders(): Promise<ActionResult<SendRemindersResult>> {
  await requirePermission("invoices", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const today = new Date().toISOString().slice(0, 10);

  const overdueRows = await db
    .select({
      id:            invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      totalAmount:   invoicesTable.totalAmount,
      dueDate:       invoicesTable.dueDate,
      customerEmail: customersTable.contactEmail,
      customerName:  customersTable.name,
    })
    .from(invoicesTable)
    .innerJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(and(eq(invoicesTable.status, "sent"), lt(invoicesTable.dueDate, today)))
    .orderBy(asc(invoicesTable.dueDate));

  // Split: no email vs has email
  const noEmailRows = overdueRows.filter((r) => !r.customerEmail);

  // Deduplicate by customer email — pick the oldest overdue invoice per customer
  // (rows already ordered by due_date asc, so first occurrence per email is the oldest)
  const seenEmails = new Set<string>();
  const deduped: typeof overdueRows = [];
  for (const row of overdueRows) {
    if (!row.customerEmail) continue;
    if (seenEmails.has(row.customerEmail)) continue;
    seenEmails.add(row.customerEmail);
    deduped.push(row);
  }

  let sent       = 0;
  let failedSend = 0;

  for (const row of deduped) {
    const dueDateFormatted = new Date(row.dueDate + "T00:00:00").toLocaleDateString("nl-NL", {
      day: "numeric", month: "long", year: "numeric",
    });

    const { subject, html } = buildPaymentReminderEmail({
      customerName:  row.customerName ?? "",
      invoiceNumber: row.invoiceNumber,
      totalAmount:   row.totalAmount ?? "0",
      dueDate:       dueDateFormatted,
    });

    const result = await sendEmailWithResult({ to: row.customerEmail!, subject, html });

    if (result.success) {
      await db.insert(auditLogTable).values({
        userId:     user.id,
        action:     "send_payment_reminder",
        resource:   "invoices",
        resourceId: row.id,
        metadata:   { to: row.customerEmail, invoiceNumber: row.invoiceNumber },
      });
      sent++;
    } else {
      failedSend++;
    }
  }

  revalidatePath("/invoices");
  return { success: true, data: { sent, skippedNoEmail: noEmailRows.length, failedSend } };
}

export async function getInvoiceSummary(): Promise<InvoiceSummary> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) {
    return { draftCount: 0, draftAmount: "0.00", sentCount: 0, sentAmount: "0.00", paidTotal: "0.00", paidThisMonth: "0.00", totalCount: 0 };
  }

  const now = new Date();
  const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const [summary] = await db
    .select({
      draftCount:    sql<number>`count(*) FILTER (WHERE status = 'draft')::int`,
      draftAmount:   sql<string>`coalesce(sum(total_amount) FILTER (WHERE status = 'draft'), 0)::text`,
      sentCount:     sql<number>`count(*) FILTER (WHERE status = 'sent')::int`,
      sentAmount:    sql<string>`coalesce(sum(total_amount) FILTER (WHERE status = 'sent'), 0)::text`,
      paidTotal:     sql<string>`coalesce(sum(total_amount) FILTER (WHERE status = 'paid'), 0)::text`,
      paidThisMonth: sql<string>`coalesce(sum(total_amount) FILTER (WHERE status = 'paid' AND paid_date >= ${startOfMonth}), 0)::text`,
      totalCount:    sql<number>`count(*)::int`,
    })
    .from(invoicesTable);

  return {
    draftCount:    summary?.draftCount    ?? 0,
    draftAmount:   parseFloat(summary?.draftAmount   ?? "0").toFixed(2),
    sentCount:     summary?.sentCount     ?? 0,
    sentAmount:    parseFloat(summary?.sentAmount    ?? "0").toFixed(2),
    paidTotal:     parseFloat(summary?.paidTotal     ?? "0").toFixed(2),
    paidThisMonth: parseFloat(summary?.paidThisMonth ?? "0").toFixed(2),
    totalCount:    summary?.totalCount    ?? 0,
  };
}

export async function getInvoiceStatusHistory(invoiceId: string): Promise<InvoiceStatusEvent[]> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return [];

  const ACTION_LABELS: Record<string, string> = {
    create_invoice:       "Factuur aangemaakt",
    create_invoice_proposal: "Factuurvoorstel aangemaakt",
    mark_invoice_sent:    "Gemarkeerd als verzonden",
    mark_invoice_paid:    "Gemarkeerd als betaald",
    cancel_invoice:       "Factuur geannuleerd",
    email_invoice:        "Factuur per e-mail verstuurd",
  };

  const rows = await db
    .select({ action: auditLogTable.action, createdAt: auditLogTable.createdAt })
    .from(auditLogTable)
    .where(
      and(
        eq(auditLogTable.resource, "invoices"),
        eq(auditLogTable.resourceId, invoiceId),
      )
    )
    .orderBy(asc(auditLogTable.createdAt));

  return rows.map((r) => ({
    action:    r.action,
    label:     ACTION_LABELS[r.action] ?? r.action,
    timestamp: r.createdAt.toISOString(),
  }));
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createInvoice(
  assignmentId: string,
  data: {
    amount:        string;
    vatPercentage: string;
    dueDate:       string;
    notes?:        string;
  },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission("invoices", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const amount        = parseFloat(data.amount ?? "0");
  const vatPercentage = parseFloat(data.vatPercentage ?? "21");

  if (isNaN(amount) || amount < 0) {
    return { success: false, message: "Ongeldig bedrag.", fieldErrors: { amount: "Voer een geldig bedrag in." } };
  }
  if (isNaN(vatPercentage) || vatPercentage < 0 || vatPercentage > 100) {
    return { success: false, message: "Ongeldig BTW-percentage.", fieldErrors: { vatPercentage: "Voer een geldig percentage in (0–100)." } };
  }
  if (!data.dueDate) {
    return { success: false, message: "Vervaldatum is verplicht.", fieldErrors: { dueDate: "Verplicht veld." } };
  }

  const vatAmount   = (amount * vatPercentage / 100);
  const totalAmount = amount + vatAmount;

  // Verify assignment is in report_approved status
  const [assignment] = await db
    .select({ status: assignmentsTable.status, customerId: assignmentsTable.customerId })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.id, assignmentId))
    .limit(1);

  if (!assignment) return { success: false, message: "Opdracht niet gevonden." };

  const [existingInvoice] = await db
    .select({ id: invoicesTable.id, status: invoicesTable.status })
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.assignmentId, assignmentId),
        inArray(invoicesTable.status, ["draft", "sent", "paid"]),
      ),
    )
    .limit(1);

  if (existingInvoice) {
    return {
      success: false,
      message: existingInvoice.status === "draft"
        ? "Er bestaat al een factuurvoorstel voor deze opdracht."
        : "Deze opdracht is al gefactureerd.",
    };
  }

  const currentStatus = assignment.status as AssignmentStatus;
  const allowedNext = ASSIGNMENT_STATUS_TRANSITIONS[currentStatus];
  if (!allowedNext.includes("invoice_ready")) {
    return { success: false, message: `Factuur aanmaken is niet mogelijk vanuit status "${currentStatus}".` };
  }

  try {
    const [created] = await db
      .insert(invoicesTable)
      .values({
        customerId:    assignment.customerId,
        assignmentId,
        amount:        amount.toFixed(2),
        vatPercentage: vatPercentage.toFixed(2),
        vatAmount:     vatAmount.toFixed(2),
        totalAmount:   totalAmount.toFixed(2),
        status:        "draft",
        dueDate:       data.dueDate,
        notes:         data.notes?.trim() || null,
        createdBy:     user.id,
      })
      .returning({ id: invoicesTable.id });

    // Advance assignment status → invoice_ready
    await db
      .update(assignmentsTable)
      .set({ status: "invoice_ready", updatedAt: new Date() })
      .where(eq(assignmentsTable.id, assignmentId));

    await db.insert(auditLogTable).values({
      userId:     user.id,
      action:     "create_invoice",
      resource:   "invoices",
      resourceId: created!.id,
      metadata:   { assignmentId, totalAmount: totalAmount.toFixed(2) },
    });

    revalidatePath(`/assignments/${assignmentId}`);
    revalidatePath("/invoices");
    return { success: true, data: { id: created!.id } };
  } catch {
    return { success: false, message: "Factuur aanmaken mislukt." };
  }
}

export async function markInvoiceSent(invoiceId: string): Promise<ActionResult> {
  await requirePermission("invoices", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [invoice] = await db
    .select({ assignmentId: invoicesTable.assignmentId, status: invoicesTable.status })
    .from(invoicesTable)
    .where(eq(invoicesTable.id, invoiceId))
    .limit(1);

  if (!invoice) return { success: false, message: "Factuur niet gevonden." };
  if (invoice.status !== "draft") {
    return { success: false, message: "Alleen conceptfacturen kunnen als verzonden worden gemarkeerd." };
  }

  await db
    .update(invoicesTable)
    .set({ status: "sent", updatedAt: new Date() })
    .where(eq(invoicesTable.id, invoiceId));

  // Advance assignment status → invoiced
  await db
    .update(assignmentsTable)
    .set({ status: "invoiced", updatedAt: new Date() })
    .where(eq(assignmentsTable.id, invoice.assignmentId));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "mark_invoice_sent",
    resource:   "invoices",
    resourceId: invoiceId,
    metadata:   { assignmentId: invoice.assignmentId },
  });

  await notifyInvoiceWorkflow({
    eventKey: "invoice_sent",
    invoiceId,
    actorUserId: user.id,
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath(`/assignments/${invoice.assignmentId}`);
  return { success: true };
}

export async function markInvoicePaid(invoiceId: string): Promise<ActionResult> {
  await requirePermission("invoices", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [invoice] = await db
    .select({ assignmentId: invoicesTable.assignmentId, status: invoicesTable.status })
    .from(invoicesTable)
    .where(eq(invoicesTable.id, invoiceId))
    .limit(1);

  if (!invoice) return { success: false, message: "Factuur niet gevonden." };
  if (invoice.status !== "sent") {
    return { success: false, message: "Alleen verzonden facturen kunnen als betaald worden gemarkeerd." };
  }

  const today = new Date().toISOString().slice(0, 10);

  await db
    .update(invoicesTable)
    .set({ status: "paid", paidDate: today, updatedAt: new Date() })
    .where(eq(invoicesTable.id, invoiceId));

  // Advance assignment: invoiced → paid → closed (auto-advance the full sequence)
  await db
    .update(assignmentsTable)
    .set({ status: "paid", updatedAt: new Date() })
    .where(eq(assignmentsTable.id, invoice.assignmentId));

  await db
    .update(assignmentsTable)
    .set({ status: "closed", updatedAt: new Date() })
    .where(eq(assignmentsTable.id, invoice.assignmentId));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "mark_invoice_paid",
    resource:   "invoices",
    resourceId: invoiceId,
    metadata:   { assignmentId: invoice.assignmentId, paidDate: today },
  });

  await notifyInvoiceWorkflow({
    eventKey: "invoice_paid",
    invoiceId,
    actorUserId: user.id,
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath(`/assignments/${invoice.assignmentId}`);
  return { success: true };
}

export async function cancelInvoice(invoiceId: string): Promise<ActionResult> {
  await requirePermission("invoices", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const [invoice] = await db
    .select({ assignmentId: invoicesTable.assignmentId, status: invoicesTable.status })
    .from(invoicesTable)
    .where(eq(invoicesTable.id, invoiceId))
    .limit(1);

  if (!invoice) return { success: false, message: "Factuur niet gevonden." };
  if (!["draft", "sent"].includes(invoice.status)) {
    return { success: false, message: "Alleen concept- of verzonden facturen kunnen worden geannuleerd." };
  }

  await db
    .update(invoicesTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(invoicesTable.id, invoiceId));

  // Revert assignment to report_approved so a new invoice can be created
  await db
    .update(assignmentsTable)
    .set({ status: "report_approved", updatedAt: new Date() })
    .where(eq(assignmentsTable.id, invoice.assignmentId));

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "cancel_invoice",
    resource:   "invoices",
    resourceId: invoiceId,
    metadata:   { assignmentId: invoice.assignmentId },
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath(`/assignments/${invoice.assignmentId}`);
  return { success: true };
}

export async function emailInvoice(invoiceId: string): Promise<ActionResult> {
  await requirePermission("invoices", "write");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const invoice = await getInvoice(invoiceId);
  if (!invoice) return { success: false, message: "Factuur niet gevonden." };

  if (invoice.status !== "sent") {
    return { success: false, message: "E-mail kan alleen voor verzonden facturen worden verstuurd." };
  }
  if (!invoice.customerEmail) {
    return { success: false, message: "Klant heeft geen e-mailadres geregistreerd." };
  }

  const [openPayment] = await db
    .select({ checkoutUrl: paymentsTable.checkoutUrl })
    .from(paymentsTable)
    .where(and(eq(paymentsTable.invoiceId, invoiceId), eq(paymentsTable.status, "open")))
    .limit(1);

  const paymentUrl = openPayment?.checkoutUrl ?? null;

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateInvoicePdf(invoice);
  } catch {
    return { success: false, message: "PDF genereren mislukt." };
  }

  const portalUrl = klantPortalUrl();
  const dueDateFormatted = new Date(invoice.dueDate + "T00:00:00").toLocaleDateString("nl-NL", {
    day: "numeric", month: "long", year: "numeric",
  });

  const { subject, html } = buildInvoiceEmail({
    customerName:  invoice.customerName,
    invoiceNumber: invoice.invoiceNumber,
    totalAmount:   invoice.totalAmount,
    dueDate:       dueDateFormatted,
    paymentUrl,
    portalUrl,
  });

  const result = await sendEmailWithResult({
    to:          invoice.customerEmail,
    subject,
    html,
    attachments: [{ filename: `${invoice.invoiceNumber}.pdf`, content: pdfBuffer }],
  });

  if (!result.success) {
    return { success: false, message: result.error ?? "E-mail verzenden mislukt." };
  }

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "email_invoice",
    resource:   "invoices",
    resourceId: invoiceId,
    metadata:   { to: invoice.customerEmail, invoiceNumber: invoice.invoiceNumber },
  });

  revalidatePath(`/invoices/${invoiceId}`);
  return { success: true };
}

export async function getInvoiceForAssignment(assignmentId: string): Promise<InvoiceRow | null> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return null;

  const [row] = await db
    .select({
      id:             invoicesTable.id,
      invoiceNumber:  invoicesTable.invoiceNumber,
      customerId:     invoicesTable.customerId,
      customerName:   customersTable.name,
      assignmentId:   invoicesTable.assignmentId,
      assignmentCode: assignmentsTable.code,
      amount:         invoicesTable.amount,
      vatPercentage:  invoicesTable.vatPercentage,
      vatAmount:      invoicesTable.vatAmount,
      totalAmount:    invoicesTable.totalAmount,
      status:         invoicesTable.status,
      dueDate:        invoicesTable.dueDate,
      paidDate:       invoicesTable.paidDate,
      createdAt:      invoicesTable.createdAt,
    })
    .from(invoicesTable)
    .innerJoin(customersTable,   eq(invoicesTable.customerId,   customersTable.id))
    .innerJoin(assignmentsTable, eq(invoicesTable.assignmentId, assignmentsTable.id))
    .where(eq(invoicesTable.assignmentId, assignmentId))
    .orderBy(desc(invoicesTable.createdAt))
    .limit(1);

  if (!row) return null;

  return {
    id:             row.id,
    invoiceNumber:  row.invoiceNumber,
    customerId:     row.customerId,
    customerName:   row.customerName ?? "",
    assignmentId:   row.assignmentId,
    assignmentCode: row.assignmentCode,
    amount:         row.amount ?? "0",
    vatPercentage:  row.vatPercentage ?? "21",
    vatAmount:      row.vatAmount ?? "0",
    totalAmount:    row.totalAmount ?? "0",
    status:         row.status as InvoiceStatus,
    dueDate:        row.dueDate,
    paidDate:       row.paidDate ?? null,
    createdAt:      row.createdAt.toISOString(),
  };
}

// ─── Customer-scoped query ─────────────────────────────────────────────────────

export async function listInvoicesForCustomer(
  customerId: string,
  limit = 25,
): Promise<InvoiceRow[]> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return [];

  const rows = await db
    .select({
      id:             invoicesTable.id,
      invoiceNumber:  invoicesTable.invoiceNumber,
      customerId:     invoicesTable.customerId,
      customerName:   customersTable.name,
      assignmentId:   invoicesTable.assignmentId,
      assignmentCode: assignmentsTable.code,
      amount:         invoicesTable.amount,
      vatPercentage:  invoicesTable.vatPercentage,
      vatAmount:      invoicesTable.vatAmount,
      totalAmount:    invoicesTable.totalAmount,
      status:         invoicesTable.status,
      dueDate:        invoicesTable.dueDate,
      paidDate:       invoicesTable.paidDate,
      createdAt:      invoicesTable.createdAt,
    })
    .from(invoicesTable)
    .innerJoin(customersTable,   eq(invoicesTable.customerId,   customersTable.id))
    .innerJoin(assignmentsTable, eq(invoicesTable.assignmentId, assignmentsTable.id))
    .where(eq(invoicesTable.customerId, customerId))
    .orderBy(desc(invoicesTable.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id:             r.id,
    invoiceNumber:  r.invoiceNumber,
    customerId:     r.customerId,
    customerName:   r.customerName ?? "",
    assignmentId:   r.assignmentId,
    assignmentCode: r.assignmentCode,
    amount:         r.amount         ?? "0",
    vatPercentage:  r.vatPercentage  ?? "21",
    vatAmount:      r.vatAmount      ?? "0",
    totalAmount:    r.totalAmount    ?? "0",
    status:         r.status as InvoiceStatus,
    dueDate:        r.dueDate,
    paidDate:       r.paidDate ?? null,
    createdAt:      r.createdAt.toISOString(),
  }));
}
