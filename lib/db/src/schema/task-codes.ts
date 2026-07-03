import {
  date,
  index,
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  numeric,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sectorsTable } from "./sectors";
import { rolesTable } from "./roles";
import { DEFAULT_TENANT_ID, tenantsTable } from "./tenants";

/**
 * Centrally managed work type definitions.
 * Task codes drive planning eligibility, reporting requirements, and invoicing.
 */
export const taskCodesTable = pgTable(
  "task_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .default(sql`'${sql.raw(DEFAULT_TENANT_ID)}'::uuid`)
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    sectorId: uuid("sector_id").references(() => sectorsTable.id, { onDelete: "set null" }),
    description: text("description"),

    /** Current selling price per unit / occurrence in EUR. Tenant price history is stored separately. */
    price: numeric("price", { precision: 10, scale: 2 }),
    /** Planned task duration in minutes. */
    durationMinutes: integer("duration_minutes"),

    /** Planning eligibility - all must be satisfied before an employee can be assigned. */
    requiredCertificates: jsonb("required_certificates").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    requiredDiploma: varchar("required_diploma", { length: 200 }),
    requiredKnowledge: jsonb("required_knowledge").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** If set, only employees with this role can be assigned. */
    requiredRoleId: uuid("required_role_id").references(() => rolesTable.id, { onDelete: "set null" }),

    /** Whether field photos must be submitted with the task report. */
    photoRequired: boolean("photo_required").notNull().default(false),
    /** Whether a written report must be submitted upon completion. */
    reportRequired: boolean("report_required").notNull().default(false),
    /** Whether this task generates an invoice line. */
    invoiceable: boolean("invoiceable").notNull().default(true),

    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("task_codes_tenant_code_unique_idx").on(table.tenantId, table.code),
    index("task_codes_tenant_active_idx").on(table.tenantId, table.isActive),
    index("task_codes_tenant_sector_idx").on(table.tenantId, table.sectorId),
  ],
);

/**
 * Tenant-specific task-code override layer.
 * Existing task_codes remain the compatibility source while this table carries SaaS-ready
 * tenant uniqueness, sector validation and price-history linkage.
 */
export const tenantTaskCodesTable = pgTable(
  "tenant_task_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    templateTaskCodeId: uuid("template_task_code_id").references(() => taskCodesTable.id, { onDelete: "set null" }),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    sectorId: uuid("sector_id").references(() => sectorsTable.id, { onDelete: "set null" }),
    description: text("description"),
    durationMinutes: integer("duration_minutes"),
    requiredCertificates: jsonb("required_certificates").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    requiredDiploma: varchar("required_diploma", { length: 200 }),
    requiredKnowledge: jsonb("required_knowledge").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    requiredRoleId: uuid("required_role_id").references(() => rolesTable.id, { onDelete: "set null" }),
    photoRequired: boolean("photo_required").notNull().default(false),
    reportRequired: boolean("report_required").notNull().default(false),
    invoiceable: boolean("invoiceable").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("tenant_task_codes_tenant_code_unique_idx").on(table.tenantId, table.code),
    index("tenant_task_codes_tenant_idx").on(table.tenantId),
    index("tenant_task_codes_template_idx").on(table.templateTaskCodeId),
    index("tenant_task_codes_tenant_sector_idx").on(table.tenantId, table.sectorId),
    index("tenant_task_codes_tenant_active_idx").on(table.tenantId, table.isActive),
  ],
);

/** Historical tenant price rows. Assignment task rows snapshot the selected row. */
export const tenantTaskCodePricesTable = pgTable(
  "tenant_task_code_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    tenantTaskCodeId: uuid("tenant_task_code_id")
      .notNull()
      .references(() => tenantTaskCodesTable.id, { onDelete: "cascade" }),
    price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
    validFrom: date("valid_from").notNull().default(sql`CURRENT_DATE`),
    validUntil: date("valid_until"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tenant_task_code_prices_task_valid_from_unique_idx").on(table.tenantTaskCodeId, table.validFrom),
    index("tenant_task_code_prices_tenant_idx").on(table.tenantId),
    index("tenant_task_code_prices_tenant_task_idx").on(table.tenantId, table.tenantTaskCodeId),
    index("tenant_task_code_prices_validity_idx").on(table.tenantTaskCodeId, table.validFrom, table.validUntil),
  ],
);

export const insertTaskCodeSchema = createInsertSchema(taskCodesTable).omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
});

export const selectTaskCodeSchema = createSelectSchema(taskCodesTable);
export const updateTaskCodeSchema = insertTaskCodeSchema.partial();

export const insertTenantTaskCodeSchema = createInsertSchema(tenantTaskCodesTable).omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
});
export const selectTenantTaskCodeSchema = createSelectSchema(tenantTaskCodesTable);
export const updateTenantTaskCodeSchema = insertTenantTaskCodeSchema.partial();

export const insertTenantTaskCodePriceSchema = createInsertSchema(tenantTaskCodePricesTable).omit({
  id: true,
  tenantId: true,
  createdAt: true,
});
export const selectTenantTaskCodePriceSchema = createSelectSchema(tenantTaskCodePricesTable);

export type InsertTaskCode = z.infer<typeof insertTaskCodeSchema>;
export type UpdateTaskCode = z.infer<typeof updateTaskCodeSchema>;
export type TaskCode = z.infer<typeof selectTaskCodeSchema>;
export type InsertTenantTaskCode = z.infer<typeof insertTenantTaskCodeSchema>;
export type UpdateTenantTaskCode = z.infer<typeof updateTenantTaskCodeSchema>;
export type TenantTaskCode = z.infer<typeof selectTenantTaskCodeSchema>;
export type InsertTenantTaskCodePrice = z.infer<typeof insertTenantTaskCodePriceSchema>;
export type TenantTaskCodePrice = z.infer<typeof selectTenantTaskCodePriceSchema>;
