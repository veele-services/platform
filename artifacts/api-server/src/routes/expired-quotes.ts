import { Router } from "express";
import { db } from "@workspace/db";
import { quotesTable, customersTable, auditLogTable, organizationSettingsTable } from "@workspace/db";
import { eq, and, lt } from "drizzle-orm";
import type { Request, Response } from "express";
import { sendEmail, buildQuoteExpiredEmail } from "../lib/email";

const router = Router();

const SYSTEM_ACTOR_UUID = "00000000-0000-0000-0000-000000000001";

/**
 * POST /api/admin/expired-quotes
 *
 * Finds all 'sent' quotes past their validity_date, marks them 'expired',
 * and sends an expiry notification to the customer (if notif_offerte_verlopen
 * is enabled in organization_settings).
 *
 * Idempotent — already-expired quotes are not touched again.
 * Designed to be triggered by a daily cron job.
 *
 * Security: protected by a pre-shared ADMIN_API_SECRET token in the
 * Authorization header: "Bearer <ADMIN_API_SECRET>".
 * Set ADMIN_API_SECRET in env; if not set, the route is disabled.
 */
router.post("/admin/expired-quotes", async (req: Request, res: Response) => {
  const expectedSecret = process.env["ADMIN_API_SECRET"];
  if (!expectedSecret) {
    req.log.error("ADMIN_API_SECRET not configured — expired-quotes route disabled");
    res.status(503).json({ error: "Route niet beschikbaar" });
    return;
  }

  const authHeader = req.headers["authorization"] ?? "";
  const provided   = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided !== expectedSecret) {
    req.log.warn({ ip: req.ip }, "expired-quotes: ongeldige token");
    res.status(401).json({ error: "Ongeautoriseerd" });
    return;
  }

  try {
    // Load org settings for notification toggle
    const [orgSettings] = await db
      .select({ notifEnabled: organizationSettingsTable.notifOfferteVerlopen })
      .from(organizationSettingsTable)
      .limit(1);

    const notifEnabled = orgSettings?.notifEnabled ?? true;

    // today in YYYY-MM-DD format
    const today = new Date().toISOString().slice(0, 10);

    req.log.info({ today, notifEnabled }, "expired-quotes: verwerken gestart");

    const expirableQuotes = await db
      .select({
        id:            quotesTable.id,
        quoteNumber:   quotesTable.quoteNumber,
        amount:        quotesTable.amount,
        customerName:  customersTable.name,
        customerEmail: customersTable.contactEmail,
      })
      .from(quotesTable)
      .leftJoin(customersTable, eq(quotesTable.customerId, customersTable.id))
      .where(
        and(
          eq(quotesTable.status, "sent"),
          lt(quotesTable.validityDate, today),
        ),
      );

    req.log.info({ count: expirableQuotes.length }, "expired-quotes: verlopen offertes gevonden");

    let expired  = 0;
    let notified = 0;
    let skipped  = 0;

    for (const q of expirableQuotes) {
      // Mark as expired
      await db
        .update(quotesTable)
        .set({ status: "expired" })
        .where(eq(quotesTable.id, q.id));

      await db.insert(auditLogTable).values({
        userId:     SYSTEM_ACTOR_UUID,
        action:     "expire_quote",
        resource:   "quotes",
        resourceId: q.id,
        metadata:   { quoteNumber: q.quoteNumber, customerEmail: q.customerEmail },
      });

      expired++;

      // Send customer notification if enabled
      if (notifEnabled) {
        if (!q.customerEmail) {
          skipped++;
          continue;
        }

        const { subject, html } = buildQuoteExpiredEmail({
          customerName: q.customerName ?? "",
          quoteNumber:  q.quoteNumber,
          amount:       q.amount ?? "0",
        });

        await sendEmail({ to: q.customerEmail, subject, html });
        notified++;
      }
    }

    req.log.info({ expired, notified, skipped }, "expired-quotes: klaar");
    res.json({ ok: true, expired, notified, skipped });
  } catch (err) {
    req.log.error({ err }, "expired-quotes: onverwachte fout");
    res.status(500).json({ error: "Interne fout" });
  }
});

export default router;
