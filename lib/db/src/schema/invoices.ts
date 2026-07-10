import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { assignmentsTable } from "./assignments";
import { tenantsTable } from "./tenants";

export const INVOICE_STATUSES = ["draft", "sent", "paid", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_NUMBER_RESET_PERIODS = ["never", "yearly", "monthly"] as const;
export type InvoiceNumberResetPeriod = (typeof INVOICE_NUMBER_RESET_PERIODS)[number];

export const INVOICE_PAYMENT_PROVIDERS = ["none", "mollie"] as const;
export type InvoicePaymentProvider = (typeof INVOICE_PAYMENT_PROVIDERS)[number];

export const INVOICE_PAYMENT_STATUSES = ["unpaid", "open", "paid", "cancelled", "expired", "failed"] as const;
export type InvoicePaymentStatus = (typeof INVOICE_PAYMENT_STATUSES)[number];

export const tenantCompanySettingsTable = pgTable(
  "tenant_company_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    legalName: varchar("legal_name", { length: 200 }).notNull().default(""),
    tradeName: varchar("trade_name", { length: 200 }),
    addressLine1: text("address_line_1"),
    addressLine2: text("address_line_2"),
    postalCode: varchar("postal_code", { length: 20 }),
    city: varchar("city", { length: 120 }),
    country: varchar("country", { length: 120 }).notNull().default("Nederland"),
    kvkNumber: varchar("kvk_number", { length: 20 }),
    vatNumber: varchar("vat_number", { length: 30 }),
    iban: varchar("iban", { length: 40 }),
    bic: varchar("bic", { length: 20 }),
    administrationEmail: varchar("administration_email", { length: 255 }),
    phone: varchar("phone", { length: 40 }),
    website: varchar("website", { length: 255 }),
    logoUrl: text("logo_url"),
    primaryColor: varchar("primary_color", { length: 20 }).notNull().default("#081D3A"),
    secondaryColor: varchar("secondary_color", { length: 20 }).notNull().default("#00B7B3"),
    defaultPaymentTermDays: integer("default_payment_term_days").notNull().default(30),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("tenant_company_settings_tenant_idx").on(table.tenantId),
    index("tenant_company_settings_updated_idx").on(table.updatedAt),
  ],
);

export const invoiceNumberingSettingsTable = pgTable(
  "invoice_numbering_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    prefix: varchar("prefix", { length: 3 }).notNull().default("FAK"),
    format: varchar("format", { length: 120 }).notNull().default("{PREFIX}-{YYYY}-{NUMBER}"),
    separator: varchar("separator", { length: 8 }).notNull().default("-"),
    numberPadding: integer("number_padding").notNull().default(4),
    resetPeriod: varchar("reset_period", { length: 20 }).notNull().default("yearly").$type<InvoiceNumberResetPeriod>(),
    defaultStartNumber: integer("default_start_number").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("invoice_numbering_settings_tenant_idx").on(table.tenantId),
    uniqueIndex("invoice_numbering_settings_one_active_per_tenant_idx")
      .on(table.tenantId)
      .where(sql`${table.isActive} = true`),
  ],
);

export const invoiceNumberSequencesTable = pgTable(
  "invoice_number_sequences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    numberingSettingsId: uuid("numbering_settings_id")
      .notNull()
      .references(() => invoiceNumberingSettingsTable.id, { onDelete: "cascade" }),
    periodKey: varchar("period_key", { length: 20 }).notNull(),
    nextNumber: integer("next_number").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("invoice_number_sequences_tenant_settings_period_idx").on(
      table.tenantId,
      table.numberingSettingsId,
      table.periodKey,
    ),
    index("invoice_number_sequences_tenant_idx").on(table.tenantId),
  ],
);

export const invoicePaymentSettingsTable = pgTable(
  "invoice_payment_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    paymentProvider: varchar("payment_provider", { length: 20 }).notNull().default("none").$type<InvoicePaymentProvider>(),
    mollieEnabled: boolean("mollie_enabled").notNull().default(false),
    showPaymentLinkOnInvoice: boolean("show_payment_link_on_invoice").notNull().default(false),
    showPaymentQrOnInvoice: boolean("show_payment_qr_on_invoice").notNull().default(false),
    paymentBlockTitle: varchar("payment_block_title", { length: 160 }).notNull().default("Betalen"),
    paymentBlockText: text("payment_block_text")
      .notNull()
      .default("Betaal deze factuur eenvoudig via onderstaande betaallink of scan de QR-code."),
    paymentLinkLabel: varchar("payment_link_label", { length: 80 }).notNull().default("Betaal online"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("invoice_payment_settings_tenant_idx").on(table.tenantId),
    index("invoice_payment_settings_provider_idx").on(table.paymentProvider),
  ],
);

export const invoiceTemplateSettingsTable = pgTable(
  "invoice_template_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    logoUrl: text("logo_url"),
    primaryColor: varchar("primary_color", { length: 20 }).notNull().default("#081D3A"),
    secondaryColor: varchar("secondary_color", { length: 20 }).notNull().default("#00B7B3"),
    introText: text("intro_text"),
    footerText: text("footer_text"),
    paymentInstruction: text("payment_instruction")
      .notNull()
      .default("Gelieve het bedrag binnen {{payment_term_days}} dagen te voldoen onder vermelding van factuurnummer {{invoice_number}}."),
    showLogo: boolean("show_logo").notNull().default(true),
    showCompanyFooter: boolean("show_company_footer").notNull().default(true),
    showKvkFooter: boolean("show_kvk_footer").notNull().default(true),
    showVatFooter: boolean("show_vat_footer").notNull().default(true),
    showIbanFooter: boolean("show_iban_footer").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("invoice_template_settings_tenant_idx").on(table.tenantId),
  ],
);

/**
 * Invoices generated from approved-report assignments.
 * Canon invoice numbers are nullable while draft and claimed once during finalization.
 * Numbering is tenant-scoped through invoice_numbering_settings and invoice_number_sequences.
 */
export const invoicesTable = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),

    invoiceNumber: varchar("invoice_number", { length: 30 }),
    invoiceNumberingSettingsId: uuid("invoice_numbering_settings_id")
      .references(() => invoiceNumberingSettingsTable.id, { onDelete: "set null" }),
    invoiceNumberPeriodKey: varchar("invoice_number_period_key", { length: 20 }),
    invoiceNumberSequenceValue: integer("invoice_number_sequence_value"),

    customerId: uuid("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "restrict" }),

    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignmentsTable.id, { onDelete: "restrict" }),

    amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
    vatPercentage: numeric("vat_percentage", { precision: 5, scale: 2 }).notNull().default("21"),
    vatAmount: numeric("vat_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),

    status: varchar("status", { length: 20 }).notNull().default("draft"),
    invoiceDate: date("invoice_date"),
    dueDate: date("due_date").notNull(),
    paidDate: date("paid_date"),

    notes: text("notes"),

    paymentStatus: varchar("payment_status", { length: 20 }).notNull().default("unpaid").$type<InvoicePaymentStatus>(),
    molliePaymentId: varchar("mollie_payment_id", { length: 80 }),
    paymentUrl: text("payment_url"),
    companySnapshotJson: jsonb("company_snapshot_json").$type<Record<string, unknown> | null>(),
    invoiceSettingsSnapshotJson: jsonb("invoice_settings_snapshot_json").$type<Record<string, unknown> | null>(),
    paymentSettingsSnapshotJson: jsonb("payment_settings_snapshot_json").$type<Record<string, unknown> | null>(),
    templateSnapshotJson: jsonb("template_snapshot_json").$type<Record<string, unknown> | null>(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),

    lastReminderSentAt: timestamp("last_reminder_sent_at", { withTimezone: true }),

    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("invoices_tenant_idx").on(table.tenantId),
    index("invoices_tenant_assignment_idx").on(table.tenantId, table.assignmentId),
    index("invoices_tenant_customer_idx").on(table.tenantId, table.customerId),
    index("invoices_tenant_status_idx").on(table.tenantId, table.status),
    uniqueIndex("invoices_tenant_invoice_number_unique_idx")
      .on(table.tenantId, table.invoiceNumber)
      .where(sql`${table.invoiceNumber} IS NOT NULL AND ${table.invoiceNumber} <> ''`),
    index("invoices_tenant_invoice_date_idx").on(table.tenantId, table.invoiceDate),
    index("invoices_numbering_settings_idx").on(table.invoiceNumberingSettingsId),
  ],
);

export const invoiceLineItemSnapshotsTable = pgTable(
  "invoice_line_item_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoicesTable.id, { onDelete: "cascade" }),
    sourceType: varchar("source_type", { length: 40 }).notNull(),
    sourceId: uuid("source_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    category: varchar("category", { length: 40 }).notNull().default("task"),
    description: text("description").notNull(),
    taskCodeCode: varchar("task_code_code", { length: 40 }),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default("1"),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
    totalPrice: numeric("total_price", { precision: 12, scale: 2 }).notNull().default("0"),
    vatPercentage: numeric("vat_percentage", { precision: 5, scale: 2 }).notNull().default("21"),
    invoiceable: boolean("invoiceable").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("invoice_line_item_snapshots_invoice_idx").on(table.invoiceId, table.sortOrder),
    index("invoice_line_item_snapshots_tenant_idx").on(table.tenantId),
    index("invoice_line_item_snapshots_source_idx").on(table.sourceType, table.sourceId),
  ],
);

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({
  id: true,
  tenantId: true,
  invoiceNumber: true,
  invoiceNumberingSettingsId: true,
  invoiceNumberPeriodKey: true,
  invoiceNumberSequenceValue: true,
  invoiceDate: true,
  currency: true,
  paymentStatus: true,
  molliePaymentId: true,
  paymentUrl: true,
  companySnapshotJson: true,
  invoiceSettingsSnapshotJson: true,
  paymentSettingsSnapshotJson: true,
  templateSnapshotJson: true,
  finalizedAt: true,
  vatAmount: true,
  totalAmount: true,
  createdAt: true,
  updatedAt: true,
});

export const selectInvoiceSchema = createSelectSchema(invoicesTable);
export const updateInvoiceSchema = insertInvoiceSchema.partial();

export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type UpdateInvoice = z.infer<typeof updateInvoiceSchema>;
export type Invoice = z.infer<typeof selectInvoiceSchema>;
export type TenantCompanySettings = typeof tenantCompanySettingsTable.$inferSelect;
export type InvoiceNumberingSettings = typeof invoiceNumberingSettingsTable.$inferSelect;
export type InvoiceNumberSequence = typeof invoiceNumberSequencesTable.$inferSelect;
export type InvoicePaymentSettings = typeof invoicePaymentSettingsTable.$inferSelect;
export type InvoiceTemplateSettings = typeof invoiceTemplateSettingsTable.$inferSelect;
export type InvoiceLineItemSnapshot = typeof invoiceLineItemSnapshotsTable.$inferSelect;
