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
import { modulesTable, type FieldgridModuleKey } from "./modules";
import { tenantsTable } from "./tenants";

export const FIELDGRID_CONTENT_SCOPES = ["platform_global", "tenant"] as const;
export const FIELDGRID_CONTENT_STATUSES = ["draft", "published", "archived"] as const;
export const FIELDGRID_CONTENT_AUDIENCES = [
  "platform_admin",
  "tenant_admin",
  "tenant_management",
  "tenant_planning",
  "tenant_administration",
  "tenant_personnel",
  "tenant_customer",
  "support",
] as const;
export const KB_MEDIA_TYPES = ["image", "video", "attachment"] as const;
export const KB_TOOLTIP_STATUSES = ["draft", "published", "archived"] as const;

export type FieldgridContentScope = (typeof FIELDGRID_CONTENT_SCOPES)[number];
export type FieldgridContentStatus = (typeof FIELDGRID_CONTENT_STATUSES)[number];
export type FieldgridContentAudience = (typeof FIELDGRID_CONTENT_AUDIENCES)[number];
export type KbMediaType = (typeof KB_MEDIA_TYPES)[number];
export type KbTooltipStatus = (typeof KB_TOOLTIP_STATUSES)[number];

export const kbCategoriesTable = pgTable(
  "kb_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    scope: varchar("scope", { length: 30 }).notNull().default("platform_global").$type<FieldgridContentScope>(),
    parentId: uuid("parent_id"),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 180 }).notNull(),
    description: text("description"),
    moduleKey: varchar("module_key", { length: 80 })
      .$type<FieldgridModuleKey | (string & {})>()
      .references(() => modulesTable.key, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    language: varchar("language", { length: 12 }).notNull().default("nl"),
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
    index("kb_categories_scope_idx").on(table.scope),
    index("kb_categories_tenant_idx").on(table.tenantId),
    index("kb_categories_parent_idx").on(table.parentId),
    index("kb_categories_module_idx").on(table.moduleKey),
    index("kb_categories_active_idx").on(table.scope, table.isActive, table.sortOrder),
    uniqueIndex("kb_categories_scope_tenant_slug_language_idx").on(table.scope, table.tenantId, table.slug, table.language),
  ],
);

export const kbArticlesTable = pgTable(
  "kb_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    scope: varchar("scope", { length: 30 }).notNull().default("platform_global").$type<FieldgridContentScope>(),
    categoryId: uuid("category_id").references(() => kbCategoriesTable.id, { onDelete: "set null" }),
    title: varchar("title", { length: 220 }).notNull(),
    slug: varchar("slug", { length: 220 }).notNull(),
    summary: text("summary"),
    contentJson: jsonb("content_json").$type<Record<string, unknown> | null>(),
    contentHtml: text("content_html"),
    contentText: text("content_text"),
    keywords: jsonb("keywords").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    smartTerms: jsonb("smart_terms").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    status: varchar("status", { length: 20 }).notNull().default("draft").$type<FieldgridContentStatus>(),
    featured: boolean("featured").notNull().default(false),
    language: varchar("language", { length: 12 }).notNull().default("nl"),
    sortOrder: integer("sort_order").notNull().default(0),
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
    index("kb_articles_scope_status_idx").on(table.scope, table.status, table.publishedAt),
    index("kb_articles_tenant_idx").on(table.tenantId),
    index("kb_articles_category_idx").on(table.categoryId),
    index("kb_articles_slug_idx").on(table.slug),
    index("kb_articles_featured_idx").on(table.featured, table.status),
    index("kb_articles_updated_idx").on(table.updatedAt),
    uniqueIndex("kb_articles_scope_tenant_slug_language_idx").on(table.scope, table.tenantId, table.slug, table.language),
  ],
);

export const kbArticleAudiencesTable = pgTable(
  "kb_article_audiences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id").notNull().references(() => kbArticlesTable.id, { onDelete: "cascade" }),
    audienceKey: varchar("audience_key", { length: 40 }).notNull().$type<FieldgridContentAudience>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("kb_article_audiences_unique_idx").on(table.articleId, table.audienceKey),
    index("kb_article_audiences_audience_idx").on(table.audienceKey),
  ],
);

export const kbArticleModulesTable = pgTable(
  "kb_article_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id").notNull().references(() => kbArticlesTable.id, { onDelete: "cascade" }),
    moduleKey: varchar("module_key", { length: 80 })
      .notNull()
      .$type<FieldgridModuleKey | (string & {})>()
      .references(() => modulesTable.key, { onDelete: "cascade" }),
    isRequired: boolean("is_required").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("kb_article_modules_unique_idx").on(table.articleId, table.moduleKey),
    index("kb_article_modules_module_idx").on(table.moduleKey),
  ],
);

export const kbArticlePermissionsTable = pgTable(
  "kb_article_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id").notNull().references(() => kbArticlesTable.id, { onDelete: "cascade" }),
    permissionKey: varchar("permission_key", { length: 220 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("kb_article_permissions_unique_idx").on(table.articleId, table.permissionKey),
    index("kb_article_permissions_permission_idx").on(table.permissionKey),
  ],
);

export const kbArticleMediaTable = pgTable(
  "kb_article_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id").notNull().references(() => kbArticlesTable.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    scope: varchar("scope", { length: 30 }).notNull().default("platform_global").$type<FieldgridContentScope>(),
    mediaType: varchar("media_type", { length: 30 }).notNull().$type<KbMediaType>(),
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
    index("kb_article_media_article_idx").on(table.articleId, table.sortOrder),
    index("kb_article_media_tenant_idx").on(table.tenantId),
    index("kb_article_media_scope_idx").on(table.scope),
  ],
);

export const kbArticleRelatedTable = pgTable(
  "kb_article_related",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id").notNull().references(() => kbArticlesTable.id, { onDelete: "cascade" }),
    relatedArticleId: uuid("related_article_id").notNull().references(() => kbArticlesTable.id, { onDelete: "cascade" }),
    relationType: varchar("relation_type", { length: 40 }).notNull().default("manual"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("kb_article_related_unique_idx").on(table.articleId, table.relatedArticleId),
    index("kb_article_related_article_idx").on(table.articleId, table.sortOrder),
    index("kb_article_related_related_idx").on(table.relatedArticleId),
  ],
);

export const kbArticleVersionsTable = pgTable(
  "kb_article_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id").notNull().references(() => kbArticlesTable.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    title: varchar("title", { length: 220 }).notNull(),
    summary: text("summary"),
    contentJson: jsonb("content_json").$type<Record<string, unknown> | null>(),
    contentHtml: text("content_html"),
    contentText: text("content_text"),
    changeNote: text("change_note"),
    changedBy: uuid("changed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("kb_article_versions_article_version_idx").on(table.articleId, table.versionNo),
    index("kb_article_versions_article_created_idx").on(table.articleId, table.createdAt),
  ],
);

export const kbArticleFeedbackTable = pgTable(
  "kb_article_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id").notNull().references(() => kbArticlesTable.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    personnelId: uuid("personnel_id"),
    customerId: uuid("customer_id"),
    audienceKey: varchar("audience_key", { length: 40 }).notNull().$type<FieldgridContentAudience>(),
    isHelpful: boolean("is_helpful").notNull(),
    comment: text("comment"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("kb_article_feedback_article_idx").on(table.articleId, table.createdAt),
    index("kb_article_feedback_tenant_idx").on(table.tenantId, table.createdAt),
    index("kb_article_feedback_user_idx").on(table.userId),
    index("kb_article_feedback_personnel_idx").on(table.personnelId),
    index("kb_article_feedback_customer_idx").on(table.customerId),
  ],
);

export const kbSearchTermsTable = pgTable(
  "kb_search_terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id").notNull().references(() => kbArticlesTable.id, { onDelete: "cascade" }),
    term: varchar("term", { length: 220 }).notNull(),
    weight: integer("weight").notNull().default(1),
    language: varchar("language", { length: 12 }).notNull().default("nl"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("kb_search_terms_article_term_language_idx").on(table.articleId, table.term, table.language),
    index("kb_search_terms_term_idx").on(table.term),
  ],
);

export const kbSearchEventsTable = pgTable(
  "kb_search_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    audienceKey: varchar("audience_key", { length: 40 }).notNull().$type<FieldgridContentAudience>(),
    query: text("query").notNull(),
    resultCount: integer("result_count").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("kb_search_events_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("kb_search_events_audience_created_idx").on(table.audienceKey, table.createdAt),
  ],
);

export const kbTooltipsTable = pgTable(
  "kb_tooltips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stableKey: varchar("stable_key", { length: 180 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description").notNull(),
    articleId: uuid("article_id").references(() => kbArticlesTable.id, { onDelete: "set null" }),
    moduleKey: varchar("module_key", { length: 80 })
      .$type<FieldgridModuleKey | (string & {})>()
      .references(() => modulesTable.key, { onDelete: "set null" }),
    permissionKey: varchar("permission_key", { length: 220 }),
    status: varchar("status", { length: 20 }).notNull().default("draft").$type<KbTooltipStatus>(),
    placement: varchar("placement", { length: 40 }).notNull().default("top"),
    iconVariant: varchar("icon_variant", { length: 40 }).notNull().default("circle_help"),
    openInDrawer: boolean("open_in_drawer").notNull().default(false),
    showRelatedArticles: boolean("show_related_articles").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("kb_tooltips_stable_key_idx").on(table.stableKey),
    index("kb_tooltips_article_idx").on(table.articleId),
    index("kb_tooltips_module_idx").on(table.moduleKey),
    index("kb_tooltips_status_idx").on(table.status),
  ],
);

export const kbTooltipAudiencesTable = pgTable(
  "kb_tooltip_audiences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tooltipId: uuid("tooltip_id").notNull().references(() => kbTooltipsTable.id, { onDelete: "cascade" }),
    audienceKey: varchar("audience_key", { length: 40 }).notNull().$type<FieldgridContentAudience>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("kb_tooltip_audiences_unique_idx").on(table.tooltipId, table.audienceKey),
    index("kb_tooltip_audiences_audience_idx").on(table.audienceKey),
  ],
);

export const kbTooltipRelatedArticlesTable = pgTable(
  "kb_tooltip_related_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tooltipId: uuid("tooltip_id").notNull().references(() => kbTooltipsTable.id, { onDelete: "cascade" }),
    articleId: uuid("article_id").notNull().references(() => kbArticlesTable.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("kb_tooltip_related_articles_unique_idx").on(table.tooltipId, table.articleId),
    index("kb_tooltip_related_articles_tooltip_idx").on(table.tooltipId, table.sortOrder),
  ],
);

export type KbCategory = typeof kbCategoriesTable.$inferSelect;
export type InsertKbCategory = typeof kbCategoriesTable.$inferInsert;
export type KbArticle = typeof kbArticlesTable.$inferSelect;
export type InsertKbArticle = typeof kbArticlesTable.$inferInsert;
export type KbArticleAudience = typeof kbArticleAudiencesTable.$inferSelect;
export type KbArticleModule = typeof kbArticleModulesTable.$inferSelect;
export type KbArticlePermission = typeof kbArticlePermissionsTable.$inferSelect;
export type KbArticleMedia = typeof kbArticleMediaTable.$inferSelect;
export type KbArticleRelated = typeof kbArticleRelatedTable.$inferSelect;
export type KbArticleVersion = typeof kbArticleVersionsTable.$inferSelect;
export type KbArticleFeedback = typeof kbArticleFeedbackTable.$inferSelect;
export type KbSearchTerm = typeof kbSearchTermsTable.$inferSelect;
export type KbSearchEvent = typeof kbSearchEventsTable.$inferSelect;
export type KbTooltip = typeof kbTooltipsTable.$inferSelect;
export type InsertKbTooltip = typeof kbTooltipsTable.$inferInsert;
export type KbTooltipAudience = typeof kbTooltipAudiencesTable.$inferSelect;
export type KbTooltipRelatedArticle = typeof kbTooltipRelatedArticlesTable.$inferSelect;
