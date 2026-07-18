"use server";

import { db } from "@workspace/db";
import {
  assignmentsTable,
  objectsTable,
  assignmentTasksTable,
  assignmentPhotosTable,
  taskCodesTable,
  getTenantBoundAssignmentMediaStoragePath,
  quotesTable,
  invoicesTable,
  insertAssignmentSchema,
  customersTable,
  sectorsTable,
  auditLogTable,
  organizationSettingsTable,
  type AssignmentStatus,
  type QuoteStatus,
  type InvoiceStatus,
} from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { sendEmail, buildQuoteDecisionEmail } from "@/lib/email";
import { emitDomainEvent } from "@workspace/db/events";
import { backofficeRoutes } from "@workspace/db/portal-routes";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod/v4";
import { revalidatePath } from "next/cache";
import { getMyCustomerIdentity } from "./customer";
import { createClient } from "@/lib/supabase/server";

// Customer-visible quote states: ["sent", "approved", "rejected", "expired"]
const CUSTOMER_VISIBLE_QUOTE_STATUSES = [
  "sent",
  "approved",
  "rejected",
  "expired",
] satisfies QuoteStatus[];

export type CustomerAssignment = {
  id: string;
  objectId: string | null;
  code: string;
  title: string;
  status: AssignmentStatus;
  scheduledDate: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  actualStartedAt: string | null;
  actualCompletedAt: string | null;
  objectName: string | null;
  objectAddress: string | null;
  objectCity: string | null;
  createdAt: string;
  /** Linked quote (if any). */
  quoteId: string | null;
  quoteNumber: string | null;
  quoteAmount: string | null;
  quoteStatus: QuoteStatus | null;
  quoteValidityDate: string | null;
};

export async function getMyAssignments(): Promise<CustomerAssignment[]> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return [];

  const rows = await db
    .select({
      id: assignmentsTable.id,
      objectId: assignmentsTable.objectId,
      code: assignmentsTable.code,
      title: assignmentsTable.title,
      status: assignmentsTable.status,
      scheduledDate: assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd: assignmentsTable.scheduledEnd,
      actualStartedAt: assignmentsTable.actualStartedAt,
      actualCompletedAt: assignmentsTable.actualCompletedAt,
      createdAt: assignmentsTable.createdAt,
      objectName: objectsTable.name,
      objectAddress: objectsTable.address,
      objectCity: objectsTable.city,
      quoteId: quotesTable.id,
      quoteNumber: quotesTable.quoteNumber,
      quoteAmount: quotesTable.amount,
      quoteStatus: quotesTable.status,
      quoteValidityDate: quotesTable.validityDate,
    })
    .from(assignmentsTable)
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .leftJoin(
      quotesTable,
      and(
        eq(quotesTable.assignmentId, assignmentsTable.id),
        inArray(quotesTable.status, CUSTOMER_VISIBLE_QUOTE_STATUSES),
      ),
    )
    .where(
      and(
        eq(assignmentsTable.customerId, identity.customerId),
        eq(assignmentsTable.tenantId, identity.tenantId),
      ),
    )
    .orderBy(desc(assignmentsTable.createdAt));

  return rows.map((r) => ({
    id: r.id,
    objectId: r.objectId ?? null,
    code: r.code,
    title: r.title,
    status: r.status as AssignmentStatus,
    scheduledDate: r.scheduledDate,
    scheduledStart: r.scheduledStart,
    scheduledEnd: r.scheduledEnd,
    actualStartedAt: r.actualStartedAt?.toISOString() ?? null,
    actualCompletedAt: r.actualCompletedAt?.toISOString() ?? null,
    objectName: r.objectName ?? null,
    objectAddress: r.objectAddress ?? null,
    objectCity: r.objectCity ?? null,
    createdAt: r.createdAt.toISOString(),
    quoteId: r.quoteId ?? null,
    quoteNumber: r.quoteNumber ?? null,
    quoteAmount: r.quoteAmount ?? null,
    quoteStatus: (r.quoteStatus ?? null) as QuoteStatus | null,
    quoteValidityDate: r.quoteValidityDate ?? null,
  }));
}

export type RequestResult =
  | { success: true; id: string }
  | { success: false; message: string };

const requestSchema = z
  .object({
    title: z.string().min(2, "Titel is verplicht").max(255),
    description: z.string().min(5, "Omschrijving is verplicht").max(5000),
    objectId: z.string().uuid("Selecteer een object."),
    sectorId: z.string().uuid("Selecteer een sector."),
    scheduledDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Kies een gewenste uitvoerdatum."),
    scheduledStart: z.string().regex(/^\d{2}:\d{2}$/, "Kies een starttijd."),
    scheduledEnd: z.string().regex(/^\d{2}:\d{2}$/, "Kies een eindtijd."),
    priority: z.enum(["low", "normal", "high", "urgent"]),
  })
  .refine((data) => data.scheduledEnd > data.scheduledStart, {
    message: "Eindtijd moet na de starttijd liggen.",
    path: ["scheduledEnd"],
  });

function formatEuro(value: string | null | undefined): string {
  const number = Number.parseFloat(value ?? "0");
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(Number.isFinite(number) ? number : 0);
}

function getSafeCustomerAssignmentPhotoStoragePath(
  storagePath: string,
  tenantId: string,
  assignmentId: string,
): string | null {
  return getTenantBoundAssignmentMediaStoragePath(
    storagePath,
    tenantId,
    assignmentId,
    {
      allowLegacyAssignmentRoot: true,
      allowLegacyPluralTenantRoot: true,
      allowLegacyTenantRoot: true,
    },
  );
}

export type RequestAssignmentInput = z.infer<typeof requestSchema>;

export async function requestAssignment(
  input: RequestAssignmentInput,
): Promise<RequestResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const identity = await getMyCustomerIdentity();
  if (!identity)
    return {
      success: false,
      message: "Geen klantprofiel gevonden voor dit account.",
    };

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { success: false, message: first?.message ?? "Ongeldig verzoek." };
  }

  const {
    title,
    description,
    objectId,
    sectorId,
    scheduledDate,
    scheduledStart,
    scheduledEnd,
    priority,
  } = parsed.data;

  const [[object], [sector], [customer]] = await Promise.all([
    db
      .select({
        id: objectsTable.id,
        sectorId: objectsTable.sectorId,
        name: objectsTable.name,
      })
      .from(objectsTable)
      .where(
        and(
          eq(objectsTable.id, objectId),
          eq(objectsTable.customerId, identity.customerId),
          eq(objectsTable.tenantId, identity.tenantId),
        ),
      )
      .limit(1),
    db
      .select({ id: sectorsTable.id, name: sectorsTable.name })
      .from(sectorsTable)
      .where(
        and(eq(sectorsTable.id, sectorId), eq(sectorsTable.isActive, true)),
      )
      .limit(1),
    db
      .select({ id: customersTable.id, name: customersTable.name })
      .from(customersTable)
      .where(
        and(
          eq(customersTable.id, identity.customerId),
          eq(customersTable.tenantId, identity.tenantId),
        ),
      )
      .limit(1),
  ]);

  if (!object)
    return {
      success: false,
      message: "Object niet gevonden of niet toegankelijk.",
    };
  if (!sector)
    return { success: false, message: "Sector niet gevonden of niet actief." };
  if (!object.sectorId) {
    return {
      success: false,
      message: "Dit object heeft nog geen sector. Werk eerst het object bij.",
    };
  }
  if (object.sectorId !== sectorId) {
    return {
      success: false,
      message: "De gekozen sector hoort niet bij het geselecteerde object.",
    };
  }

  const validatedData = insertAssignmentSchema.parse({
    title,
    description,
    customerId: identity.customerId,
    objectId,
    status: "requested",
    priority,
    scheduledDate,
    scheduledStart,
    scheduledEnd,
    createdBy: user.id,
  });

  const [inserted] = await db
    .insert(assignmentsTable)
    .values({ ...validatedData, tenantId: identity.tenantId })
    .returning({ id: assignmentsTable.id });

  if (!inserted) return { success: false, message: "Aanmaken mislukt." };
  const backofficeHref = backofficeRoutes.assignment(inserted.id);

  await db.insert(auditLogTable).values({
    userId: user.id,
    action: "customer_request_assignment",
    resource: "assignments",
    resourceId: inserted.id,
    metadata: {
      customerId: identity.customerId,
      tenantId: identity.tenantId,
      objectId,
      objectName: object.name,
      sectorId,
      sectorName: sector.name,
      scheduledDate,
      scheduledStart,
      scheduledEnd,
      priority,
    },
  });

  await emitDomainEvent({
    eventKey: "customer_assignment_requested",
    tenantId: identity.tenantId,
    actorUserId: user.id,
    audience: "management",
    aggregate: { type: "assignment", id: inserted.id },
    payload: {
      customerId: identity.customerId,
      assignmentId: inserted.id,
      objectId,
      objectName: object.name,
      sectorId,
      sectorName: sector.name,
      scheduledDate,
      scheduledStart,
      scheduledEnd,
      priority,
      title,
      assignment: {
        id: inserted.id,
        code: "",
        title,
        date: scheduledDate,
        start: scheduledStart,
        end: scheduledEnd,
      },
      customer: {
        id: identity.customerId,
        name: customer?.name ?? "klant",
      },
      object: {
        id: objectId,
        name: object.name,
      },
      sector: {
        id: sectorId,
        name: sector.name,
      },
      backofficeHref,
    },
    fallback: {
      title: "Nieuwe klantaanvraag",
      body: `${title} is aangevraagd voor ${object.name}.`,
      category: "planning",
      priority: priority === "urgent" ? "high" : "normal",
      href: backofficeHref,
      sourceLabel: "Klantportaal",
    },
    audit: false,
  });

  revalidatePath("/");
  revalidatePath("/opdrachten");
  revalidatePath("/meldingen");

  return { success: true, id: inserted.id };
}

// ─── Assignment detail ────────────────────────────────────────────────────────

export type ApprovedPhoto = {
  id: string;
  signedUrl: string | null;
};

export type AssignmentQuote = {
  id: string;
  quoteNumber: string;
  amount: string;
  status: QuoteStatus;
  validityDate: string;
};

export type AssignmentInvoice = {
  id: string;
  invoiceNumber: string;
  totalAmount: string;
  status: InvoiceStatus;
};

export type CustomerAssignmentDetail = {
  id: string;
  objectId: string | null;
  code: string;
  title: string;
  description: string | null;
  status: AssignmentStatus;
  scheduledDate: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  actualStartedAt: string | null;
  actualCompletedAt: string | null;
  objectName: string | null;
  objectAddress: string | null;
  objectCity: string | null;
  objectPostalCode: string | null;
  createdAt: string;
  tasks: {
    id: string;
    sortOrder: number;
    customerDescription: string;
  }[];
  /** Photos that management has explicitly approved for customer visibility. */
  approvedPhotos: ApprovedPhoto[];
  /** Linked quote — null if no quote has been created for this assignment. */
  quote: AssignmentQuote | null;
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
  const identity = await getMyCustomerIdentity();
  if (!identity) return null;

  const [row] = await db
    .select({
      id: assignmentsTable.id,
      objectId: assignmentsTable.objectId,
      code: assignmentsTable.code,
      title: assignmentsTable.title,
      description: assignmentsTable.description,
      status: assignmentsTable.status,
      scheduledDate: assignmentsTable.scheduledDate,
      scheduledStart: assignmentsTable.scheduledStart,
      scheduledEnd: assignmentsTable.scheduledEnd,
      actualStartedAt: assignmentsTable.actualStartedAt,
      actualCompletedAt: assignmentsTable.actualCompletedAt,
      createdAt: assignmentsTable.createdAt,
      objectName: objectsTable.name,
      objectAddress: objectsTable.address,
      objectCity: objectsTable.city,
      objectPostalCode: objectsTable.postalCode,
      quoteId: quotesTable.id,
      quoteNumber: quotesTable.quoteNumber,
      quoteAmount: quotesTable.amount,
      quoteStatus: quotesTable.status,
      quoteValidityDate: quotesTable.validityDate,
      invoiceId: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      invoiceTotalAmount: invoicesTable.totalAmount,
      invoiceStatus: invoicesTable.status,
    })
    .from(assignmentsTable)
    .leftJoin(objectsTable, eq(assignmentsTable.objectId, objectsTable.id))
    .leftJoin(
      quotesTable,
      and(
        eq(quotesTable.assignmentId, assignmentsTable.id),
        inArray(quotesTable.status, CUSTOMER_VISIBLE_QUOTE_STATUSES),
      ),
    )
    .leftJoin(
      invoicesTable,
      eq(invoicesTable.assignmentId, assignmentsTable.id),
    )
    .where(
      and(
        eq(assignmentsTable.id, assignmentId),
        eq(assignmentsTable.customerId, identity.customerId),
        eq(assignmentsTable.tenantId, identity.tenantId),
      ),
    )
    .limit(1);

  if (!row) return null;

  const [tasks, photoRows] = await Promise.all([
    db
      .select({
        id: assignmentTasksTable.id,
        sortOrder: assignmentTasksTable.sortOrder,
        taskCode: taskCodesTable.code,
        customerDescription: taskCodesTable.name,
      })
      .from(assignmentTasksTable)
      .leftJoin(
        taskCodesTable,
        eq(taskCodesTable.id, assignmentTasksTable.taskCodeId),
      )
      .where(eq(assignmentTasksTable.assignmentId, assignmentId))
      .orderBy(assignmentTasksTable.sortOrder),
    db
      .select({
        id: assignmentPhotosTable.id,
        storagePath: assignmentPhotosTable.storagePath,
      })
      .from(assignmentPhotosTable)
      .where(
        and(
          eq(assignmentPhotosTable.assignmentId, assignmentId),
          eq(assignmentPhotosTable.isApproved, true),
          eq(assignmentPhotosTable.visibilityScope, "customer_approved"),
        ),
      )
      .orderBy(assignmentPhotosTable.createdAt),
  ]);

  const admin = createAdminClient();
  const approvedPhotos: ApprovedPhoto[] = await Promise.all(
    photoRows.map(async (p) => {
      const storagePath = getSafeCustomerAssignmentPhotoStoragePath(
        p.storagePath,
        identity.tenantId,
        assignmentId,
      );
      if (!storagePath) return { id: p.id, signedUrl: null };

      try {
        const { data } = await admin.storage
          .from("assignment-photos")
          .createSignedUrl(storagePath, 3600);
        return { id: p.id, signedUrl: data?.signedUrl ?? null };
      } catch {
        return { id: p.id, signedUrl: null };
      }
    }),
  );

  const quote: AssignmentQuote | null = row.quoteId
    ? {
        id: row.quoteId,
        quoteNumber: row.quoteNumber ?? "",
        amount: row.quoteAmount ?? "0",
        status: (row.quoteStatus ?? "draft") as QuoteStatus,
        validityDate: row.quoteValidityDate ?? "",
      }
    : null;

  const invoice: AssignmentInvoice | null = row.invoiceId
    ? {
        id: row.invoiceId,
        invoiceNumber: row.invoiceNumber ?? "",
        totalAmount: row.invoiceTotalAmount ?? "0",
        status: (row.invoiceStatus ?? "draft") as InvoiceStatus,
      }
    : null;

  return {
    id: row.id,
    objectId: row.objectId ?? null,
    code: row.code,
    title: row.title,
    description: row.description ?? null,
    status: row.status as AssignmentStatus,
    scheduledDate: row.scheduledDate,
    scheduledStart: row.scheduledStart,
    scheduledEnd: row.scheduledEnd,
    actualStartedAt: row.actualStartedAt?.toISOString() ?? null,
    actualCompletedAt: row.actualCompletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    objectName: row.objectName ?? null,
    objectAddress: row.objectAddress ?? null,
    objectCity: row.objectCity ?? null,
    objectPostalCode: row.objectPostalCode ?? null,
    tasks: tasks.map((t) => ({
      id: t.id,
      sortOrder: t.sortOrder,
      customerDescription:
        [t.taskCode, t.customerDescription].filter(Boolean).join(" - ") ||
        "Werkzaamheid",
    })),
    approvedPhotos,
    quote,
    invoice,
  };
}

// ─── Quote approval workflow ──────────────────────────────────────────────────

export async function approveQuote(
  assignmentId: string,
): Promise<RequestResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const identity = await getMyCustomerIdentity();
  if (!identity)
    return { success: false, message: "Geen klantprofiel gevonden." };

  const [assignment] = await db
    .select({
      id: assignmentsTable.id,
      code: assignmentsTable.code,
      title: assignmentsTable.title,
      quoteId: quotesTable.id,
      quoteNumber: quotesTable.quoteNumber,
      quoteAmount: quotesTable.amount,
      validityDate: quotesTable.validityDate,
      customerName: customersTable.name,
    })
    .from(assignmentsTable)
    .innerJoin(quotesTable, eq(quotesTable.assignmentId, assignmentsTable.id))
    .innerJoin(
      customersTable,
      eq(assignmentsTable.customerId, customersTable.id),
    )
    .where(
      and(
        eq(assignmentsTable.id, assignmentId),
        eq(assignmentsTable.customerId, identity.customerId),
        eq(assignmentsTable.tenantId, identity.tenantId),
        eq(assignmentsTable.status, "awaiting_approval"),
        eq(quotesTable.status, "sent"),
      ),
    )
    .limit(1);

  if (!assignment) {
    return { success: false, message: "Offerte niet gevonden of al verwerkt." };
  }
  const backofficeHref = backofficeRoutes.assignment(assignmentId);

  await db.transaction(async (tx) => {
    await tx
      .update(quotesTable)
      .set({
        status: "approved",
        approvedBy: user.id,
        approvedAt: new Date(),
      })
      .where(eq(quotesTable.id, assignment.quoteId));

    await tx
      .update(assignmentsTable)
      .set({ status: "plannable" })
      .where(
        and(
          eq(assignmentsTable.id, assignmentId),
          eq(assignmentsTable.tenantId, identity.tenantId),
        ),
      );

    await tx.insert(auditLogTable).values({
      userId: user.id,
      action: "customer_approve_quote",
      resource: "quotes",
      resourceId: assignment.quoteId,
      metadata: {
        assignmentId,
        customerId: identity.customerId,
        tenantId: identity.tenantId,
        nextAssignmentStatus: "plannable",
      },
    });
  });

  await emitDomainEvent({
    eventKey: "quote_approved_by_customer",
    tenantId: identity.tenantId,
    actorUserId: user.id,
    audience: "management",
    aggregate: { type: "quote", id: assignment.quoteId },
    payload: {
      assignmentId,
      customerId: identity.customerId,
      quoteId: assignment.quoteId,
      nextAssignmentStatus: "plannable",
      assignment: {
        id: assignmentId,
        code: assignment.code,
        title: assignment.title,
      },
      customer: {
        id: identity.customerId,
        name: assignment.customerName ?? "klant",
      },
      quote: {
        id: assignment.quoteId,
        number: assignment.quoteNumber,
        amount: formatEuro(assignment.quoteAmount),
        valid_until: assignment.validityDate ?? "",
      },
      backofficeHref,
    },
    fallback: {
      title: "Offerte geaccepteerd",
      body: "Een klant heeft een offerte geaccepteerd. De opdracht is nu planbaar.",
      category: "quotes",
      href: backofficeHref,
      sourceLabel: "Klantportaal",
    },
    audit: false,
  });

  void (async () => {
    const [orgSettings] = await db
      .select({ emailAfzender: organizationSettingsTable.emailAfzender })
      .from(organizationSettingsTable)
      .limit(1);
    if (!orgSettings?.emailAfzender) return;

    const [[customer], [quote]] = await Promise.all([
      db
        .select({ name: customersTable.name })
        .from(customersTable)
        .where(
          and(
            eq(customersTable.id, identity.customerId),
            eq(customersTable.tenantId, identity.tenantId),
          ),
        )
        .limit(1),
      db
        .select({ quoteNumber: quotesTable.quoteNumber })
        .from(quotesTable)
        .innerJoin(
          assignmentsTable,
          eq(assignmentsTable.id, quotesTable.assignmentId),
        )
        .where(
          and(
            eq(quotesTable.assignmentId, assignmentId),
            eq(assignmentsTable.tenantId, identity.tenantId),
          ),
        )
        .limit(1),
    ]);

    if (!quote) return;
    const { subject, html } = buildQuoteDecisionEmail({
      customerName: customer?.name ?? "Onbekende klant",
      quoteNumber: quote.quoteNumber,
      decision: "geaccepteerd",
      reason: null,
    });
    await sendEmail({
      to: orgSettings.emailAfzender,
      subject,
      html,
      tenantId: identity.tenantId,
      purpose: "quote_decision_received",
    });
  })();

  revalidatePath("/opdrachten");
  revalidatePath(`/opdrachten/${assignmentId}`);
  revalidatePath("/offertes");
  revalidatePath("/meldingen");
  revalidatePath("/");
  return { success: true, id: assignmentId };
}

export async function rejectQuote(
  assignmentId: string,
  reason?: string,
): Promise<RequestResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const identity = await getMyCustomerIdentity();
  if (!identity)
    return { success: false, message: "Geen klantprofiel gevonden." };

  const [assignment] = await db
    .select({
      id: assignmentsTable.id,
      code: assignmentsTable.code,
      title: assignmentsTable.title,
      quoteId: quotesTable.id,
      quoteNumber: quotesTable.quoteNumber,
      customerName: customersTable.name,
    })
    .from(assignmentsTable)
    .innerJoin(quotesTable, eq(quotesTable.assignmentId, assignmentsTable.id))
    .innerJoin(
      customersTable,
      eq(assignmentsTable.customerId, customersTable.id),
    )
    .where(
      and(
        eq(assignmentsTable.id, assignmentId),
        eq(assignmentsTable.customerId, identity.customerId),
        eq(assignmentsTable.tenantId, identity.tenantId),
        eq(assignmentsTable.status, "awaiting_approval"),
        eq(quotesTable.status, "sent"),
      ),
    )
    .limit(1);

  if (!assignment) {
    return { success: false, message: "Offerte niet gevonden of al verwerkt." };
  }
  const backofficeHref = backofficeRoutes.assignment(assignmentId);

  await db.transaction(async (tx) => {
    await tx
      .update(quotesTable)
      .set({
        status: "rejected",
        rejectionReason: reason?.trim() || null,
      })
      .where(eq(quotesTable.id, assignment.quoteId));

    await tx
      .update(assignmentsTable)
      .set({ status: "review" })
      .where(
        and(
          eq(assignmentsTable.id, assignmentId),
          eq(assignmentsTable.tenantId, identity.tenantId),
        ),
      );

    await tx.insert(auditLogTable).values({
      userId: user.id,
      action: "customer_reject_quote",
      resource: "quotes",
      resourceId: assignment.quoteId,
      metadata: {
        assignmentId,
        customerId: identity.customerId,
        tenantId: identity.tenantId,
        reason: reason?.trim() || null,
        nextAssignmentStatus: "review",
      },
    });
  });

  await emitDomainEvent({
    eventKey: "quote_rejected_by_customer",
    tenantId: identity.tenantId,
    actorUserId: user.id,
    audience: "management",
    aggregate: { type: "quote", id: assignment.quoteId },
    payload: {
      assignmentId,
      customerId: identity.customerId,
      quoteId: assignment.quoteId,
      reason: reason?.trim() || null,
      nextAssignmentStatus: "review",
      assignment: {
        id: assignmentId,
        code: assignment.code,
        title: assignment.title,
      },
      customer: {
        id: identity.customerId,
        name: assignment.customerName ?? "klant",
      },
      quote: {
        id: assignment.quoteId,
        number: assignment.quoteNumber,
        rejection_reason: reason?.trim() || "",
      },
      backofficeHref,
    },
    fallback: {
      title: "Offerte afgewezen",
      body: reason?.trim()
        ? `Een klant heeft een offerte afgewezen: ${reason.trim()}`
        : "Een klant heeft een offerte afgewezen.",
      category: "quotes",
      priority: "high",
      href: backofficeHref,
      sourceLabel: "Klantportaal",
    },
    audit: false,
  });

  void (async () => {
    const [orgSettings] = await db
      .select({ emailAfzender: organizationSettingsTable.emailAfzender })
      .from(organizationSettingsTable)
      .limit(1);
    if (!orgSettings?.emailAfzender) return;

    const [[customer], [quote]] = await Promise.all([
      db
        .select({ name: customersTable.name })
        .from(customersTable)
        .where(
          and(
            eq(customersTable.id, identity.customerId),
            eq(customersTable.tenantId, identity.tenantId),
          ),
        )
        .limit(1),
      db
        .select({ quoteNumber: quotesTable.quoteNumber })
        .from(quotesTable)
        .innerJoin(
          assignmentsTable,
          eq(assignmentsTable.id, quotesTable.assignmentId),
        )
        .where(
          and(
            eq(quotesTable.assignmentId, assignmentId),
            eq(assignmentsTable.tenantId, identity.tenantId),
          ),
        )
        .limit(1),
    ]);

    if (!quote) return;
    const { subject, html } = buildQuoteDecisionEmail({
      customerName: customer?.name ?? "Onbekende klant",
      quoteNumber: quote.quoteNumber,
      decision: "afgewezen",
      reason: reason?.trim() || null,
    });
    await sendEmail({
      to: orgSettings.emailAfzender,
      subject,
      html,
      tenantId: identity.tenantId,
      purpose: "quote_decision_received",
    });
  })();

  revalidatePath("/opdrachten");
  revalidatePath(`/opdrachten/${assignmentId}`);
  revalidatePath("/offertes");
  revalidatePath("/meldingen");
  revalidatePath("/");
  return { success: true, id: assignmentId };
}
