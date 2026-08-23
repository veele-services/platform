import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { customersTable } from "./customers";
import { objectsTable } from "./objects";
import { personnelTable } from "./personnel";
import { tenantsTable } from "./tenants";
import { tenantUsersTable } from "./tenants";

export const DOSSIER_SUBJECT_TYPES = ["personnel", "customer", "object"] as const;
export type DossierSubjectType = (typeof DOSSIER_SUBJECT_TYPES)[number];
export const DOSSIER_STATUSES = ["active", "attention", "archived", "closed"] as const;
export type DossierStatus = (typeof DOSSIER_STATUSES)[number];

export const dossierProfilesTable = pgTable(
  "dossier_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    subjectType: varchar("subject_type", { length: 20 })
      .notNull()
      .$type<DossierSubjectType>(),
    personnelId: uuid("personnel_id"),
    customerId: uuid("customer_id"),
    objectId: uuid("object_id"),
    dossierNumber: varchar("dossier_number", { length: 80 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("active").$type<DossierStatus>(),
    managerUserId: uuid("manager_user_id"),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    lastReviewedBy: uuid("last_reviewed_by"),
    retentionPolicyKey: varchar("retention_policy_key", { length: 80 }),
    scheduledDeletionAt: timestamp("scheduled_deletion_at", { withTimezone: true }),
    legalHoldAt: timestamp("legal_hold_at", { withTimezone: true }),
    legalHoldBy: uuid("legal_hold_by"),
    legalHoldReason: text("legal_hold_reason"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by"),
    archiveReason: text("archive_reason"),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId, table.personnelId],
      foreignColumns: [personnelTable.tenantId, personnelTable.id],
      name: "dossier_profiles_personnel_tenant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.managerUserId],
      foreignColumns: [tenantUsersTable.tenantId, tenantUsersTable.userId],
      name: "dossier_profiles_manager_tenant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customersTable.tenantId, customersTable.id],
      name: "dossier_profiles_customer_tenant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.objectId],
      foreignColumns: [objectsTable.tenantId, objectsTable.id],
      name: "dossier_profiles_object_tenant_fk",
    }).onDelete("restrict"),
    uniqueIndex("dossier_profiles_tenant_number_unique").on(table.tenantId, table.dossierNumber),
    uniqueIndex("dossier_profiles_tenant_id_unique").on(table.tenantId, table.id),
    uniqueIndex("dossier_profiles_personnel_unique")
      .on(table.tenantId, table.personnelId)
      .where(sql`${table.personnelId} is not null`),
    uniqueIndex("dossier_profiles_customer_unique")
      .on(table.tenantId, table.customerId)
      .where(sql`${table.customerId} is not null`),
    uniqueIndex("dossier_profiles_object_unique")
      .on(table.tenantId, table.objectId)
      .where(sql`${table.objectId} is not null`),
    index("dossier_profiles_attention_idx").on(
      table.tenantId,
      table.status,
      table.lastReviewedAt,
      table.scheduledDeletionAt,
    ),
  ],
);

export const dossierNotesTable = pgTable(
  "dossier_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    dossierProfileId: uuid("dossier_profile_id").notNull(),
    classification: varchar("classification", { length: 24 }).notNull().default("internal"),
    content: text("content").notNull(),
    correctionOfId: uuid("correction_of_id"),
    correctionReason: text("correction_reason"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId, table.dossierProfileId],
      foreignColumns: [dossierProfilesTable.tenantId, dossierProfilesTable.id],
      name: "dossier_notes_profile_tenant_fk",
    }).onDelete("restrict"),
    uniqueIndex("dossier_notes_tenant_id_unique").on(table.tenantId, table.id),
    index("dossier_notes_profile_time_idx").on(
      table.tenantId,
      table.dossierProfileId,
      table.createdAt,
    ),
  ],
);

export const dossierTasksTable = pgTable(
  "dossier_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    dossierProfileId: uuid("dossier_profile_id").notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 24 }).notNull().default("open"),
    priority: varchar("priority", { length: 20 }).notNull().default("normal"),
    ownerUserId: uuid("owner_user_id"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by"),
    recordVersion: integer("record_version").notNull().default(1),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId, table.dossierProfileId],
      foreignColumns: [dossierProfilesTable.tenantId, dossierProfilesTable.id],
      name: "dossier_tasks_profile_tenant_fk",
    }).onDelete("restrict"),
    index("dossier_tasks_open_due_idx").on(
      table.tenantId,
      table.dossierProfileId,
      table.status,
      table.dueAt,
    ),
  ],
);

export const dossierEventsTable = pgTable(
  "dossier_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    dossierProfileId: uuid("dossier_profile_id").notNull(),
    actorUserId: uuid("actor_user_id"),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    summary: text("summary"),
    classification: varchar("classification", { length: 24 }).notNull().default("internal"),
    sourceType: varchar("source_type", { length: 60 }).notNull(),
    sourceId: uuid("source_id"),
    correlationId: varchar("correlation_id", { length: 128 }),
    safeMetadata: jsonb("safe_metadata").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId, table.dossierProfileId],
      foreignColumns: [dossierProfilesTable.tenantId, dossierProfilesTable.id],
      name: "dossier_events_profile_tenant_fk",
    }).onDelete("restrict"),
    index("dossier_events_profile_time_idx").on(
      table.tenantId,
      table.dossierProfileId,
      table.occurredAt,
    ),
  ],
);

export type DossierProfile = typeof dossierProfilesTable.$inferSelect;
export type DossierNote = typeof dossierNotesTable.$inferSelect;
export type DossierTask = typeof dossierTasksTable.$inferSelect;
export type DossierEvent = typeof dossierEventsTable.$inferSelect;
