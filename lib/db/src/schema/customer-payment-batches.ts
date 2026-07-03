import {
  index,
  integer,
  date,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
  text,
} from "drizzle-orm/pg-core";
import { customersTable } from "./customers";
import { invoicesTable } from "./invoices";
import { objectsTable } from "./objects";
import { tenantsTable } from "./tenants";

export const CUSTOMER_PAYMENT_BATCH_STATUSES = ["open", "paid", "canceled", "expired", "failed"] as const;
export type CustomerPaymentBatchStatus = (typeof CUSTOMER_PAYMENT_BATCH_STATUSES)[number];

export const customerPaymentBatchesTable = pgTable(
  "customer_payment_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "cascade" }),
    molliePaymentId: varchar("mollie_payment_id", { length: 50 }).notNull().unique(),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    checkoutUrl: text("checkout_url"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    objectId: uuid("object_id").references(() => objectsTable.id, { onDelete: "set null" }),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    vatCents: integer("vat_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    surchargeCents: integer("surcharge_cents").notNull().default(0),
    notes: text("notes"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("customer_payment_batches_tenant_idx").on(table.tenantId),
    index("customer_payment_batches_tenant_customer_idx").on(table.tenantId, table.customerId),
    index("customer_payment_batches_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

export const customerPaymentBatchItemsTable = pgTable(
  "customer_payment_batch_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => customerPaymentBatchesTable.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoicesTable.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("customer_payment_batch_items_tenant_idx").on(table.tenantId),
    index("customer_payment_batch_items_tenant_batch_idx").on(table.tenantId, table.batchId),
    index("customer_payment_batch_items_tenant_invoice_idx").on(table.tenantId, table.invoiceId),
    unique("customer_payment_batch_items_unique").on(table.batchId, table.invoiceId),
  ],
);

export type CustomerPaymentBatch = typeof customerPaymentBatchesTable.$inferSelect;
export type CustomerPaymentBatchItem = typeof customerPaymentBatchItemsTable.$inferSelect;
