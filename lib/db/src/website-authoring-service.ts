import type { PoolClient } from "pg";
import { z } from "zod/v4";
import {
  WEBSITE_PAGE_TYPES,
  websitePathChangeDecisionSchema,
  websiteSectionSchema,
  websiteSeoSchema,
  websiteSiteSettingsSchema,
  type WebsitePageType,
  type WebsitePathChangeDecision,
  type WebsiteSeo,
  type WebsiteSection,
  type WebsiteSiteSettings,
} from "@workspace/website-core";
import { pool } from "./connection";
import { createDefaultWebsiteContactForm } from "./website-form-service";

export type {
  WebsiteAction,
  WebsiteEditorSectionKey,
  WebsitePageType,
  WebsiteRichTextDocument,
  WebsiteSeo,
  WebsiteSection,
  WebsiteSiteSettings,
} from "@workspace/website-core";

const commandContextSchema = z
  .object({
    tenantId: z.string().uuid(),
    actorUserId: z.string().uuid(),
  })
  .strict();

const siteCommandContextSchema = commandContextSchema.extend({
  siteId: z.string().uuid(),
  expectedAuthoringRevision: z.number().int().positive(),
});

const initializeWebsiteInputSchema = commandContextSchema.extend({
  settings: websiteSiteSettingsSchema,
});

const updateWebsiteSettingsInputSchema = siteCommandContextSchema.extend({
  settings: websiteSiteSettingsSchema,
});

export const websitePageDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    navigationLabel: z.string().trim().max(180).nullable(),
    locale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/u),
    slug: z
      .string()
      .trim()
      .max(180)
      .refine(
        (value) => value === "" || /^[a-z0-9][a-z0-9-]*$/u.test(value),
        "Ongeldige slug",
      ),
    path: z
      .string()
      .trim()
      .max(500)
      .regex(/^\/(?:[a-z0-9_-]+(?:\/[a-z0-9_-]+)*)?$/u)
      .refine(
        (value) =>
          !/^\/(?:api|_next|health|preview|assets)(?:\/|$)/u.test(value),
        "Dit pad is gereserveerd",
      ),
    pageType: z.enum(WEBSITE_PAGE_TYPES),
    isHomepage: z.boolean(),
    seo: websiteSeoSchema,
  })
  .strict()
  .superRefine((page, context) => {
    if (page.isHomepage && (page.path !== "/" || page.slug !== "")) {
      context.addIssue({
        code: "custom",
        message: "De homepage moet pad / en een lege slug gebruiken",
        path: ["path"],
      });
    }
    if (page.isHomepage && page.pageType !== "home") {
      context.addIssue({
        code: "custom",
        message: "De homepage moet paginatype home gebruiken",
        path: ["pageType"],
      });
    }
    if (!page.isHomepage && page.path === "/") {
      context.addIssue({
        code: "custom",
        message: "Alleen de homepage mag pad / gebruiken",
        path: ["path"],
      });
    }
    if (
      page.pageType === "blog_index" &&
      (page.path !== "/blog" || page.slug !== "blog")
    ) {
      context.addIssue({
        code: "custom",
        message: "Het blogoverzicht gebruikt vast pad /blog en slug blog",
        path: ["path"],
      });
    }
    if (page.pageType !== "blog_index" && page.path === "/blog") {
      context.addIssue({
        code: "custom",
        message: "Pad /blog is gereserveerd voor het blogoverzicht",
        path: ["path"],
      });
    }
  });

const createWebsitePageInputSchema = siteCommandContextSchema.extend({
  page: websitePageDraftSchema,
});

const updateWebsitePageInputSchema = siteCommandContextSchema.extend({
  pageId: z.string().uuid(),
  expectedPageRevision: z.number().int().positive(),
  pathChangeDecision: websitePathChangeDecisionSchema,
  page: websitePageDraftSchema,
});

const sectionCommandContextSchema = siteCommandContextSchema.extend({
  pageId: z.string().uuid(),
  expectedPageRevision: z.number().int().positive(),
});

const createWebsiteSectionInputSchema = sectionCommandContextSchema.extend({
  section: websiteSectionSchema,
});

const updateWebsiteSectionInputSchema = sectionCommandContextSchema.extend({
  expectedSectionRevision: z.number().int().positive(),
  section: websiteSectionSchema,
});

const reorderWebsiteSectionsInputSchema = sectionCommandContextSchema.extend({
  sectionIds: z
    .array(z.string().uuid())
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, "Dubbele sectie-ID"),
});

const deleteWebsiteSectionInputSchema = sectionCommandContextSchema.extend({
  sectionId: z.string().uuid(),
  expectedSectionRevision: z.number().int().positive(),
});

export type InitializeWebsiteInput = z.input<
  typeof initializeWebsiteInputSchema
>;
export type UpdateWebsiteSettingsInput = z.input<
  typeof updateWebsiteSettingsInputSchema
>;
export type WebsitePageDraft = z.infer<typeof websitePageDraftSchema>;
export type CreateWebsitePageInput = z.input<
  typeof createWebsitePageInputSchema
>;
export type UpdateWebsitePageInput = z.input<
  typeof updateWebsitePageInputSchema
>;
export type { WebsitePathChangeDecision };
export type CreateWebsiteSectionInput = z.input<
  typeof createWebsiteSectionInputSchema
>;
export type UpdateWebsiteSectionInput = z.input<
  typeof updateWebsiteSectionInputSchema
>;
export type ReorderWebsiteSectionsInput = z.input<
  typeof reorderWebsiteSectionsInputSchema
>;
export type DeleteWebsiteSectionInput = z.input<
  typeof deleteWebsiteSectionInputSchema
>;

export type WebsiteAdminOverview = {
  tenantName: string;
  site: null | {
    id: string;
    name: string;
    status: string;
    deliveryMode: "managed_cms" | "custom_nextjs";
    authoringRevision: number;
    deliveryRevision: number;
    canonicalHostname: string | null;
    canonicalDomainStatus: string | null;
    activePublicationSequence: number | null;
    activePublicationHash: string | null;
    activeCustomReleaseId: string | null;
    pageCount: number;
    draftPageCount: number;
    updatedAt: string;
  };
};

export type WebsiteSettingsView = {
  id: string;
  status: string;
  deliveryMode: "managed_cms" | "custom_nextjs";
  authoringRevision: number;
  deliveryRevision: number;
  settings: WebsiteSiteSettings;
};

export type WebsitePageListItem = {
  id: string;
  title: string;
  navigationLabel: string | null;
  path: string;
  pageType: WebsitePageType;
  status: "draft" | "published" | "archived";
  isHomepage: boolean;
  indexable: boolean;
  authoringRevision: number;
  sectionCount: number;
  updatedAt: string;
};

export type WebsitePagesView = {
  siteId: string;
  siteName: string;
  authoringRevision: number;
  deliveryMode: "managed_cms" | "custom_nextjs";
  pages: WebsitePageListItem[];
};

export type WebsitePageDetail = WebsitePageListItem & {
  siteId: string;
  siteName: string;
  siteAuthoringRevision: number;
  locale: string;
  slug: string;
  seo: WebsiteSeo;
  sections: Array<
    WebsiteSection & {
      position: number;
      authoringRevision: number;
    }
  >;
};

type SiteIdentityRow = {
  id: string;
  authoring_revision: number;
  tenant_is_active: boolean;
  tenant_status: string;
  module_enabled: boolean;
};

async function inTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function requireOne<T>(rows: T[], message: string): T {
  const row = rows[0];
  if (!row) throw new Error(message);
  return row;
}

function asIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

async function lockSite(
  client: PoolClient,
  input: {
    tenantId: string;
    siteId: string;
    expectedAuthoringRevision: number;
  },
): Promise<SiteIdentityRow> {
  const result = await client.query<SiteIdentityRow>(
    `SELECT site.id, site.authoring_revision,
            tenant.is_active AS tenant_is_active,
            tenant.status AS tenant_status,
            EXISTS (
              SELECT 1
              FROM public.tenant_modules entitlement
              JOIN public.modules module ON module.id = entitlement.module_id
              WHERE entitlement.tenant_id = site.tenant_id
                AND module.key = 'website'
                AND entitlement.is_enabled = true
            ) AS module_enabled
     FROM public.website_sites site
     JOIN public.tenants tenant ON tenant.id = site.tenant_id
     WHERE site.tenant_id = $1 AND site.id = $2
       AND site.is_primary = true AND site.status <> 'disabled'
     FOR UPDATE OF site`,
    [input.tenantId, input.siteId],
  );
  const site = requireOne(result.rows, "Website niet gevonden");
  if (
    !site.tenant_is_active ||
    !["trial", "active"].includes(site.tenant_status)
  ) {
    throw new Error("De tenant is niet actief");
  }
  if (!site.module_enabled) throw new Error("De website-module is niet actief");
  if (Number(site.authoring_revision) !== input.expectedAuthoringRevision) {
    throw new Error("Website is intussen gewijzigd. Laad de pagina opnieuw.");
  }
  return site;
}

async function beginSectionMutation(
  client: PoolClient,
  input: {
    tenantId: string;
    siteId: string;
    pageId: string;
    actorUserId: string;
    expectedAuthoringRevision: number;
    expectedPageRevision: number;
  },
): Promise<void> {
  await lockSite(client, input);
  const pageResult = await client.query<{ authoring_revision: number }>(
    `SELECT authoring_revision
     FROM public.website_pages
     WHERE tenant_id = $1 AND site_id = $2 AND id = $3
       AND status <> 'archived'
     FOR UPDATE`,
    [input.tenantId, input.siteId, input.pageId],
  );
  const page = requireOne(pageResult.rows, "Pagina niet gevonden");
  if (Number(page.authoring_revision) !== input.expectedPageRevision) {
    throw new Error("Pagina is intussen gewijzigd. Laad de pagina opnieuw.");
  }
  await client.query(
    `SELECT set_config('fieldgrid.website_child_authoring_touch', 'suppressed', true)`,
  );
}

async function finishSectionMutation(
  client: PoolClient,
  input: {
    tenantId: string;
    siteId: string;
    pageId: string;
    actorUserId: string;
    expectedAuthoringRevision: number;
    expectedPageRevision: number;
  },
): Promise<{
  pageAuthoringRevision: number;
  siteAuthoringRevision: number;
}> {
  const pageResult = await client.query<{ authoring_revision: number }>(
    `UPDATE public.website_pages
     SET authoring_revision = authoring_revision + 1,
         updated_by = $5,
         updated_at = now()
     WHERE tenant_id = $1 AND site_id = $2 AND id = $3
       AND authoring_revision = $4
       AND status <> 'archived'
     RETURNING authoring_revision`,
    [
      input.tenantId,
      input.siteId,
      input.pageId,
      input.expectedPageRevision,
      input.actorUserId,
    ],
  );
  const page = requireOne(
    pageResult.rows,
    "Pagina is intussen gewijzigd. Laad de pagina opnieuw.",
  );

  await client.query(
    `SELECT set_config('fieldgrid.website_authoring_touch', 'allowed', true)`,
  );
  const siteResult = await client.query<{ authoring_revision: number }>(
    `UPDATE public.website_sites
     SET authoring_revision = authoring_revision + 1,
         updated_by = $4,
         updated_at = now()
     WHERE tenant_id = $1 AND id = $2 AND authoring_revision = $3
     RETURNING authoring_revision`,
    [
      input.tenantId,
      input.siteId,
      input.expectedAuthoringRevision,
      input.actorUserId,
    ],
  );
  const site = requireOne(
    siteResult.rows,
    "Website is intussen gewijzigd. Laad de pagina opnieuw.",
  );
  return {
    pageAuthoringRevision: Number(page.authoring_revision),
    siteAuthoringRevision: Number(site.authoring_revision),
  };
}

export async function getWebsiteAdminOverview(
  tenantId: string,
): Promise<WebsiteAdminOverview> {
  const parsedTenantId = z.string().uuid().parse(tenantId);
  const tenantResult = await pool.query<{ name: string }>(
    `SELECT name FROM public.tenants WHERE id = $1`,
    [parsedTenantId],
  );
  const tenant = requireOne(tenantResult.rows, "Tenant niet gevonden");

  const result = await pool.query<{
    id: string;
    name: string;
    status: string;
    delivery_mode: "managed_cms" | "custom_nextjs";
    authoring_revision: number;
    delivery_revision: number;
    canonical_hostname: string | null;
    canonical_domain_status: string | null;
    active_publication_sequence: number | null;
    active_publication_hash: string | null;
    active_custom_release_id: string | null;
    page_count: number;
    draft_page_count: number;
    updated_at: Date | string;
  }>(
    `SELECT
       site.id,
       site.name,
       site.status,
       site.delivery_mode,
       site.authoring_revision,
       site.delivery_revision,
       domain.hostname AS canonical_hostname,
       domain.status AS canonical_domain_status,
       publication.sequence AS active_publication_sequence,
       publication.content_hash AS active_publication_hash,
       deployment.release_id AS active_custom_release_id,
       (SELECT count(*)::integer FROM public.website_pages page
        WHERE page.tenant_id = site.tenant_id AND page.site_id = site.id
          AND page.status <> 'archived') AS page_count,
       (SELECT count(*)::integer FROM public.website_pages page
        WHERE page.tenant_id = site.tenant_id AND page.site_id = site.id
          AND page.status = 'draft') AS draft_page_count,
       site.updated_at
     FROM public.website_sites site
     LEFT JOIN public.website_domain_bindings domain
       ON domain.tenant_id = site.tenant_id
      AND domain.site_id = site.id
      AND domain.is_primary = true
     LEFT JOIN public.website_publications publication
       ON publication.tenant_id = site.tenant_id
      AND publication.site_id = site.id
      AND publication.id = site.active_publication_id
     LEFT JOIN public.website_custom_deployments deployment
       ON deployment.tenant_id = site.tenant_id
      AND deployment.site_id = site.id
      AND deployment.id = site.active_custom_deployment_id
     WHERE site.tenant_id = $1
       AND site.is_primary = true
       AND site.status <> 'disabled'
     LIMIT 1`,
    [parsedTenantId],
  );
  const site = result.rows[0];
  return {
    tenantName: tenant.name,
    site: site
      ? {
          id: site.id,
          name: site.name,
          status: site.status,
          deliveryMode: site.delivery_mode,
          authoringRevision: Number(site.authoring_revision),
          deliveryRevision: Number(site.delivery_revision),
          canonicalHostname: site.canonical_hostname,
          canonicalDomainStatus: site.canonical_domain_status,
          activePublicationSequence:
            site.active_publication_sequence === null
              ? null
              : Number(site.active_publication_sequence),
          activePublicationHash: site.active_publication_hash,
          activeCustomReleaseId: site.active_custom_release_id,
          pageCount: Number(site.page_count),
          draftPageCount: Number(site.draft_page_count),
          updatedAt: asIsoString(site.updated_at),
        }
      : null,
  };
}

export async function getWebsiteSettings(
  tenantId: string,
): Promise<WebsiteSettingsView | null> {
  const parsedTenantId = z.string().uuid().parse(tenantId);
  const result = await pool.query<{
    id: string;
    name: string;
    status: string;
    delivery_mode: "managed_cms" | "custom_nextjs";
    delivery_revision: number;
    default_locale: string;
    theme: unknown;
    contact: unknown;
    social_links: unknown;
    default_seo: unknown;
    analytics: unknown;
    seo_settings: unknown;
    authoring_revision: number;
  }>(
    `SELECT id, name, status, delivery_mode, delivery_revision,
            default_locale, theme, contact, social_links, default_seo,
            analytics, seo_settings, authoring_revision
     FROM public.website_sites
     WHERE tenant_id = $1 AND is_primary = true AND status <> 'disabled'
     LIMIT 1`,
    [parsedTenantId],
  );
  const site = result.rows[0];
  if (!site) return null;

  return {
    id: site.id,
    status: site.status,
    deliveryMode: site.delivery_mode,
    authoringRevision: Number(site.authoring_revision),
    deliveryRevision: Number(site.delivery_revision),
    settings: websiteSiteSettingsSchema.parse({
      schemaVersion: 1,
      name: site.name,
      defaultLocale: site.default_locale,
      theme: site.theme,
      contact: site.contact,
      socialLinks: site.social_links,
      defaultSeo: site.default_seo,
      analytics: site.analytics,
      seoSettings: site.seo_settings,
    }),
  };
}

export async function listWebsitePages(
  tenantId: string,
): Promise<WebsitePagesView | null> {
  const parsedTenantId = z.string().uuid().parse(tenantId);
  const siteResult = await pool.query<{
    id: string;
    name: string;
    authoring_revision: number;
    delivery_mode: "managed_cms" | "custom_nextjs";
  }>(
    `SELECT id, name, authoring_revision, delivery_mode
     FROM public.website_sites
     WHERE tenant_id = $1 AND is_primary = true AND status <> 'disabled'
     LIMIT 1`,
    [parsedTenantId],
  );
  const site = siteResult.rows[0];
  if (!site) return null;

  const pagesResult = await pool.query<{
    id: string;
    title: string;
    navigation_label: string | null;
    path: string;
    page_type: WebsitePageType;
    status: "draft" | "published" | "archived";
    is_homepage: boolean;
    seo: WebsiteSeo;
    authoring_revision: number;
    section_count: number;
    updated_at: Date | string;
  }>(
    `SELECT page.id, page.title, page.navigation_label, page.path,
            page.page_type, page.status, page.is_homepage, page.seo,
            page.authoring_revision, page.updated_at,
            count(section.id)::integer AS section_count
     FROM public.website_pages page
     LEFT JOIN public.website_page_sections section
       ON section.tenant_id = page.tenant_id
      AND section.site_id = page.site_id
      AND section.page_id = page.id
     WHERE page.tenant_id = $1 AND page.site_id = $2
     GROUP BY page.id
     ORDER BY page.is_homepage DESC, page.path, page.id`,
    [parsedTenantId, site.id],
  );

  return {
    siteId: site.id,
    siteName: site.name,
    authoringRevision: Number(site.authoring_revision),
    deliveryMode: site.delivery_mode,
    pages: pagesResult.rows.map((page) => ({
      id: page.id,
      title: page.title,
      navigationLabel: page.navigation_label,
      path: page.path,
      pageType: page.page_type,
      status: page.status,
      isHomepage: page.is_homepage,
      indexable: websiteSeoSchema.parse(page.seo).indexable,
      authoringRevision: Number(page.authoring_revision),
      sectionCount: Number(page.section_count),
      updatedAt: asIsoString(page.updated_at),
    })),
  };
}

export async function getWebsitePage(
  tenantId: string,
  pageId: string,
): Promise<WebsitePageDetail | null> {
  const parsedTenantId = z.string().uuid().parse(tenantId);
  const parsedPageId = z.string().uuid().parse(pageId);
  const result = await pool.query<{
    id: string;
    site_id: string;
    site_name: string;
    site_authoring_revision: number;
    title: string;
    navigation_label: string | null;
    locale: string;
    slug: string;
    path: string;
    page_type: WebsitePageType;
    status: "draft" | "published" | "archived";
    is_homepage: boolean;
    seo: WebsiteSeo;
    authoring_revision: number;
    updated_at: Date | string;
  }>(
    `SELECT page.id, page.site_id, site.name AS site_name,
            site.authoring_revision AS site_authoring_revision,
            page.title, page.navigation_label, page.locale, page.slug,
            page.path, page.page_type, page.status, page.is_homepage,
            page.seo, page.authoring_revision, page.updated_at
     FROM public.website_pages page
     JOIN public.website_sites site
       ON site.tenant_id = page.tenant_id AND site.id = page.site_id
     WHERE page.tenant_id = $1 AND page.id = $2
       AND site.is_primary = true AND site.status <> 'disabled'
     LIMIT 1`,
    [parsedTenantId, parsedPageId],
  );
  const page = result.rows[0];
  if (!page) return null;

  const sectionsResult = await pool.query<{
    id: string;
    section_key: string;
    schema_version: number;
    variant_key: string;
    position: number;
    content: unknown;
    is_visible: boolean;
    authoring_revision: number;
  }>(
    `SELECT id, section_key, schema_version, variant_key, position, content,
            is_visible, authoring_revision
     FROM public.website_page_sections
     WHERE tenant_id = $1 AND site_id = $2 AND page_id = $3
     ORDER BY position, id`,
    [parsedTenantId, page.site_id, parsedPageId],
  );
  const seo = websiteSeoSchema.parse(page.seo);
  return {
    id: page.id,
    siteId: page.site_id,
    siteName: page.site_name,
    siteAuthoringRevision: Number(page.site_authoring_revision),
    title: page.title,
    navigationLabel: page.navigation_label,
    locale: page.locale,
    slug: page.slug,
    path: page.path,
    pageType: page.page_type,
    status: page.status,
    isHomepage: page.is_homepage,
    indexable: seo.indexable,
    seo,
    authoringRevision: Number(page.authoring_revision),
    sectionCount: sectionsResult.rows.length,
    updatedAt: asIsoString(page.updated_at),
    sections: sectionsResult.rows.map((section) => ({
      ...websiteSectionSchema.parse({
        id: section.id,
        type: section.section_key,
        schemaVersion: Number(section.schema_version),
        variant: section.variant_key,
        visible: section.is_visible,
        content: section.content,
      }),
      position: Number(section.position),
      authoringRevision: Number(section.authoring_revision),
    })),
  };
}

export async function initializeManagedWebsite(
  rawInput: InitializeWebsiteInput,
): Promise<{ siteId: string; authoringRevision: number }> {
  const input = initializeWebsiteInputSchema.parse(rawInput);
  return inTransaction(async (client) => {
    const tenantResult = await client.query<{
      name: string;
      is_active: boolean;
      status: string;
      module_enabled: boolean;
    }>(
      `SELECT tenant.name, tenant.is_active, tenant.status,
              EXISTS (
                SELECT 1
                FROM public.tenant_modules entitlement
                JOIN public.modules module ON module.id = entitlement.module_id
                WHERE entitlement.tenant_id = tenant.id
                  AND module.key = 'website'
                  AND entitlement.is_enabled = true
              ) AS module_enabled
       FROM public.tenants tenant
       WHERE tenant.id = $1
       FOR UPDATE`,
      [input.tenantId],
    );
    const tenant = requireOne(tenantResult.rows, "Tenant niet gevonden");
    if (!tenant.is_active || !["trial", "active"].includes(tenant.status)) {
      throw new Error("De tenant is niet actief");
    }
    if (!tenant.module_enabled) {
      throw new Error("De website-module is niet actief");
    }

    const existing = await client.query(
      `SELECT 1 FROM public.website_sites
       WHERE tenant_id = $1 AND status <> 'disabled'
       LIMIT 1`,
      [input.tenantId],
    );
    if (existing.rowCount) throw new Error("Er bestaat al een website");

    const settings = input.settings;
    const siteResult = await client.query<{
      id: string;
      authoring_revision: number;
    }>(
      `INSERT INTO public.website_sites (
         tenant_id, name, status, is_primary, delivery_mode,
         default_locale, theme, contact, social_links, default_seo,
         analytics, seo_settings, created_by, updated_by
       ) VALUES (
         $1, $2, 'draft', true, 'managed_cms', $3, $4::jsonb, $5::jsonb,
         $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $10
       )
       RETURNING id, authoring_revision`,
      [
        input.tenantId,
        settings.name,
        settings.defaultLocale,
        JSON.stringify(settings.theme),
        JSON.stringify(settings.contact),
        JSON.stringify(settings.socialLinks),
        JSON.stringify(settings.defaultSeo),
        JSON.stringify(settings.analytics),
        JSON.stringify(settings.seoSettings),
        input.actorUserId,
      ],
    );
    const site = requireOne(
      siteResult.rows,
      "Website kon niet worden aangemaakt",
    );
    await createDefaultWebsiteContactForm(client, {
      tenantId: input.tenantId,
      siteId: site.id,
      locale: settings.defaultLocale,
      notificationEmail: settings.contact.email,
      actorUserId: input.actorUserId,
    });
    const initializedRevisionResult = await client.query<{
      authoring_revision: number;
    }>(
      `SELECT authoring_revision
       FROM public.website_sites
       WHERE tenant_id = $1 AND id = $2`,
      [input.tenantId, site.id],
    );
    const initializedRevision = requireOne(
      initializedRevisionResult.rows,
      "Website-revisie kon niet worden gelezen",
    );
    await client.query(
      `INSERT INTO public.audit_log (
         tenant_id, user_id, action, resource, resource_id, metadata
       ) VALUES ($1, $2, 'website_initialized', 'website', $3,
                 jsonb_build_object('deliveryMode', 'managed_cms'))`,
      [input.tenantId, input.actorUserId, site.id],
    );
    return {
      siteId: site.id,
      authoringRevision: Number(initializedRevision.authoring_revision),
    };
  });
}

export async function updateWebsiteSettings(
  rawInput: UpdateWebsiteSettingsInput,
): Promise<{ siteId: string; authoringRevision: number }> {
  const input = updateWebsiteSettingsInputSchema.parse(rawInput);
  const settings = input.settings;
  return inTransaction(async (client) => {
    await lockSite(client, input);
    const result = await client.query<{
      id: string;
      authoring_revision: number;
    }>(
      `UPDATE public.website_sites
       SET name = $4,
           default_locale = $5,
           theme = $6::jsonb,
           contact = $7::jsonb,
           social_links = $8::jsonb,
           default_seo = $9::jsonb,
           analytics = $10::jsonb,
           seo_settings = $11::jsonb,
           updated_by = $12,
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2 AND authoring_revision = $3
       RETURNING id, authoring_revision`,
      [
        input.tenantId,
        input.siteId,
        input.expectedAuthoringRevision,
        settings.name,
        settings.defaultLocale,
        JSON.stringify(settings.theme),
        JSON.stringify(settings.contact),
        JSON.stringify(settings.socialLinks),
        JSON.stringify(settings.defaultSeo),
        JSON.stringify(settings.analytics),
        JSON.stringify(settings.seoSettings),
        input.actorUserId,
      ],
    );
    const site = requireOne(
      result.rows,
      "Website is intussen gewijzigd. Laad de pagina opnieuw.",
    );
    await client.query(
      `INSERT INTO public.audit_log (
         tenant_id, user_id, action, resource, resource_id, metadata
       ) VALUES ($1, $2, 'website_settings_updated', 'website', $3,
                 jsonb_build_object('fromRevision', $4::integer,
                                    'toRevision', $5::integer))`,
      [
        input.tenantId,
        input.actorUserId,
        site.id,
        input.expectedAuthoringRevision,
        Number(site.authoring_revision),
      ],
    );
    return {
      siteId: site.id,
      authoringRevision: Number(site.authoring_revision),
    };
  });
}

export async function createWebsitePage(
  rawInput: CreateWebsitePageInput,
): Promise<{ pageId: string; siteAuthoringRevision: number }> {
  const input = createWebsitePageInputSchema.parse(rawInput);
  return inTransaction(async (client) => {
    await lockSite(client, input);
    const page = input.page;
    const result = await client.query<{ id: string }>(
      `INSERT INTO public.website_pages (
         tenant_id, site_id, locale, title, navigation_label, slug, path,
         page_type, status, is_homepage, seo, created_by, updated_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $10::jsonb, $11, $11
       ) RETURNING id`,
      [
        input.tenantId,
        input.siteId,
        page.locale,
        page.title,
        page.navigationLabel,
        page.slug,
        page.path,
        page.pageType,
        page.isHomepage,
        JSON.stringify(page.seo),
        input.actorUserId,
      ],
    );
    const created = requireOne(
      result.rows,
      "Pagina kon niet worden aangemaakt",
    );
    const revisionResult = await client.query<{ authoring_revision: number }>(
      `SELECT authoring_revision FROM public.website_sites
       WHERE tenant_id = $1 AND id = $2`,
      [input.tenantId, input.siteId],
    );
    const revision = requireOne(revisionResult.rows, "Website niet gevonden");
    await client.query(
      `INSERT INTO public.audit_log (
         tenant_id, user_id, action, resource, resource_id, metadata
       ) VALUES ($1, $2, 'website_page_created', 'website_page', $3,
                 jsonb_build_object('siteId', $4::text, 'path', $5::text))`,
      [input.tenantId, input.actorUserId, created.id, input.siteId, page.path],
    );
    return {
      pageId: created.id,
      siteAuthoringRevision: Number(revision.authoring_revision),
    };
  });
}

export async function updateWebsitePage(
  rawInput: UpdateWebsitePageInput,
): Promise<{
  pageId: string;
  pageAuthoringRevision: number;
  siteAuthoringRevision: number;
}> {
  const input = updateWebsitePageInputSchema.parse(rawInput);
  return inTransaction(async (client) => {
    await lockSite(client, input);
    const page = input.page;
    const currentResult = await client.query<{
      id: string;
      locale: string;
      path: string;
      status: "draft" | "published" | "archived";
      is_homepage: boolean;
      authoring_revision: number;
    }>(
      `SELECT id, locale, path, status, is_homepage, authoring_revision
       FROM public.website_pages
       WHERE tenant_id = $1 AND site_id = $2 AND id = $3
       FOR UPDATE`,
      [input.tenantId, input.siteId, input.pageId],
    );
    const current = requireOne(currentResult.rows, "Pagina niet gevonden");
    if (Number(current.authoring_revision) !== input.expectedPageRevision) {
      throw new Error("Pagina is intussen gewijzigd. Laad de pagina opnieuw.");
    }
    if (current.status === "archived") {
      throw new Error("Een gearchiveerde pagina kan niet worden gewijzigd.");
    }
    const routeChanged =
      current.locale !== page.locale || current.path !== page.path;
    if (
      current.is_homepage &&
      (current.locale !== page.locale || page.path !== "/")
    ) {
      throw new Error("De route van de homepage kan niet worden gewijzigd.");
    }
    if (
      routeChanged &&
      current.locale !== page.locale &&
      input.pathChangeDecision === "create_redirect"
    ) {
      throw new Error(
        "Een automatische redirect kan niet tussen talen worden gemaakt. Kies expliciet voor wijzigen zonder redirect.",
      );
    }

    await client.query(
      `SELECT set_config('fieldgrid.website_child_authoring_touch', 'suppressed', true)`,
    );
    await client.query(
      `SET CONSTRAINTS
         trg_website_redirect_integrity,
         trg_website_page_route_integrity
       DEFERRED`,
    );
    const result = await client.query<{
      id: string;
      authoring_revision: number;
    }>(
      `UPDATE public.website_pages
       SET locale = $5,
           title = $6,
           navigation_label = $7,
           slug = $8,
           path = $9,
           page_type = $10,
           is_homepage = $11,
           seo = $12::jsonb,
           authoring_revision = authoring_revision + 1,
           updated_by = $13,
           updated_at = now()
       WHERE tenant_id = $1 AND site_id = $2 AND id = $3
         AND authoring_revision = $4
       RETURNING id, authoring_revision`,
      [
        input.tenantId,
        input.siteId,
        input.pageId,
        input.expectedPageRevision,
        page.locale,
        page.title,
        page.navigationLabel,
        page.slug,
        page.path,
        page.pageType,
        page.isHomepage,
        JSON.stringify(page.seo),
        input.actorUserId,
      ],
    );
    const updated = requireOne(
      result.rows,
      "Pagina is intussen gewijzigd. Laad de pagina opnieuw.",
    );

    let retargetedRedirectCount = 0;
    if (routeChanged && input.pathChangeDecision === "create_redirect") {
      const retargeted = await client.query(
        `UPDATE public.website_redirects
         SET destination = $5,
             updated_by = $4,
             updated_at = now()
         WHERE tenant_id = $1
           AND site_id = $2
           AND locale = $3
           AND destination_type = 'path'
           AND destination = $6
           AND is_active = true`,
        [
          input.tenantId,
          input.siteId,
          current.locale,
          input.actorUserId,
          page.path,
          current.path,
        ],
      );
      retargetedRedirectCount = retargeted.rowCount ?? 0;
      await client.query(
        `INSERT INTO public.website_redirects (
           tenant_id, site_id, locale, source_path, destination_type,
           destination, status_code, is_active, created_by, updated_by
         ) VALUES (
           $1, $2, $3, $4, 'path', $5, 308, true, $6, $6
         )`,
        [
          input.tenantId,
          input.siteId,
          current.locale,
          current.path,
          page.path,
          input.actorUserId,
        ],
      );
    }

    await client.query(
      `SELECT set_config('fieldgrid.website_authoring_touch', 'allowed', true)`,
    );
    const revisionResult = await client.query<{ authoring_revision: number }>(
      `UPDATE public.website_sites
       SET authoring_revision = authoring_revision + 1,
           updated_by = $4,
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2 AND authoring_revision = $3
       RETURNING authoring_revision`,
      [
        input.tenantId,
        input.siteId,
        input.expectedAuthoringRevision,
        input.actorUserId,
      ],
    );
    const revision = requireOne(
      revisionResult.rows,
      "Website is intussen gewijzigd. Laad de pagina opnieuw.",
    );
    await client.query(
      `INSERT INTO public.audit_log (
         tenant_id, user_id, action, resource, resource_id, metadata
       ) VALUES ($1, $2, 'website_page_updated', 'website_page', $3,
                 jsonb_build_object(
                   'siteId', $4::text,
                   'fromPageRevision', $5::integer,
                   'toPageRevision', $6::integer,
                   'fromRoute', $7::text,
                   'toRoute', $8::text,
                   'pathChangeDecision', $9::text,
                   'retargetedRedirectCount', $10::integer
                 ))`,
      [
        input.tenantId,
        input.actorUserId,
        updated.id,
        input.siteId,
        input.expectedPageRevision,
        Number(updated.authoring_revision),
        `${current.locale}:${current.path}`,
        `${page.locale}:${page.path}`,
        routeChanged ? input.pathChangeDecision : "unchanged",
        retargetedRedirectCount,
      ],
    );
    return {
      pageId: updated.id,
      pageAuthoringRevision: Number(updated.authoring_revision),
      siteAuthoringRevision: Number(revision.authoring_revision),
    };
  });
}

type WebsiteSectionMutationResult = {
  sectionId: string;
  sectionAuthoringRevision?: number;
  pageAuthoringRevision: number;
  siteAuthoringRevision: number;
};

export async function createWebsiteSection(
  rawInput: CreateWebsiteSectionInput,
): Promise<WebsiteSectionMutationResult> {
  const input = createWebsiteSectionInputSchema.parse(rawInput);
  return inTransaction(async (client) => {
    await beginSectionMutation(client, input);
    const countResult = await client.query<{ count: number; position: number }>(
      `SELECT count(*)::integer AS count,
              COALESCE(max(position), -1)::integer + 1 AS position
       FROM public.website_page_sections
       WHERE tenant_id = $1 AND site_id = $2 AND page_id = $3`,
      [input.tenantId, input.siteId, input.pageId],
    );
    const sectionCount = requireOne(countResult.rows, "Pagina niet gevonden");
    if (Number(sectionCount.count) >= 100) {
      throw new Error("Een pagina mag maximaal 100 secties bevatten");
    }

    const section = input.section;
    const createdResult = await client.query<{
      id: string;
      authoring_revision: number;
    }>(
      `INSERT INTO public.website_page_sections (
         id, tenant_id, site_id, page_id, section_key, schema_version,
         variant_key, position, content, is_visible, created_by, updated_by
       ) VALUES (
         $4, $1, $2, $3, $5, $6, $7, $8, $9::jsonb, $10, $11, $11
       )
       RETURNING id, authoring_revision`,
      [
        input.tenantId,
        input.siteId,
        input.pageId,
        section.id,
        section.type,
        section.schemaVersion,
        section.variant,
        Number(sectionCount.position),
        JSON.stringify(section.content),
        section.visible,
        input.actorUserId,
      ],
    );
    const created = requireOne(
      createdResult.rows,
      "Sectie kon niet worden aangemaakt",
    );
    const revisions = await finishSectionMutation(client, input);
    await client.query(
      `INSERT INTO public.audit_log (
         tenant_id, user_id, action, resource, resource_id, metadata
       ) VALUES ($1, $2, 'website_section_created', 'website_page_section', $3,
                 jsonb_build_object('siteId', $4::text,
                                    'pageId', $5::text,
                                    'sectionType', $6::text))`,
      [
        input.tenantId,
        input.actorUserId,
        created.id,
        input.siteId,
        input.pageId,
        section.type,
      ],
    );
    return {
      sectionId: created.id,
      sectionAuthoringRevision: Number(created.authoring_revision),
      ...revisions,
    };
  });
}

export async function updateWebsiteSection(
  rawInput: UpdateWebsiteSectionInput,
): Promise<WebsiteSectionMutationResult> {
  const input = updateWebsiteSectionInputSchema.parse(rawInput);
  return inTransaction(async (client) => {
    await beginSectionMutation(client, input);
    const section = input.section;
    const updatedResult = await client.query<{
      id: string;
      authoring_revision: number;
    }>(
      `UPDATE public.website_page_sections
       SET variant_key = $8,
           content = $9::jsonb,
           is_visible = $10,
           authoring_revision = authoring_revision + 1,
           updated_by = $11,
           updated_at = now()
       WHERE tenant_id = $1 AND site_id = $2 AND page_id = $3 AND id = $4
         AND authoring_revision = $5
         AND section_key = $6 AND schema_version = $7
       RETURNING id, authoring_revision`,
      [
        input.tenantId,
        input.siteId,
        input.pageId,
        section.id,
        input.expectedSectionRevision,
        section.type,
        section.schemaVersion,
        section.variant,
        JSON.stringify(section.content),
        section.visible,
        input.actorUserId,
      ],
    );
    const updated = requireOne(
      updatedResult.rows,
      "Sectie is intussen gewijzigd. Laad de pagina opnieuw.",
    );
    const revisions = await finishSectionMutation(client, input);
    await client.query(
      `INSERT INTO public.audit_log (
         tenant_id, user_id, action, resource, resource_id, metadata
       ) VALUES ($1, $2, 'website_section_updated', 'website_page_section', $3,
                 jsonb_build_object(
                   'siteId', $4::text,
                   'pageId', $5::text,
                   'fromSectionRevision', $6::integer,
                   'toSectionRevision', $7::integer
                 ))`,
      [
        input.tenantId,
        input.actorUserId,
        updated.id,
        input.siteId,
        input.pageId,
        input.expectedSectionRevision,
        Number(updated.authoring_revision),
      ],
    );
    return {
      sectionId: updated.id,
      sectionAuthoringRevision: Number(updated.authoring_revision),
      ...revisions,
    };
  });
}

export async function reorderWebsiteSections(
  rawInput: ReorderWebsiteSectionsInput,
): Promise<Omit<WebsiteSectionMutationResult, "sectionId">> {
  const input = reorderWebsiteSectionsInputSchema.parse(rawInput);
  return inTransaction(async (client) => {
    await beginSectionMutation(client, input);
    const currentResult = await client.query<{ id: string; position: number }>(
      `SELECT id, position
       FROM public.website_page_sections
       WHERE tenant_id = $1 AND site_id = $2 AND page_id = $3
       ORDER BY position, id
       FOR UPDATE`,
      [input.tenantId, input.siteId, input.pageId],
    );
    const currentIds = new Set(currentResult.rows.map((section) => section.id));
    if (
      currentIds.size !== input.sectionIds.length ||
      input.sectionIds.some((id) => !currentIds.has(id))
    ) {
      throw new Error(
        "De sectielijst is intussen gewijzigd. Laad de pagina opnieuw.",
      );
    }
    const offset =
      Math.max(-1, ...currentResult.rows.map((section) => section.position)) +
      currentResult.rows.length +
      1;
    await client.query(
      `UPDATE public.website_page_sections
       SET position = position + $4,
           updated_by = $5,
           updated_at = now()
       WHERE tenant_id = $1 AND site_id = $2 AND page_id = $3`,
      [input.tenantId, input.siteId, input.pageId, offset, input.actorUserId],
    );
    const reorderedResult = await client.query(
      `UPDATE public.website_page_sections AS section
       SET position = (ordering.ordinal - 1)::integer,
           authoring_revision = authoring_revision + 1,
           updated_by = $5,
           updated_at = now()
       FROM unnest($4::uuid[]) WITH ORDINALITY AS ordering(id, ordinal)
       WHERE section.tenant_id = $1 AND section.site_id = $2
         AND section.page_id = $3 AND section.id = ordering.id`,
      [
        input.tenantId,
        input.siteId,
        input.pageId,
        input.sectionIds,
        input.actorUserId,
      ],
    );
    if (reorderedResult.rowCount !== input.sectionIds.length) {
      throw new Error(
        "De sectielijst is intussen gewijzigd. Laad de pagina opnieuw.",
      );
    }
    const revisions = await finishSectionMutation(client, input);
    await client.query(
      `INSERT INTO public.audit_log (
         tenant_id, user_id, action, resource, resource_id, metadata
       ) VALUES ($1, $2, 'website_sections_reordered', 'website_page', $3,
                 jsonb_build_object('siteId', $4::text,
                                    'sectionCount', $5::integer))`,
      [
        input.tenantId,
        input.actorUserId,
        input.pageId,
        input.siteId,
        input.sectionIds.length,
      ],
    );
    return revisions;
  });
}

export async function deleteWebsiteSection(
  rawInput: DeleteWebsiteSectionInput,
): Promise<WebsiteSectionMutationResult> {
  const input = deleteWebsiteSectionInputSchema.parse(rawInput);
  return inTransaction(async (client) => {
    await beginSectionMutation(client, input);
    const deletedResult = await client.query<{ id: string }>(
      `DELETE FROM public.website_page_sections
       WHERE tenant_id = $1 AND site_id = $2 AND page_id = $3 AND id = $4
         AND authoring_revision = $5
       RETURNING id`,
      [
        input.tenantId,
        input.siteId,
        input.pageId,
        input.sectionId,
        input.expectedSectionRevision,
      ],
    );
    const deleted = requireOne(
      deletedResult.rows,
      "Sectie is intussen gewijzigd. Laad de pagina opnieuw.",
    );
    const revisions = await finishSectionMutation(client, input);
    await client.query(
      `INSERT INTO public.audit_log (
         tenant_id, user_id, action, resource, resource_id, metadata
       ) VALUES ($1, $2, 'website_section_deleted', 'website_page_section', $3,
                 jsonb_build_object('siteId', $4::text,
                                    'pageId', $5::text,
                                    'sectionRevision', $6::integer))`,
      [
        input.tenantId,
        input.actorUserId,
        deleted.id,
        input.siteId,
        input.pageId,
        input.expectedSectionRevision,
      ],
    );
    return { sectionId: deleted.id, ...revisions };
  });
}
