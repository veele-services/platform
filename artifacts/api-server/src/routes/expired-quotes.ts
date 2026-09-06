import { Router } from "express";
import {
  amsterdamDateKey,
  db,
  quotesTable,
  customersTable,
  auditLogTable,
  organizationSettingsTable,
} from "@workspace/db";
import { eq, and, lt } from "drizzle-orm";
import type { Request, Response } from "express";
import { sendEmailWithResult, buildQuoteExpiredEmail } from "../lib/email";
import { requireJobTenantModule } from "../lib/module-guards";

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
    req.log.error(
      "ADMIN_API_SECRET not configured — expired-quotes route disabled",
    );
    res.status(503).json({ error: "Route niet beschikbaar" });
    return;
  }

  const authHeader = req.headers["authorization"] ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided !== expectedSecret) {
    req.log.warn({ ip: req.ip }, "expired-quotes: ongeldige token");
    res.status(401).json({ error: "Ongeautoriseerd" });
    return;
  }

  try {
    const today = amsterdamDateKey();

    req.log.info({ today }, "expired-quotes: verwerken gestart");

    const expirableQuotes = await db
      .select({
        id: quotesTable.id,
        tenantId: quotesTable.tenantId,
        quoteNumber: quotesTable.quoteNumber,
        amount: quotesTable.amount,
        customerName: customersTable.name,
        customerEmail: customersTable.contactEmail,
        notifEnabled: organizationSettingsTable.notifOfferteVerlopen,
      })
      .from(quotesTable)
      .leftJoin(
        customersTable,
        and(
          eq(quotesTable.customerId, customersTable.id),
          eq(customersTable.tenantId, quotesTable.tenantId),
        ),
      )
      .leftJoin(
        organizationSettingsTable,
        eq(organizationSettingsTable.tenantId, quotesTable.tenantId),
      )
      .where(
        and(
          eq(quotesTable.status, "sent"),
          lt(quotesTable.validityDate, today),
        ),
      );

    req.log.info(
      { count: expirableQuotes.length },
      "expired-quotes: verlopen offertes gevonden",
    );

    let expired = 0;
    let notified = 0;
    let skipped = 0;
    let moduleDisabled = 0;

    for (const q of expirableQuotes) {
      const quoteTenantId = q.tenantId;
      if (!quoteTenantId) {
        moduleDisabled++;
        skipped++;
        continue;
      }
      const moduleGuard = await requireJobTenantModule(
        quoteTenantId,
        "finance",
      );
      if (!moduleGuard.allowed) {
        moduleDisabled++;
        skipped++;
        continue;
      }

      const transitioned = await db.transaction(async (tx) => {
        const [claimed] = await tx
          .update(quotesTable)
          .set({ status: "expired" })
          .where(
            and(
              eq(quotesTable.id, q.id),
              eq(quotesTable.tenantId, quoteTenantId),
              eq(quotesTable.status, "sent"),
              lt(quotesTable.validityDate, today),
            ),
          )
          .returning({
            id: quotesTable.id,
            tenantId: quotesTable.tenantId,
          });
        if (!claimed || claimed.tenantId !== quoteTenantId) return false;

        await tx.insert(auditLogTable).values({
          tenantId: quoteTenantId,
          userId: SYSTEM_ACTOR_UUID,
          action: "expire_quote",
          resource: "quotes",
          resourceId: q.id,
          metadata: { quoteNumber: q.quoteNumber },
        });
        return true;
      });

      if (!transitioned) {
        skipped++;
        continue;
      }

      expired++;

      // Send customer notification if enabled
      if (q.notifEnabled ?? true) {
        if (!q.customerEmail) {
          skipped++;
          continue;
        }

        const { subject, html } = buildQuoteExpiredEmail({
          customerName: q.customerName ?? "",
          quoteNumber: q.quoteNumber,
          amount: q.amount ?? "0",
        });

        const emailResult = await sendEmailWithResult({
          to: q.customerEmail,
          subject,
          html,
          tenantId: quoteTenantId,
          purpose: "quote_expired",
          idempotencyKey: `quote-expired:${quoteTenantId}:${q.id}`,
        });
        if (emailResult.success) {
          notified++;
        } else {
          skipped++;
          req.log.warn(
            {
              quoteId: q.id,
              tenantId: quoteTenantId,
              deliveryEffect: emailResult.deliveryEffect,
            },
            "expired-quotes: notificatie niet bevestigd",
          );
        }
      }
    }

    req.log.info(
      { expired, notified, skipped, moduleDisabled },
      "expired-quotes: klaar",
    );
    res.json({ ok: true, expired, notified, skipped, moduleDisabled });
  } catch (err) {
    req.log.error({ err }, "expired-quotes: onverwachte fout");
    res.status(500).json({ error: "Interne fout" });
  }
});

export default router;
