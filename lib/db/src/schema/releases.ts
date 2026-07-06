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
import { roadmapItemsTable } from "./roadmap";
import { tenantsTable } from "./tenants";

export const RELEASE_STATUSES = ["draft", "published", "archived"] as const;
export const RELEASE_IMPACT_LEVELS = ["low", "medium", "high", "critical"] as const;
export const RELEASE_MEDIA_TYPES = ["image", "video", "attachment"] as const;
export const RELEASE_HIGHLIGHT_SURFACES = [
  "platform_backoffice",
  "tenant_backoffice",
  "personnel_pwa",
  "customer_pwa",
] as const;

export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];
export type ReleaseImpactLevel = (typeof RELEASE_IMPACT_LEVELS)[number];
export type ReleaseMediaType = (typeof RELEASE_MEDIA_TYPES)[number];
export type ReleaseHighlightSurface = (typeof RELEASE_HIGHLIGHT_SURFACES)[number];

export const releaseCategoriesTable = pgTable(
  "release_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 180 }).notNull(),
    moduleKey: varchar("module_key", { length: 80 })
      .$type<FieldgridModuleKey | (string & {})>()
      .references(() => modulesTable.key, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("release_categories_slug_idx").on(table.slug),
    index("release_categories_module_idx").on(table.moduleKey),
    index("release_categories_active_idx").on(table.isActive, table.sortOrder),
  ],
);

export const releasesTable = pgTable(
  "releases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: varchar("version", { length: 80 }).notNull(),
    title: varchar("title", { length: 220 }).notNull(),
    slug: varchar("slug", { length: 220 }).notNull(),
    summary: text("summary"),
    contentJson: jsonb("content_json").$type<Record<string, unknown> | null>(),
    contentHtml: text("content_html"),
    contentText: text("content_text"),
    status: varchar("status", { length: 20 }).notNull().default("draft").$type<ReleaseStatus>(),
    impactLevel: varchar("impact_level", { length: 20 }).notNull().default("medium").$type<ReleaseImpactLevel>(),
    featured: boolean("featured").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
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
    uniqueIndex("releases_version_idx").on(table.version),
    uniqueIndex("releases_slug_idx").on(table.slug),
    index("releases_status_published_idx").on(table.status, table.publishedAt),
    index("releases_featured_idx").on(table.featured, table.status),
    index("releases_impact_idx").on(table.impactLevel),
  ],
);

export const releaseItemsTable = pgTable(
  "release_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    releaseId: uuid("release_id").notNull().references(() => releasesTable.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => releaseCategoriesTable.id, { onDelete: "set null" }),
    title: varchar("title", { length: 220 }).notNull(),
    description: text("description").notNull(),
    moduleKey: varchar("module_key", { length: 80 })
      .$type<FieldgridModuleKey | (string & {})>()
      .references(() => modulesTable.key, { onDelete: "set null" }),
    impactLevel: varchar("impact_level", { length: 20 }).notNull().default("medium").$type<ReleaseImpactLevel>(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("release_items_release_idx").on(table.releaseId, table.sortOrder),
    index("release_items_module_idx").on(table.moduleKey),
    index("release_items_category_idx").on(table.categoryId),
  ],
);

export const releaseAudiencesTable = pgTable(
  "release_audiences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    releaseId: uuid("release_id").notNull().references(() => releasesTable.id, { onDelete: "cascade" }),
    audienceKey: varchar("audience_key", { length: 40 }).notNull().$type<FieldgridContentAudience>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("release_audiences_unique_idx").on(table.releaseId, table.audienceKey),
    index("release_audiences_audience_idx").on(table.audienceKey),
  ],
);

export const releaseModulesTable = pgTable(
  "release_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    releaseId: uuid("release_id").notNull().references(() => releasesTable.id, { onDelete: "cascade" }),
    moduleKey: varchar("module_key", { length: 80 })
      .notNull()
      .$type<FieldgridModuleKey | (string & {})>()
      .references(() => modulesTable.key, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("release_modules_unique_idx").on(table.releaseId, table.moduleKey),
    index("release_modules_module_idx").on(table.moduleKey),
  ],
);

export const releaseMediaTable = pgTable(
  "release_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    releaseId: uuid("release_id").notNull().references(() => releasesTable.id, { onDelete: "cascade" }),
    mediaType: varchar("media_type", { length: 30 }).notNull().$type<ReleaseMediaType>(),
    storagePath: text("storage_path").notNull(),
    publicUrl: text("public_url"),
    mimeType: varchar("mime_type", { length: 160 }),
    sizeBytes: integer("size_bytes"),
    altText: text("alt_text"),
    caption: text("caption"),
    sortOrder: integer("sort_order").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("release_media_release_idx").on(table.releaseId, table.sortOrder),
  ],
);

export const releaseHighlightsTable = pgTable(
  "release_highlights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    releaseId: uuid("release_id").notNull().references(() => releasesTable.id, { onDelete: "cascade" }),
    surface: varchar("surface", { length: 40 }).notNull().$type<ReleaseHighlightSurface>(),
    audienceKey: varchar("audience_key", { length: 40 }).notNull().$type<FieldgridContentAudience>(),
    moduleKey: varchar("module_key", { length: 80 })
      .$type<FieldgridModuleKey | (string & {})>()
      .references(() => modulesTable.key, { onDelete: "set null" }),
    title: varchar("title", { length: 180 }).notNull(),
    message: text("message").notNull(),
    priority: integer("priority").notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("release_highlights_release_idx").on(table.releaseId),
    index("release_highlights_surface_audience_idx").on(table.surface, table.audienceKey, table.isActive),
    index("release_highlights_module_idx").on(table.moduleKey),
    index("release_highlights_window_idx").on(table.startsAt, table.endsAt),
  ],
);

export const releaseDismissalsTable = pgTable(
  "release_dismissals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    highlightId: uuid("highlight_id").notNull().references(() => releaseHighlightsTable.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    personnelId: uuid("personnel_id"),
    customerId: uuid("customer_id"),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("release_dismissals_highlight_idx").on(table.highlightId),
    index("release_dismissals_user_idx").on(table.userId),
    index("release_dismissals_personnel_idx").on(table.personnelId),
    index("release_dismissals_customer_idx").on(table.customerId),
    index("release_dismissals_tenant_idx").on(table.tenantId),
  ],
);

export const releaseReadReceiptsTable = pgTable(
  "release_read_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    releaseId: uuid("release_id").notNull().references(() => releasesTable.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    personnelId: uuid("personnel_id"),
    customerId: uuid("customer_id"),
    surface: varchar("surface", { length: 40 }).notNull().$type<ReleaseHighlightSurface>(),
    audienceKey: varchar("audience_key", { length: 40 }).notNull().$type<FieldgridContentAudience>(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  },
  (table) => [
    index("release_read_receipts_release_idx").on(table.releaseId, table.readAt),
    index("release_read_receipts_tenant_idx").on(table.tenantId, table.readAt),
    index("release_read_receipts_user_idx").on(table.userId),
    index("release_read_receipts_personnel_idx").on(table.personnelId),
    index("release_read_receipts_customer_idx").on(table.customerId),
    index("release_read_receipts_surface_audience_idx").on(table.surface, table.audienceKey),
  ],
);

export const releaseRoadmapLinksTable = pgTable(
  "release_roadmap_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    releaseId: uuid("release_id").notNull().references(() => releasesTable.id, { onDelete: "cascade" }),
    roadmapItemId: uuid("roadmap_item_id").notNull().references(() => roadmapItemsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("release_roadmap_links_unique_idx").on(table.releaseId, table.roadmapItemId),
    index("release_roadmap_links_roadmap_idx").on(table.roadmapItemId),
  ],
);

export const releaseTicketLinksTable = pgTable(
  "release_ticket_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    releaseId: uuid("release_id").notNull().references(() => releasesTable.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
    ticketType: varchar("ticket_type", { length: 40 }).notNull(),
    ticketId: uuid("ticket_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("release_ticket_links_unique_idx").on(table.releaseId, table.ticketType, table.ticketId),
    index("release_ticket_links_ticket_idx").on(table.ticketType, table.ticketId),
    index("release_ticket_links_tenant_idx").on(table.tenantId),
  ],
);

export type ReleaseCategory = typeof releaseCategoriesTable.$inferSelect;
export type InsertReleaseCategory = typeof releaseCategoriesTable.$inferInsert;
export type Release = typeof releasesTable.$inferSelect;
export type InsertRelease = typeof releasesTable.$inferInsert;
export type ReleaseItem = typeof releaseItemsTable.$inferSelect;
export type ReleaseAudience = typeof releaseAudiencesTable.$inferSelect;
export type ReleaseModule = typeof releaseModulesTable.$inferSelect;
export type ReleaseMedia = typeof releaseMediaTable.$inferSelect;
export type ReleaseHighlight = typeof releaseHighlightsTable.$inferSelect;
export type ReleaseDismissal = typeof releaseDismissalsTable.$inferSelect;
export type ReleaseReadReceipt = typeof releaseReadReceiptsTable.$inferSelect;
export type ReleaseRoadmapLink = typeof releaseRoadmapLinksTable.$inferSelect;
export type ReleaseTicketLink = typeof releaseTicketLinksTable.$inferSelect;
