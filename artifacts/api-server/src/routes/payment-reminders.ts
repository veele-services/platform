import { Router } from "express";
import {
  addCalendarDays,
  amsterdamDateKey,
  db,
  invoicesTable,
  customersTable,
  notificationDeliveryQueueTable,
  organizationSettingsTable,
} from "@workspace/db";
import { eq, and, inArray, lte, or, isNull, lt, sql } from "drizzle-orm";
import type { Request, Response } from "express";
import { buildPaymentReminderEmail } from "../lib/email";
import { requireJobTenantModule } from "../lib/module-guards";

const router = Router();

function displayInvoiceNumber(
  value: string | null | undefined,
  fallback = "Factuur",
): string {
  return value?.trim() || fallback;
}

/**
 * POST /api/admin/payment-reminders
 *
 * Queues payment reminder emails for all invoices with status='sent' whose
 * dueDate is at least N days in the past, where N is configured via
 * notif_herinnering_dagen in organization_settings (default: 7).
 *
 * Deduplication: each invoice cycle gets one durable notification queue item.
 * The worker records last_reminder_sent_at only after confirmed delivery, so a
 * process exit cannot turn a delivery claim into a false sent timestamp.
 *
 * The notification can be disabled per tenant by setting
 * notif_betaling_herinnering = false in organization_settings.
 *
 * Security: protected by a pre-shared ADMIN_API_SECRET token in the
 * Authorization header: "Bearer <ADMIN_API_SECRET>".
 * Set ADMIN_API_SECRET in env; if not set, the route is disabled.
 */
router.post("/admin/payment-reminders", async (req: Request, res: Response) => {
  const expectedSecret = process.env["ADMIN_API_SECRET"];
  if (!expectedSecret) {
    req.log.error(
      "ADMIN_API_SECRET not configured — payment-reminders route disabled",
    );
    res.status(503).json({ error: "Route niet beschikbaar" });
    return;
  }

  const authHeader = req.headers["authorization"] ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided !== expectedSecret) {
    req.log.warn({ ip: req.ip }, "payment-reminders: ongeldige token");
    res.status(401).json({ error: "Ongeautoriseerd" });
    return;
  }

  try {
    req.log.info("payment-reminders: verwerken gestart");

    const overdueInvoices = await db
      .select({
        id: invoicesTable.id,
        tenantId: invoicesTable.tenantId,
      })
      .from(invoicesTable)
      .leftJoin(
        customersTable,
        and(
          eq(invoicesTable.customerId, customersTable.id),
          eq(customersTable.tenantId, invoicesTable.tenantId),
        ),
      )
      .leftJoin(
        organizationSettingsTable,
        eq(organizationSettingsTable.tenantId, invoicesTable.tenantId),
      )
      .where(
        and(
          eq(invoicesTable.status, "sent"),
          sql`coalesce(${organizationSettingsTable.notifBetalingHerinnering}, true)`,
          lte(
            invoicesTable.dueDate,
            sql<string>`(
              (current_timestamp at time zone 'Europe/Amsterdam')::date
              - coalesce(${organizationSettingsTable.notifHerinneringDagen}, 7)
            )`,
          ),
          // Deduplication: only select invoices that have never had a reminder OR
          // whose last reminder was sent more than that tenant's configured days ago.
          or(
            isNull(invoicesTable.lastReminderSentAt),
            lt(
              invoicesTable.lastReminderSentAt,
              sql<Date>`current_timestamp - (
                coalesce(${organizationSettingsTable.notifHerinneringDagen}, 7)
                * interval '1 day'
              )`,
            ),
          ),
        ),
      );

    req.log.info(
      { count: overdueInvoices.length },
      "payment-reminders: openstaande facturen gevonden",
    );

    let queued = 0;
    let skipped = 0;
    let moduleDisabled = 0;

    for (const invoice of overdueInvoices) {
      const invoiceTenantId = invoice.tenantId;
      if (!invoiceTenantId) {
        moduleDisabled++;
        skipped++;
        continue;
      }
      const moduleGuard = await requireJobTenantModule(
        invoiceTenantId,
        "finance",
      );
      if (!moduleGuard.allowed) {
        moduleDisabled++;
        skipped++;
        continue;
      }

      const queueItem = await db.transaction(async (tx) => {
        const [currentInvoice] = await tx
          .select({
            invoiceNumber: invoicesTable.invoiceNumber,
            totalAmount: invoicesTable.totalAmount,
            dueDate: invoicesTable.dueDate,
            lastReminderSentAt: invoicesTable.lastReminderSentAt,
            customerId: customersTable.id,
            customerName: customersTable.name,
            customerEmail: customersTable.contactEmail,
          })
          .from(invoicesTable)
          .innerJoin(
            customersTable,
            and(
              eq(invoicesTable.customerId, customersTable.id),
              eq(customersTable.tenantId, invoiceTenantId),
            ),
          )
          .where(
            and(
              eq(invoicesTable.id, invoice.id),
              eq(invoicesTable.tenantId, invoiceTenantId),
              eq(invoicesTable.status, "sent"),
            ),
          )
          .for("update")
          .limit(1);
        if (!currentInvoice?.customerEmail) return null;

        const [settings] = await tx
          .select({
            notifEnabled: organizationSettingsTable.notifBetalingHerinnering,
            herinneringDagen: organizationSettingsTable.notifHerinneringDagen,
          })
          .from(organizationSettingsTable)
          .where(eq(organizationSettingsTable.tenantId, invoiceTenantId))
          .for("share")
          .limit(1);
        if (!(settings?.notifEnabled ?? true)) return null;

        const herinneringDagen = settings?.herinneringDagen ?? 7;
        const claimedAt = new Date();
        const dueCutoff = addCalendarDays(
          amsterdamDateKey(claimedAt),
          -herinneringDagen,
        );
        const reminderCutoff = new Date(
          claimedAt.getTime() - herinneringDagen * 24 * 60 * 60 * 1_000,
        );
        if (currentInvoice.dueDate > dueCutoff) return null;
        if (
          currentInvoice.lastReminderSentAt &&
          currentInvoice.lastReminderSentAt >= reminderCutoff
        ) {
          return null;
        }

        const invoiceNumber = displayInvoiceNumber(
          currentInvoice.invoiceNumber,
          invoice.id.slice(0, 8),
        );
        const { subject, html, templateVariables } = buildPaymentReminderEmail({
          customerName: currentInvoice.customerName ?? "",
          invoiceNumber,
          totalAmount: currentInvoice.totalAmount ?? "0",
          dueDate: currentInvoice.dueDate,
          invoiceId: invoice.id,
        });
        const cycleKey = `payment-reminder:${invoiceTenantId}:${invoice.id}:${currentInvoice.lastReminderSentAt?.getTime() ?? "initial"}`;
        const [enqueued] = await tx
          .insert(notificationDeliveryQueueTable)
          .values({
            tenantId: invoiceTenantId,
            eventKey: "payment_reminder",
            channel: "email",
            recipientType: "customer",
            customerId: currentInvoice.customerId,
            recipientEmail: currentInvoice.customerEmail,
            subject: subject.slice(0, 240),
            title: subject.slice(0, 180),
            html,
            payload: {
              fieldgridPurpose: "invoice_payment_reminder",
              templateKey: "invoice_payment_reminder",
              templateVariables,
              invoiceId: invoice.id,
              invoiceNumber,
              dueDate: currentInvoice.dueDate,
              herinneringDagen,
            },
            status: "pending",
            idempotencyKey: cycleKey,
            deliveryKey: cycleKey,
          })
          .onConflictDoUpdate({
            target: notificationDeliveryQueueTable.idempotencyKey,
            targetWhere: sql`${notificationDeliveryQueueTable.idempotencyKey} is not null`,
            set: {
              recipientType: "customer",
              customerId: currentInvoice.customerId,
              recipientEmail: currentInvoice.customerEmail,
              subject: subject.slice(0, 240),
              title: subject.slice(0, 180),
              html,
              payload: {
                fieldgridPurpose: "invoice_payment_reminder",
                templateKey: "invoice_payment_reminder",
                templateVariables,
                invoiceId: invoice.id,
                invoiceNumber,
                dueDate: currentInvoice.dueDate,
                herinneringDagen,
              },
              status: "retry",
              nextAttemptAt: claimedAt,
              lockedAt: null,
              lockedBy: null,
              processingStartedAt: null,
              deliveryStartedAt: null,
              terminalAttemptId: null,
              lastError: null,
              errorDetails: {},
              response: {},
              maxAttempts: sql<number>`greatest(
                ${notificationDeliveryQueueTable.maxAttempts},
                ${notificationDeliveryQueueTable.attempts} + 5
              )`,
              updatedAt: claimedAt,
            },
            setWhere: inArray(notificationDeliveryQueueTable.status, [
              "failed",
              "skipped",
            ]),
          })
          .returning({ id: notificationDeliveryQueueTable.id });

        return enqueued ?? null;
      });
      if (!queueItem) {
        skipped++;
        continue;
      }

      queued++;
    }

    req.log.info({ queued, skipped, moduleDisabled }, "payment-reminders: klaar");
    res.json({ ok: true, queued, skipped, moduleDisabled });
  } catch (err) {
    req.log.error({ err }, "payment-reminders: onverwachte fout");
    res.status(500).json({ error: "Interne fout" });
  }
});

export default router;
