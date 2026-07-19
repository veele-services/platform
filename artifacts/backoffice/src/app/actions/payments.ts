"use server";

import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import {
  paymentsTable,
  paymentAllocationsTable,
  invoicesTable,
  assignmentsTable,
  auditLogTable,
  invoicePaymentSettingsTable,
  maskPaymentProviderId,
  type PaymentStatus,
} from "@workspace/db";
import { and, eq, desc, isNull, sql } from "drizzle-orm";
import { emitInvoiceWorkflowEvent } from "@workspace/db/workflow-events";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, hasPermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import { requireSensitiveRuntimeAccess } from "@/lib/security/sensitive-runtime";
import { toPlatformPaymentDiagnosticDto } from "@/lib/security/safe-dtos";
import type { ActionResult } from "./customers";

export type { ActionResult, PaymentStatus };

async function notifyInvoiceWorkflow(
  input: Parameters<typeof emitInvoiceWorkflowEvent>[0],
) {
  try {
    await emitInvoiceWorkflowEvent(input);
  } catch (error) {
    console.error("invoice payment notification failed", {
      eventKey: input.eventKey,
      invoiceId: input.invoiceId,
      error,
    });
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentRecord = {
  id: string;
  molliePaymentId: string | null;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  checkoutUrl: string | null;
  paidAt: string | null;
  createdAt: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the publicly-accessible base URL for the current environment.
 * Used for constructing redirect and webhook URLs.
 */
function getBaseUrl(): string {
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) {
    const first = domains.split(",")[0]?.trim();
    if (first) return `https://${first}`;
  }
  const dev = process.env.REPLIT_DEV_DOMAIN;
  if (dev) return `https://${dev}`;
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://localhost";
}

/**
 * Formats a euro amount in cents as a Mollie-compatible decimal string.
 * E.g. 1250 → "12.50"
 */
function centsToMollieValue(cents: number): string {
  return (cents / 100).toFixed(2);
}

function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

function displayInvoiceNumber(
  value: string | null | undefined,
  fallback = "Factuur",
): string {
  return value?.trim() || fallback;
}

async function requireMolliePaymentsEnabled(
  tenantId: string,
): Promise<ActionResult | null> {
  const [settings] = await db
    .select({
      paymentProvider: invoicePaymentSettingsTable.paymentProvider,
      mollieEnabled: invoicePaymentSettingsTable.mollieEnabled,
    })
    .from(invoicePaymentSettingsTable)
    .where(eq(invoicePaymentSettingsTable.tenantId, tenantId))
    .limit(1);

  if (
    settings?.paymentProvider !== "mollie" ||
    settings.mollieEnabled !== true
  ) {
    return {
      success: false,
      message: "Mollie is niet actief in factuurinstellingen.",
    };
  }
  return null;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getPaymentHistory(
  invoiceId: string,
): Promise<PaymentRecord[]> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return [];

  const tenantId = await requireCurrentTenantId();
  const sensitiveDecision = await requireSensitiveRuntimeAccess({
    tenantId,
    scope: "tenant_payments",
    accessLevel: "masked_read",
    resourceType: "payments",
    resourceId: invoiceId,
  });
  const rows = await db
    .select({
      id: paymentsTable.id,
      molliePaymentId: paymentsTable.molliePaymentId,
      amountCents: paymentsTable.amountCents,
      currency: paymentsTable.currency,
      status: paymentsTable.status,
      checkoutUrl: paymentsTable.checkoutUrl,
      paidAt: paymentsTable.paidAt,
      createdAt: paymentsTable.createdAt,
    })
    .from(paymentsTable)
    .innerJoin(invoicesTable, eq(paymentsTable.invoiceId, invoicesTable.id))
    .where(
      and(
        eq(paymentsTable.invoiceId, invoiceId),
        eq(paymentsTable.tenantId, tenantId),
        eq(invoicesTable.tenantId, tenantId),
      ),
    )
    .orderBy(desc(paymentsTable.createdAt));

  return rows.map((r) =>
    toPlatformPaymentDiagnosticDto(
      {
        id: r.id,
        molliePaymentId: r.molliePaymentId,
        amountCents: r.amountCents,
        currency: r.currency,
        status: r.status as PaymentStatus,
        checkoutUrl: r.checkoutUrl ?? null,
        paidAt: r.paidAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      },
      sensitiveDecision,
    ),
  );
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Creates a Mollie payment for the given invoice and stores the record in DB.
 * Returns the Mollie checkout URL on success.
 *
 * Requires MOLLIE_API_KEY environment variable (secret).
 */
export async function createMolliePayment(
  invoiceId: string,
): Promise<ActionResult<{ checkoutUrl: string; molliePaymentId: string }>> {
  await requirePermission("invoices", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const tenantId = await requireCurrentTenantId();
  const mollieDisabled = await requireMolliePaymentsEnabled(tenantId);
  if (mollieDisabled) return mollieDisabled;

  const mollieKey = process.env.MOLLIE_API_KEY;
  if (!mollieKey) {
    return {
      success: false,
      message:
        "Mollie API-sleutel niet geconfigureerd. Stel MOLLIE_API_KEY in als omgevingsvariabele.",
    };
  }

  // Fetch invoice
  const [invoice] = await db
    .select({
      id: invoicesTable.id,
      tenantId: invoicesTable.tenantId,
      invoiceNumber: invoicesTable.invoiceNumber,
      totalAmount: invoicesTable.totalAmount,
      status: invoicesTable.status,
      assignmentId: invoicesTable.assignmentId,
      customerId: invoicesTable.customerId,
    })
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.id, invoiceId),
        eq(invoicesTable.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!invoice) return { success: false, message: "Factuur niet gevonden." };
  if (invoice.status !== "sent") {
    return {
      success: false,
      message:
        "Betaallink kan alleen worden aangemaakt voor verzonden facturen.",
    };
  }

  const totalAmount = parseFloat(invoice.totalAmount ?? "0");
  if (isNaN(totalAmount) || totalAmount <= 0) {
    return { success: false, message: "Ongeldig factuurbedrag." };
  }

  const amountCents = Math.round(totalAmount * 100);
  const baseUrl = getBaseUrl();
  const redirectUrl = `${baseUrl}/klant/betalingen/succes?invoice=${invoiceId}`;
  const webhookUrl =
    process.env.MOLLIE_WEBHOOK_URL ?? `${baseUrl}/api/webhooks/mollie`;

  let [pendingPayment] = await db
    .select({
      id: paymentsTable.id,
      providerRequestKey: paymentsTable.providerRequestKey,
    })
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.tenantId, tenantId),
        eq(paymentsTable.invoiceId, invoiceId),
        eq(paymentsTable.paymentMethod, "mollie"),
        eq(paymentsTable.status, "open"),
        isNull(paymentsTable.molliePaymentId),
      ),
    )
    .orderBy(desc(paymentsTable.createdAt))
    .limit(1);
  if (!pendingPayment) {
    [pendingPayment] = await db
      .insert(paymentsTable)
      .values({
        tenantId,
        invoiceId,
        customerId: invoice.customerId,
        sourceType: "invoice",
        sourceId: invoiceId,
        providerRequestKey: randomUUID(),
        amountCents,
        amount: centsToAmount(amountCents),
        currency: "EUR",
        paymentMethod: "mollie",
        status: "open",
        registeredByUserId: user.id,
      })
      .returning({
        id: paymentsTable.id,
        providerRequestKey: paymentsTable.providerRequestKey,
      });
  }
  if (!pendingPayment?.providerRequestKey) {
    return {
      success: false,
      message: "Duurzame betalingsaanvraag kon niet worden vastgelegd.",
    };
  }

  // Call Mollie API
  let mollieResp: Response;
  try {
    mollieResp = await fetch("https://api.mollie.com/v2/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mollieKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": pendingPayment.providerRequestKey,
      },
      body: JSON.stringify({
        amount: {
          currency: "EUR",
          value: centsToMollieValue(amountCents),
        },
        description: `Factuur ${displayInvoiceNumber(invoice.invoiceNumber, invoice.id.slice(0, 8))}`,
        redirectUrl,
        webhookUrl,
        metadata: {
          tenantId,
          invoiceId,
          invoiceNumber: displayInvoiceNumber(
            invoice.invoiceNumber,
            invoice.id.slice(0, 8),
          ),
        },
      }),
    });
  } catch (err) {
    return {
      success: false,
      message:
        "Verbinding met Mollie mislukt. Controleer de internetverbinding.",
    };
  }

  if (!mollieResp.ok) {
    const body = await mollieResp.json().catch(() => ({}));
    const detail =
      (body as { detail?: string }).detail ?? mollieResp.statusText;
    return { success: false, message: `Mollie fout: ${detail}` };
  }

  type MolliePayment = {
    id: string;
    _links: { checkout: { href: string } };
  };
  const molliePayment = (await mollieResp.json()) as MolliePayment;

  const molliePaymentId = molliePayment.id;
  const checkoutUrl = molliePayment._links?.checkout?.href ?? null;
  const paymentReference = maskPaymentProviderId(molliePaymentId);

  // Bind the provider response to the durable request created before the call.
  try {
    await db
      .update(paymentsTable)
      .set({
        molliePaymentId,
        checkoutUrl,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentsTable.id, pendingPayment.id),
          eq(paymentsTable.tenantId, tenantId),
        ),
      );
  } catch {
    return {
      success: false,
      message: "Betaling aanmaken in database mislukt.",
    };
  }

  await db.insert(auditLogTable).values({
    tenantId,
    userId: user.id,
    action: "create_mollie_payment",
    resource: "invoices",
    resourceId: invoiceId,
    metadata: {
      tenantId,
      paymentReference,
      amountCents,
      checkoutIssued: Boolean(checkoutUrl),
    },
  });

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");

  return {
    success: true,
    data: { checkoutUrl: checkoutUrl ?? "", molliePaymentId },
  };
}

/**
 * Marks an invoice as paid (called from the Mollie webhook handler).
 * This action can also be called directly by the webhook route in the API server.
 */
export async function markInvoicePaidByMollie(
  molliePaymentId: string,
  paidAt: Date,
): Promise<{ success: boolean; message?: string }> {
  const result = await db.transaction(async (tx) => {
    // Find payment record
    const [payment] = await tx
      .select({
        id: paymentsTable.id,
        invoiceId: paymentsTable.invoiceId,
        tenantId: paymentsTable.tenantId,
        customerId: paymentsTable.customerId,
        amountCents: paymentsTable.amountCents,
      })
      .from(paymentsTable)
      .where(eq(paymentsTable.molliePaymentId, molliePaymentId))
      .limit(1);

    if (!payment) return { success: false, message: "Betaling niet gevonden." };
    if (!payment.tenantId)
      return { success: false, message: "Betaling heeft geen tenantcontext." };
    if (!payment.invoiceId)
      return {
        success: false,
        message: "Betaling is niet aan een factuur gekoppeld.",
      };

    // Update payment status
    await tx
      .update(paymentsTable)
      .set({ status: "paid", paidAt })
      .where(
        and(
          eq(paymentsTable.molliePaymentId, molliePaymentId),
          eq(paymentsTable.tenantId, payment.tenantId),
        ),
      );

    const [invoice] = await tx
      .select({
        id: invoicesTable.id,
        tenantId: invoicesTable.tenantId,
        status: invoicesTable.status,
        assignmentId: invoicesTable.assignmentId,
        totalAmount: invoicesTable.totalAmount,
      })
      .from(invoicesTable)
      .where(
        and(
          eq(invoicesTable.id, payment.invoiceId),
          eq(invoicesTable.tenantId, payment.tenantId),
        ),
      )
      .limit(1);

    if (invoice && invoice.status === "sent") {
      const paidDateStr = paidAt.toISOString().slice(0, 10);
      await tx
        .update(invoicesTable)
        .set({
          status: "paid",
          paymentStatus: "paid",
          paidAmount: centsToAmount(payment.amountCents),
          outstandingAmount: "0",
          paidDate: paidDateStr,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(invoicesTable.id, invoice.id),
            eq(invoicesTable.tenantId, payment.tenantId),
          ),
        );

      await tx.insert(paymentAllocationsTable).values({
        tenantId: payment.tenantId,
        paymentId: payment.id,
        invoiceId: invoice.id,
        amountCents: payment.amountCents,
        amount: centsToAmount(payment.amountCents),
        note: "Mollie betaling automatisch toegewezen",
      });

      // Advance assignment: invoiced → paid → closed
      await tx
        .update(assignmentsTable)
        .set({ status: "paid", updatedAt: new Date() })
        .where(
          and(
            eq(assignmentsTable.id, invoice.assignmentId),
            eq(assignmentsTable.tenantId, payment.tenantId),
          ),
        );
      await tx
        .update(assignmentsTable)
        .set({ status: "closed", updatedAt: new Date() })
        .where(
          and(
            eq(assignmentsTable.id, invoice.assignmentId),
            eq(assignmentsTable.tenantId, payment.tenantId),
          ),
        );

      // audit_log.user_id is UUID NOT NULL; use dedicated system actor UUID
      // for webhook/background events that have no real Supabase auth user.
      const SYSTEM_ACTOR_UUID = "00000000-0000-0000-0000-000000000001";
      await tx.insert(auditLogTable).values({
        tenantId: payment.tenantId,
        userId: SYSTEM_ACTOR_UUID,
        action: "mollie_payment_received",
        resource: "invoices",
        resourceId: invoice.id,
        metadata: {
          tenantId: payment.tenantId,
          paymentReference: maskPaymentProviderId(molliePaymentId),
          paidAt: paidAt.toISOString(),
        },
      });

      return {
        success: true as const,
        invoiceId: invoice.id,
        actorUserId: SYSTEM_ACTOR_UUID,
      };
    }

    return { success: true as const };
  });

  if (
    result.success &&
    "invoiceId" in result &&
    typeof result.invoiceId === "string" &&
    typeof result.actorUserId === "string"
  ) {
    await notifyInvoiceWorkflow({
      eventKey: "invoice_paid",
      invoiceId: result.invoiceId,
      actorUserId: result.actorUserId,
    });
    revalidatePath(`/invoices/${result.invoiceId}`);
    revalidatePath("/invoices");
  }
  return result;
}

// ─── Customer-scoped query ─────────────────────────────────────────────────────

export async function registerManualInvoicePayment(
  invoiceId: string,
  input: {
    amountCents: number;
    paymentMethod?:
      | "manual_bank"
      | "cash"
      | "correction"
      | "settlement"
      | "other";
    reference?: string;
    note?: string;
  },
): Promise<ActionResult<{ paymentId: string }>> {
  await requirePermission("invoices", "write");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  const tenantId = await requireCurrentTenantId();
  const amountCents = Math.round(input.amountCents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { success: false, message: "Voer een geldig betaald bedrag in." };
  }

  let paymentResult: {
    paymentId: string;
    paymentStatus: string;
    assignmentId: string;
  };
  try {
    paymentResult = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM public.invoices WHERE id = ${invoiceId}::uuid AND tenant_id = ${tenantId}::uuid FOR UPDATE`,
      );
      const [invoice] = await tx
        .select({
          id: invoicesTable.id,
          customerId: invoicesTable.customerId,
          totalAmount: invoicesTable.totalAmount,
          status: invoicesTable.status,
          assignmentId: invoicesTable.assignmentId,
        })
        .from(invoicesTable)
        .where(
          and(
            eq(invoicesTable.id, invoiceId),
            eq(invoicesTable.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!invoice) throw new Error("Factuur niet gevonden.");
      if (invoice.status === "cancelled")
        throw new Error("Een geannuleerde factuur kan niet betaald worden.");

      const [allocated] = await tx
        .select({
          paidCents: sql<number>`coalesce(sum(${paymentAllocationsTable.amountCents}), 0)::int`,
        })
        .from(paymentAllocationsTable)
        .where(
          and(
            eq(paymentAllocationsTable.invoiceId, invoice.id),
            eq(paymentAllocationsTable.tenantId, tenantId),
          ),
        );
      const totalCents = Math.round(
        Number.parseFloat(invoice.totalAmount ?? "0") * 100,
      );
      const paidCents = Number(allocated?.paidCents ?? 0);
      if (amountCents > totalCents - paidCents)
        throw new Error(
          "Het betaalde bedrag is hoger dan het openstaande bedrag.",
        );
      const nextPaidCents = paidCents + amountCents;
      const nextOutstandingCents = totalCents - nextPaidCents;
      const nextPaymentStatus =
        nextOutstandingCents === 0 ? "paid" : "partially_paid";

      const [payment] = await tx
        .insert(paymentsTable)
        .values({
          tenantId,
          customerId: invoice.customerId,
          invoiceId: invoice.id,
          sourceType: "invoice",
          sourceId: invoice.id,
          amountCents,
          amount: centsToAmount(amountCents),
          currency: "EUR",
          paymentMethod: input.paymentMethod ?? "manual_bank",
          status: "paid",
          reference: input.reference?.trim() || null,
          note: input.note?.trim() || null,
          registeredByUserId: user.id,
          paidAt: new Date(),
        })
        .returning({ id: paymentsTable.id });
      if (!payment) throw new Error("Betaling kon niet worden opgeslagen.");

      await tx.insert(paymentAllocationsTable).values({
        tenantId,
        paymentId: payment.id,
        invoiceId: invoice.id,
        amountCents,
        amount: centsToAmount(amountCents),
        allocatedByUserId: user.id,
        note: input.note?.trim() || "Handmatige betaling toegewezen",
      });
      await tx
        .update(invoicesTable)
        .set({
          status: nextPaymentStatus === "paid" ? "paid" : invoice.status,
          paymentStatus: nextPaymentStatus,
          paidAmount: centsToAmount(nextPaidCents),
          outstandingAmount: centsToAmount(nextOutstandingCents),
          paidDate:
            nextPaymentStatus === "paid"
              ? new Date().toISOString().slice(0, 10)
              : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(invoicesTable.id, invoice.id),
            eq(invoicesTable.tenantId, tenantId),
          ),
        );
      if (nextPaymentStatus === "paid") {
        await tx
          .update(assignmentsTable)
          .set({ status: "paid", updatedAt: new Date() })
          .where(
            and(
              eq(assignmentsTable.id, invoice.assignmentId),
              eq(assignmentsTable.tenantId, tenantId),
            ),
          );
        await tx
          .update(assignmentsTable)
          .set({ status: "closed", updatedAt: new Date() })
          .where(
            and(
              eq(assignmentsTable.id, invoice.assignmentId),
              eq(assignmentsTable.tenantId, tenantId),
            ),
          );
      }
      await tx.insert(auditLogTable).values({
        tenantId,
        userId: user.id,
        action: "register_manual_invoice_payment",
        resource: "invoices",
        resourceId: invoice.id,
        metadata: {
          tenantId,
          amountCents,
          paymentId: payment.id,
          paymentMethod: input.paymentMethod ?? "manual_bank",
          paymentStatus: nextPaymentStatus,
        },
      });
      return {
        paymentId: payment.id,
        paymentStatus: nextPaymentStatus,
        assignmentId: invoice.assignmentId,
      };
    });
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Betaling kon niet worden opgeslagen.",
    };
  }

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");

  return { success: true, data: { paymentId: paymentResult.paymentId } };
}

export type CustomerPaymentRow = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  molliePaymentId: string | null;
  amountCents: number;
  currency: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
};

export async function listPaymentsForCustomer(
  customerId: string,
  limit = 25,
): Promise<CustomerPaymentRow[]> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return [];

  const tenantId = await requireCurrentTenantId();
  const sensitiveDecision = await requireSensitiveRuntimeAccess({
    tenantId,
    scope: "tenant_payments",
    accessLevel: "masked_read",
    resourceType: "payments",
    resourceId: customerId,
  });
  const rows = await db
    .select({
      id: paymentsTable.id,
      invoiceId: paymentsTable.invoiceId,
      invoiceNumber: invoicesTable.invoiceNumber,
      molliePaymentId: paymentsTable.molliePaymentId,
      amountCents: paymentsTable.amountCents,
      currency: paymentsTable.currency,
      status: paymentsTable.status,
      paidAt: paymentsTable.paidAt,
      createdAt: paymentsTable.createdAt,
    })
    .from(paymentsTable)
    .innerJoin(invoicesTable, eq(paymentsTable.invoiceId, invoicesTable.id))
    .where(
      and(
        eq(invoicesTable.customerId, customerId),
        eq(invoicesTable.tenantId, tenantId),
        eq(paymentsTable.tenantId, tenantId),
      ),
    )
    .orderBy(desc(paymentsTable.createdAt))
    .limit(limit);

  return rows.map((r) =>
    toPlatformPaymentDiagnosticDto(
      {
        id: r.id,
        invoiceId: r.invoiceId ?? r.id,
        invoiceNumber: displayInvoiceNumber(r.invoiceNumber),
        molliePaymentId: r.molliePaymentId,
        amountCents: r.amountCents,
        currency: r.currency,
        status: r.status,
        paidAt: r.paidAt ? r.paidAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      },
      sensitiveDecision,
    ),
  );
}
