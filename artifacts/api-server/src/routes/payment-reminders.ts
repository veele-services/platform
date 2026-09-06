import { Router } from "express";
import {
  addCalendarDays,
  amsterdamDateKey,
  db,
  invoicesTable,
  customersTable,
  auditLogTable,
  organizationSettingsTable,
} from "@workspace/db";
import { eq, and, lte, or, isNull, lt, sql } from "drizzle-orm";
import type { Request, Response } from "express";
import { sendEmailWithResult, buildPaymentReminderEmail } from "../lib/email";
import { requireJobTenantModule } from "../lib/module-guards";

const router = Router();

const SYSTEM_ACTOR_UUID = "00000000-0000-0000-0000-000000000001";

function displayInvoiceNumber(
  value: string | null | undefined,
  fallback = "Factuur",
): string {
  return value?.trim() || fallback;
}

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
        invoiceNumber: invoicesTable.invoiceNumber,
        totalAmount: invoicesTable.totalAmount,
        dueDate: invoicesTable.dueDate,
        customerName: customersTable.name,
        customerEmail: customersTable.contactEmail,
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

    let sent = 0;
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

      if (!invoice.customerEmail) {
        skipped++;
        continue;
      }

      const claim = await db.transaction(async (tx) => {
        const [currentInvoice] = await tx
          .select({ lastReminderSentAt: invoicesTable.lastReminderSentAt })
          .from(invoicesTable)
          .where(
            and(
              eq(invoicesTable.id, invoice.id),
              eq(invoicesTable.tenantId, invoiceTenantId),
            ),
          )
          .for("update")
          .limit(1);
        if (!currentInvoice) return null;

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
        const [claimed] = await tx
          .update(invoicesTable)
          .set({ lastReminderSentAt: claimedAt })
          .where(
            and(
              eq(invoicesTable.id, invoice.id),
              eq(invoicesTable.tenantId, invoiceTenantId),
              eq(invoicesTable.status, "sent"),
              lte(invoicesTable.dueDate, dueCutoff),
              or(
                isNull(invoicesTable.lastReminderSentAt),
                lt(invoicesTable.lastReminderSentAt, reminderCutoff),
              ),
            ),
          )
          .returning({
            id: invoicesTable.id,
            tenantId: invoicesTable.tenantId,
          });
        if (!claimed || claimed.tenantId !== invoiceTenantId) return null;

        return {
          claimedAt,
          herinneringDagen,
          previousReminderSentAt: currentInvoice.lastReminderSentAt,
        };
      });
      if (!claim) {
        skipped++;
        continue;
      }

      const invoiceNumber = displayInvoiceNumber(
        invoice.invoiceNumber,
        invoice.id.slice(0, 8),
      );
      const { subject, html } = buildPaymentReminderEmail({
        customerName: invoice.customerName ?? "",
        invoiceNumber,
        totalAmount: invoice.totalAmount ?? "0",
        dueDate: invoice.dueDate,
        invoiceId: invoice.id,
      });

      const emailResult = await sendEmailWithResult({
        to: invoice.customerEmail,
        subject,
        html,
        tenantId: invoiceTenantId,
        purpose: "invoice_payment_reminder",
        idempotencyKey: `payment-reminder:${invoiceTenantId}:${invoice.id}:${claim.previousReminderSentAt?.toISOString() ?? "initial"}`,
      });

      if (!emailResult.success) {
        req.log.warn(
          {
            invoiceId: invoice.id,
            tenantId: invoiceTenantId,
            deliveryEffect: emailResult.deliveryEffect,
          },
          "payment-reminders: e-mailbezorging niet bevestigd",
        );
        if (emailResult.deliveryEffect === "not_attempted") {
          const [released] = await db
            .update(invoicesTable)
            .set({ lastReminderSentAt: claim.previousReminderSentAt })
            .where(
              and(
                eq(invoicesTable.id, invoice.id),
                eq(invoicesTable.tenantId, invoiceTenantId),
                eq(invoicesTable.status, "sent"),
                eq(invoicesTable.lastReminderSentAt, claim.claimedAt),
              ),
            )
            .returning({ id: invoicesTable.id });
          if (!released) {
            req.log.error(
              { invoiceId: invoice.id, tenantId: invoiceTenantId },
              "payment-reminders: niet-verzonden claim kon niet worden vrijgegeven",
            );
          }
        }
        skipped++;
        continue;
      }

      await db.insert(auditLogTable).values({
        tenantId: invoiceTenantId,
        userId: SYSTEM_ACTOR_UUID,
        action: "payment_reminder_sent",
        resource: "invoices",
        resourceId: invoice.id,
        metadata: {
          invoiceNumber,
          dueDate: invoice.dueDate,
          herinneringDagen: claim.herinneringDagen,
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
