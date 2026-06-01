import { Router } from "express";
import { db } from "@workspace/db";
import { invoicesTable, customersTable, auditLogTable } from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";
import type { Request, Response } from "express";
import { sendEmail, buildPaymentReminderEmail } from "../lib/email";

const router = Router();

const SYSTEM_ACTOR_UUID = "00000000-0000-0000-0000-000000000001";

/**
 * POST /api/admin/payment-reminders
 *
 * Sends payment reminder emails for all invoices with status='sent' that are
 * at least 7 days old (based on invoice createdAt). Idempotent — re-running
 * sends again, so callers should rate-limit (e.g. once per day).
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

  // Invoices eligible for reminder: status='sent' AND created >= 7 days ago
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  req.log.info({ sevenDaysAgo: sevenDaysAgo.toISOString() }, "payment-reminders: verwerken gestart");

  try {
    const overdueInvoices = await db
      .select({
        id:            invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        totalAmount:   invoicesTable.totalAmount,
        dueDate:       invoicesTable.dueDate,
        customerName:  customersTable.name,
        customerEmail: customersTable.contactEmail,
      })
      .from(invoicesTable)
      .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
      .where(
        and(
          eq(invoicesTable.status, "sent"),
          lte(invoicesTable.createdAt, sevenDaysAgo),
        ),
      );

    req.log.info({ count: overdueInvoices.length }, "payment-reminders: openstaande facturen gevonden");

    let sent    = 0;
    let skipped = 0;

    for (const invoice of overdueInvoices) {
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

      await sendEmail({ to: invoice.customerEmail, subject, html });

      await db.insert(auditLogTable).values({
        userId:     SYSTEM_ACTOR_UUID,
        action:     "payment_reminder_sent",
        resource:   "invoices",
        resourceId: invoice.id,
        metadata:   {
          invoiceNumber: invoice.invoiceNumber,
          customerEmail: invoice.customerEmail,
          dueDate:       invoice.dueDate,
        },
      });

      sent++;
    }

    req.log.info({ sent, skipped }, "payment-reminders: klaar");
    res.json({ ok: true, sent, skipped });
  } catch (err) {
    req.log.error({ err }, "payment-reminders: onverwachte fout");
    res.status(500).json({ error: "Interne fout" });
  }
});

export default router;
