import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { tenantsTable, type TenantPlanKey } from "./tenants";

export const TENANT_PROVISIONING_STATUSES = [
  "draft",
  "started",
  "succeeded",
  "failed",
  "rolled_back",
] as const;

export const TENANT_OWNER_INVITE_STATUSES = [
  "not_requested",
  "pending",
  "sent",
  "accepted",
  "failed",
  "rolled_back",
] as const;

export const TENANT_FIRST_RUN_STATUSES = ["pending", "in_progress", "completed", "skipped"] as const;

export type TenantProvisioningStatus = (typeof TENANT_PROVISIONING_STATUSES)[number];
export type TenantOwnerInviteStatus = (typeof TENANT_OWNER_INVITE_STATUSES)[number];
export type TenantFirstRunStatus = (typeof TENANT_FIRST_RUN_STATUSES)[number];

export const tenantProvisioningRunsTable = pgTable(
  "tenant_provisioning_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
    requestedBy: uuid("requested_by").notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    planKey: varchar("plan_key", { length: 40 }).notNull().default("starter").$type<TenantPlanKey>(),
    primaryDomain: text("primary_domain"),
    ownerEmail: text("owner_email"),
    ownerUserId: uuid("owner_user_id"),
    ownerInviteStatus: varchar("owner_invite_status", { length: 30 })
      .notNull()
      .default("not_requested")
      .$type<TenantOwnerInviteStatus>(),
    status: varchar("status", { length: 30 })
      .notNull()
      .default("started")
      .$type<TenantProvisioningStatus>(),
    currentStep: varchar("current_step", { length: 80 }).notNull().default("started"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("tenant_provisioning_runs_tenant_idx").on(table.tenantId),
    index("tenant_provisioning_runs_status_idx").on(table.status),
    index("tenant_provisioning_runs_requested_by_idx").on(table.requestedBy),
    index("tenant_provisioning_runs_slug_idx").on(table.slug),
  ],
);

export const tenantOwnerInvitesTable = pgTable(
  "tenant_owner_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    userId: uuid("user_id"),
    status: varchar("status", { length: 30 })
      .notNull()
      .default("pending")
      .$type<TenantOwnerInviteStatus>(),
    invitedBy: uuid("invited_by").notNull(),
    inviteSentAt: timestamp("invite_sent_at", { withTimezone: true }),
    rollbackAt: timestamp("rollback_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("tenant_owner_invites_tenant_email_idx").on(table.tenantId, table.email),
    index("tenant_owner_invites_email_idx").on(table.email),
    index("tenant_owner_invites_status_idx").on(table.status),
  ],
);

export const tenantFirstRunStateTable = pgTable(
  "tenant_first_run_state",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 30 })
      .notNull()
      .default("pending")
      .$type<TenantFirstRunStatus>(),
    requiredSteps: jsonb("required_steps")
      .$type<string[]>()
      .notNull()
      .default(sql`'["branding", "users", "sectors", "modules"]'::jsonb`),
    completedSteps: jsonb("completed_steps")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("tenant_first_run_state_status_idx").on(table.status)],
);

export type TenantProvisioningRun = typeof tenantProvisioningRunsTable.$inferSelect;
export type TenantOwnerInvite = typeof tenantOwnerInvitesTable.$inferSelect;
export type TenantFirstRunState = typeof tenantFirstRunStateTable.$inferSelect;
