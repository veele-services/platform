import { Router } from "express";
import { db } from "@workspace/db";
import {
  paymentsTable,
  invoicesTable,
  assignmentsTable,
  auditLogTable,
  customerPaymentBatchesTable,
  customerPaymentBatchItemsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
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
 *   2. Fallback: query-string secret (`?secret=…`) for existing deployments without the header.
 *   3. If MOLLIE_WEBHOOK_SECRET is not configured at all: accept with a warning (dev fallback).
 *
 * Spec: https://docs.mollie.com/docs/webhooks
 */
router.post("/webhooks/mollie", async (req: Request, res: Response) => {
  // ── Signature / secret guard ─────────────────────────────────────────────────
  const webhookSecret = process.env.MOLLIE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    // Dev fallback: no secret configured — accept but warn
    req.log.warn(
      "MOLLIE_WEBHOOK_SECRET is not configured — accepting Mollie webhook without validation. " +
      "Set this env var in production to enable request verification.",
    );
  } else {
    // Secret is configured — x-mollie-signature is required; no fallback
    const hmacSignature = req.headers["x-mollie-signature"] as string | undefined;
    if (!hmacSignature) {
      req.log.warn(
        { ip: req.ip },
        "Mollie webhook rejected — x-mollie-signature header missing",
      );
      res.status(400).send("Missing signature");
      return;
    }

    const rawBody = req.rawBody ? req.rawBody.toString("utf8") : "";
    if (!verifyMollieSignature(rawBody, hmacSignature, webhookSecret)) {
      req.log.warn(
        { ip: req.ip },
        "Mollie webhook rejected — invalid x-mollie-signature",
      );
      res.status(400).send("Invalid signature");
      return;
    }
  }

  // ── API key check ─────────────────────────────────────────────────────────────
  const mollieKey = process.env.MOLLIE_API_KEY;
  if (!mollieKey) {
    req.log.error("MOLLIE_API_KEY not configured — cannot process webhook");
    res.status(200).send("ok"); // 200 so Mollie does not retry on our config error
    return;
  }

  const molliePaymentId = (req.body as Record<string, string>)["id"];
  if (!molliePaymentId || !molliePaymentId.startsWith("tr_")) {
    req.log.warn({ body: req.body }, "Mollie webhook received invalid or missing payment ID");
    res.status(200).send("ok");
    return;
  }

  req.log.info({ molliePaymentId }, "Mollie webhook received");

  // Re-fetch payment from Mollie to get the authoritative status
  let mollieStatus: string;
  try {
    const response = await fetch(`https://api.mollie.com/v2/payments/${molliePaymentId}`, {
      headers: { Authorization: `Bearer ${mollieKey}` },
    });

    if (!response.ok) {
      req.log.error({ molliePaymentId, status: response.status }, "Failed to fetch payment from Mollie");
      res.status(200).send("ok");
      return;
    }

    type MolliePayment = { id: string; status: string; paidAt?: string };
    const data = (await response.json()) as MolliePayment;
    mollieStatus = data.status;

    req.log.info({ molliePaymentId, mollieStatus }, "Fetched payment status from Mollie");

    // Find local single-invoice payment record first.
    const [payment] = await db
      .select({ id: paymentsTable.id, invoiceId: paymentsTable.invoiceId, status: paymentsTable.status })
      .from(paymentsTable)
      .where(eq(paymentsTable.molliePaymentId, molliePaymentId))
      .limit(1);

    const paidAt = data.paidAt ? new Date(data.paidAt) : new Date();

    // audit_log.user_id is UUID NOT NULL; use dedicated system actor UUID
    // for webhook/background events with no Supabase auth user.
    const SYSTEM_ACTOR_UUID = "00000000-0000-0000-0000-000000000001";

    if (!payment) {
      const [batch] = await db
        .select({
          id:         customerPaymentBatchesTable.id,
          customerId: customerPaymentBatchesTable.customerId,
          status:     customerPaymentBatchesTable.status,
        })
        .from(customerPaymentBatchesTable)
        .where(eq(customerPaymentBatchesTable.molliePaymentId, molliePaymentId))
        .limit(1);

      if (!batch) {
        req.log.warn({ molliePaymentId }, "No local payment or payment batch found for Mollie payment ID");
        res.status(200).send("ok");
        return;
      }

      const previousStatus = batch.status;

      await db
        .update(customerPaymentBatchesTable)
        .set({
          status: mollieStatus,
          paidAt: mollieStatus === "paid" ? paidAt : undefined,
        })
        .where(eq(customerPaymentBatchesTable.molliePaymentId, molliePaymentId));

      await db.insert(auditLogTable).values({
        userId:     SYSTEM_ACTOR_UUID,
        action:     "mollie_payment_batch_status_changed",
        resource:   "customer_payment_batches",
        resourceId: batch.id,
        metadata:   {
          molliePaymentId,
          customerId: batch.customerId,
          previousStatus,
          newStatus: mollieStatus,
        },
      });

      if (mollieStatus === "paid") {
        const items = await db
          .select({ invoiceId: customerPaymentBatchItemsTable.invoiceId })
          .from(customerPaymentBatchItemsTable)
          .where(eq(customerPaymentBatchItemsTable.batchId, batch.id));

        const paidDateStr = paidAt.toISOString().slice(0, 10);

        for (const item of items) {
          const [invoice] = await db
            .select({ id: invoicesTable.id, status: invoicesTable.status, assignmentId: invoicesTable.assignmentId })
            .from(invoicesTable)
            .where(eq(invoicesTable.id, item.invoiceId))
            .limit(1);

          if (!invoice || invoice.status !== "sent") continue;

          await db
            .update(invoicesTable)
            .set({ status: "paid", paidDate: paidDateStr, updatedAt: new Date() })
            .where(eq(invoicesTable.id, invoice.id));

          await db
            .update(assignmentsTable)
            .set({ status: "paid", updatedAt: new Date() })
            .where(eq(assignmentsTable.id, invoice.assignmentId));

          await db
            .update(assignmentsTable)
            .set({ status: "closed", updatedAt: new Date() })
            .where(eq(assignmentsTable.id, invoice.assignmentId));
        }

        await db.insert(auditLogTable).values({
          userId:     SYSTEM_ACTOR_UUID,
          action:     "mollie_payment_batch_received",
          resource:   "customer_payment_batches",
          resourceId: batch.id,
          metadata:   { molliePaymentId, paidAt: paidAt.toISOString(), invoiceCount: items.length },
        });
      }

      res.status(200).send("ok");
      return;
    }

    const previousStatus = payment.status;

    // Update local payment status
    await db
      .update(paymentsTable)
      .set({
        status: mollieStatus,
        paidAt: mollieStatus === "paid" ? paidAt : undefined,
      })
      .where(eq(paymentsTable.molliePaymentId, molliePaymentId));

    // Log every status transition (open, paid, canceled, expired, failed, …)
    await db.insert(auditLogTable).values({
      userId:     SYSTEM_ACTOR_UUID,
      action:     "mollie_payment_status_changed",
      resource:   "payments",
      resourceId: payment.id,
      metadata:   {
        molliePaymentId,
        invoiceId: payment.invoiceId,
        previousStatus,
        newStatus: mollieStatus,
      },
    });

    // If paid: advance invoice and assignment
    if (mollieStatus === "paid") {
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

        await db.insert(auditLogTable).values({
          userId:     SYSTEM_ACTOR_UUID,
          action:     "mollie_payment_received",
          resource:   "invoices",
          resourceId: invoice.id,
          metadata:   { molliePaymentId, paidAt: paidAt.toISOString() },
        });

        req.log.info({ invoiceId: invoice.id, molliePaymentId }, "Invoice marked as paid via Mollie webhook");
      }
    }
  } catch (err) {
    req.log.error({ err, molliePaymentId }, "Unexpected error in Mollie webhook handler");
  }

  // Always return 200 — Mollie will retry on non-200
  res.status(200).send("ok");
});

export default router;
