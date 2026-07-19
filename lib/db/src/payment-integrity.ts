import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "./connection";
import {
  assertProviderEnvelope,
  PAYMENT_METADATA_SCHEMA,
  type FieldgridPaymentMetadata,
  type MolliePaymentSnapshot,
} from "./mollie-payment-provider";

const ACTIVE_PAYMENT_STATUSES = [
  "created",
  "provider_pending",
  "open",
  "pending",
  "authorized",
  "reconciliation_required",
] as const;
const SYSTEM_ACTOR_UUID = "00000000-0000-0000-0000-000000000001";

export type DurablePaymentIntent = {
  id: string;
  tenantId: string;
  customerId: string;
  sourceType: "invoice" | "invoice_collection";
  sourceId: string;
  amountCents: number;
  currency: string;
  providerRequestKey: string;
  requestHash: string;
  metadata: FieldgridPaymentMetadata;
  status: string;
  molliePaymentId: string | null;
  checkoutUrl: string | null;
};

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function intentFromRow(row: Record<string, unknown>): DurablePaymentIntent {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    customerId: String(row.customer_id),
    sourceType: row.source_type as DurablePaymentIntent["sourceType"],
    sourceId: String(row.source_id),
    amountCents: Number(row.amount_cents),
    currency: String(row.currency),
    providerRequestKey: String(row.provider_request_key),
    requestHash: String(row.request_hash),
    metadata: row.expected_provider_metadata as FieldgridPaymentMetadata,
    status: String(row.status),
    molliePaymentId: row.mollie_payment_id
      ? String(row.mollie_payment_id)
      : null,
    checkoutUrl: row.checkout_url ? String(row.checkout_url) : null,
  };
}

async function inTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function invoiceOutstandingCents(
  client: PoolClient,
  invoiceId: string,
): Promise<number> {
  const result = await client.query(
    `SELECT greatest(
       round(coalesce(invoice.total_amount, 0) * 100)::bigint
       + coalesce((
           SELECT sum(round(coalesce(credit.total_amount, 0) * 100)::bigint)
           FROM public.invoices credit
           WHERE credit.credited_invoice_id = invoice.id
             AND credit.type = 'credit_note' AND credit.status IN ('sent', 'paid')
         ), 0)
       - coalesce((
           SELECT sum(allocation.amount_cents)::bigint
           FROM public.payment_allocations allocation
           WHERE allocation.invoice_id = invoice.id
         ), 0),
       0
     )::integer AS outstanding_cents
     FROM public.invoices invoice WHERE invoice.id = $1`,
    [invoiceId],
  );
  return Number(result.rows[0]?.outstanding_cents ?? 0);
}

async function findIntent(
  client: PoolClient,
  paymentId: string,
): Promise<DurablePaymentIntent> {
  const result = await client.query(
    `SELECT id, tenant_id, customer_id, source_type, source_id, amount_cents,
            currency, provider_request_key, request_hash, expected_provider_metadata,
            status, mollie_payment_id, checkout_url
     FROM public.payments WHERE id = $1`,
    [paymentId],
  );
  if (!result.rows[0]) throw new Error("Durable payment intent was not found.");
  return intentFromRow(result.rows[0]);
}

async function recordPaymentAuditOnce(
  client: PoolClient,
  intent: DurablePaymentIntent,
  action: string,
  discriminator: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO public.audit_log(tenant_id, user_id, action, resource, resource_id, metadata)
     SELECT $1::uuid, $2::uuid, $3::varchar(100), 'payments', $4::text, $5::jsonb
     WHERE NOT EXISTS (
       SELECT 1 FROM public.audit_log
       WHERE tenant_id = $1::uuid AND resource = 'payments' AND resource_id = $4::text
         AND action::text = $3::text AND metadata->>'discriminator' = $6::text
     )`,
    [
      intent.tenantId,
      SYSTEM_ACTOR_UUID,
      action,
      intent.id,
      JSON.stringify({ ...metadata, discriminator }),
      discriminator,
    ],
  );
}

async function quarantinePayment(
  client: PoolClient,
  intent: DurablePaymentIntent,
  reasonCode: string,
  reason: string,
): Promise<string> {
  const result = await client.query(
    `UPDATE public.payments
     SET status = CASE
           WHEN status IN ('paid', 'canceled', 'expired', 'failed') THEN status
           ELSE 'reconciliation_required'
         END,
         reconciliation_reason = left($2, 1000), updated_at = now(),
         status_version = status_version + 1
     WHERE id = $1
       AND (reconciliation_reason IS DISTINCT FROM left($2, 1000)
            OR status NOT IN ('paid', 'canceled', 'expired', 'failed', 'reconciliation_required'))
     RETURNING status`,
    [intent.id, reason],
  );
  await recordPaymentAuditOnce(
    client,
    intent,
    "payment_reconciliation_required",
    reasonCode,
    {
      reasonCode,
      sourceType: intent.sourceType,
      sourceId: intent.sourceId,
    },
  );
  return String(result.rows[0]?.status ?? intent.status);
}

export async function prepareDirectPaymentIntent(input: {
  tenantId: string;
  customerId: string;
  invoiceId: string;
  actorUserId: string;
}): Promise<DurablePaymentIntent> {
  return inTransaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`payment:invoice:${input.invoiceId}`],
    );
    const invoiceResult = await client.query(
      `SELECT id, tenant_id, customer_id, invoice_number, status, type
       FROM public.invoices
       WHERE id = $1 AND tenant_id = $2 AND customer_id = $3
       FOR UPDATE`,
      [input.invoiceId, input.tenantId, input.customerId],
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice || invoice.type !== "invoice")
      throw new Error("Invoice was not found.");
    if (invoice.status !== "sent")
      throw new Error("Only an open sent invoice can be paid.");

    const outstandingCents = await invoiceOutstandingCents(
      client,
      input.invoiceId,
    );
    if (outstandingCents <= 0)
      throw new Error("Invoice has no outstanding balance.");

    const batchConflict = await client.query(
      `SELECT 1
       FROM public.customer_payment_batch_items item
       JOIN public.customer_payment_batches batch ON batch.id = item.batch_id
       JOIN public.payments payment
         ON payment.source_type = 'invoice_collection' AND payment.source_id = batch.id
       WHERE item.invoice_id = $1 AND payment.status = ANY($2::text[])
       LIMIT 1`,
      [input.invoiceId, ACTIVE_PAYMENT_STATUSES],
    );
    if (batchConflict.rowCount)
      throw new Error("Invoice is reserved by an active collection payment.");

    const existingResult = await client.query(
      `SELECT id, tenant_id, customer_id, source_type, source_id, amount_cents,
              currency, provider_request_key, request_hash, expected_provider_metadata,
              status, mollie_payment_id, checkout_url
       FROM public.payments
       WHERE tenant_id = $1 AND source_type = 'invoice' AND source_id = $2
         AND payment_method = 'mollie' AND status = ANY($3::text[])
       ORDER BY created_at DESC LIMIT 1`,
      [input.tenantId, input.invoiceId, ACTIVE_PAYMENT_STATUSES],
    );
    if (existingResult.rows[0]) {
      const existing = intentFromRow(existingResult.rows[0]);
      if (
        existing.amountCents !== outstandingCents ||
        !existing.providerRequestKey ||
        !existing.requestHash
      ) {
        throw new Error(
          "Existing provider request no longer matches the authoritative outstanding balance.",
        );
      }
      return existing;
    }

    const id = randomUUID();
    const providerRequestKey = randomUUID();
    const metadata: FieldgridPaymentMetadata = {
      schemaVersion: PAYMENT_METADATA_SCHEMA,
      purpose: "invoice_payment",
      paymentIntentId: id,
      tenantId: input.tenantId,
      customerId: input.customerId,
      sourceType: "invoice",
      sourceId: input.invoiceId,
    };
    const hash = requestHash({
      amountCents: outstandingCents,
      currency: "EUR",
      metadata,
    });
    await client.query(
      `INSERT INTO public.payments(
         id, tenant_id, customer_id, invoice_id, source_type, source_id,
         provider_request_key, request_hash, expected_provider_metadata,
         amount_cents, amount, currency, payment_method, status, registered_by_user_id
       ) VALUES ($1, $2, $3, $4, 'invoice', $4, $5, $6, $7, $8::integer, ($8::integer)::numeric / 100,
                 'EUR', 'mollie', 'created', $9)`,
      [
        id,
        input.tenantId,
        input.customerId,
        input.invoiceId,
        providerRequestKey,
        hash,
        metadata,
        outstandingCents,
        input.actorUserId,
      ],
    );
    await client.query(
      `INSERT INTO public.audit_log(tenant_id, user_id, action, resource, resource_id, metadata)
       VALUES ($1, $2, 'create_durable_payment_intent', 'payments', $3,
               jsonb_build_object('sourceType', 'invoice', 'sourceId', $4::uuid, 'amountCents', $5::integer))`,
      [
        input.tenantId,
        input.actorUserId,
        id,
        input.invoiceId,
        outstandingCents,
      ],
    );
    return findIntent(client, id);
  });
}

export async function prepareCollectionPaymentIntent(input: {
  tenantId: string;
  customerId: string;
  invoiceIds: string[];
  actorUserId: string;
  actorType: "customer_user" | "tenant_user";
  periodStart?: string | null;
  periodEnd?: string | null;
  objectId?: string | null;
  notes?: string | null;
  discountCents?: number;
  surchargeCents?: number;
}): Promise<DurablePaymentIntent> {
  const invoiceIds = [...new Set(input.invoiceIds)].sort();
  if (invoiceIds.length < 2)
    throw new Error("A collection payment requires at least two invoices.");
  if ((input.discountCents ?? 0) !== 0 || (input.surchargeCents ?? 0) !== 0) {
    throw new Error(
      "Discounts and surcharges require an issued financial document before collection.",
    );
  }

  return inTransaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`payment:customer:${input.tenantId}:${input.customerId}`],
    );
    const invoicesResult = await client.query(
      `SELECT id, invoice_number, status, type,
              round(coalesce(amount, 0) * 100)::integer AS subtotal_cents,
              round(coalesce(vat_amount, 0) * 100)::integer AS vat_cents,
              round(coalesce(total_amount, 0) * 100)::integer AS total_cents
       FROM public.invoices
       WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND customer_id = $3
       ORDER BY id FOR UPDATE`,
      [invoiceIds, input.tenantId, input.customerId],
    );
    if (invoicesResult.rowCount !== invoiceIds.length)
      throw new Error("One or more invoices were not found.");
    if (
      invoicesResult.rows.some(
        (row) => row.status !== "sent" || row.type !== "invoice",
      )
    ) {
      throw new Error("A collection can contain only open sent invoices.");
    }

    const existingResult = await client.query(
      `SELECT payment.id, payment.tenant_id, payment.customer_id, payment.source_type,
              payment.source_id, payment.amount_cents, payment.currency,
              payment.provider_request_key, payment.request_hash,
              payment.expected_provider_metadata, payment.status,
              payment.mollie_payment_id, payment.checkout_url,
              array_agg(item.invoice_id::text ORDER BY item.invoice_id) AS invoice_ids
       FROM public.payments payment
       JOIN public.customer_payment_batch_items item ON item.batch_id = payment.source_id
       WHERE payment.tenant_id = $1 AND payment.customer_id = $2
         AND payment.source_type = 'invoice_collection' AND payment.status = ANY($3::text[])
         AND item.invoice_id = ANY($4::uuid[])
       GROUP BY payment.id
       ORDER BY payment.created_at DESC LIMIT 1`,
      [input.tenantId, input.customerId, ACTIVE_PAYMENT_STATUSES, invoiceIds],
    );

    const amounts: Array<{
      id: string;
      amountCents: number;
      totalCents: number;
      invoiceNumber: string | null;
    }> = [];
    for (const invoice of invoicesResult.rows) {
      const amountCents = await invoiceOutstandingCents(client, invoice.id);
      if (amountCents <= 0)
        throw new Error("Collection invoice has no outstanding balance.");
      amounts.push({
        id: invoice.id,
        amountCents,
        totalCents: Number(invoice.total_cents),
        invoiceNumber: invoice.invoice_number,
      });
    }
    const amountCents = amounts.reduce(
      (sum, item) => sum + item.amountCents,
      0,
    );

    if (existingResult.rows[0]) {
      const existingIds = (
        existingResult.rows[0].invoice_ids as string[]
      ).sort();
      if (JSON.stringify(existingIds) === JSON.stringify(invoiceIds)) {
        const existing = intentFromRow(existingResult.rows[0]);
        if (
          existing.amountCents === amountCents &&
          existing.providerRequestKey &&
          existing.requestHash
        )
          return existing;
      }
      throw new Error(
        "One or more invoices are reserved by another active payment.",
      );
    }
    const directConflict = await client.query(
      `SELECT 1 FROM public.payments
       WHERE tenant_id = $1 AND source_type = 'invoice' AND source_id = ANY($2::uuid[])
         AND payment_method = 'mollie' AND status = ANY($3::text[]) LIMIT 1`,
      [input.tenantId, invoiceIds, ACTIVE_PAYMENT_STATUSES],
    );
    if (directConflict.rowCount)
      throw new Error("One or more invoices are reserved by a direct payment.");

    const batchId = randomUUID();
    const paymentId = randomUUID();
    const providerRequestKey = randomUUID();
    const metadata: FieldgridPaymentMetadata = {
      schemaVersion: PAYMENT_METADATA_SCHEMA,
      purpose: "invoice_collection_payment",
      paymentIntentId: paymentId,
      tenantId: input.tenantId,
      customerId: input.customerId,
      sourceType: "invoice_collection",
      sourceId: batchId,
    };
    const hash = requestHash({
      amountCents,
      currency: "EUR",
      metadata,
      items: amounts.map(({ id, amountCents }) => ({ id, amountCents })),
    });
    const subtotalCents = invoicesResult.rows.reduce(
      (sum, row) => sum + Number(row.subtotal_cents),
      0,
    );
    const vatCents = invoicesResult.rows.reduce(
      (sum, row) => sum + Number(row.vat_cents),
      0,
    );
    await client.query(
      `INSERT INTO public.customer_payment_batches(
         id, tenant_id, customer_id, amount_cents, outstanding_amount_cents, currency,
         status, payment_provider, period_start, period_end, object_id,
         subtotal_cents, vat_cents, discount_cents, surcharge_cents, notes,
         created_by, created_by_actor_type
       ) VALUES ($1, $2, $3, $4, $4, 'EUR', 'open', 'mollie', $5, $6, $7,
                 $8, $9, 0, 0, $10, $11, $12)`,
      [
        batchId,
        input.tenantId,
        input.customerId,
        amountCents,
        input.periodStart ?? null,
        input.periodEnd ?? null,
        input.objectId ?? null,
        subtotalCents,
        vatCents,
        input.notes?.trim() || null,
        input.actorUserId,
        input.actorType,
      ],
    );
    for (const [index, item] of amounts.entries()) {
      await client.query(
        `INSERT INTO public.customer_payment_batch_items(
           tenant_id, batch_id, invoice_id, amount_cents, invoice_number_snapshot,
           original_total_amount_cents, paid_amount_at_collection_cents,
           outstanding_amount_at_collection_cents, included_amount_cents, sort_order
         ) VALUES ($1, $2, $3, $4, $5, $6, $6::integer - $4::integer, $4, $4, $7)`,
        [
          input.tenantId,
          batchId,
          item.id,
          item.amountCents,
          item.invoiceNumber,
          item.totalCents,
          index,
        ],
      );
    }
    await client.query(
      `INSERT INTO public.payments(
         id, tenant_id, customer_id, invoice_id, source_type, source_id,
         provider_request_key, request_hash, expected_provider_metadata,
         amount_cents, amount, currency, payment_method, status, registered_by_user_id
       ) VALUES ($1, $2, $3, NULL, 'invoice_collection', $4, $5, $6, $7,
                 $8::integer, ($8::integer)::numeric / 100, 'EUR', 'mollie', 'created', $9)`,
      [
        paymentId,
        input.tenantId,
        input.customerId,
        batchId,
        providerRequestKey,
        hash,
        metadata,
        amountCents,
        input.actorUserId,
      ],
    );
    await client.query(
      `INSERT INTO public.audit_log(tenant_id, user_id, action, resource, resource_id, metadata)
       VALUES ($1, $2, 'create_durable_collection_payment_intent', 'customer_payment_batches', $3,
               jsonb_build_object('paymentIntentId', $4::uuid, 'amountCents', $5::integer, 'invoiceIds', $6::jsonb))`,
      [
        input.tenantId,
        input.actorUserId,
        batchId,
        paymentId,
        amountCents,
        JSON.stringify(invoiceIds),
      ],
    );
    return findIntent(client, paymentId);
  });
}

export async function markProviderAttempt(paymentId: string): Promise<void> {
  await inTransaction(async (client) => {
    await client.query(
      "SELECT id FROM public.payments WHERE id = $1 FOR UPDATE",
      [paymentId],
    );
    const intent = await findIntent(client, paymentId);
    const updated = await client.query(
      `UPDATE public.payments SET status = 'provider_pending', provider_status = 'requesting',
              reconciliation_reason = NULL, updated_at = now(), status_version = status_version + 1
       WHERE id = $1 AND status IN ('created', 'provider_pending', 'reconciliation_required')
         AND (status IS DISTINCT FROM 'provider_pending' OR provider_status IS DISTINCT FROM 'requesting')
       RETURNING id`,
      [paymentId],
    );
    if (updated.rowCount) {
      await recordPaymentAuditOnce(
        client,
        intent,
        "request_payment_provider_creation",
        "provider_pending",
        {
          sourceType: intent.sourceType,
          sourceId: intent.sourceId,
        },
      );
    }
  });
}

export async function markPaymentForReconciliation(
  paymentId: string,
  reason: string,
): Promise<void> {
  await inTransaction(async (client) => {
    await client.query(
      "SELECT id FROM public.payments WHERE id = $1 FOR UPDATE",
      [paymentId],
    );
    const intent = await findIntent(client, paymentId);
    await quarantinePayment(
      client,
      intent,
      "provider_creation_or_binding_failure",
      reason,
    );
  });
}

export async function bindProviderPayment(
  paymentId: string,
  snapshot: MolliePaymentSnapshot,
): Promise<DurablePaymentIntent> {
  return inTransaction(async (client) => {
    await client.query(
      "SELECT id FROM public.payments WHERE id = $1 FOR UPDATE",
      [paymentId],
    );
    const intent = await findIntent(client, paymentId);
    assertProviderEnvelope(snapshot, {
      amountCents: intent.amountCents,
      currency: intent.currency,
      metadata: intent.metadata,
    });
    if (intent.molliePaymentId && intent.molliePaymentId !== snapshot.id) {
      throw new Error(
        "Provider response conflicts with the durable payment binding.",
      );
    }
    const localStatus =
      snapshot.status === "paid"
        ? "open"
        : [
              "open",
              "pending",
              "authorized",
              "canceled",
              "expired",
              "failed",
            ].includes(snapshot.status)
          ? snapshot.status
          : "reconciliation_required";
    await client.query(
      `UPDATE public.payments SET mollie_payment_id = $2, checkout_url = $3,
              status = $4, provider_status = $5, provider_mode = $6,
              provider_profile_id = $7, provider_created_at = $8,
              provider_status_at = $9, reconciliation_reason = NULL,
              updated_at = now(), status_version = status_version + 1
       WHERE id = $1`,
      [
        paymentId,
        snapshot.id,
        snapshot.checkoutUrl,
        localStatus,
        snapshot.status,
        snapshot.mode,
        snapshot.profileId,
        snapshot.providerCreatedAt,
        snapshot.providerStatusAt,
      ],
    );
    if (intent.sourceType === "invoice_collection") {
      await client.query(
        `UPDATE public.customer_payment_batches
         SET mollie_payment_id = $2, checkout_url = $3, status = $4, updated_at = now()
         WHERE id = $1`,
        [
          intent.sourceId,
          snapshot.id,
          snapshot.checkoutUrl,
          localStatus === "authorized" || localStatus === "pending"
            ? "open"
            : localStatus,
        ],
      );
    }
    await recordPaymentAuditOnce(
      client,
      intent,
      "bind_payment_provider_response",
      snapshot.id,
      {
        providerStatus: snapshot.status,
        mode: snapshot.mode,
        profileId: snapshot.profileId,
      },
    );
    return findIntent(client, paymentId);
  });
}

type ProviderApplyResult = {
  applied: boolean;
  duplicate: boolean;
  reconciliationRequired: boolean;
  status: string;
};

export async function applyProviderPaymentSnapshot(
  snapshot: MolliePaymentSnapshot,
): Promise<ProviderApplyResult> {
  return inTransaction(async (client) => {
    const locked = await client.query(
      `SELECT id FROM public.payments WHERE mollie_payment_id = $1 FOR UPDATE`,
      [snapshot.id],
    );
    if (!locked.rows[0])
      throw new Error(
        "No durable local payment intent is bound to this provider payment.",
      );
    const intent = await findIntent(client, locked.rows[0].id);
    try {
      assertProviderEnvelope(snapshot, {
        amountCents: intent.amountCents,
        currency: intent.currency,
        metadata: intent.metadata,
        mode: (
          await client.query(
            "SELECT provider_mode FROM public.payments WHERE id = $1",
            [intent.id],
          )
        ).rows[0]?.provider_mode,
        profileId: (
          await client.query(
            "SELECT provider_profile_id FROM public.payments WHERE id = $1",
            [intent.id],
          )
        ).rows[0]?.provider_profile_id,
      });
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Provider envelope mismatch.";
      const reasonCode = `provider_envelope_mismatch:${createHash("sha256").update(reason).digest("hex").slice(0, 12)}`;
      const status = await quarantinePayment(
        client,
        intent,
        reasonCode,
        reason,
      );
      return {
        applied: false,
        duplicate: false,
        reconciliationRequired: true,
        status,
      };
    }

    if (snapshot.reversalObserved) {
      const status = await quarantinePayment(
        client,
        intent,
        "provider_refund_or_chargeback",
        "Provider reported a refund or chargeback; accounting reversal requires explicit review.",
      );
      return {
        applied: false,
        duplicate: false,
        reconciliationRequired: true,
        status,
      };
    }
    if (intent.status === "paid") {
      return {
        applied: false,
        duplicate: snapshot.status === "paid",
        reconciliationRequired: false,
        status: "paid",
      };
    }
    const terminal = ["canceled", "expired", "failed"].includes(intent.status);
    const ranks: Record<string, number> = {
      created: 0,
      provider_pending: 0,
      open: 1,
      pending: 2,
      authorized: 3,
      paid: 4,
    };
    const providerTerminal = ["canceled", "expired", "failed"].includes(
      snapshot.status,
    );
    if (terminal) {
      return {
        applied: false,
        duplicate: snapshot.status === intent.status,
        reconciliationRequired: false,
        status: intent.status,
      };
    }
    if (providerTerminal) {
      await client.query(
        `UPDATE public.payments SET status = $2, provider_status = $2, provider_status_at = $3,
                updated_at = now(), status_version = status_version + 1 WHERE id = $1`,
        [intent.id, snapshot.status, snapshot.providerStatusAt],
      );
      if (intent.sourceType === "invoice_collection") {
        await client.query(
          "UPDATE public.customer_payment_batches SET status = $2, updated_at = now() WHERE id = $1",
          [intent.sourceId, snapshot.status],
        );
      }
      await recordPaymentAuditOnce(
        client,
        intent,
        "observe_provider_payment_status",
        snapshot.status,
        {
          providerStatus: snapshot.status,
        },
      );
      return {
        applied: true,
        duplicate: false,
        reconciliationRequired: false,
        status: snapshot.status,
      };
    }
    if (
      !(snapshot.status in ranks) ||
      (ranks[snapshot.status] ?? -1) < (ranks[intent.status] ?? 0)
    ) {
      return {
        applied: false,
        duplicate: false,
        reconciliationRequired: false,
        status: intent.status,
      };
    }
    if (snapshot.status !== "paid") {
      const transitioned = await client.query(
        `UPDATE public.payments SET status = $2, provider_status = $2, provider_status_at = $3,
                updated_at = now(), status_version = status_version + 1
         WHERE id = $1 AND (status IS DISTINCT FROM $2 OR provider_status IS DISTINCT FROM $2)
         RETURNING id`,
        [intent.id, snapshot.status, snapshot.providerStatusAt],
      );
      if (transitioned.rowCount && intent.sourceType === "invoice_collection") {
        const batchStatus = ["open", "canceled", "expired", "failed"].includes(
          snapshot.status,
        )
          ? snapshot.status
          : "open";
        await client.query(
          "UPDATE public.customer_payment_batches SET status = $2, updated_at = now() WHERE id = $1",
          [intent.sourceId, batchStatus],
        );
      }
      if (transitioned.rowCount) {
        await recordPaymentAuditOnce(
          client,
          intent,
          "observe_provider_payment_status",
          snapshot.status,
          {
            providerStatus: snapshot.status,
          },
        );
      }
      return {
        applied: Boolean(transitioned.rowCount),
        duplicate: !transitioned.rowCount,
        reconciliationRequired: false,
        status: snapshot.status,
      };
    }

    if (intent.sourceType === "invoice") {
      await client.query(
        "SELECT id FROM public.invoices WHERE id = $1 FOR UPDATE",
        [intent.sourceId],
      );
      const invoiceResult = await client.query(
        `SELECT id, tenant_id, customer_id, assignment_id, status FROM public.invoices WHERE id = $1`,
        [intent.sourceId],
      );
      const invoice = invoiceResult.rows[0];
      const outstanding = await invoiceOutstandingCents(
        client,
        intent.sourceId,
      );
      if (
        !invoice ||
        invoice.tenant_id !== intent.tenantId ||
        invoice.customer_id !== intent.customerId ||
        invoice.status !== "sent" ||
        outstanding !== intent.amountCents
      ) {
        const status = await quarantinePayment(
          client,
          intent,
          "direct_outstanding_mismatch",
          "Direct payment no longer equals the locked authoritative outstanding balance.",
        );
        return {
          applied: false,
          duplicate: false,
          reconciliationRequired: true,
          status,
        };
      }
      await client.query(
        `UPDATE public.payments SET status = 'paid', provider_status = 'paid', paid_at = $2,
                provider_status_at = $3, provider_finalized_at = now(), reconciliation_reason = NULL,
                updated_at = now(), status_version = status_version + 1 WHERE id = $1`,
        [intent.id, snapshot.paidAt ?? new Date(), snapshot.providerStatusAt],
      );
      await client.query(
        `INSERT INTO public.payment_allocations(tenant_id, payment_id, invoice_id, amount_cents, amount, note)
         VALUES ($1, $2, $3, $4::integer, ($4::integer)::numeric / 100, 'Mollie payment automatically allocated')
         ON CONFLICT (payment_id, invoice_id) DO NOTHING`,
        [intent.tenantId, intent.id, intent.sourceId, intent.amountCents],
      );
      const totals = await client.query(
        `SELECT coalesce(sum(amount_cents), 0)::integer AS paid_cents
         FROM public.payment_allocations WHERE invoice_id = $1`,
        [intent.sourceId],
      );
      const paidCents = Number(totals.rows[0]?.paid_cents ?? 0);
      await client.query(
        `UPDATE public.invoices SET status = 'paid', payment_status = 'paid',
                paid_amount = $2::numeric / 100, outstanding_amount = 0,
                paid_date = ($3::timestamptz AT TIME ZONE 'UTC')::date, updated_at = now()
         WHERE id = $1`,
        [intent.sourceId, paidCents, snapshot.paidAt ?? new Date()],
      );
      await client.query(
        "UPDATE public.assignments SET status = 'paid', updated_at = now() WHERE id = $1 AND status = 'invoiced'",
        [invoice.assignment_id],
      );
      await client.query(
        "UPDATE public.assignments SET status = 'closed', updated_at = now() WHERE id = $1 AND status = 'paid'",
        [invoice.assignment_id],
      );
    } else {
      await client.query(
        "SELECT id FROM public.customer_payment_batches WHERE id = $1 FOR UPDATE",
        [intent.sourceId],
      );
      const batch = (
        await client.query(
          "SELECT id, tenant_id, customer_id, amount_cents, status FROM public.customer_payment_batches WHERE id = $1",
          [intent.sourceId],
        )
      ).rows[0];
      const items = (
        await client.query(
          `SELECT item.invoice_id, item.included_amount_cents, invoice.assignment_id,
                invoice.tenant_id, invoice.customer_id, invoice.status
         FROM public.customer_payment_batch_items item
         JOIN public.invoices invoice ON invoice.id = item.invoice_id
         WHERE item.batch_id = $1 ORDER BY item.invoice_id FOR UPDATE OF invoice`,
          [intent.sourceId],
        )
      ).rows;
      const itemTotal = items.reduce(
        (sum, item) => sum + Number(item.included_amount_cents),
        0,
      );
      let valid =
        Boolean(batch) &&
        batch.tenant_id === intent.tenantId &&
        batch.customer_id === intent.customerId &&
        Number(batch.amount_cents) === intent.amountCents &&
        itemTotal === intent.amountCents &&
        items.length > 0;
      for (const item of items) {
        valid =
          valid &&
          item.tenant_id === intent.tenantId &&
          item.customer_id === intent.customerId &&
          item.status === "sent" &&
          (await invoiceOutstandingCents(client, item.invoice_id)) ===
            Number(item.included_amount_cents);
      }
      if (!valid) {
        const status = await quarantinePayment(
          client,
          intent,
          "collection_outstanding_mismatch",
          "Collection items no longer exactly reconcile to locked invoice balances.",
        );
        return {
          applied: false,
          duplicate: false,
          reconciliationRequired: true,
          status,
        };
      }
      await client.query(
        `UPDATE public.payments SET status = 'paid', provider_status = 'paid', paid_at = $2,
                provider_status_at = $3, provider_finalized_at = now(), reconciliation_reason = NULL,
                updated_at = now(), status_version = status_version + 1 WHERE id = $1`,
        [intent.id, snapshot.paidAt ?? new Date(), snapshot.providerStatusAt],
      );
      for (const item of items) {
        const amount = Number(item.included_amount_cents);
        await client.query(
          `INSERT INTO public.payment_allocations(tenant_id, payment_id, invoice_id, amount_cents, amount, note)
           VALUES ($1, $2, $3, $4::integer, ($4::integer)::numeric / 100, 'Mollie collection payment automatically allocated')
           ON CONFLICT (payment_id, invoice_id) DO NOTHING`,
          [intent.tenantId, intent.id, item.invoice_id, amount],
        );
        const paidCents = Number(
          (
            await client.query(
              "SELECT coalesce(sum(amount_cents), 0)::integer AS paid_cents FROM public.payment_allocations WHERE invoice_id = $1",
              [item.invoice_id],
            )
          ).rows[0]?.paid_cents ?? 0,
        );
        await client.query(
          `UPDATE public.invoices SET status = 'paid', payment_status = 'paid', collection_status = 'collection_paid',
                  paid_amount = $2::numeric / 100, outstanding_amount = 0,
                  paid_date = ($3::timestamptz AT TIME ZONE 'UTC')::date, updated_at = now() WHERE id = $1`,
          [item.invoice_id, paidCents, snapshot.paidAt ?? new Date()],
        );
        await client.query(
          "UPDATE public.assignments SET status = 'paid', updated_at = now() WHERE id = $1 AND status = 'invoiced'",
          [item.assignment_id],
        );
        await client.query(
          "UPDATE public.assignments SET status = 'closed', updated_at = now() WHERE id = $1 AND status = 'paid'",
          [item.assignment_id],
        );
      }
      await client.query(
        `UPDATE public.customer_payment_batches SET status = 'paid', paid_amount_cents = amount_cents,
                outstanding_amount_cents = 0, paid_at = $2, updated_at = now() WHERE id = $1`,
        [intent.sourceId, snapshot.paidAt ?? new Date()],
      );
    }

    await recordPaymentAuditOnce(
      client,
      intent,
      "apply_verified_provider_payment",
      "paid",
      {
        sourceType: intent.sourceType,
        sourceId: intent.sourceId,
        amountCents: intent.amountCents,
        providerStatus: "paid",
      },
    );
    return {
      applied: true,
      duplicate: false,
      reconciliationRequired: false,
      status: "paid",
    };
  });
}
