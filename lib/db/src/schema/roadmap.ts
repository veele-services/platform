import { sql } from "drizzle-orm";
import {
  boolean,
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
import { type FieldgridContentAudience } from "./knowledgebase";
import { modulesTable, type FieldgridModuleKey } from "./modules";
import { tenantsTable } from "./tenants";

export const ROADMAP_SCOPES = ["global", "tenant"] as const;
export const ROADMAP_STATUSES = ["new", "considering", "in_development", "done", "archived"] as const;
export const ROADMAP_PRIORITIES = ["low", "normal", "high", "critical"] as const;
export const ROADMAP_COMMENT_VISIBILITIES = ["platform_internal", "tenant_visible"] as const;
export const ROADMAP_TENANT_LINK_TYPES = ["requested_by", "interested", "blocked_by", "related"] as const;

export type RoadmapScope = (typeof ROADMAP_SCOPES)[number];
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];
export type RoadmapPriority = (typeof ROADMAP_PRIORITIES)[number];
export type RoadmapCommentVisibility = (typeof ROADMAP_COMMENT_VISIBILITIES)[number];
export type RoadmapTenantLinkType = (typeof ROADMAP_TENANT_LINK_TYPES)[number];

export const roadmapItemsTable = pgTable(
  "roadmap_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
    scope: varchar("scope", { length: 20 }).notNull().default("tenant").$type<RoadmapScope>(),
    title: varchar("title", { length: 220 }).notNull(),
    slug: varchar("slug", { length: 220 }).notNull(),
    description: text("description").notNull(),
    status: varchar("status", { length: 30 }).notNull().default("new").$type<RoadmapStatus>(),
    priority: varchar("priority", { length: 20 }).notNull().default("normal").$type<RoadmapPriority>(),
    categoryId: uuid("category_id"),
    submittedBy: uuid("submitted_by"),
    plannedVersion: varchar("planned_version", { length: 80 }),
    expectedDelivery: timestamp("expected_delivery", { withTimezone: true }),
    publicVisible: boolean("public_visible").notNull().default(false),
    featured: boolean("featured").notNull().default(false),
    internalNote: text("internal_note"),
    convertedFromItemId: uuid("converted_from_item_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("roadmap_items_tenant_idx").on(table.tenantId),
    index("roadmap_items_scope_status_idx").on(table.scope, table.status, table.priority),
    index("roadmap_items_public_idx").on(table.publicVisible, table.status),
    index("roadmap_items_featured_idx").on(table.featured, table.status),
    index("roadmap_items_updated_idx").on(table.updatedAt),
    uniqueIndex("roadmap_items_scope_tenant_slug_idx").on(table.scope, table.tenantId, table.slug),
  ],
);

export const roadmapItemAudiencesTable = pgTable(
  "roadmap_item_audiences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roadmapItemId: uuid("roadmap_item_id").notNull().references(() => roadmapItemsTable.id, { onDelete: "cascade" }),
    audienceKey: varchar("audience_key", { length: 40 }).notNull().$type<FieldgridContentAudience>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("roadmap_item_audiences_unique_idx").on(table.roadmapItemId, table.audienceKey),
    index("roadmap_item_audiences_audience_idx").on(table.audienceKey),
  ],
);

export const roadmapItemModulesTable = pgTable(
  "roadmap_item_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roadmapItemId: uuid("roadmap_item_id").notNull().references(() => roadmapItemsTable.id, { onDelete: "cascade" }),
    moduleKey: varchar("module_key", { length: 80 })
      .notNull()
      .$type<FieldgridModuleKey | (string & {})>()
      .references(() => modulesTable.key, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("roadmap_item_modules_unique_idx").on(table.roadmapItemId, table.moduleKey),
    index("roadmap_item_modules_module_idx").on(table.moduleKey),
  ],
);

export const roadmapItemTenantLinksTable = pgTable(
  "roadmap_item_tenant_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roadmapItemId: uuid("roadmap_item_id").notNull().references(() => roadmapItemsTable.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    relationType: varchar("relation_type", { length: 40 }).notNull().default("interested").$type<RoadmapTenantLinkType>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("roadmap_item_tenant_links_unique_idx").on(table.roadmapItemId, table.tenantId, table.relationType),
    index("roadmap_item_tenant_links_tenant_idx").on(table.tenantId),
  ],
);

export const roadmapItemCommentsTable = pgTable(
  "roadmap_item_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roadmapItemId: uuid("roadmap_item_id").notNull().references(() => roadmapItemsTable.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
    authorUserId: uuid("author_user_id"),
    body: text("body").notNull(),
    visibility: varchar("visibility", { length: 40 })
      .notNull()
      .default("tenant_visible")
      .$type<RoadmapCommentVisibility>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("roadmap_item_comments_item_created_idx").on(table.roadmapItemId, table.createdAt),
    index("roadmap_item_comments_tenant_idx").on(table.tenantId),
    index("roadmap_item_comments_author_idx").on(table.authorUserId),
  ],
);

export const roadmapItemVotesTable = pgTable(
  "roadmap_item_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roadmapItemId: uuid("roadmap_item_id").notNull().references(() => roadmapItemsTable.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    weight: integer("weight").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("roadmap_item_votes_item_user_idx").on(table.roadmapItemId, table.userId),
    index("roadmap_item_votes_tenant_idx").on(table.tenantId),
  ],
);

export const roadmapItemStatusHistoryTable = pgTable(
  "roadmap_item_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roadmapItemId: uuid("roadmap_item_id").notNull().references(() => roadmapItemsTable.id, { onDelete: "cascade" }),
    fromStatus: varchar("from_status", { length: 30 }).$type<RoadmapStatus>(),
    toStatus: varchar("to_status", { length: 30 }).notNull().$type<RoadmapStatus>(),
    changedBy: uuid("changed_by"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("roadmap_item_status_history_item_created_idx").on(table.roadmapItemId, table.createdAt),
    index("roadmap_item_status_history_to_status_idx").on(table.toStatus),
  ],
);

export const roadmapItemTicketLinksTable = pgTable(
  "roadmap_item_ticket_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roadmapItemId: uuid("roadmap_item_id").notNull().references(() => roadmapItemsTable.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
    ticketType: varchar("ticket_type", { length: 40 }).notNull(),
    ticketId: uuid("ticket_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("roadmap_item_ticket_links_unique_idx").on(table.roadmapItemId, table.ticketType, table.ticketId),
    index("roadmap_item_ticket_links_ticket_idx").on(table.ticketType, table.ticketId),
    index("roadmap_item_ticket_links_tenant_idx").on(table.tenantId),
  ],
);

export type RoadmapItem = typeof roadmapItemsTable.$inferSelect;
export type InsertRoadmapItem = typeof roadmapItemsTable.$inferInsert;
export type RoadmapItemAudience = typeof roadmapItemAudiencesTable.$inferSelect;
export type RoadmapItemModule = typeof roadmapItemModulesTable.$inferSelect;
export type RoadmapItemTenantLink = typeof roadmapItemTenantLinksTable.$inferSelect;
export type RoadmapItemComment = typeof roadmapItemCommentsTable.$inferSelect;
export type RoadmapItemVote = typeof roadmapItemVotesTable.$inferSelect;
export type RoadmapItemStatusHistory = typeof roadmapItemStatusHistoryTable.$inferSelect;
export type RoadmapItemTicketLink = typeof roadmapItemTicketLinksTable.$inferSelect;
