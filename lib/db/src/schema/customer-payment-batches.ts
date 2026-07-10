import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { customersTable } from "./customers";
import { invoiceNumberingSettingsTable } from "./invoices";
import { invoicesTable } from "./invoices";
import { objectsTable } from "./objects";
import { tenantsTable } from "./tenants";

export const CUSTOMER_PAYMENT_BATCH_STATUSES = [
  "draft",
  "active",
  "sent",
  "partially_paid",
  "paid",
  "cancelled",
  "expired",
  "open",
  "canceled",
  "failed",
] as const;
export type CustomerPaymentBatchStatus = (typeof CUSTOMER_PAYMENT_BATCH_STATUSES)[number];

export const customerPaymentBatchesTable = pgTable(
  "customer_payment_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "cascade" }),

    collectionNumber: varchar("collection_number", { length: 30 }),
    numberingSettingsId: uuid("numbering_settings_id").references(() => invoiceNumberingSettingsTable.id, {
      onDelete: "set null",
    }),
    numberPeriodKey: varchar("number_period_key", { length: 20 }),
    numberSequenceValue: integer("number_sequence_value"),

    molliePaymentId: varchar("mollie_payment_id", { length: 50 }).unique(),
    amountCents: integer("amount_cents").notNull(),
    paidAmountCents: integer("paid_amount_cents").notNull().default(0),
    outstandingAmountCents: integer("outstanding_amount_cents").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
    status: varchar("status", { length: 30 }).notNull().default("open").$type<CustomerPaymentBatchStatus>(),
    checkoutUrl: text("checkout_url"),
    paymentProvider: varchar("payment_provider", { length: 40 }).notNull().default("mollie"),
    paidAt: timestamp("paid_at", { withTimezone: true }),

    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    objectId: uuid("object_id").references(() => objectsTable.id, { onDelete: "set null" }),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    vatCents: integer("vat_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    surchargeCents: integer("surcharge_cents").notNull().default(0),
    notes: text("notes"),

    companySnapshotJson: jsonb("company_snapshot_json").$type<Record<string, unknown> | null>(),
    invoiceSettingsSnapshotJson: jsonb("invoice_settings_snapshot_json").$type<Record<string, unknown> | null>(),
    paymentSettingsSnapshotJson: jsonb("payment_settings_snapshot_json").$type<Record<string, unknown> | null>(),
    templateSnapshotJson: jsonb("template_snapshot_json").$type<Record<string, unknown> | null>(),

    createdBy: uuid("created_by"),
    createdByActorType: varchar("created_by_actor_type", { length: 40 }).notNull().default("tenant_user"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("customer_payment_batches_tenant_idx").on(table.tenantId),
    index("customer_payment_batches_tenant_customer_idx").on(table.tenantId, table.customerId),
    index("customer_payment_batches_tenant_status_idx").on(table.tenantId, table.status),
    index("customer_payment_batches_tenant_numbering_idx").on(table.tenantId, table.numberingSettingsId),
    uniqueIndex("customer_payment_batches_tenant_collection_number_idx")
      .on(table.tenantId, table.collectionNumber)
      .where(sql`${table.collectionNumber} IS NOT NULL AND ${table.collectionNumber} <> ''`),
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
    invoiceNumberSnapshot: varchar("invoice_number_snapshot", { length: 30 }),
    invoiceDateSnapshot: date("invoice_date_snapshot"),
    dueDateSnapshot: date("due_date_snapshot"),
    originalTotalAmountCents: integer("original_total_amount_cents").notNull().default(0),
    paidAmountAtCollectionCents: integer("paid_amount_at_collection_cents").notNull().default(0),
    outstandingAmountAtCollectionCents: integer("outstanding_amount_at_collection_cents").notNull().default(0),
    includedAmountCents: integer("included_amount_cents").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
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
