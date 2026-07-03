import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const NEWS_POST_SCOPES = ["platform"] as const;
export type NewsPostScope = (typeof NEWS_POST_SCOPES)[number];

export const NEWS_POST_STATUSES = ["draft", "scheduled", "published", "archived"] as const;
export type NewsPostStatus = (typeof NEWS_POST_STATUSES)[number];

export const NEWS_TARGET_TYPES = [
  "all_personnel",
  "all_customers",
  "sector",
  "personnel",
  "customer",
  "customer_type",
] as const;
export type NewsTargetType = (typeof NEWS_TARGET_TYPES)[number];

export const PLATFORM_NEWS_TARGET_TYPES = ["all_personnel", "all_customers"] as const;
export type PlatformNewsTargetType = (typeof PLATFORM_NEWS_TARGET_TYPES)[number];

export const newsPostsTable = pgTable(
  "news_posts",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    scope:        varchar("scope", { length: 20 }).notNull().default("platform").$type<NewsPostScope>(),
    tenantId:     uuid("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    slug:         varchar("slug", { length: 180 }).notNull(),
    title:        varchar("title", { length: 180 }).notNull(),
    excerpt:      text("excerpt"),
    contentHtml:  text("content_html").notNull(),
    contentJson:  jsonb("content_json").$type<Record<string, unknown> | null>(),
    heroImageUrl: text("hero_image_url"),
    heroImagePath:text("hero_image_path"),
    status:       varchar("status", { length: 20 }).notNull().default("draft").$type<NewsPostStatus>(),
    publishAt:    timestamp("publish_at", { withTimezone: true }),
    publishedAt:  timestamp("published_at", { withTimezone: true }),
    createdBy:    uuid("created_by").notNull(),
    updatedBy:    uuid("updated_by"),
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("news_posts_slug_idx").on(table.slug),
    index("news_posts_scope_idx").on(table.scope),
    index("news_posts_tenant_idx").on(table.tenantId),
    index("news_posts_status_publish_idx").on(table.status, table.publishAt),
    index("news_posts_created_at_idx").on(table.createdAt),
  ],
);

export const newsPostTargetsTable = pgTable(
  "news_post_targets",
  {
    id:         uuid("id").primaryKey().defaultRandom(),
    postId:     uuid("post_id").notNull().references(() => newsPostsTable.id, { onDelete: "cascade" }),
    targetType: varchar("target_type", { length: 30 }).notNull().$type<NewsTargetType>(),
    targetId:   uuid("target_id"),
    createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("news_post_targets_post_id_idx").on(table.postId),
    index("news_post_targets_lookup_idx").on(table.targetType, table.targetId),
  ],
);

export const insertNewsPostSchema = createInsertSchema(newsPostsTable).omit({
  id: true,
  scope: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
});

export const selectNewsPostSchema = createSelectSchema(newsPostsTable);
export const updateNewsPostSchema = insertNewsPostSchema.partial();

export type InsertNewsPost = z.infer<typeof insertNewsPostSchema>;
export type UpdateNewsPost = z.infer<typeof updateNewsPostSchema>;
export type NewsPost = z.infer<typeof selectNewsPostSchema>;
export type NewsPostTarget = typeof newsPostTargetsTable.$inferSelect;
