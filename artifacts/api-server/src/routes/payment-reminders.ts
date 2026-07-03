import { Router } from "express";
import { db, isTenantModuleEnabled } from "@workspace/db";
import { invoicesTable, customersTable, auditLogTable, organizationSettingsTable } from "@workspace/db";
import { eq, and, lte, or, isNull, lt } from "drizzle-orm";
import type { Request, Response } from "express";
import { sendEmailWithResult, buildPaymentReminderEmail } from "../lib/email";

const router = Router();

const SYSTEM_ACTOR_UUID = "00000000-0000-0000-0000-000000000001";

/**
 * POST /api/admin/payment-reminders
 *
 * Sends payment reminder emails for all invoices with status='sent' whose
 * dueDate is at least N days in the past, where N is configured via
 * notif_herinnering_dagen in organization_settings (default: 7).
 *
 * Deduplication: invoices where last_reminder_sent_at is within the last
 * herinneringDagen days are skipped — preventing duplicate reminders per cycle.
 *
 * The notification can be disabled globally by setting
 * notif_betaling_herinnering = false in organization_settings.
 *
 * Security: protected by a pre-shared ADMIN_API_SECRET token in the
 * Authorization header: "Bearer <ADMIN_API_SECRET>".
 * Set ADMIN_API_SECRET in env; if not set, the route is disabled.
 */
router.post("/admin/payment-reminders", async (req: Request, res: Response) => {
  const expectedSecret = process.env["ADMIN_API_SECRET"];
  if (!expectedSecret) {
    req.log.error("ADMIN_API_SECRET not configured — payment-reminders route disabled");
    res.status(503).json({ error: "Route niet beschikbaar" });
    return;
  }

  const authHeader = req.headers["authorization"] ?? "";
  const provided   = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided !== expectedSecret) {
    req.log.warn({ ip: req.ip }, "payment-reminders: ongeldige token");
    res.status(401).json({ error: "Ongeautoriseerd" });
    return;
  }

  try {
    // Load org settings for notification toggle and configurable days
    const [orgSettings] = await db
      .select({
        notifEnabled:      organizationSettingsTable.notifBetalingHerinnering,
        herinneringDagen:  organizationSettingsTable.notifHerinneringDagen,
      })
      .from(organizationSettingsTable)
      .limit(1);

    const notifEnabled     = orgSettings?.notifEnabled     ?? true;
    const herinneringDagen = orgSettings?.herinneringDagen ?? 7;

    if (!notifEnabled) {
      req.log.info("payment-reminders: betalingsherinnering uitgeschakeld in instellingen — overgeslagen");
      res.json({ ok: true, sent: 0, skipped: 0, disabled: true });
      return;
    }

    // dueDate cutoff: invoices overdue by at least N days
    const dueCutoff = new Date();
    dueCutoff.setDate(dueCutoff.getDate() - herinneringDagen);
    const dueCutoffDateStr = dueCutoff.toISOString().slice(0, 10);

    // Reminder dedup cutoff: skip if a reminder was already sent within the last N days
    const reminderCutoff = new Date();
    reminderCutoff.setDate(reminderCutoff.getDate() - herinneringDagen);

    req.log.info(
      { herinneringDagen, dueCutoff: dueCutoffDateStr, reminderCutoff: reminderCutoff.toISOString() },
      "payment-reminders: verwerken gestart",
    );

    const overdueInvoices = await db
      .select({
        id:                  invoicesTable.id,
        invoiceNumber:       invoicesTable.invoiceNumber,
        totalAmount:         invoicesTable.totalAmount,
        dueDate:             invoicesTable.dueDate,
        lastReminderSentAt:  invoicesTable.lastReminderSentAt,
        customerTenantId:    customersTable.tenantId,
        customerName:        customersTable.name,
        customerEmail:       customersTable.contactEmail,
      })
      .from(invoicesTable)
      .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
      .where(
        and(
          eq(invoicesTable.status, "sent"),
          lte(invoicesTable.dueDate, dueCutoffDateStr),
          // Deduplication: only select invoices that have never had a reminder OR
          // whose last reminder was sent more than herinneringDagen days ago.
          or(
            isNull(invoicesTable.lastReminderSentAt),
            lt(invoicesTable.lastReminderSentAt, reminderCutoff),
          ),
        ),
      );

    req.log.info({ count: overdueInvoices.length }, "payment-reminders: openstaande facturen gevonden");

    let sent    = 0;
    let skipped = 0;
    let moduleDisabled = 0;

    for (const invoice of overdueInvoices) {
      if (!invoice.customerTenantId || !(await isTenantModuleEnabled(invoice.customerTenantId, "finance"))) {
        moduleDisabled++;
        skipped++;
        continue;
      }

      if (!invoice.customerEmail) {
        skipped++;
        continue;
      }

      const { subject, html } = buildPaymentReminderEmail({
        customerName:  invoice.customerName ?? "",
        invoiceNumber: invoice.invoiceNumber,
        totalAmount:   invoice.totalAmount ?? "0",
        dueDate:       invoice.dueDate,
        invoiceId:     invoice.id,
      });

      const emailResult = await sendEmailWithResult({ to: invoice.customerEmail, subject, html });

      if (!emailResult.success) {
        req.log.warn(
          { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, error: emailResult.error },
          "payment-reminders: e-mail verzenden mislukt — factuur overgeslagen",
        );
        skipped++;
        continue;
      }

      // Only record timestamp + audit log when delivery actually succeeded,
      // so failed invoices are retried in the next cron run.
      await db
        .update(invoicesTable)
        .set({ lastReminderSentAt: new Date() })
        .where(eq(invoicesTable.id, invoice.id));

      await db.insert(auditLogTable).values({
        userId:     SYSTEM_ACTOR_UUID,
        action:     "payment_reminder_sent",
        resource:   "invoices",
        resourceId: invoice.id,
        metadata:   {
          invoiceNumber:   invoice.invoiceNumber,
          customerEmail:   invoice.customerEmail,
          dueDate:         invoice.dueDate,
          herinneringDagen,
        },
      });

      sent++;
    }

    req.log.info({ sent, skipped, moduleDisabled }, "payment-reminders: klaar");
    res.json({ ok: true, sent, skipped, moduleDisabled });
  } catch (err) {
    req.log.error({ err }, "payment-reminders: onverwachte fout");
    res.status(500).json({ error: "Interne fout" });
  }
});

export default router;
