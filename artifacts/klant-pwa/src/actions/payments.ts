"use server";

import { revalidatePath } from "next/cache";
import { db } from "@workspace/db";
import {
  auditLogTable,
  customersTable,
  customerPaymentBatchItemsTable,
  customerPaymentBatchesTable,
  invoicesTable,
  paymentsTable,
  type CustomerPaymentBatchStatus,
  type PaymentStatus,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getMyCustomerIdentity } from "./customer";

type ActionResult<T> = { success: true; data: T } | { success: false; message: string };

export type CustomerPaymentRecord = {
  id:              string;
  invoiceId:       string;
  invoiceNumber:   string;
  molliePaymentId: string;
  amountCents:     number;
  currency:        string;
  status:          PaymentStatus;
  checkoutUrl:     string | null;
  paidAt:          string | null;
  createdAt:       string;
};

export type CustomerPaymentBatchRecord = {
  id:              string;
  molliePaymentId: string;
  amountCents:     number;
  currency:        string;
  status:          CustomerPaymentBatchStatus;
  checkoutUrl:     string | null;
  paidAt:          string | null;
  createdAt:       string;
  invoices: {
    id:            string;
    invoiceNumber: string;
    totalAmount:   string;
  }[];
};

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

function centsToMollieValue(cents: number): string {
  return (cents / 100).toFixed(2);
}

function parseAmountCents(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

async function getAuthenticatedCustomer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const identity = await getMyCustomerIdentity();
  if (!identity) return null;
  return { userId: user.id, customerId: identity.customerId, tenantId: identity.tenantId };
}

async function createMolliePaymentRequest(input: {
  amountCents: number;
  description: string;
  redirectUrl: string;
  metadata: Record<string, unknown>;
}): Promise<ActionResult<{ checkoutUrl: string; molliePaymentId: string }>> {
  const mollieKey = process.env.MOLLIE_API_KEY;
  if (!mollieKey) {
    return { success: false, message: "Mollie API-sleutel is niet geconfigureerd." };
  }

  let response: Response;
  try {
    response = await fetch("https://api.mollie.com/v2/payments", {
      method:  "POST",
      headers: {
        Authorization: `Bearer ${mollieKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: {
          currency: "EUR",
          value:    centsToMollieValue(input.amountCents),
        },
        description: input.description,
        redirectUrl: input.redirectUrl,
        webhookUrl:  process.env.MOLLIE_WEBHOOK_URL ?? `${getBaseUrl()}/api/webhooks/mollie`,
        metadata:    input.metadata,
      }),
    });
  } catch {
    return { success: false, message: "Verbinding met Mollie mislukt." };
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = (body as { detail?: string }).detail ?? response.statusText;
    return { success: false, message: `Mollie fout: ${detail}` };
  }

  const payment = await response.json() as {
    id: string;
    _links?: { checkout?: { href?: string } };
  };

  const checkoutUrl = payment._links?.checkout?.href;
  if (!payment.id || !checkoutUrl) {
    return { success: false, message: "Mollie gaf geen geldige checkout-link terug." };
  }

  return { success: true, data: { checkoutUrl, molliePaymentId: payment.id } };
}

export async function createCustomerInvoicePayment(invoiceId: string): Promise<ActionResult<{ checkoutUrl: string }>> {
  const auth = await getAuthenticatedCustomer();
  if (!auth) return { success: false, message: "Niet ingelogd of geen klantprofiel gevonden." };

  const [invoice] = await db
    .select({
      id:            invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      customerId:    invoicesTable.customerId,
      totalAmount:   invoicesTable.totalAmount,
      status:        invoicesTable.status,
    })
    .from(invoicesTable)
    .innerJoin(customersTable, eq(customersTable.id, invoicesTable.customerId))
    .where(
      and(
        eq(invoicesTable.id, invoiceId),
        eq(invoicesTable.customerId, auth.customerId),
        eq(customersTable.tenantId, auth.tenantId),
      ),
    )
    .limit(1);

  if (!invoice) return { success: false, message: "Factuur niet gevonden." };
  if (invoice.status !== "sent") {
    return { success: false, message: "Alleen openstaande facturen kunnen betaald worden." };
  }

  const [existing] = await db
    .select({ checkoutUrl: paymentsTable.checkoutUrl })
    .from(paymentsTable)
    .where(and(eq(paymentsTable.invoiceId, invoice.id), eq(paymentsTable.status, "open")))
    .orderBy(desc(paymentsTable.createdAt))
    .limit(1);

  if (existing?.checkoutUrl) {
    return { success: true, data: { checkoutUrl: existing.checkoutUrl } };
  }

  const amountCents = parseAmountCents(invoice.totalAmount);
  if (amountCents <= 0) return { success: false, message: "Ongeldig factuurbedrag." };

  const payment = await createMolliePaymentRequest({
    amountCents,
    description: `Factuur ${invoice.invoiceNumber}`,
    redirectUrl: `${getBaseUrl()}/klant/betalingen/succes?invoice=${invoice.id}`,
    metadata: {
      type:          "invoice",
      invoiceId:     invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId:    auth.customerId,
      tenantId:      auth.tenantId,
    },
  });

  if (!payment.success) return { success: false, message: payment.message };

  await db.insert(paymentsTable).values({
    invoiceId:        invoice.id,
    molliePaymentId:  payment.data.molliePaymentId,
    amountCents,
    currency:         "EUR",
    status:           "open",
    checkoutUrl:      payment.data.checkoutUrl,
  });

  await db.insert(auditLogTable).values({
    userId:     auth.userId,
    action:     "customer_create_mollie_payment",
    resource:   "invoices",
    resourceId: invoice.id,
    metadata:   { molliePaymentId: payment.data.molliePaymentId, amountCents },
  });

  revalidatePath("/facturen");
  revalidatePath(`/facturen/${invoice.id}`);

  return { success: true, data: { checkoutUrl: payment.data.checkoutUrl } };
}

export async function createCustomerBatchPayment(invoiceIds: string[]): Promise<ActionResult<{ checkoutUrl: string }>> {
  const auth = await getAuthenticatedCustomer();
  if (!auth) return { success: false, message: "Niet ingelogd of geen klantprofiel gevonden." };

  const uniqueInvoiceIds = [...new Set(invoiceIds)].filter(Boolean);
  if (uniqueInvoiceIds.length === 0) {
    return { success: false, message: "Selecteer minimaal één factuur." };
  }
  if (uniqueInvoiceIds.length === 1) {
    return createCustomerInvoicePayment(uniqueInvoiceIds[0]!);
  }

  const invoices = await db
    .select({
      id:            invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      customerId:    invoicesTable.customerId,
      totalAmount:   invoicesTable.totalAmount,
      status:        invoicesTable.status,
    })
    .from(invoicesTable)
    .innerJoin(customersTable, eq(customersTable.id, invoicesTable.customerId))
    .where(
      and(
        inArray(invoicesTable.id, uniqueInvoiceIds),
        eq(invoicesTable.customerId, auth.customerId),
        eq(customersTable.tenantId, auth.tenantId),
      ),
    );

  if (invoices.length !== uniqueInvoiceIds.length) {
    return { success: false, message: "Een of meer facturen zijn niet gevonden." };
  }
  if (invoices.some((invoice) => invoice.status !== "sent")) {
    return { success: false, message: "Een verzamelbetaling kan alleen openstaande facturen bevatten." };
  }

  const amountCents = invoices.reduce((sum, invoice) => sum + parseAmountCents(invoice.totalAmount), 0);
  if (amountCents <= 0) return { success: false, message: "Ongeldig totaalbedrag." };

  const invoiceNumbers = invoices.map((invoice) => invoice.invoiceNumber).join(", ");
  const payment = await createMolliePaymentRequest({
    amountCents,
    description: `Verzamelfactuur Veele Services (${invoices.length} facturen)`,
    redirectUrl: `${getBaseUrl()}/klant/betalingen/succes`,
    metadata: {
      type:          "customer_payment_batch",
      customerId:    auth.customerId,
      tenantId:      auth.tenantId,
      invoiceIds:    invoices.map((invoice) => invoice.id),
      invoiceNumbers,
    },
  });

  if (!payment.success) return { success: false, message: payment.message };

  const [batch] = await db
    .insert(customerPaymentBatchesTable)
    .values({
      customerId:       auth.customerId,
      molliePaymentId:  payment.data.molliePaymentId,
      amountCents,
      currency:         "EUR",
      status:           "open",
      checkoutUrl:      payment.data.checkoutUrl,
      createdBy:        auth.userId,
    })
    .returning({ id: customerPaymentBatchesTable.id });

  if (!batch) return { success: false, message: "Verzamelbetaling opslaan mislukt." };

  await db.insert(customerPaymentBatchItemsTable).values(
    invoices.map((invoice) => ({
      batchId:     batch.id,
      invoiceId:   invoice.id,
      amountCents: parseAmountCents(invoice.totalAmount),
    })),
  );

  await db.insert(auditLogTable).values({
    userId:     auth.userId,
    action:     "customer_create_mollie_payment_batch",
    resource:   "customer_payment_batches",
    resourceId: batch.id,
    metadata:   { molliePaymentId: payment.data.molliePaymentId, amountCents, invoiceIds: invoices.map((i) => i.id) },
  });

  revalidatePath("/facturen");
  revalidatePath("/betalingen");

  return { success: true, data: { checkoutUrl: payment.data.checkoutUrl } };
}

export async function getMyPayments(): Promise<CustomerPaymentRecord[]> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return [];

  const rows = await db
    .select({
      id:              paymentsTable.id,
      invoiceId:       paymentsTable.invoiceId,
      invoiceNumber:   invoicesTable.invoiceNumber,
      molliePaymentId: paymentsTable.molliePaymentId,
      amountCents:     paymentsTable.amountCents,
      currency:        paymentsTable.currency,
      status:          paymentsTable.status,
      checkoutUrl:     paymentsTable.checkoutUrl,
      paidAt:          paymentsTable.paidAt,
      createdAt:       paymentsTable.createdAt,
    })
    .from(paymentsTable)
    .innerJoin(invoicesTable, eq(paymentsTable.invoiceId, invoicesTable.id))
    .innerJoin(customersTable, eq(customersTable.id, invoicesTable.customerId))
    .where(
      and(
        eq(invoicesTable.customerId, identity.customerId),
        eq(customersTable.tenantId, identity.tenantId),
      ),
    )
    .orderBy(desc(paymentsTable.createdAt));

  return rows.map((row) => ({
    id:              row.id,
    invoiceId:       row.invoiceId,
    invoiceNumber:   row.invoiceNumber,
    molliePaymentId: row.molliePaymentId,
    amountCents:     row.amountCents,
    currency:        row.currency,
    status:          row.status as PaymentStatus,
    checkoutUrl:     row.checkoutUrl ?? null,
    paidAt:          row.paidAt?.toISOString() ?? null,
    createdAt:       row.createdAt.toISOString(),
  }));
}

export async function getMyPaymentBatches(): Promise<CustomerPaymentBatchRecord[]> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return [];

  const batches = await db
    .select({
      id:              customerPaymentBatchesTable.id,
      molliePaymentId: customerPaymentBatchesTable.molliePaymentId,
      amountCents:     customerPaymentBatchesTable.amountCents,
      currency:        customerPaymentBatchesTable.currency,
      status:          customerPaymentBatchesTable.status,
      checkoutUrl:     customerPaymentBatchesTable.checkoutUrl,
      paidAt:          customerPaymentBatchesTable.paidAt,
      createdAt:       customerPaymentBatchesTable.createdAt,
    })
    .from(customerPaymentBatchesTable)
    .innerJoin(customersTable, eq(customersTable.id, customerPaymentBatchesTable.customerId))
    .where(
      and(
        eq(customerPaymentBatchesTable.customerId, identity.customerId),
        eq(customersTable.tenantId, identity.tenantId),
      ),
    )
    .orderBy(desc(customerPaymentBatchesTable.createdAt));

  if (batches.length === 0) return [];

  const batchIds = batches.map((batch) => batch.id);
  const items = await db
    .select({
      batchId:       customerPaymentBatchItemsTable.batchId,
      invoiceId:     invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      totalAmount:   invoicesTable.totalAmount,
    })
    .from(customerPaymentBatchItemsTable)
    .innerJoin(invoicesTable, eq(customerPaymentBatchItemsTable.invoiceId, invoicesTable.id))
    .innerJoin(customersTable, eq(customersTable.id, invoicesTable.customerId))
    .where(
      and(
        inArray(customerPaymentBatchItemsTable.batchId, batchIds),
        eq(invoicesTable.customerId, identity.customerId),
        eq(customersTable.tenantId, identity.tenantId),
      ),
    );

  const itemsByBatch = new Map<string, CustomerPaymentBatchRecord["invoices"]>();
  for (const item of items) {
    const list = itemsByBatch.get(item.batchId) ?? [];
    list.push({
      id:            item.invoiceId,
      invoiceNumber: item.invoiceNumber,
      totalAmount:   item.totalAmount,
    });
    itemsByBatch.set(item.batchId, list);
  }

  return batches.map((batch) => ({
    id:              batch.id,
    molliePaymentId: batch.molliePaymentId,
    amountCents:     batch.amountCents,
    currency:        batch.currency,
    status:          batch.status as CustomerPaymentBatchStatus,
    checkoutUrl:     batch.checkoutUrl ?? null,
    paidAt:          batch.paidAt?.toISOString() ?? null,
    createdAt:       batch.createdAt.toISOString(),
    invoices:        itemsByBatch.get(batch.id) ?? [],
  }));
}
