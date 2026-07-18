import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { invoicesTable } from "./invoices";
import { tenantsTable } from "./tenants";

export const PAYMENT_STATUSES = ["open", "paid", "canceled", "expired", "failed"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_SOURCE_TYPES = ["invoice", "invoice_collection"] as const;
export type PaymentSourceType = (typeof PAYMENT_SOURCE_TYPES)[number];

export const PAYMENT_METHODS = ["mollie", "manual_bank", "cash", "correction", "settlement", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const paymentsTable = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customersTable.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").references(() => invoicesTable.id, { onDelete: "cascade" }),
    sourceType: varchar("source_type", { length: 40 }).notNull().default("invoice").$type<PaymentSourceType>(),
    sourceId: uuid("source_id"),

    molliePaymentId: varchar("mollie_payment_id", { length: 50 }).unique(),
    providerRequestKey: uuid("provider_request_key").unique(),
    amountCents: integer("amount_cents").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }),
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
    paymentMethod: varchar("payment_method", { length: 40 }).notNull().default("mollie").$type<PaymentMethod>(),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    checkoutUrl: text("checkout_url"),
    reference: varchar("reference", { length: 120 }),
    note: text("note"),
    registeredByUserId: uuid("registered_by_user_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("payments_tenant_idx").on(table.tenantId),
    index("payments_tenant_invoice_idx").on(table.tenantId, table.invoiceId),
    index("payments_tenant_customer_idx").on(table.tenantId, table.customerId),
    index("payments_tenant_source_idx").on(table.tenantId, table.sourceType, table.sourceId),
    index("payments_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

export const paymentAllocationsTable = pgTable(
  "payment_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => paymentsTable.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoicesTable.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    allocatedAt: timestamp("allocated_at", { withTimezone: true }).notNull().defaultNow(),
    allocatedByUserId: uuid("allocated_by_user_id"),
    note: text("note"),
  },
  (table) => [
    index("payment_allocations_tenant_idx").on(table.tenantId),
    index("payment_allocations_tenant_payment_idx").on(table.tenantId, table.paymentId),
    index("payment_allocations_tenant_invoice_idx").on(table.tenantId, table.invoiceId),
    uniqueIndex("payment_allocations_payment_invoice_idx").on(table.paymentId, table.invoiceId),
  ],
);

export const selectPaymentSchema = createSelectSchema(paymentsTable);
export type Payment = z.infer<typeof selectPaymentSchema>;
export type PaymentAllocation = typeof paymentAllocationsTable.$inferSelect;
