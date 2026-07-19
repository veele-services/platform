"use server";

import { db } from "@workspace/db";
import {
  AmbiguousProviderResultError,
  bindProviderPayment,
  createMolliePayment as createProviderPayment,
  markPaymentForReconciliation,
  markProviderAttempt,
  prepareDirectPaymentIntent,
  paymentsTable,
  paymentAllocationsTable,
  invoicesTable,
  assignmentsTable,
  auditLogTable,
  invoicePaymentSettingsTable,
  type PaymentStatus,
} from "@workspace/db";
import { and, eq, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, hasPermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import { requireSensitiveRuntimeAccess } from "@/lib/security/sensitive-runtime";
import { toPlatformPaymentDiagnosticDto } from "@/lib/security/safe-dtos";
import type { ActionResult } from "./customers";

export type { ActionResult, PaymentStatus };

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

  const baseUrl = getBaseUrl();
  const redirectUrl = `${baseUrl}/klant/betalingen/succes?invoice=${invoiceId}`;
  const webhookUrl =
    process.env.MOLLIE_WEBHOOK_URL ?? `${baseUrl}/api/webhooks/mollie`;
  let intent;
  try {
    intent = await prepareDirectPaymentIntent({
      tenantId,
      customerId: invoice.customerId,
      invoiceId,
      actorUserId: user.id,
    });
    if (intent.checkoutUrl && intent.molliePaymentId) {
      return {
        success: true,
        data: {
          checkoutUrl: intent.checkoutUrl,
          molliePaymentId: intent.molliePaymentId,
        },
      };
    }
    await markProviderAttempt(intent.id);
    const snapshot = await createProviderPayment({
      requestKey: intent.providerRequestKey,
      amountCents: intent.amountCents,
      currency: intent.currency,
      description: `Factuur ${displayInvoiceNumber(invoice.invoiceNumber, invoice.id.slice(0, 8))}`,
      redirectUrl,
      webhookUrl,
      metadata: intent.metadata,
    });
    const bound = await bindProviderPayment(intent.id, snapshot);
    if (!bound.checkoutUrl || !bound.molliePaymentId)
      throw new Error("Mollie gaf geen geldige checkout-link terug.");
    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath("/invoices");
    return {
      success: true,
      data: {
        checkoutUrl: bound.checkoutUrl,
        molliePaymentId: bound.molliePaymentId,
      },
    };
  } catch (error) {
    if (intent)
      await markPaymentForReconciliation(
        intent.id,
        error instanceof Error ? error.message : "Providerfout.",
      );
    return {
      success: false,
      message:
        error instanceof AmbiguousProviderResultError
          ? "De betaalprovider verwerkt de aanvraag nog. Probeer dezelfde aanvraag opnieuw."
          : error instanceof Error
            ? error.message
            : "Betaalaanvraag mislukt.",
    };
  }
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

      const activeProviderReservation = await tx.execute(sql`
        SELECT 1
        FROM public.payments payment
        WHERE payment.tenant_id = ${tenantId}::uuid
          AND payment.payment_method = 'mollie'
          AND payment.status IN ('created', 'provider_pending', 'open', 'pending', 'authorized', 'reconciliation_required')
          AND (
            (payment.source_type = 'invoice' AND payment.source_id = ${invoice.id}::uuid)
            OR (
              payment.source_type = 'invoice_collection'
              AND EXISTS (
                SELECT 1 FROM public.customer_payment_batch_items item
                WHERE item.batch_id = payment.source_id AND item.invoice_id = ${invoice.id}::uuid
              )
            )
          )
        LIMIT 1
      `);
      if (activeProviderReservation.rows.length > 0) {
        throw new Error(
          "Deze factuur is gereserveerd door een actieve Mollie-betaling.",
        );
      }

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
