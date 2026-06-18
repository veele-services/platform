"use server";

import { db } from "@workspace/db";
import {
  assignmentsTable,
  objectsTable,
  assignmentTasksTable,
  assignmentPhotosTable,
  quotesTable,
  invoicesTable,
  insertAssignmentSchema,
  customersTable,
  organizationSettingsTable,
  type AssignmentStatus,
  type QuoteStatus,
  type InvoiceStatus,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { sendEmail, buildQuoteDecisionEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod/v4";
import { revalidatePath } from "next/cache";
import { getMyCustomerId } from "./customer";
import { createClient } from "@/lib/supabase/server";

export type CustomerAssignment = {
  id:               string;
  code:             string;
  title:            string;
  status:           AssignmentStatus;
  scheduledDate:    string | null;
  scheduledStart:   string | null;
  scheduledEnd:     string | null;
  objectName:       string | null;
  objectAddress:    string | null;
  objectCity:       string | null;
  createdAt:        string;
  /** Linked quote (if any). */
  quoteNumber:      string | null;
  quoteAmount:      string | null;
  quoteStatus:      QuoteStatus | null;
  quoteValidityDate: string | null;
};

export async function getMyAssignments(): Promise<CustomerAssignment[]> {
  const customerId = await getMyCustomerId();
  if (!customerId) return [];

  const rows = await db
    .select({
      id:               assignmentsTable.id,
      code:             assignmentsTable.code,
      title:            assignmentsTable.title,
      status:           assignmentsTable.status,
      scheduledDate:    assignmentsTable.scheduledDate,
      scheduledStart:   assignmentsTable.scheduledStart,
      scheduledEnd:     assignmentsTable.scheduledEnd,
      createdAt:        assignmentsTable.createdAt,
      objectName:       objectsTable.name,
      objectAddress:    objectsTable.address,
      objectCity:       objectsTable.city,
      quoteNumber:      quotesTable.quoteNumber,
      quoteAmount:      quotesTable.amount,
      quoteStatus:      quotesTable.status,
      quoteValidityDate: quotesTable.validityDate,
    })
    .from(assignmentsTable)
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .leftJoin(quotesTable, eq(quotesTable.assignmentId, assignmentsTable.id))
    .where(eq(assignmentsTable.customerId, customerId))
    .orderBy(desc(assignmentsTable.createdAt));

  return rows.map((r) => ({
    id:               r.id,
    code:             r.code,
    title:            r.title,
    status:           r.status as AssignmentStatus,
    scheduledDate:    r.scheduledDate,
    scheduledStart:   r.scheduledStart,
    scheduledEnd:     r.scheduledEnd,
    objectName:       r.objectName ?? null,
    objectAddress:    r.objectAddress ?? null,
    objectCity:       r.objectCity ?? null,
    createdAt:        r.createdAt.toISOString(),
    quoteNumber:      r.quoteNumber ?? null,
    quoteAmount:      r.quoteAmount ?? null,
    quoteStatus:      (r.quoteStatus ?? null) as QuoteStatus | null,
    quoteValidityDate: r.quoteValidityDate ?? null,
  }));
}

export type RequestResult =
  | { success: true;  id: string }
  | { success: false; message: string };

const requestSchema = z.object({
  title:       z.string().min(2, "Titel is verplicht").max(255),
  description: z.string().min(5, "Omschrijving is verplicht").max(5000),
  objectId:    z.string().uuid().optional(),
  priority:    z.enum(["low", "normal", "high", "urgent"]),
});

export type RequestAssignmentInput = z.infer<typeof requestSchema>;

export async function requestAssignment(input: RequestAssignmentInput): Promise<RequestResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const customerId = await getMyCustomerId();
  if (!customerId) return { success: false, message: "Geen klantprofiel gevonden voor dit account." };

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { success: false, message: first?.message ?? "Ongeldig verzoek." };
  }

  const { title, description, objectId, priority } = parsed.data;

  // Ownership check: verify the selected object belongs to this customer.
  if (objectId) {
    const [owned] = await db
      .select({ id: objectsTable.id })
      .from(objectsTable)
      .where(
        and(
          eq(objectsTable.id, objectId),
          eq(objectsTable.customerId, customerId),
        ),
      )
      .limit(1);
    if (!owned) return { success: false, message: "Object niet gevonden of niet toegankelijk." };
  }

  const validatedData = insertAssignmentSchema.parse({
    title,
    description,
    customerId,
    objectId:   objectId ?? null,
    status:     "requested",
    priority,
    createdBy:  user.id,
  });

  const [inserted] = await db
    .insert(assignmentsTable)
    .values(validatedData)
    .returning({ id: assignmentsTable.id });

  if (!inserted) return { success: false, message: "Aanmaken mislukt." };

  return { success: true, id: inserted.id };
}

// ─── Assignment detail ────────────────────────────────────────────────────────

export type ApprovedPhoto = {
  id:        string;
  signedUrl: string | null;
};

export type AssignmentQuote = {
  id:           string;
  quoteNumber:  string;
  amount:       string;
  status:       QuoteStatus;
  validityDate: string;
};

export type AssignmentInvoice = {
  id:            string;
  invoiceNumber: string;
  totalAmount:   string;
  status:        InvoiceStatus;
};

export type CustomerAssignmentDetail = {
  id:             string;
  code:           string;
  title:          string;
  description:    string | null;
  status:         AssignmentStatus;
  scheduledDate:  string | null;
  scheduledStart: string | null;
  scheduledEnd:   string | null;
  objectName:     string | null;
  objectAddress:  string | null;
  objectCity:     string | null;
  objectPostalCode: string | null;
  createdAt:      string;
  tasks: {
    id:        string;
    sortOrder: number;
    notes:     string | null;
  }[];
  /** Photos that management has explicitly approved for customer visibility. */
  approvedPhotos: ApprovedPhoto[];
  /** Linked quote — null if no quote has been created for this assignment. */
  quote:   AssignmentQuote | null;
  /** Linked invoice — null if no invoice has been created for this assignment. */
  invoice: AssignmentInvoice | null;
};

/**
 * Fetch full detail for a single assignment belonging to the logged-in customer.
 * Includes linked quote and invoice via LEFT JOINs.
 */
export async function getMyAssignmentDetail(
  assignmentId: string,
): Promise<CustomerAssignmentDetail | null> {
  const customerId = await getMyCustomerId();
  if (!customerId) return null;

  const [row] = await db
    .select({
      id:                assignmentsTable.id,
      code:              assignmentsTable.code,
      title:             assignmentsTable.title,
      description:       assignmentsTable.description,
      status:            assignmentsTable.status,
      scheduledDate:     assignmentsTable.scheduledDate,
      scheduledStart:    assignmentsTable.scheduledStart,
      scheduledEnd:      assignmentsTable.scheduledEnd,
      createdAt:         assignmentsTable.createdAt,
      objectName:        objectsTable.name,
      objectAddress:     objectsTable.address,
      objectCity:        objectsTable.city,
      objectPostalCode:  objectsTable.postalCode,
      quoteId:           quotesTable.id,
      quoteNumber:       quotesTable.quoteNumber,
      quoteAmount:       quotesTable.amount,
      quoteStatus:       quotesTable.status,
      quoteValidityDate: quotesTable.validityDate,
      invoiceId:          invoicesTable.id,
      invoiceNumber:      invoicesTable.invoiceNumber,
      invoiceTotalAmount: invoicesTable.totalAmount,
      invoiceStatus:      invoicesTable.status,
    })
    .from(assignmentsTable)
    .leftJoin(objectsTable,  eq(assignmentsTable.objectId,   objectsTable.id))
    .leftJoin(quotesTable,   eq(quotesTable.assignmentId,    assignmentsTable.id))
    .leftJoin(invoicesTable, eq(invoicesTable.assignmentId,  assignmentsTable.id))
    .where(
      and(
        eq(assignmentsTable.id,         assignmentId),
        eq(assignmentsTable.customerId, customerId),
      ),
    )
    .limit(1);

  if (!row) return null;

  const [tasks, photoRows] = await Promise.all([
    db
      .select({
        id:        assignmentTasksTable.id,
        sortOrder: assignmentTasksTable.sortOrder,
        notes:     assignmentTasksTable.notes,
      })
      .from(assignmentTasksTable)
      .where(eq(assignmentTasksTable.assignmentId, assignmentId))
      .orderBy(assignmentTasksTable.sortOrder),
    db
      .select({ id: assignmentPhotosTable.id, storagePath: assignmentPhotosTable.storagePath })
      .from(assignmentPhotosTable)
      .where(
        and(
          eq(assignmentPhotosTable.assignmentId, assignmentId),
          eq(assignmentPhotosTable.isApproved,   true),
        ),
      )
      .orderBy(assignmentPhotosTable.createdAt),
  ]);

  const admin = createAdminClient();
  const approvedPhotos: ApprovedPhoto[] = await Promise.all(
    photoRows.map(async (p) => {
      try {
        const { data } = await admin.storage
          .from("assignment-photos")
          .createSignedUrl(p.storagePath, 3600);
        return { id: p.id, signedUrl: data?.signedUrl ?? null };
      } catch {
        return { id: p.id, signedUrl: null };
      }
    }),
  );

  const quote: AssignmentQuote | null = row.quoteId
    ? {
        id:           row.quoteId,
        quoteNumber:  row.quoteNumber ?? "",
        amount:       row.quoteAmount ?? "0",
        status:       (row.quoteStatus ?? "draft") as QuoteStatus,
        validityDate: row.quoteValidityDate ?? "",
      }
    : null;

  const invoice: AssignmentInvoice | null = row.invoiceId
    ? {
        id:            row.invoiceId,
        invoiceNumber: row.invoiceNumber ?? "",
        totalAmount:   row.invoiceTotalAmount ?? "0",
        status:        (row.invoiceStatus ?? "draft") as InvoiceStatus,
      }
    : null;

  return {
    id:               row.id,
    code:             row.code,
    title:            row.title,
    description:      row.description ?? null,
    status:           row.status as AssignmentStatus,
    scheduledDate:    row.scheduledDate,
    scheduledStart:   row.scheduledStart,
    scheduledEnd:     row.scheduledEnd,
    createdAt:        row.createdAt.toISOString(),
    objectName:       row.objectName       ?? null,
    objectAddress:    row.objectAddress    ?? null,
    objectCity:       row.objectCity       ?? null,
    objectPostalCode: row.objectPostalCode ?? null,
    tasks: tasks.map((t) => ({
      id:        t.id,
      sortOrder: t.sortOrder,
      notes:     t.notes ?? null,
    })),
    approvedPhotos,
    quote,
    invoice,
  };
}

// ─── Quote approval workflow ──────────────────────────────────────────────────

export async function approveQuote(assignmentId: string): Promise<RequestResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const customerId = await getMyCustomerId();
  if (!customerId) return { success: false, message: "Geen klantprofiel gevonden." };

  const [assignment] = await db
    .select({ id: assignmentsTable.id })
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.id,         assignmentId),
        eq(assignmentsTable.customerId, customerId),
        eq(assignmentsTable.status,     "awaiting_approval"),
      ),
    )
    .limit(1);

  if (!assignment) {
    return { success: false, message: "Offerte niet gevonden of al verwerkt." };
  }

  await db
    .update(assignmentsTable)
    .set({ status: "approved" })
    .where(eq(assignmentsTable.id, assignmentId));

  void (async () => {
    const [orgSettings] = await db
      .select({ emailAfzender: organizationSettingsTable.emailAfzender })
      .from(organizationSettingsTable)
      .limit(1);
    if (!orgSettings?.emailAfzender) return;

    const [[customer], [quote]] = await Promise.all([
      db.select({ name: customersTable.name })
        .from(customersTable)
        .where(eq(customersTable.id, customerId))
        .limit(1),
      db.select({ quoteNumber: quotesTable.quoteNumber })
        .from(quotesTable)
        .where(eq(quotesTable.assignmentId, assignmentId))
        .limit(1),
    ]);

    if (!quote) return;
    const { subject, html } = buildQuoteDecisionEmail({
      customerName: customer?.name ?? "Onbekende klant",
      quoteNumber:  quote.quoteNumber,
      decision:     "geaccepteerd",
      reason:       null,
    });
    await sendEmail({ to: orgSettings.emailAfzender, subject, html });
  })();

  revalidatePath("/klant/opdrachten");
  return { success: true, id: assignmentId };
}

export async function rejectQuote(assignmentId: string, reason?: string): Promise<RequestResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const customerId = await getMyCustomerId();
  if (!customerId) return { success: false, message: "Geen klantprofiel gevonden." };

  const [assignment] = await db
    .select({ id: assignmentsTable.id })
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.id,         assignmentId),
        eq(assignmentsTable.customerId, customerId),
        eq(assignmentsTable.status,     "awaiting_approval"),
      ),
    )
    .limit(1);

  if (!assignment) {
    return { success: false, message: "Offerte niet gevonden of al verwerkt." };
  }

  await db
    .update(assignmentsTable)
    .set({ status: "review" })
    .where(eq(assignmentsTable.id, assignmentId));

  await db
    .update(quotesTable)
    .set({ rejectionReason: reason?.trim() || null })
    .where(eq(quotesTable.assignmentId, assignmentId));

  void (async () => {
    const [orgSettings] = await db
      .select({ emailAfzender: organizationSettingsTable.emailAfzender })
      .from(organizationSettingsTable)
      .limit(1);
    if (!orgSettings?.emailAfzender) return;

    const [[customer], [quote]] = await Promise.all([
      db.select({ name: customersTable.name })
        .from(customersTable)
        .where(eq(customersTable.id, customerId))
        .limit(1),
      db.select({ quoteNumber: quotesTable.quoteNumber })
        .from(quotesTable)
        .where(eq(quotesTable.assignmentId, assignmentId))
        .limit(1),
    ]);

    if (!quote) return;
    const { subject, html } = buildQuoteDecisionEmail({
      customerName: customer?.name ?? "Onbekende klant",
      quoteNumber:  quote.quoteNumber,
      decision:     "afgewezen",
      reason:       reason?.trim() || null,
    });
    await sendEmail({ to: orgSettings.emailAfzender, subject, html });
  })();

  revalidatePath("/klant/opdrachten");
  return { success: true, id: assignmentId };
}
