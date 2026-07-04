import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenantsTable } from "./tenants";

export const domainEventsTable = pgTable(
  "domain_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    eventKey: varchar("event_key", { length: 100 }).notNull(),
    actorUserId: uuid("actor_user_id"),
    audience: varchar("audience", { length: 30 }).notNull().default("management"),
    aggregateType: varchar("aggregate_type", { length: 80 }),
    aggregateId: text("aggregate_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    dispatchStatus: varchar("dispatch_status", { length: 30 }).notNull().default("recorded"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("domain_events_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("domain_events_event_key_idx").on(table.eventKey),
    index("domain_events_aggregate_idx").on(table.aggregateType, table.aggregateId),
  ],
);

export type DomainEvent = typeof domainEventsTable.$inferSelect;
export type InsertDomainEvent = typeof domainEventsTable.$inferInsert;
