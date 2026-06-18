"use server";

import { db } from "@workspace/db";
import {
  paymentsTable,
  invoicesTable,
  assignmentsTable,
  auditLogTable,
  type PaymentStatus,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, hasPermission } from "@/lib/auth/permissions";
import type { ActionResult } from "./customers";

export type { ActionResult, PaymentStatus };

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentRecord = {
  id:              string;
  molliePaymentId: string;
  amountCents:     number;
  currency:        string;
  status:          PaymentStatus;
  checkoutUrl:     string | null;
  paidAt:          string | null;
  createdAt:       string;
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

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getPaymentHistory(invoiceId: string): Promise<PaymentRecord[]> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return [];

  const rows = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.invoiceId, invoiceId))
    .orderBy(desc(paymentsTable.createdAt));

  return rows.map((r) => ({
    id:              r.id,
    molliePaymentId: r.molliePaymentId,
    amountCents:     r.amountCents,
    currency:        r.currency,
    status:          r.status as PaymentStatus,
    checkoutUrl:     r.checkoutUrl ?? null,
    paidAt:          r.paidAt?.toISOString() ?? null,
    createdAt:       r.createdAt.toISOString(),
  }));
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

  const mollieKey = process.env.MOLLIE_API_KEY;
  if (!mollieKey) {
    return {
      success: false,
      message: "Mollie API-sleutel niet geconfigureerd. Stel MOLLIE_API_KEY in als omgevingsvariabele.",
    };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "Niet geauthenticeerd." };

  // Fetch invoice
  const [invoice] = await db
    .select({
      id:            invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      totalAmount:   invoicesTable.totalAmount,
      status:        invoicesTable.status,
      assignmentId:  invoicesTable.assignmentId,
    })
    .from(invoicesTable)
    .where(eq(invoicesTable.id, invoiceId))
    .limit(1);

  if (!invoice) return { success: false, message: "Factuur niet gevonden." };
  if (invoice.status !== "sent") {
    return { success: false, message: "Betaallink kan alleen worden aangemaakt voor verzonden facturen." };
  }

  const totalAmount = parseFloat(invoice.totalAmount ?? "0");
  if (isNaN(totalAmount) || totalAmount <= 0) {
    return { success: false, message: "Ongeldig factuurbedrag." };
  }

  const amountCents = Math.round(totalAmount * 100);
  const baseUrl     = getBaseUrl();
  const redirectUrl = `${baseUrl}/klant/betalingen/succes?invoice=${invoiceId}`;
  const webhookUrl  = process.env.MOLLIE_WEBHOOK_URL ?? `${baseUrl}/api/webhooks/mollie`;

  // Call Mollie API
  let mollieResp: Response;
  try {
    mollieResp = await fetch("https://api.mollie.com/v2/payments", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${mollieKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        amount: {
          currency: "EUR",
          value:    centsToMollieValue(amountCents),
        },
        description: `Factuur ${invoice.invoiceNumber}`,
        redirectUrl,
        webhookUrl,
        metadata: {
          invoiceId,
          invoiceNumber: invoice.invoiceNumber,
        },
      }),
    });
  } catch (err) {
    return { success: false, message: "Verbinding met Mollie mislukt. Controleer de internetverbinding." };
  }

  if (!mollieResp.ok) {
    const body = await mollieResp.json().catch(() => ({}));
    const detail = (body as { detail?: string }).detail ?? mollieResp.statusText;
    return { success: false, message: `Mollie fout: ${detail}` };
  }

  type MolliePayment = {
    id:          string;
    _links: { checkout: { href: string } };
  };
  const molliePayment = (await mollieResp.json()) as MolliePayment;

  const molliePaymentId = molliePayment.id;
  const checkoutUrl     = molliePayment._links?.checkout?.href ?? null;

  // Store in DB
  try {
    await db.insert(paymentsTable).values({
      invoiceId,
      molliePaymentId,
      amountCents,
      currency:    "EUR",
      status:      "open",
      checkoutUrl,
    });
  } catch {
    return { success: false, message: "Betaling aanmaken in database mislukt." };
  }

  await db.insert(auditLogTable).values({
    userId:     user.id,
    action:     "create_mollie_payment",
    resource:   "invoices",
    resourceId: invoiceId,
    metadata:   { molliePaymentId, amountCents, checkoutUrl },
  });

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");

  return { success: true, data: { checkoutUrl: checkoutUrl ?? "", molliePaymentId } };
}

/**
 * Marks an invoice as paid (called from the Mollie webhook handler).
 * This action can also be called directly by the webhook route in the API server.
 */
export async function markInvoicePaidByMollie(
  molliePaymentId: string,
  paidAt: Date,
): Promise<{ success: boolean; message?: string }> {
  // Find payment record
  const [payment] = await db
    .select({ id: paymentsTable.id, invoiceId: paymentsTable.invoiceId })
    .from(paymentsTable)
    .where(eq(paymentsTable.molliePaymentId, molliePaymentId))
    .limit(1);

  if (!payment) return { success: false, message: "Betaling niet gevonden." };

  // Update payment status
  await db
    .update(paymentsTable)
    .set({ status: "paid", paidAt })
    .where(eq(paymentsTable.molliePaymentId, molliePaymentId));

  const [invoice] = await db
    .select({ id: invoicesTable.id, status: invoicesTable.status, assignmentId: invoicesTable.assignmentId })
    .from(invoicesTable)
    .where(eq(invoicesTable.id, payment.invoiceId))
    .limit(1);

  if (invoice && invoice.status === "sent") {
    const paidDateStr = paidAt.toISOString().slice(0, 10);
    await db
      .update(invoicesTable)
      .set({ status: "paid", paidDate: paidDateStr, updatedAt: new Date() })
      .where(eq(invoicesTable.id, invoice.id));

    // Advance assignment: invoiced → paid → closed
    await db
      .update(assignmentsTable)
      .set({ status: "paid", updatedAt: new Date() })
      .where(eq(assignmentsTable.id, invoice.assignmentId));
    await db
      .update(assignmentsTable)
      .set({ status: "closed", updatedAt: new Date() })
      .where(eq(assignmentsTable.id, invoice.assignmentId));

    // audit_log.user_id is UUID NOT NULL; use dedicated system actor UUID
    // for webhook/background events that have no real Supabase auth user.
    const SYSTEM_ACTOR_UUID = "00000000-0000-0000-0000-000000000001";
    await db.insert(auditLogTable).values({
      userId:     SYSTEM_ACTOR_UUID,
      action:     "mollie_payment_received",
      resource:   "invoices",
      resourceId: invoice.id,
      metadata:   { molliePaymentId, paidAt: paidAt.toISOString() },
    });

    revalidatePath(`/invoices/${invoice.id}`);
    revalidatePath("/invoices");
  }

  return { success: true };
}

// ─── Customer-scoped query ─────────────────────────────────────────────────────

export type CustomerPaymentRow = {
  id:              string;
  invoiceId:       string;
  invoiceNumber:   string;
  molliePaymentId: string;
  amountCents:     number;
  currency:        string;
  status:          string;
  paidAt:          string | null;
  createdAt:       string;
};

export async function listPaymentsForCustomer(
  customerId: string,
  limit = 25,
): Promise<CustomerPaymentRow[]> {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return [];

  const rows = await db
    .select({
      id:              paymentsTable.id,
      invoiceId:       paymentsTable.invoiceId,
      invoiceNumber:   invoicesTable.invoiceNumber,
      molliePaymentId: paymentsTable.molliePaymentId,
      amountCents:     paymentsTable.amountCents,
      currency:        paymentsTable.currency,
      status:          paymentsTable.status,
      paidAt:          paymentsTable.paidAt,
      createdAt:       paymentsTable.createdAt,
    })
    .from(paymentsTable)
    .innerJoin(invoicesTable, eq(paymentsTable.invoiceId, invoicesTable.id))
    .where(eq(invoicesTable.customerId, customerId))
    .orderBy(desc(paymentsTable.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id:              r.id,
    invoiceId:       r.invoiceId,
    invoiceNumber:   r.invoiceNumber,
    molliePaymentId: r.molliePaymentId,
    amountCents:     r.amountCents,
    currency:        r.currency,
    status:          r.status,
    paidAt:          r.paidAt  ? r.paidAt.toISOString()  : null,
    createdAt:       r.createdAt.toISOString(),
  }));
}
