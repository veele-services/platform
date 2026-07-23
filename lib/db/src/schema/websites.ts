import type {
  WebsiteRichTextDocument,
  WebsiteAnalytics,
  WebsiteContact,
  WebsiteContentStatus,
  WebsiteCustomDeploymentStatus,
  WebsiteDeliveryMode,
  WebsiteDomainBindingStatus,
  WebsiteFormField,
  WebsiteFormKind,
  WebsiteFormNotificationStatus,
  WebsiteFormStatus,
  WebsiteFormSubmissionData,
  WebsiteFormSubmissionStatus,
  WebsitePageType,
  WebsitePublicationSnapshot,
  WebsitePublicationStatus,
  WebsiteRedirectStatusCode,
  WebsiteSeo,
  WebsiteSeoSettings,
  WebsiteSiteStatus,
  WebsiteSocialLink,
  WebsiteTemplateKey,
  WebsiteTheme,
} from "@workspace/website-core";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { tenantDomainsTable } from "./tenant-domains";
import { tenantsTable } from "./tenants";
import { customersTable } from "./customers";

export const websiteSitesTable = pgTable(
  "website_sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 160 }).notNull(),
    status: varchar("status", { length: 20 })
      .notNull()
      .default("draft")
      .$type<WebsiteSiteStatus>(),
    isPrimary: boolean("is_primary").notNull().default(false),
    deliveryMode: varchar("delivery_mode", { length: 30 })
      .notNull()
      .default("managed_cms")
      .$type<WebsiteDeliveryMode>(),
    deliveryRevision: integer("delivery_revision").notNull().default(1),
    activePublicationId: uuid("active_publication_id"),
    activeCustomDeploymentId: uuid("active_custom_deployment_id"),
    templateKey: varchar("template_key", {
      length: 80,
    }).$type<WebsiteTemplateKey | null>(),
    templateVersion: integer("template_version"),
    defaultLocale: varchar("default_locale", { length: 20 })
      .notNull()
      .default("nl-NL"),
    theme: jsonb("theme").notNull().$type<WebsiteTheme>(),
    contact: jsonb("contact").notNull().$type<WebsiteContact>(),
    socialLinks: jsonb("social_links")
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<WebsiteSocialLink[]>(),
    defaultSeo: jsonb("default_seo").notNull().$type<WebsiteSeo>(),
    analytics: jsonb("analytics")
      .notNull()
      .default(sql`'{"provider":"none"}'::jsonb`)
      .$type<WebsiteAnalytics>(),
    seoSettings: jsonb("seo_settings")
      .notNull()
      .default(
        sql`'{"schemaVersion":1,"structuredData":{"enabled":true,"organizationType":"organization"},"webmasterVerification":{"google":null,"bing":null}}'::jsonb`,
      )
      .$type<WebsiteSeoSettings>(),
    authoringRevision: integer("authoring_revision").notNull().default(1),
    createdBy: uuid("created_by").notNull(),
    updatedBy: uuid("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("website_sites_tenant_id_idx").on(table.tenantId, table.id),
    uniqueIndex("website_sites_tenant_primary_idx")
      .on(table.tenantId)
      .where(sql`${table.isPrimary} = true AND ${table.status} <> 'disabled'`),
    index("website_sites_tenant_status_idx").on(table.tenantId, table.status),
    check(
      "website_sites_delivery_revision_check",
      sql`${table.deliveryRevision} > 0`,
    ),
    check(
      "website_sites_authoring_revision_check",
      sql`${table.authoringRevision} > 0`,
    ),
    check(
      "website_sites_template_version_check",
      sql`${table.templateVersion} IS NULL OR ${table.templateVersion} > 0`,
    ),
  ],
);

export const websiteDomainBindingsTable = pgTable(
  "website_domain_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").notNull(),
    tenantDomainId: uuid("tenant_domain_id").notNull(),
    hostname: varchar("hostname", { length: 253 }).notNull(),
    status: varchar("status", { length: 20 })
      .notNull()
      .default("pending")
      .$type<WebsiteDomainBindingStatus>(),
    isPrimary: boolean("is_primary").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdBy: uuid("created_by").notNull(),
    updatedBy: uuid("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("website_domain_bindings_hostname_idx").on(table.hostname),
    uniqueIndex("website_domain_bindings_tenant_domain_idx").on(
      table.tenantDomainId,
    ),
    uniqueIndex("website_domain_bindings_site_primary_idx")
      .on(table.siteId)
      .where(sql`${table.isPrimary} = true`),
    index("website_domain_bindings_tenant_site_idx").on(
      table.tenantId,
      table.siteId,
    ),
    foreignKey({
      name: "website_domain_bindings_tenant_site_fk",
      columns: [table.tenantId, table.siteId],
      foreignColumns: [websiteSitesTable.tenantId, websiteSitesTable.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "website_domain_bindings_tenant_domain_fk",
      columns: [table.tenantId, table.tenantDomainId],
      foreignColumns: [tenantDomainsTable.tenantId, tenantDomainsTable.id],
    }).onDelete("restrict"),
  ],
);

export const websiteCustomDeploymentsTable = pgTable(
  "website_custom_deployments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").notNull(),
    providerKey: varchar("provider_key", { length: 80 }).notNull(),
    routeKey: varchar("route_key", { length: 240 }).notNull(),
    releaseId: varchar("release_id", { length: 240 }).notNull(),
    expectedHost: varchar("expected_host", { length: 253 }).notNull(),
    healthPath: varchar("health_path", { length: 500 })
      .notNull()
      .default("/api/health"),
    status: varchar("status", { length: 20 })
      .notNull()
      .default("draft")
      .$type<WebsiteCustomDeploymentStatus>(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastHealth: jsonb("last_health").$type<Record<string, unknown> | null>(),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("website_custom_deployments_tenant_site_id_idx").on(
      table.tenantId,
      table.siteId,
      table.id,
    ),
    uniqueIndex("website_custom_deployments_release_idx").on(
      table.siteId,
      table.providerKey,
      table.releaseId,
    ),
    uniqueIndex("website_custom_deployments_site_active_idx")
      .on(table.siteId)
      .where(sql`${table.status} = 'active'`),
    index("website_custom_deployments_tenant_status_idx").on(
      table.tenantId,
      table.status,
    ),
    foreignKey({
      name: "website_custom_deployments_tenant_site_fk",
      columns: [table.tenantId, table.siteId],
      foreignColumns: [websiteSitesTable.tenantId, websiteSitesTable.id],
    }).onDelete("restrict"),
  ],
);

export const websitePagesTable = pgTable(
  "website_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").notNull(),
    parentId: uuid("parent_id"),
    locale: varchar("locale", { length: 20 }).notNull().default("nl-NL"),
    title: varchar("title", { length: 180 }).notNull(),
    navigationLabel: varchar("navigation_label", { length: 180 }),
    slug: varchar("slug", { length: 180 }).notNull(),
    path: varchar("path", { length: 500 }).notNull(),
    pageType: varchar("page_type", { length: 30 })
      .notNull()
      .default("standard")
      .$type<WebsitePageType>(),
    status: varchar("status", { length: 20 })
      .notNull()
      .default("draft")
      .$type<WebsiteContentStatus>(),
    isHomepage: boolean("is_homepage").notNull().default(false),
    seo: jsonb("seo").notNull().$type<WebsiteSeo>(),
    authoringRevision: integer("authoring_revision").notNull().default(1),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: uuid("created_by").notNull(),
    updatedBy: uuid("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("website_pages_tenant_site_id_idx").on(
      table.tenantId,
      table.siteId,
      table.id,
    ),
    uniqueIndex("website_pages_site_locale_path_idx")
      .on(table.siteId, table.locale, table.path)
      .where(sql`${table.status} <> 'archived'`),
    uniqueIndex("website_pages_site_locale_home_idx")
      .on(table.siteId, table.locale)
      .where(sql`${table.isHomepage} = true AND ${table.status} <> 'archived'`),
    index("website_pages_tenant_site_status_idx").on(
      table.tenantId,
      table.siteId,
      table.status,
    ),
    check(
      "website_pages_authoring_revision_check",
      sql`${table.authoringRevision} > 0`,
    ),
    check(
      "website_pages_parent_check",
      sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`,
    ),
    foreignKey({
      name: "website_pages_tenant_site_fk",
      columns: [table.tenantId, table.siteId],
      foreignColumns: [websiteSitesTable.tenantId, websiteSitesTable.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "website_pages_parent_fk",
      columns: [table.tenantId, table.siteId, table.parentId],
      foreignColumns: [table.tenantId, table.siteId, table.id],
    }).onDelete("restrict"),
  ],
);

export const websitePageSectionsTable = pgTable(
  "website_page_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").notNull(),
    pageId: uuid("page_id").notNull(),
    sectionKey: varchar("section_key", { length: 80 }).notNull(),
    schemaVersion: integer("schema_version").notNull(),
    variantKey: varchar("variant_key", { length: 80 }).notNull(),
    position: integer("position").notNull(),
    content: jsonb("content").notNull().$type<Record<string, unknown>>(),
    isVisible: boolean("is_visible").notNull().default(true),
    requiresReview: boolean("requires_review").notNull().default(false),
    authoringRevision: integer("authoring_revision").notNull().default(1),
    createdBy: uuid("created_by").notNull(),
    updatedBy: uuid("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("website_page_sections_page_position_idx").on(
      table.pageId,
      table.position,
    ),
    index("website_page_sections_tenant_page_idx").on(
      table.tenantId,
      table.pageId,
    ),
    check("website_page_sections_position_check", sql`${table.position} >= 0`),
    check(
      "website_page_sections_schema_version_check",
      sql`${table.schemaVersion} > 0`,
    ),
    check(
      "website_page_sections_authoring_revision_check",
      sql`${table.authoringRevision} > 0`,
    ),
    foreignKey({
      name: "website_page_sections_tenant_page_fk",
      columns: [table.tenantId, table.siteId, table.pageId],
      foreignColumns: [
        websitePagesTable.tenantId,
        websitePagesTable.siteId,
        websitePagesTable.id,
      ],
    }).onDelete("restrict"),
  ],
);

export const websiteNavigationItemsTable = pgTable(
  "website_navigation_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").notNull(),
    parentId: uuid("parent_id"),
    pageId: uuid("page_id"),
    location: varchar("location", { length: 30 }).notNull(),
    label: varchar("label", { length: 180 }).notNull(),
    linkType: varchar("link_type", { length: 20 }).notNull(),
    href: varchar("href", { length: 2_048 }),
    target: varchar("target", { length: 20 }).notNull().default("self"),
    position: integer("position").notNull(),
    isVisible: boolean("is_visible").notNull().default(true),
    createdBy: uuid("created_by").notNull(),
    updatedBy: uuid("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("website_navigation_items_tenant_site_id_idx").on(
      table.tenantId,
      table.siteId,
      table.id,
    ),
    // Position uniqueness is migration-owned because Drizzle cannot model its
    // DEFERRABLE constraint. An immediate uniqueIndex here breaks atomic reorders.
    index("website_navigation_items_tenant_site_idx").on(
      table.tenantId,
      table.siteId,
    ),
    check(
      "website_navigation_items_position_check",
      sql`${table.position} >= 0`,
    ),
    check(
      "website_navigation_items_parent_check",
      sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`,
    ),
    foreignKey({
      name: "website_navigation_items_tenant_site_fk",
      columns: [table.tenantId, table.siteId],
      foreignColumns: [websiteSitesTable.tenantId, websiteSitesTable.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "website_navigation_items_parent_fk",
      columns: [table.tenantId, table.siteId, table.parentId],
      foreignColumns: [table.tenantId, table.siteId, table.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "website_navigation_items_page_fk",
      columns: [table.tenantId, table.siteId, table.pageId],
      foreignColumns: [
        websitePagesTable.tenantId,
        websitePagesTable.siteId,
        websitePagesTable.id,
      ],
    }).onDelete("restrict"),
  ],
);

export const websiteRedirectsTable = pgTable(
  "website_redirects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").notNull(),
    locale: varchar("locale", { length: 20 }).notNull().default("nl-NL"),
    sourcePath: varchar("source_path", { length: 500 }).notNull(),
    destinationType: varchar("destination_type", { length: 20 })
      .notNull()
      .$type<"path" | "external">(),
    destination: varchar("destination", { length: 2_048 }).notNull(),
    statusCode: integer("status_code")
      .notNull()
      .default(308)
      .$type<WebsiteRedirectStatusCode>(),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").notNull(),
    updatedBy: uuid("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("website_redirects_tenant_site_id_idx").on(
      table.tenantId,
      table.siteId,
      table.id,
    ),
    uniqueIndex("website_redirects_source_idx").on(
      table.tenantId,
      table.siteId,
      table.locale,
      table.sourcePath,
    ),
    index("website_redirects_tenant_site_active_idx").on(
      table.tenantId,
      table.siteId,
      table.isActive,
    ),
    check(
      "website_redirects_status_code_check",
      sql`${table.statusCode} IN (301, 302, 308)`,
    ),
    check(
      "website_redirects_destination_type_check",
      sql`${table.destinationType} IN ('path', 'external')`,
    ),
    check(
      "website_redirects_locale_check",
      sql`${table.locale} ~ '^[a-z]{2}-[A-Z]{2}$'`,
    ),
    check(
      "website_redirects_source_path_check",
      sql`${table.sourcePath} <> '/' AND ${table.sourcePath} ~ '^/(?:[a-z0-9_-]+(?:/[a-z0-9_-]+)*)?$' AND ${table.sourcePath} !~ '^/(api|_next|health|preview|assets)(/|$)'`,
    ),
    check(
      "website_redirects_destination_check",
      sql`(${table.destinationType} = 'path' AND ${table.destination} ~ '^/(?:[a-z0-9_-]+(?:/[a-z0-9_-]+)*)?$' AND ${table.destination} !~ '^/(api|_next|health|preview|assets)(/|$)') OR (${table.destinationType} = 'external' AND ${table.destination} ~ '^https://' AND ${table.destination} !~ '^https://[^/]*@')`,
    ),
    check(
      "website_redirects_self_check",
      sql`${table.destinationType} <> 'path' OR ${table.destination} <> ${table.sourcePath}`,
    ),
    foreignKey({
      name: "website_redirects_tenant_site_fk",
      columns: [table.tenantId, table.siteId],
      foreignColumns: [websiteSitesTable.tenantId, websiteSitesTable.id],
    }).onDelete("restrict"),
  ],
);

export const websiteBlogCategoriesTable = pgTable(
  "website_blog_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").notNull(),
    locale: varchar("locale", { length: 20 }).notNull().default("nl-NL"),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 180 }).notNull(),
    path: varchar("path", { length: 500 }).notNull(),
    description: varchar("description", { length: 500 }),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").notNull(),
    updatedBy: uuid("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("website_blog_categories_tenant_site_id_idx").on(
      table.tenantId,
      table.siteId,
      table.id,
    ),
    uniqueIndex("website_blog_categories_route_idx")
      .on(table.tenantId, table.siteId, table.locale, table.path)
      .where(sql`${table.isActive} = true`),
    index("website_blog_categories_tenant_site_idx").on(
      table.tenantId,
      table.siteId,
      table.isActive,
    ),
    check(
      "website_blog_categories_locale_check",
      sql`${table.locale} ~ '^[a-z]{2}-[A-Z]{2}$'`,
    ),
    foreignKey({
      name: "website_blog_categories_tenant_site_fk",
      columns: [table.tenantId, table.siteId],
      foreignColumns: [websiteSitesTable.tenantId, websiteSitesTable.id],
    }).onDelete("restrict"),
  ],
);

export const websiteBlogTagsTable = pgTable(
  "website_blog_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").notNull(),
    locale: varchar("locale", { length: 20 }).notNull().default("nl-NL"),
    name: varchar("name", { length: 80 }).notNull(),
    slug: varchar("slug", { length: 180 }).notNull(),
    path: varchar("path", { length: 500 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").notNull(),
    updatedBy: uuid("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("website_blog_tags_tenant_site_id_idx").on(
      table.tenantId,
      table.siteId,
      table.id,
    ),
    uniqueIndex("website_blog_tags_route_idx")
      .on(table.tenantId, table.siteId, table.locale, table.path)
      .where(sql`${table.isActive} = true`),
    index("website_blog_tags_tenant_site_idx").on(
      table.tenantId,
      table.siteId,
      table.isActive,
    ),
    check(
      "website_blog_tags_locale_check",
      sql`${table.locale} ~ '^[a-z]{2}-[A-Z]{2}$'`,
    ),
    foreignKey({
      name: "website_blog_tags_tenant_site_fk",
      columns: [table.tenantId, table.siteId],
      foreignColumns: [websiteSitesTable.tenantId, websiteSitesTable.id],
    }).onDelete("restrict"),
  ],
);

export const websiteBlogPostsTable = pgTable(
  "website_blog_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").notNull(),
    locale: varchar("locale", { length: 20 }).notNull().default("nl-NL"),
    title: varchar("title", { length: 180 }).notNull(),
    slug: varchar("slug", { length: 180 }).notNull(),
    path: varchar("path", { length: 500 }).notNull(),
    excerpt: varchar("excerpt", { length: 500 }).notNull(),
    body: jsonb("body").notNull().$type<WebsiteRichTextDocument>(),
    categoryId: uuid("category_id"),
    seo: jsonb("seo").notNull().$type<WebsiteSeo>(),
    status: varchar("status", { length: 20 })
      .notNull()
      .default("draft")
      .$type<WebsiteContentStatus>(),
    authoringRevision: integer("authoring_revision").notNull().default(1),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: uuid("created_by").notNull(),
    updatedBy: uuid("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("website_blog_posts_tenant_site_id_idx").on(
      table.tenantId,
      table.siteId,
      table.id,
    ),
    uniqueIndex("website_blog_posts_route_idx")
      .on(table.tenantId, table.siteId, table.locale, table.path)
      .where(sql`${table.status} <> 'archived'`),
    index("website_blog_posts_tenant_site_status_idx").on(
      table.tenantId,
      table.siteId,
      table.status,
    ),
    check(
      "website_blog_posts_authoring_revision_check",
      sql`${table.authoringRevision} > 0`,
    ),
    check(
      "website_blog_posts_locale_check",
      sql`${table.locale} ~ '^[a-z]{2}-[A-Z]{2}$'`,
    ),
    foreignKey({
      name: "website_blog_posts_tenant_site_fk",
      columns: [table.tenantId, table.siteId],
      foreignColumns: [websiteSitesTable.tenantId, websiteSitesTable.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "website_blog_posts_category_fk",
      columns: [table.tenantId, table.siteId, table.categoryId],
      foreignColumns: [
        websiteBlogCategoriesTable.tenantId,
        websiteBlogCategoriesTable.siteId,
        websiteBlogCategoriesTable.id,
      ],
    }).onDelete("restrict"),
  ],
);

export const websiteBlogPostTagsTable = pgTable(
  "website_blog_post_tags",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").notNull(),
    postId: uuid("post_id").notNull(),
    tagId: uuid("tag_id").notNull(),
    createdBy: uuid("created_by").notNull(),
    updatedBy: uuid("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("website_blog_post_tags_identity_idx").on(
      table.tenantId,
      table.siteId,
      table.postId,
      table.tagId,
    ),
    index("website_blog_post_tags_tag_idx").on(
      table.tenantId,
      table.siteId,
      table.tagId,
    ),
    foreignKey({
      name: "website_blog_post_tags_post_fk",
      columns: [table.tenantId, table.siteId, table.postId],
      foreignColumns: [
        websiteBlogPostsTable.tenantId,
        websiteBlogPostsTable.siteId,
        websiteBlogPostsTable.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "website_blog_post_tags_tag_fk",
      columns: [table.tenantId, table.siteId, table.tagId],
      foreignColumns: [
        websiteBlogTagsTable.tenantId,
        websiteBlogTagsTable.siteId,
        websiteBlogTagsTable.id,
      ],
    }).onDelete("restrict"),
  ],
);

export const websiteFormsTable = pgTable(
  "website_forms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").notNull(),
    key: varchar("key", { length: 80 }).notNull(),
    locale: varchar("locale", { length: 20 }).notNull().default("nl-NL"),
    kind: varchar("kind", { length: 20 }).notNull().$type<WebsiteFormKind>(),
    name: varchar("name", { length: 160 }).notNull(),
    fields: jsonb("fields").notNull().$type<WebsiteFormField[]>(),
    submitLabel: varchar("submit_label", { length: 80 }).notNull(),
    successMessage: varchar("success_message", { length: 500 }).notNull(),
    notificationEmail: varchar("notification_email", { length: 254 }),
    status: varchar("status", { length: 20 })
      .notNull()
      .default("draft")
      .$type<WebsiteFormStatus>(),
    authoringRevision: integer("authoring_revision").notNull().default(1),
    createdBy: uuid("created_by").notNull(),
    updatedBy: uuid("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("website_forms_tenant_site_id_idx").on(
      table.tenantId,
      table.siteId,
      table.id,
    ),
    uniqueIndex("website_forms_site_locale_key_idx")
      .on(table.tenantId, table.siteId, table.locale, table.key)
      .where(sql`${table.status} <> 'archived'`),
    index("website_forms_tenant_site_status_idx").on(
      table.tenantId,
      table.siteId,
      table.status,
    ),
    foreignKey({
      name: "website_forms_tenant_site_fk",
      columns: [table.tenantId, table.siteId],
      foreignColumns: [websiteSitesTable.tenantId, websiteSitesTable.id],
    }).onDelete("restrict"),
  ],
);

export const websiteFormSubmissionsTable = pgTable(
  "website_form_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").notNull(),
    formId: uuid("form_id").notNull(),
    status: varchar("status", { length: 20 })
      .notNull()
      .default("new")
      .$type<WebsiteFormSubmissionStatus>(),
    payload: jsonb("payload").notNull().$type<WebsiteFormSubmissionData>(),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    idempotencyHash: varchar("idempotency_hash", { length: 64 }).notNull(),
    requestFingerprint: varchar("request_fingerprint", {
      length: 64,
    }).notNull(),
    sourceHostname: varchar("source_hostname", { length: 253 }).notNull(),
    contactName: varchar("contact_name", { length: 160 }),
    contactEmail: varchar("contact_email", { length: 254 }),
    contactPhone: varchar("contact_phone", { length: 50 }),
    notificationStatus: varchar("notification_status", { length: 20 })
      .notNull()
      .default("pending")
      .$type<WebsiteFormNotificationStatus>(),
    notificationAttemptedAt: timestamp("notification_attempted_at", {
      withTimezone: true,
    }),
    notificationError: varchar("notification_error", { length: 500 }),
    customerId: uuid("customer_id").references(() => customersTable.id, {
      onDelete: "restrict",
    }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    convertedBy: uuid("converted_by"),
    readAt: timestamp("read_at", { withTimezone: true }),
    readBy: uuid("read_by"),
    retentionUntil: timestamp("retention_until", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '365 days'`),
    isRedacted: boolean("is_redacted").notNull().default(false),
    redactedAt: timestamp("redacted_at", { withTimezone: true }),
    redactedBy: uuid("redacted_by"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("website_form_submissions_tenant_site_id_idx").on(
      table.tenantId,
      table.siteId,
      table.id,
    ),
    uniqueIndex("website_form_submissions_idempotency_idx").on(
      table.tenantId,
      table.formId,
      table.idempotencyHash,
    ),
    index("website_form_submissions_inbox_idx").on(
      table.tenantId,
      table.siteId,
      table.status,
      table.receivedAt.desc(),
    ),
    index("website_form_submissions_retention_idx")
      .on(table.tenantId, table.retentionUntil)
      .where(sql`${table.isRedacted} = false`),
    index("website_form_submissions_customer_idx")
      .on(table.tenantId, table.customerId)
      .where(sql`${table.customerId} IS NOT NULL`),
    foreignKey({
      name: "website_form_submissions_form_fk",
      columns: [table.tenantId, table.siteId, table.formId],
      foreignColumns: [
        websiteFormsTable.tenantId,
        websiteFormsTable.siteId,
        websiteFormsTable.id,
      ],
    }).onDelete("restrict"),
  ],
);

export const websiteFormSubmissionEventsTable = pgTable(
  "website_form_submission_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").notNull(),
    submissionId: uuid("submission_id").notNull(),
    eventType: varchar("event_type", { length: 40 }).notNull(),
    actorUserId: uuid("actor_user_id"),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`)
      .$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("website_form_submission_events_timeline_idx").on(
      table.tenantId,
      table.submissionId,
      table.createdAt,
      table.id,
    ),
    foreignKey({
      name: "website_form_submission_events_submission_fk",
      columns: [table.tenantId, table.siteId, table.submissionId],
      foreignColumns: [
        websiteFormSubmissionsTable.tenantId,
        websiteFormSubmissionsTable.siteId,
        websiteFormSubmissionsTable.id,
      ],
    }).onDelete("restrict"),
  ],
);

export const websiteFormRateLimitsTable = pgTable(
  "website_form_rate_limits",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").notNull(),
    formId: uuid("form_id").notNull(),
    requestFingerprint: varchar("request_fingerprint", {
      length: 64,
    }).notNull(),
    windowStartedAt: timestamp("window_started_at", {
      withTimezone: true,
    }).notNull(),
    requestCount: integer("request_count").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "website_form_rate_limits_pkey",
      columns: [
        table.tenantId,
        table.formId,
        table.requestFingerprint,
        table.windowStartedAt,
      ],
    }),
    index("website_form_rate_limits_expiry_idx").on(table.expiresAt),
    foreignKey({
      name: "website_form_rate_limits_form_fk",
      columns: [table.tenantId, table.siteId, table.formId],
      foreignColumns: [
        websiteFormsTable.tenantId,
        websiteFormsTable.siteId,
        websiteFormsTable.id,
      ],
    }).onDelete("cascade"),
  ],
);

export const websitePublicationsTable = pgTable(
  "website_publications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").notNull(),
    sequence: integer("sequence").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    sourceRevision: integer("source_revision").notNull(),
    targetDeliveryRevision: integer("target_delivery_revision").notNull(),
    snapshot: jsonb("snapshot").notNull().$type<WebsitePublicationSnapshot>(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    cacheKey: varchar("cache_key", { length: 320 }).notNull(),
    status: varchar("status", { length: 20 })
      .notNull()
      .default("building")
      .$type<WebsitePublicationStatus>(),
    validation: jsonb("validation")
      .notNull()
      .default(sql`'{"errors":[],"warnings":[]}'::jsonb`),
    createdBy: uuid("created_by").notNull(),
    activatedBy: uuid("activated_by"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("website_publications_tenant_site_id_idx").on(
      table.tenantId,
      table.siteId,
      table.id,
    ),
    uniqueIndex("website_publications_site_sequence_idx").on(
      table.siteId,
      table.sequence,
    ),
    uniqueIndex("website_publications_site_hash_idx").on(
      table.siteId,
      table.contentHash,
    ),
    uniqueIndex("website_publications_cache_key_idx").on(table.cacheKey),
    uniqueIndex("website_publications_site_active_idx")
      .on(table.siteId)
      .where(sql`${table.status} = 'active'`),
    index("website_publications_tenant_status_idx").on(
      table.tenantId,
      table.status,
    ),
    check("website_publications_sequence_check", sql`${table.sequence} > 0`),
    check(
      "website_publications_schema_version_check",
      sql`${table.schemaVersion} > 0`,
    ),
    check(
      "website_publications_source_revision_check",
      sql`${table.sourceRevision} > 0`,
    ),
    check(
      "website_publications_target_delivery_revision_check",
      sql`${table.targetDeliveryRevision} > 0`,
    ),
    check(
      "website_publications_snapshot_delivery_revision_check",
      sql`(${table.snapshot} ->> 'deliveryRevision')::integer = ${table.targetDeliveryRevision}`,
    ),
    check(
      "website_publications_cache_key_check",
      sql`${table.cacheKey} = concat('website-publication:v1:', ${table.tenantId}::text, ':', ${table.siteId}::text, ':r', ${table.targetDeliveryRevision}::text, ':', ${table.contentHash})`,
    ),
    foreignKey({
      name: "website_publications_tenant_site_fk",
      columns: [table.tenantId, table.siteId],
      foreignColumns: [websiteSitesTable.tenantId, websiteSitesTable.id],
    }).onDelete("restrict"),
  ],
);

export const websiteDeliveryActivationsTable = pgTable(
  "website_delivery_activations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").notNull(),
    fromMode: varchar("from_mode", { length: 30 })
      .notNull()
      .$type<WebsiteDeliveryMode>(),
    fromTargetId: uuid("from_target_id"),
    toMode: varchar("to_mode", { length: 30 })
      .notNull()
      .$type<WebsiteDeliveryMode>(),
    toTargetId: uuid("to_target_id").notNull(),
    expectedRevision: integer("expected_revision").notNull(),
    newRevision: integer("new_revision").notNull(),
    reason: text("reason").notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("website_delivery_activations_site_revision_idx").on(
      table.siteId,
      table.newRevision,
    ),
    index("website_delivery_activations_tenant_site_idx").on(
      table.tenantId,
      table.siteId,
      table.createdAt,
    ),
    check(
      "website_delivery_activations_revision_check",
      sql`${table.expectedRevision} > 0 AND ${table.newRevision} = ${table.expectedRevision} + 1`,
    ),
    foreignKey({
      name: "website_delivery_activations_tenant_site_fk",
      columns: [table.tenantId, table.siteId],
      foreignColumns: [websiteSitesTable.tenantId, websiteSitesTable.id],
    }).onDelete("restrict"),
  ],
);

export const websiteDeliveryOperationsTable = pgTable(
  "website_delivery_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").notNull(),
    operationType: varchar("operation_type", { length: 20 })
      .notNull()
      .$type<"activate" | "rollback">(),
    environment: varchar("environment", { length: 20 })
      .notNull()
      .default("staging")
      .$type<"staging">(),
    status: varchar("status", { length: 20 })
      .notNull()
      .$type<"succeeded" | "failed">(),
    fromMode: varchar("from_mode", { length: 30 })
      .notNull()
      .$type<WebsiteDeliveryMode>(),
    fromTargetId: uuid("from_target_id"),
    toMode: varchar("to_mode", { length: 30 })
      .notNull()
      .$type<WebsiteDeliveryMode>(),
    toTargetId: uuid("to_target_id").notNull(),
    rollbackSourceTargetId: uuid("rollback_source_target_id"),
    expectedRevision: integer("expected_revision").notNull(),
    newRevision: integer("new_revision"),
    changeReference: varchar("change_reference", { length: 160 }).notNull(),
    reason: text("reason").notNull(),
    preflightEvidence: jsonb("preflight_evidence")
      .notNull()
      .$type<Record<string, unknown>>(),
    errorCode: varchar("error_code", { length: 80 }),
    actorUserId: uuid("actor_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("website_delivery_operations_tenant_site_idx").on(
      table.tenantId,
      table.siteId,
      table.createdAt,
    ),
    uniqueIndex("website_delivery_operations_site_revision_idx")
      .on(table.siteId, table.newRevision)
      .where(sql`${table.status} = 'succeeded'`),
    foreignKey({
      name: "website_delivery_operations_tenant_site_fk",
      columns: [table.tenantId, table.siteId],
      foreignColumns: [websiteSitesTable.tenantId, websiteSitesTable.id],
    }).onDelete("restrict"),
  ],
);

export type WebsiteSite = typeof websiteSitesTable.$inferSelect;
export type InsertWebsiteSite = typeof websiteSitesTable.$inferInsert;
export type WebsiteDomainBinding =
  typeof websiteDomainBindingsTable.$inferSelect;
export type WebsiteCustomDeployment =
  typeof websiteCustomDeploymentsTable.$inferSelect;
export type WebsitePage = typeof websitePagesTable.$inferSelect;
export type WebsitePageSection = typeof websitePageSectionsTable.$inferSelect;
export type WebsiteNavigationItem =
  typeof websiteNavigationItemsTable.$inferSelect;
export type WebsiteRedirect = typeof websiteRedirectsTable.$inferSelect;
export type WebsiteBlogCategory =
  typeof websiteBlogCategoriesTable.$inferSelect;
export type WebsiteBlogTag = typeof websiteBlogTagsTable.$inferSelect;
export type WebsiteBlogPost = typeof websiteBlogPostsTable.$inferSelect;
export type WebsiteBlogPostTag = typeof websiteBlogPostTagsTable.$inferSelect;
export type WebsitePublication = typeof websitePublicationsTable.$inferSelect;
export type WebsiteDeliveryActivation =
  typeof websiteDeliveryActivationsTable.$inferSelect;
export type WebsiteDeliveryOperation =
  typeof websiteDeliveryOperationsTable.$inferSelect;
