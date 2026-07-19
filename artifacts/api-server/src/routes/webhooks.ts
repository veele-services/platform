import { Router } from "express";
import { db } from "@workspace/db";
import {
  paymentsTable,
  paymentAllocationsTable,
  invoicesTable,
  assignmentsTable,
  auditLogTable,
  customerPaymentBatchesTable,
  customerPaymentBatchItemsTable,
  maskPaymentProviderId,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import type { Request, Response } from "express";
import { verifyMollieSignature } from "../lib/mollie";

const router = Router();

/**
 * POST /api/webhooks/mollie
 *
 * Mollie sends a form-encoded POST with a single field: `id` (the payment ID).
 * We re-fetch the payment from Mollie to verify the status (re-verification pattern).
 *
 * Security layer (in priority order):
 *   1. HMAC-SHA256 signature via `x-mollie-signature` header when MOLLIE_WEBHOOK_SECRET is set.
 *   2. Fallback: query-string secret (`?secret=â€¦`) for existing deployments without the header.
 *   3. If MOLLIE_WEBHOOK_SECRET is not configured at all: accept with a warning (dev fallback).
 *
 * Spec: https://docs.mollie.com/docs/webhooks
 */
router.post("/webhooks/mollie", async (req: Request, res: Response) => {
  // â”€â”€ Signature / secret guard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const webhookSecret = process.env.MOLLIE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    // Dev fallback: no secret configured â€” accept but warn
    req.log.warn(
      "MOLLIE_WEBHOOK_SECRET is not configured â€” accepting Mollie webhook without validation. " +
        "Set this env var in production to enable request verification.",
    );
  } else {
    // Secret is configured â€” x-mollie-signature is required; no fallback
    const hmacSignature = req.headers["x-mollie-signature"] as
      | string
      | undefined;
    if (!hmacSignature) {
      req.log.warn(
        { ip: req.ip },
        "Mollie webhook rejected â€” x-mollie-signature header missing",
      );
      res.status(400).send("Missing signature");
      return;
    }

    const rawBody = req.rawBody ? req.rawBody.toString("utf8") : "";
    if (!verifyMollieSignature(rawBody, hmacSignature, webhookSecret)) {
      req.log.warn(
        { ip: req.ip },
        "Mollie webhook rejected â€” invalid x-mollie-signature",
      );
      res.status(400).send("Invalid signature");
      return;
    }
  }

  // â”€â”€ API key check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const mollieKey = process.env.MOLLIE_API_KEY;
  if (!mollieKey) {
    req.log.error("MOLLIE_API_KEY not configured â€” cannot process webhook");
    res.status(503).send("payment provider unavailable");
    return;
  }

  const molliePaymentId = (req.body as Record<string, string>)["id"];
  if (!molliePaymentId || !molliePaymentId.startsWith("tr_")) {
    req.log.warn(
      { bodyKeys: Object.keys((req.body as Record<string, unknown>) ?? {}) },
      "Mollie webhook received invalid or missing payment ID",
    );
    res.status(200).send("ok");
    return;
  }
  const molliePaymentReference = maskPaymentProviderId(molliePaymentId);

  req.log.info({ molliePaymentReference }, "Mollie webhook received");

  // Re-fetch payment from Mollie to get the authoritative status
  let mollieStatus: string;
  try {
    const mollieApiBaseUrl = (
      process.env.MOLLIE_API_BASE_URL ?? "https://api.mollie.com"
    ).replace(/\/$/u, "");
    const response = await fetch(
      `${mollieApiBaseUrl}/v2/payments/${molliePaymentId}`,
      {
        headers: { Authorization: `Bearer ${mollieKey}` },
      },
    );

    if (!response.ok) {
      req.log.error(
        { molliePaymentReference, status: response.status },
        "Failed to fetch payment from Mollie",
      );
      res.status(502).send("payment provider status unavailable");
      return;
    }

    type MolliePayment = { id: string; status: string; paidAt?: string };
    const data = (await response.json()) as MolliePayment;
    mollieStatus = data.status;

    req.log.info(
      { molliePaymentReference, mollieStatus },
      "Fetched payment status from Mollie",
    );
    const localPaymentStatus = (
      ["open", "paid", "canceled", "expired", "failed"].includes(mollieStatus)
        ? mollieStatus
        : "failed"
    ) as "open" | "paid" | "canceled" | "expired" | "failed";
    const localBatchStatus = (
      mollieStatus === "paid"
        ? "paid"
        : ["open", "canceled", "expired", "failed"].includes(mollieStatus)
          ? mollieStatus
          : "failed"
    ) as "open" | "paid" | "canceled" | "expired" | "failed";

    // Process every local transition atomically. A failed statement rolls back the
    // payment, allocation, invoice, assignment and audit changes together; the
    // non-2xx response below then asks Mollie to retry the same provider event.
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM public.payments WHERE mollie_payment_id = ${molliePaymentId} FOR UPDATE`,
      );
      const [payment] = await tx
        .select({
          id: paymentsTable.id,
          invoiceId: paymentsTable.invoiceId,
          tenantId: paymentsTable.tenantId,
          customerId: paymentsTable.customerId,
          sourceType: paymentsTable.sourceType,
          sourceId: paymentsTable.sourceId,
          amountCents: paymentsTable.amountCents,
          status: paymentsTable.status,
        })
        .from(paymentsTable)
        .where(eq(paymentsTable.molliePaymentId, molliePaymentId))
        .limit(1);

      const paidAt = data.paidAt ? new Date(data.paidAt) : new Date();

      // audit_log.user_id is UUID NOT NULL; use dedicated system actor UUID
      // for webhook/background events with no Supabase auth user.
      const SYSTEM_ACTOR_UUID = "00000000-0000-0000-0000-000000000001";

      if (!payment) {
        throw new Error(
          "No durable local payment intent found for Mollie payment ID",
        );
      }

      const previousStatus = payment.status;

      // Update local payment status
      await tx
        .update(paymentsTable)
        .set({
          status: localPaymentStatus,
          paidAt: mollieStatus === "paid" ? paidAt : undefined,
        })
        .where(eq(paymentsTable.molliePaymentId, molliePaymentId));

      if (payment.sourceType === "invoice_collection" && payment.sourceId) {
        await tx.execute(
          sql`SELECT id FROM public.customer_payment_batches WHERE id = ${payment.sourceId}::uuid FOR UPDATE`,
        );
        const [batch] = await tx
          .select({
            id: customerPaymentBatchesTable.id,
            tenantId: customerPaymentBatchesTable.tenantId,
            customerId: customerPaymentBatchesTable.customerId,
            amountCents: customerPaymentBatchesTable.amountCents,
            status: customerPaymentBatchesTable.status,
          })
          .from(customerPaymentBatchesTable)
          .where(eq(customerPaymentBatchesTable.id, payment.sourceId))
          .limit(1);

        if (
          !batch ||
          !payment.tenantId ||
          batch.tenantId !== payment.tenantId ||
          batch.customerId !== payment.customerId ||
          batch.amountCents !== payment.amountCents
        ) {
          throw new Error(
            "Collection payment source does not match its tenant, customer or amount",
          );
        }

        if (
          previousStatus === "paid" &&
          batch.status === "paid" &&
          mollieStatus === "paid"
        ) {
          return;
        }

        if (mollieStatus !== "paid") {
          await tx
            .update(customerPaymentBatchesTable)
            .set({ status: localBatchStatus })
            .where(eq(customerPaymentBatchesTable.id, batch.id));
          return;
        }

        const items = await tx
          .select({
            invoiceId: customerPaymentBatchItemsTable.invoiceId,
            amountCents: customerPaymentBatchItemsTable.amountCents,
            tenantId: customerPaymentBatchItemsTable.tenantId,
          })
          .from(customerPaymentBatchItemsTable)
          .where(eq(customerPaymentBatchItemsTable.batchId, batch.id));
        const allocationTotal = items.reduce(
          (sum, item) => sum + item.amountCents,
          0,
        );
        if (items.length === 0 || allocationTotal !== payment.amountCents) {
          throw new Error(
            "Collection items do not exactly reconcile to the settled provider amount",
          );
        }

        const paidDateStr = paidAt.toISOString().slice(0, 10);
        for (const item of items) {
          await tx.execute(
            sql`SELECT id FROM public.invoices WHERE id = ${item.invoiceId}::uuid FOR UPDATE`,
          );
          const [invoice] = await tx
            .select({
              id: invoicesTable.id,
              tenantId: invoicesTable.tenantId,
              customerId: invoicesTable.customerId,
              status: invoicesTable.status,
              assignmentId: invoicesTable.assignmentId,
              totalAmount: invoicesTable.totalAmount,
            })
            .from(invoicesTable)
            .where(eq(invoicesTable.id, item.invoiceId))
            .limit(1);

          if (
            !invoice ||
            invoice.tenantId !== payment.tenantId ||
            invoice.customerId !== payment.customerId ||
            item.tenantId !== payment.tenantId ||
            invoice.status !== "sent" ||
            Math.round(Number.parseFloat(invoice.totalAmount ?? "0") * 100) !==
              item.amountCents
          ) {
            throw new Error("Collection item is not a matching open invoice");
          }

          await tx.insert(paymentAllocationsTable).values({
            tenantId: payment.tenantId,
            paymentId: payment.id,
            invoiceId: invoice.id,
            amountCents: item.amountCents,
            amount: (item.amountCents / 100).toFixed(2),
            note: "Mollie verzamelbetaling automatisch toegewezen",
          });

          await tx
            .update(invoicesTable)
            .set({
              status: "paid",
              paymentStatus: "paid",
              collectionStatus: "collection_paid",
              paidAmount: (item.amountCents / 100).toFixed(2),
              outstandingAmount: "0.00",
              paidDate: paidDateStr,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(invoicesTable.id, invoice.id),
                eq(invoicesTable.tenantId, payment.tenantId),
              ),
            );

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
        }

        await tx
          .update(customerPaymentBatchesTable)
          .set({
            status: "paid",
            paidAmountCents: payment.amountCents,
            outstandingAmountCents: 0,
            paidAt,
          })
          .where(
            and(
              eq(customerPaymentBatchesTable.id, batch.id),
              eq(customerPaymentBatchesTable.tenantId, payment.tenantId),
            ),
          );

        await tx.insert(auditLogTable).values({
          tenantId: payment.tenantId,
          userId: SYSTEM_ACTOR_UUID,
          action: "mollie_payment_batch_received",
          resource: "customer_payment_batches",
          resourceId: batch.id,
          metadata: {
            paymentReference: molliePaymentReference,
            paidAt: paidAt.toISOString(),
            invoiceCount: items.length,
            amountCents: payment.amountCents,
          },
        });

        return;
      }

      if (
        payment.sourceType !== "invoice" ||
        !payment.invoiceId ||
        payment.sourceId !== payment.invoiceId ||
        !payment.tenantId
      ) {
        throw new Error("Mollie payment has an invalid direct-invoice source");
      }
      if (previousStatus === localPaymentStatus) {
        return;
      }

      // Log every status transition (open, paid, canceled, expired, failed, â€¦)
      await tx.insert(auditLogTable).values({
        userId: SYSTEM_ACTOR_UUID,
        action: "mollie_payment_status_changed",
        resource: "payments",
        resourceId: payment.id,
        metadata: {
          paymentReference: molliePaymentReference,
          invoiceId: payment.invoiceId,
          previousStatus,
          newstatus: localBatchStatus,
        },
      });

      // If paid: advance invoice and assignment
      if (mollieStatus === "paid") {
        const [invoice] = await tx
          .select({
            id: invoicesTable.id,
            tenantId: invoicesTable.tenantId,
            customerId: invoicesTable.customerId,
            status: invoicesTable.status,
            assignmentId: invoicesTable.assignmentId,
          })
          .from(invoicesTable)
          .where(eq(invoicesTable.id, payment.invoiceId))
          .limit(1);

        if (
          !invoice ||
          invoice.tenantId !== payment.tenantId ||
          invoice.customerId !== payment.customerId ||
          invoice.status !== "sent"
        ) {
          throw new Error(
            "Direct payment invoice is not a matching open invoice",
          );
        }
        {
          const paidDateStr = paidAt.toISOString().slice(0, 10);

          await tx
            .update(invoicesTable)
            .set({
              status: "paid",
              paymentStatus: "paid",
              paidAmount: (payment.amountCents / 100).toFixed(2),
              outstandingAmount: "0",
              paidDate: paidDateStr,
              updatedAt: new Date(),
            })
            .where(eq(invoicesTable.id, invoice.id));

          await tx.insert(paymentAllocationsTable).values({
            tenantId: payment.tenantId,
            paymentId: payment.id,
            invoiceId: invoice.id,
            amountCents: payment.amountCents,
            amount: (payment.amountCents / 100).toFixed(2),
            note: "Mollie betaling automatisch toegewezen",
          });

          // Advance assignment: invoiced â†’ paid â†’ closed
          await tx
            .update(assignmentsTable)
            .set({ status: "paid", updatedAt: new Date() })
            .where(eq(assignmentsTable.id, invoice.assignmentId));

          await tx
            .update(assignmentsTable)
            .set({ status: "closed", updatedAt: new Date() })
            .where(eq(assignmentsTable.id, invoice.assignmentId));

          await tx.insert(auditLogTable).values({
            userId: SYSTEM_ACTOR_UUID,
            action: "mollie_payment_received",
            resource: "invoices",
            resourceId: invoice.id,
            metadata: {
              paymentReference: molliePaymentReference,
              paidAt: paidAt.toISOString(),
            },
          });

          req.log.info(
            { invoiceId: invoice.id, molliePaymentReference },
            "Invoice marked as paid via Mollie webhook",
          );
        }
      }
    });
  } catch (err) {
    req.log.error(
      { err, molliePaymentReference },
      "Unexpected error in Mollie webhook handler",
    );
    res.status(500).send("payment processing failed");
    return;
  }

  // Acknowledge only after durable processing; provider retries on non-2xx.
  res.status(200).send("ok");
});

export default router;
