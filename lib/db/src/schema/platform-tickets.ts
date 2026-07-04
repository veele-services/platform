import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { auditLogTable } from "./audit-log";
import { tenantDomainsTable } from "./tenant-domains";
import { tenantsTable } from "./tenants";
import {
  platformUsersTable,
  supportAccessGrantsTable,
} from "./platform-users";
import { tenantSubscriptionsTable } from "./plans";

export const PLATFORM_TICKET_TYPES = [
  "support",
  "incident",
  "onboarding",
  "billing",
  "domain",
  "security",
] as const;
export type PlatformTicketType = (typeof PLATFORM_TICKET_TYPES)[number];

export const PLATFORM_TICKET_STATUSES = [
  "open",
  "in_progress",
  "waiting_customer",
  "waiting_internal",
  "resolved",
  "closed",
] as const;
export type PlatformTicketStatus = (typeof PLATFORM_TICKET_STATUSES)[number];

export const PLATFORM_TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type PlatformTicketPriority = (typeof PLATFORM_TICKET_PRIORITIES)[number];

export const PLATFORM_TICKET_NOTE_VISIBILITIES = ["internal", "public"] as const;
export type PlatformTicketNoteVisibility = (typeof PLATFORM_TICKET_NOTE_VISIBILITIES)[number];

export const platformTicketsTable = pgTable(
  "platform_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: varchar("type", { length: 30 })
      .notNull()
      .default("support")
      .$type<PlatformTicketType>(),
    status: varchar("status", { length: 30 })
      .notNull()
      .default("open")
      .$type<PlatformTicketStatus>(),
    priority: varchar("priority", { length: 20 })
      .notNull()
      .default("normal")
      .$type<PlatformTicketPriority>(),
    title: varchar("title", { length: 220 }).notNull(),
    description: text("description"),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
    subscriptionId: uuid("subscription_id").references(() => tenantSubscriptionsTable.id, { onDelete: "set null" }),
    domainId: uuid("domain_id").references(() => tenantDomainsTable.id, { onDelete: "set null" }),
    supportGrantId: uuid("support_grant_id").references(() => supportAccessGrantsTable.id, { onDelete: "set null" }),
    smokeRunId: text("smoke_run_id"),
    auditLogId: uuid("audit_log_id").references(() => auditLogTable.id, { onDelete: "set null" }),
    assigneePlatformUserId: uuid("assignee_platform_user_id").references(() => platformUsersTable.id, { onDelete: "set null" }),
    createdByPlatformUserId: uuid("created_by_platform_user_id").references(() => platformUsersTable.id, { onDelete: "set null" }),
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("platform_tickets_status_priority_idx").on(table.status, table.priority),
    index("platform_tickets_tenant_idx").on(table.tenantId),
    index("platform_tickets_subscription_idx").on(table.subscriptionId),
    index("platform_tickets_domain_idx").on(table.domainId),
    index("platform_tickets_support_grant_idx").on(table.supportGrantId),
    index("platform_tickets_smoke_run_idx").on(table.smokeRunId),
    index("platform_tickets_audit_log_idx").on(table.auditLogId),
    index("platform_tickets_sla_idx").on(table.slaDueAt),
    index("platform_tickets_activity_idx").on(table.lastActivityAt),
    index("platform_tickets_open_domain_idx")
      .on(table.domainId, table.status)
      .where(sql`${table.domainId} IS NOT NULL AND ${table.status} NOT IN ('resolved', 'closed')`),
  ],
);

export const platformTicketNotesTable = pgTable(
  "platform_ticket_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => platformTicketsTable.id, { onDelete: "cascade" }),
    authorPlatformUserId: uuid("author_platform_user_id").references(() => platformUsersTable.id, { onDelete: "set null" }),
    visibility: varchar("visibility", { length: 20 })
      .notNull()
      .default("internal")
      .$type<PlatformTicketNoteVisibility>(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("platform_ticket_notes_ticket_created_idx").on(table.ticketId, table.createdAt),
    index("platform_ticket_notes_author_idx").on(table.authorPlatformUserId),
  ],
);

export type PlatformTicket = typeof platformTicketsTable.$inferSelect;
export type InsertPlatformTicket = typeof platformTicketsTable.$inferInsert;
export type PlatformTicketNote = typeof platformTicketNotesTable.$inferSelect;
export type InsertPlatformTicketNote = typeof platformTicketNotesTable.$inferInsert;
