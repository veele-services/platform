import type {
  WebsiteAnalytics,
  WebsiteContact,
  WebsiteContentStatus,
  WebsiteCustomDeploymentStatus,
  WebsiteDeliveryMode,
  WebsiteDomainBindingStatus,
  WebsitePageType,
  WebsitePublicationSnapshot,
  WebsitePublicationStatus,
  WebsiteSeo,
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
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { tenantDomainsTable } from "./tenant-domains";
import { tenantsTable } from "./tenants";

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
export type WebsitePublication = typeof websitePublicationsTable.$inferSelect;
export type WebsiteDeliveryActivation =
  typeof websiteDeliveryActivationsTable.$inferSelect;
