import {
  integer,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
  text,
} from "drizzle-orm/pg-core";
import { customersTable } from "./customers";
import { invoicesTable } from "./invoices";

export const CUSTOMER_PAYMENT_BATCH_STATUSES = ["open", "paid", "canceled", "expired", "failed"] as const;
export type CustomerPaymentBatchStatus = (typeof CUSTOMER_PAYMENT_BATCH_STATUSES)[number];

export const customerPaymentBatchesTable = pgTable("customer_payment_batches", {
  id:              uuid("id").primaryKey().defaultRandom(),
  customerId:      uuid("customer_id")
    .notNull()
    .references(() => customersTable.id, { onDelete: "cascade" }),
  molliePaymentId: varchar("mollie_payment_id", { length: 50 }).notNull().unique(),
  amountCents:     integer("amount_cents").notNull(),
  currency:        varchar("currency", { length: 3 }).notNull().default("EUR"),
  status:          varchar("status", { length: 20 }).notNull().default("open"),
  checkoutUrl:     text("checkout_url"),
  paidAt:          timestamp("paid_at", { withTimezone: true }),
  createdBy:       uuid("created_by"),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customerPaymentBatchItemsTable = pgTable(
  "customer_payment_batch_items",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    batchId:     uuid("batch_id")
      .notNull()
      .references(() => customerPaymentBatchesTable.id, { onDelete: "cascade" }),
    invoiceId:   uuid("invoice_id")
      .notNull()
      .references(() => invoicesTable.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("customer_payment_batch_items_unique").on(t.batchId, t.invoiceId),
  ],
);

export type CustomerPaymentBatch = typeof customerPaymentBatchesTable.$inferSelect;
export type CustomerPaymentBatchItem = typeof customerPaymentBatchItemsTable.$inferSelect;
