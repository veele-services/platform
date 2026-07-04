import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { sectorsTable } from "./sectors";
import { personnelTable } from "./personnel";
import { rolesTable } from "./roles";
import { taskCodesTable } from "./task-codes";

export const QUALIFICATION_TYPES = ["certificate", "diploma", "knowledge"] as const;
export type QualificationType = (typeof QUALIFICATION_TYPES)[number];

export const qualificationItemsTable = pgTable(
  "qualification_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 30 }).notNull().$type<QualificationType>(),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    sectorId: uuid("sector_id").references(() => sectorsTable.id, {
      onDelete: "set null",
    }),
    validityMonths: integer("validity_months"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("qualification_items_tenant_type_code_idx").on(
      table.tenantId,
      table.type,
      table.code,
    ),
    index("qualification_items_tenant_type_active_idx").on(
      table.tenantId,
      table.type,
      table.isActive,
    ),
    index("qualification_items_sector_idx").on(table.sectorId),
  ],
);

export const personnelQualificationsTable = pgTable(
  "personnel_qualifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => personnelTable.id, { onDelete: "cascade" }),
    qualificationId: uuid("qualification_id")
      .notNull()
      .references(() => qualificationItemsTable.id, { onDelete: "cascade" }),
    issuedAt: varchar("issued_at", { length: 10 }),
    expiresAt: varchar("expires_at", { length: 10 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("personnel_qualifications_person_qualification_idx").on(
      table.personnelId,
      table.qualificationId,
    ),
    index("personnel_qualifications_tenant_expiry_idx").on(
      table.tenantId,
      table.expiresAt,
    ),
    index("personnel_qualifications_qualification_idx").on(table.qualificationId),
  ],
);

export const roleQualificationsTable = pgTable(
  "role_qualifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => rolesTable.id, { onDelete: "cascade" }),
    qualificationId: uuid("qualification_id")
      .notNull()
      .references(() => qualificationItemsTable.id, { onDelete: "cascade" }),
    required: boolean("required").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("role_qualifications_role_qualification_idx").on(
      table.roleId,
      table.qualificationId,
    ),
    index("role_qualifications_qualification_idx").on(table.qualificationId),
  ],
);

export const taskCodeQualificationsTable = pgTable(
  "task_code_qualifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    taskCodeId: uuid("task_code_id")
      .notNull()
      .references(() => taskCodesTable.id, { onDelete: "cascade" }),
    qualificationId: uuid("qualification_id")
      .notNull()
      .references(() => qualificationItemsTable.id, { onDelete: "cascade" }),
    required: boolean("required").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("task_code_qualifications_task_qualification_idx").on(
      table.taskCodeId,
      table.qualificationId,
    ),
    index("task_code_qualifications_qualification_idx").on(table.qualificationId),
  ],
);

export const insertQualificationItemSchema = createInsertSchema(qualificationItemsTable).omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
});
export const updateQualificationItemSchema = insertQualificationItemSchema.partial();
export const selectQualificationItemSchema = createSelectSchema(qualificationItemsTable);

export type QualificationItem = typeof qualificationItemsTable.$inferSelect;
export type PersonnelQualification = typeof personnelQualificationsTable.$inferSelect;
export type RoleQualification = typeof roleQualificationsTable.$inferSelect;
export type TaskCodeQualification = typeof taskCodeQualificationsTable.$inferSelect;
export type InsertQualificationItem = z.infer<typeof insertQualificationItemSchema>;
export type UpdateQualificationItem = z.infer<typeof updateQualificationItemSchema>;
