"use server";

import { revalidatePath } from "next/cache";
import { db } from "@workspace/db";
import {
  AmbiguousProviderResultError,
  bindProviderPayment,
  createMolliePayment,
  getTenantBranding,
  markPaymentForReconciliation,
  markProviderAttempt,
  prepareCollectionPaymentIntent,
  prepareDirectPaymentIntent,
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

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; message: string };

export type CustomerPaymentRecord = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  molliePaymentId: string | null;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  checkoutUrl: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type CustomerPaymentBatchRecord = {
  id: string;
  molliePaymentId: string | null;
  amountCents: number;
  currency: string;
  status: CustomerPaymentBatchStatus;
  checkoutUrl: string | null;
  paidAt: string | null;
  createdAt: string;
  invoices: {
    id: string;
    invoiceNumber: string;
    totalAmount: string;
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

function displayInvoiceNumber(
  value: string | null | undefined,
  fallback = "Factuur",
): string {
  return value?.trim() || fallback;
}

async function getAuthenticatedCustomer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const identity = await getMyCustomerIdentity();
  if (!identity) return null;
  return {
    userId: user.id,
    customerId: identity.customerId,
    tenantId: identity.tenantId,
  };
}

async function createMolliePaymentRequest(input: {
  intent: Awaited<ReturnType<typeof prepareDirectPaymentIntent>>;
  description: string;
  redirectUrl: string;
}): Promise<ActionResult<{ checkoutUrl: string }>> {
  if (input.intent.checkoutUrl)
    return { success: true, data: { checkoutUrl: input.intent.checkoutUrl } };
  try {
    await markProviderAttempt(input.intent.id);
    const snapshot = await createMolliePayment({
      requestKey: input.intent.providerRequestKey,
      amountCents: input.intent.amountCents,
      currency: input.intent.currency,
      description: input.description,
      redirectUrl: input.redirectUrl,
      webhookUrl:
        process.env.MOLLIE_WEBHOOK_URL ?? `${getBaseUrl()}/api/webhooks/mollie`,
      metadata: input.intent.metadata,
    });
    const bound = await bindProviderPayment(input.intent.id, snapshot);
    if (!bound.checkoutUrl)
      throw new Error("Mollie gaf geen geldige checkout-link terug.");
    return { success: true, data: { checkoutUrl: bound.checkoutUrl } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Verbinding met Mollie mislukt.";
    if (error instanceof AmbiguousProviderResultError) {
      await markPaymentForReconciliation(input.intent.id, message);
      return {
        success: false,
        message:
          "De betaalprovider verwerkt de aanvraag nog. Probeer dezelfde aanvraag opnieuw.",
      };
    }
    await markPaymentForReconciliation(input.intent.id, message);
    return { success: false, message };
  }
}

export async function createCustomerInvoicePayment(
  invoiceId: string,
): Promise<ActionResult<{ checkoutUrl: string }>> {
  const auth = await getAuthenticatedCustomer();
  if (!auth)
    return {
      success: false,
      message: "Niet ingelogd of geen klantprofiel gevonden.",
    };

  const [invoice] = await db
    .select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      customerId: invoicesTable.customerId,
      totalAmount: invoicesTable.totalAmount,
      status: invoicesTable.status,
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
    return {
      success: false,
      message: "Alleen openstaande facturen kunnen betaald worden.",
    };
  }

  let intent;
  try {
    intent = await prepareDirectPaymentIntent({
      tenantId: auth.tenantId,
      customerId: auth.customerId,
      invoiceId: invoice.id,
      actorUserId: auth.userId,
    });
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Betaalaanvraag opslaan mislukt.",
    };
  }

  const payment = await createMolliePaymentRequest({
    intent,
    description: `Factuur ${displayInvoiceNumber(invoice.invoiceNumber, invoice.id.slice(0, 8))}`,
    redirectUrl: `${getBaseUrl()}/klant/betalingen/succes?invoice=${invoice.id}`,
  });

  if (!payment.success) return { success: false, message: payment.message };

  revalidatePath("/facturen");
  revalidatePath(`/facturen/${invoice.id}`);

  return { success: true, data: { checkoutUrl: payment.data.checkoutUrl } };
}

export async function createCustomerBatchPayment(
  invoiceIds: string[],
): Promise<ActionResult<{ checkoutUrl: string }>> {
  const auth = await getAuthenticatedCustomer();
  if (!auth)
    return {
      success: false,
      message: "Niet ingelogd of geen klantprofiel gevonden.",
    };

  const uniqueInvoiceIds = [...new Set(invoiceIds)].filter(Boolean);
  if (uniqueInvoiceIds.length === 0) {
    return { success: false, message: "Selecteer minimaal één factuur." };
  }
  if (uniqueInvoiceIds.length === 1) {
    return createCustomerInvoicePayment(uniqueInvoiceIds[0]!);
  }

  const invoices = await db
    .select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      customerId: invoicesTable.customerId,
      totalAmount: invoicesTable.totalAmount,
      status: invoicesTable.status,
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
    return {
      success: false,
      message: "Een of meer facturen zijn niet gevonden.",
    };
  }
  if (invoices.some((invoice) => invoice.status !== "sent")) {
    return {
      success: false,
      message: "Een verzamelbetaling kan alleen openstaande facturen bevatten.",
    };
  }

  const branding = await getTenantBranding(auth.tenantId);
  let intent;
  try {
    intent = await prepareCollectionPaymentIntent({
      tenantId: auth.tenantId,
      customerId: auth.customerId,
      invoiceIds: uniqueInvoiceIds,
      actorUserId: auth.userId,
      actorType: "customer_user",
    });
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Verzamelbetaling opslaan mislukt.",
    };
  }
  const payment = await createMolliePaymentRequest({
    intent,
    description: `Verzamelfactuur ${branding.displayName} (${invoices.length} facturen)`,
    redirectUrl: `${getBaseUrl()}/klant/betalingen/succes`,
  });

  if (!payment.success) return { success: false, message: payment.message };

  revalidatePath("/facturen");
  revalidatePath("/betalingen");

  return { success: true, data: { checkoutUrl: payment.data.checkoutUrl } };
}

export async function getMyPayments(): Promise<CustomerPaymentRecord[]> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return [];

  const rows = await db
    .select({
      id: paymentsTable.id,
      invoiceId: paymentsTable.invoiceId,
      invoiceNumber: invoicesTable.invoiceNumber,
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
    .innerJoin(customersTable, eq(customersTable.id, invoicesTable.customerId))
    .where(
      and(
        eq(invoicesTable.customerId, identity.customerId),
        eq(customersTable.tenantId, identity.tenantId),
      ),
    )
    .orderBy(desc(paymentsTable.createdAt));

  return rows.map((row) => ({
    id: row.id,
    invoiceId: row.invoiceId ?? "",
    invoiceNumber: displayInvoiceNumber(
      row.invoiceNumber,
      (row.invoiceId ?? row.id).slice(0, 8),
    ),
    molliePaymentId: row.molliePaymentId,
    amountCents: row.amountCents,
    currency: row.currency,
    status: row.status as PaymentStatus,
    checkoutUrl: row.checkoutUrl ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getMyPaymentBatches(): Promise<
  CustomerPaymentBatchRecord[]
> {
  const identity = await getMyCustomerIdentity();
  if (!identity) return [];

  const batches = await db
    .select({
      id: customerPaymentBatchesTable.id,
      molliePaymentId: customerPaymentBatchesTable.molliePaymentId,
      amountCents: customerPaymentBatchesTable.amountCents,
      currency: customerPaymentBatchesTable.currency,
      status: customerPaymentBatchesTable.status,
      checkoutUrl: customerPaymentBatchesTable.checkoutUrl,
      paidAt: customerPaymentBatchesTable.paidAt,
      createdAt: customerPaymentBatchesTable.createdAt,
    })
    .from(customerPaymentBatchesTable)
    .innerJoin(
      customersTable,
      eq(customersTable.id, customerPaymentBatchesTable.customerId),
    )
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
      batchId: customerPaymentBatchItemsTable.batchId,
      invoiceId: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      totalAmount: invoicesTable.totalAmount,
    })
    .from(customerPaymentBatchItemsTable)
    .innerJoin(
      invoicesTable,
      eq(customerPaymentBatchItemsTable.invoiceId, invoicesTable.id),
    )
    .innerJoin(customersTable, eq(customersTable.id, invoicesTable.customerId))
    .where(
      and(
        inArray(customerPaymentBatchItemsTable.batchId, batchIds),
        eq(invoicesTable.customerId, identity.customerId),
        eq(customersTable.tenantId, identity.tenantId),
      ),
    );

  const itemsByBatch = new Map<
    string,
    CustomerPaymentBatchRecord["invoices"]
  >();
  for (const item of items) {
    const list = itemsByBatch.get(item.batchId) ?? [];
    list.push({
      id: item.invoiceId,
      invoiceNumber: displayInvoiceNumber(
        item.invoiceNumber,
        item.invoiceId.slice(0, 8),
      ),
      totalAmount: item.totalAmount,
    });
    itemsByBatch.set(item.batchId, list);
  }

  return batches.map((batch) => ({
    id: batch.id,
    molliePaymentId: batch.molliePaymentId,
    amountCents: batch.amountCents,
    currency: batch.currency,
    status: batch.status as CustomerPaymentBatchStatus,
    checkoutUrl: batch.checkoutUrl ?? null,
    paidAt: batch.paidAt?.toISOString() ?? null,
    createdAt: batch.createdAt.toISOString(),
    invoices: itemsByBatch.get(batch.id) ?? [],
  }));
}
