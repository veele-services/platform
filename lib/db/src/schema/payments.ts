import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { invoicesTable } from "./invoices";

// ─── Status ────────────────────────────────────────────────────────────────────

export const PAYMENT_STATUSES = ["open", "paid", "canceled", "expired", "failed"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// ─── Table ─────────────────────────────────────────────────────────────────────

/**
 * Mollie payment transactions linked to invoices.
 * Each row represents one Mollie payment attempt.
 * Status is updated via the /api/webhooks/mollie endpoint.
 */
export const paymentsTable = pgTable("payments", {
  id:              uuid("id").primaryKey().defaultRandom(),

  invoiceId:       uuid("invoice_id")
    .notNull()
    .references(() => invoicesTable.id, { onDelete: "cascade" }),

  /** Mollie payment ID, e.g. tr_xxxxxxxxxx */
  molliePaymentId: varchar("mollie_payment_id", { length: 50 }).notNull().unique(),

  /** Amount in euro cents (e.g. 1250 = €12.50) */
  amountCents:     integer("amount_cents").notNull(),

  currency:        varchar("currency", { length: 3 }).notNull().default("EUR"),

  /** Mollie payment status: open / paid / canceled / expired / failed */
  status:          varchar("status", { length: 20 }).notNull().default("open"),

  /** Mollie checkout URL — redirect customer to this URL to pay */
  checkoutUrl:     text("checkout_url"),

  /** Set when Mollie reports status = paid */
  paidAt:          timestamp("paid_at", { withTimezone: true }),

  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Zod schemas ───────────────────────────────────────────────────────────────

export const selectPaymentSchema = createSelectSchema(paymentsTable);
export type Payment = z.infer<typeof selectPaymentSchema>;
