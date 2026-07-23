import type { PoolClient } from "pg";
import { z } from "zod/v4";
import {
  WebsitePublicationValidationError,
  buildWebsiteDraftPreviewSnapshot,
  buildWebsitePublicationSnapshot,
  serializeWebsitePublication,
  websitePublicationSnapshotSchema,
  websitePublicationSourceSchema,
  type WebsitePublicationDiagnostic,
  type WebsitePublicationSnapshot,
  type WebsitePublicationSource,
} from "@workspace/website-core";
import { pool } from "./connection";

const uuidSchema = z.string().uuid();
const tokenHashSchema = z.string().regex(/^[0-9a-f]{64}$/u);

const reviewInputSchema = z
  .object({
    tenantId: uuidSchema,
    siteId: uuidSchema,
  })
  .strict();

const createPreviewInputSchema = reviewInputSchema
  .extend({
    actorUserId: uuidSchema,
    tokenHash: tokenHashSchema,
    expectedAuthoringRevision: z.number().int().positive(),
  })
  .strict();

const loadPreviewInputSchema = z
  .object({
    tenantId: uuidSchema,
    actorUserId: uuidSchema,
    tokenHash: tokenHashSchema,
  })
  .strict();

const includePageInputSchema = reviewInputSchema
  .extend({
    actorUserId: uuidSchema,
    pageId: uuidSchema,
    expectedAuthoringRevision: z.number().int().positive(),
    expectedPageRevision: z.number().int().positive(),
  })
  .strict();

export type WebsitePublicationReviewDiagnostic =
  WebsitePublicationDiagnostic & {
    severity: "error" | "warning";
  };

export type WebsitePublicationReview = {
  siteId: string;
  authoringRevision: number;
  deliveryRevision: number;
  deliveryMode: "managed_cms" | "custom_nextjs";
  canonicalHostname: string | null;
  activePublication: {
    id: string;
    sequence: number;
    sourceRevision: number;
    contentHash: string;
  } | null;
  readyPublication: {
    id: string;
    sequence: number;
    sourceRevision: number;
    targetDeliveryRevision: number;
    contentHash: string;
  } | null;
  pages: Array<{
    id: string;
    title: string;
    path: string;
    status: "draft" | "published" | "archived";
    authoringRevision: number;
  }>;
  changes: {
    settings: boolean;
    navigation: boolean;
    redirects: boolean;
    pages: Array<{
      id: string;
      title: string;
      path: string;
      kind: "added" | "changed" | "removed";
    }>;
  };
  diagnostics: WebsitePublicationReviewDiagnostic[];
  previewAvailable: boolean;
  canPreparePublication: boolean;
};

export type WebsitePreviewSession = {
  siteId: string;
  sourceRevision: number;
  expiresAt: string;
  snapshot: WebsitePublicationSnapshot;
};

type SourceSiteRow = {
  id: string;
  tenant_id: string;
  authoring_revision: number;
  delivery_revision: number;
  delivery_mode: "managed_cms" | "custom_nextjs";
  default_locale: string;
  theme: unknown;
  contact: unknown;
  social_links: unknown;
  default_seo: unknown;
  canonical_hostname: string | null;
  tenant_is_active: boolean;
  tenant_status: string;
  module_enabled: boolean;
};

type SourcePageRow = {
  id: string;
  locale: string;
  path: string;
  page_type: string;
  title: string;
  seo: unknown;
  status: "draft" | "published" | "archived";
  is_homepage: boolean;
  authoring_revision: number;
};

type SourceSectionRow = {
  id: string;
  page_id: string;
  section_key: string;
  schema_version: number;
  variant_key: string;
  position: number;
  content: unknown;
  is_visible: boolean;
};

type SourceNavigationRow = {
  id: string;
  label: string;
  location: string;
  parent_id: string | null;
  page_id: string | null;
  link_type: string;
  href: string | null;
  target: string;
  position: number;
  is_visible: boolean;
};

type SourceRedirectRow = {
  id: string;
  locale: string;
  source_path: string;
  destination_type: "path" | "external";
  destination: string;
  status_code: 301 | 302 | 308;
  is_active: boolean;
};

type LoadedSource = {
  site: SourceSiteRow;
  pages: SourcePageRow[];
  source: WebsitePublicationSource;
  hasCanonicalDomain: boolean;
};

function requireOne<T>(rows: T[], message: string): T {
  const row = rows[0];
  if (!row) throw new Error(message);
  return row;
}

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

async function loadWebsiteSource(
  query: Pick<PoolClient, "query">,
  tenantId: string,
  siteId: string,
): Promise<LoadedSource> {
  const siteResult = await query.query<SourceSiteRow>(
    `SELECT
       site.id,
       site.tenant_id,
       site.authoring_revision,
       site.delivery_revision,
       site.delivery_mode,
       site.default_locale,
       site.theme,
       site.contact,
       site.social_links,
       site.default_seo,
       domain.hostname AS canonical_hostname,
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
     LEFT JOIN public.website_domain_bindings domain
       ON domain.tenant_id = site.tenant_id
      AND domain.site_id = site.id
      AND domain.status = 'active'
      AND domain.is_primary = true
     WHERE site.tenant_id = $1
       AND site.id = $2
       AND site.status <> 'disabled'
     LIMIT 2`,
    [tenantId, siteId],
  );
  if (siteResult.rows.length !== 1) {
    throw new Error(
      "Website niet gevonden of primaire domeinbinding is dubbel",
    );
  }
  const site = siteResult.rows[0]!;
  if (
    !site.tenant_is_active ||
    !["trial", "active"].includes(site.tenant_status) ||
    !site.module_enabled
  ) {
    throw new Error("Website-module is niet actief voor deze tenant");
  }

  const [pageResult, sectionResult, navigationResult, redirectResult] =
    await Promise.all([
      query.query<SourcePageRow>(
        `SELECT id, locale, path, page_type, title, seo, status, is_homepage,
              authoring_revision
       FROM public.website_pages
       WHERE tenant_id = $1 AND site_id = $2
       ORDER BY locale, path, id`,
        [tenantId, siteId],
      ),
      query.query<SourceSectionRow>(
        `SELECT id, page_id, section_key, schema_version, variant_key, position,
              content, is_visible
       FROM public.website_page_sections
       WHERE tenant_id = $1 AND site_id = $2
       ORDER BY page_id, position, id`,
        [tenantId, siteId],
      ),
      query.query<SourceNavigationRow>(
        `SELECT id, label, location, parent_id, page_id, link_type, href, target,
              position, is_visible
       FROM public.website_navigation_items
       WHERE tenant_id = $1 AND site_id = $2
       ORDER BY location, position, id`,
        [tenantId, siteId],
      ),
      query.query<SourceRedirectRow>(
        `SELECT id, locale, source_path, destination_type, destination,
              status_code, is_active
       FROM public.website_redirects
       WHERE tenant_id = $1 AND site_id = $2
       ORDER BY locale, source_path, id`,
        [tenantId, siteId],
      ),
    ]);

  const sectionsByPage = new Map<string, SourceSectionRow[]>();
  for (const section of sectionResult.rows) {
    const list = sectionsByPage.get(section.page_id) ?? [];
    list.push(section);
    sectionsByPage.set(section.page_id, list);
  }

  const source = websitePublicationSourceSchema.parse({
    site: {
      id: site.id,
      authoringRevision: Number(site.authoring_revision),
      deliveryRevision: Number(site.delivery_revision),
      defaultLocale: site.default_locale,
      theme: site.theme,
      contact: site.contact,
      socialLinks: site.social_links,
      defaultSeo: site.default_seo,
    },
    canonicalHostname: site.canonical_hostname ?? "preview.invalid",
    pages: pageResult.rows.map((page) => ({
      id: page.id,
      locale: page.locale,
      path: page.path,
      pageType: page.page_type,
      title: page.title,
      seo: page.seo,
      status: page.status,
      isHomepage: page.is_homepage,
      sections: (sectionsByPage.get(page.id) ?? []).map((section) => ({
        id: section.id,
        sectionKey: section.section_key,
        schemaVersion: Number(section.schema_version),
        variantKey: section.variant_key,
        position: Number(section.position),
        content: section.content,
        isVisible: section.is_visible,
      })),
    })),
    navigation: navigationResult.rows.map((item) => ({
      id: item.id,
      label: item.label,
      location: item.location,
      parentId: item.parent_id,
      pageId: item.page_id,
      linkType: item.link_type,
      href: item.href,
      target: item.target,
      position: Number(item.position),
      isVisible: item.is_visible,
    })),
    redirects: redirectResult.rows.map((redirect) => ({
      id: redirect.id,
      locale: redirect.locale,
      sourcePath: redirect.source_path,
      destinationType: redirect.destination_type,
      destination: redirect.destination,
      statusCode: Number(redirect.status_code),
      isActive: redirect.is_active,
    })),
  });

  return {
    site,
    pages: pageResult.rows,
    source,
    hasCanonicalDomain: Boolean(site.canonical_hostname),
  };
}

function compilerDiagnostics(callback: () => WebsitePublicationSnapshot): {
  snapshot: WebsitePublicationSnapshot | null;
  diagnostics: WebsitePublicationDiagnostic[];
} {
  try {
    return { snapshot: callback(), diagnostics: [] };
  } catch (error) {
    if (error instanceof WebsitePublicationValidationError) {
      return { snapshot: null, diagnostics: error.diagnostics };
    }
    throw error;
  }
}

function stableSnapshotPart(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(stableSnapshotPart).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSnapshotPart(record[key])}`)
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Websitevergelijking bevat een niet-JSON waarde");
  }
  return serialized;
}

function publicationChanges(
  current: WebsitePublicationSnapshot | null,
  active: WebsitePublicationSnapshot | null,
): WebsitePublicationReview["changes"] {
  if (!current) {
    return {
      settings: false,
      navigation: false,
      redirects: false,
      pages: [],
    };
  }
  const currentPages = new Map(current.pages.map((page) => [page.id, page]));
  const activePages = new Map(
    (active?.pages ?? []).map((page) => [page.id, page]),
  );
  const pageIds = new Set([...currentPages.keys(), ...activePages.keys()]);
  const pages: WebsitePublicationReview["changes"]["pages"] = [];

  for (const id of pageIds) {
    const next = currentPages.get(id);
    const previous = activePages.get(id);
    if (!previous && next) {
      pages.push({ id, title: next.title, path: next.path, kind: "added" });
    } else if (previous && !next) {
      pages.push({
        id,
        title: previous.title,
        path: previous.path,
        kind: "removed",
      });
    } else if (
      previous &&
      next &&
      stableSnapshotPart(previous) !== stableSnapshotPart(next)
    ) {
      pages.push({ id, title: next.title, path: next.path, kind: "changed" });
    }
  }

  return {
    settings:
      !active ||
      stableSnapshotPart({
        canonicalHostname: active.canonicalHostname,
        defaultLocale: active.defaultLocale,
        theme: active.theme,
        contact: active.contact,
        socialLinks: active.socialLinks,
        defaultSeo: active.defaultSeo,
      }) !==
        stableSnapshotPart({
          canonicalHostname: current.canonicalHostname,
          defaultLocale: current.defaultLocale,
          theme: current.theme,
          contact: current.contact,
          socialLinks: current.socialLinks,
          defaultSeo: current.defaultSeo,
        }),
    navigation:
      !active ||
      stableSnapshotPart(active.navigation) !==
        stableSnapshotPart(current.navigation),
    redirects:
      !active ||
      stableSnapshotPart(active.redirects) !==
        stableSnapshotPart(current.redirects),
    pages: pages.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

function hasMediaReference(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasMediaReference);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) =>
      (/(?:imageId|mediaId)$/u.test(key) && typeof nested === "string") ||
      hasMediaReference(nested),
  );
}

function draftCapabilityWarnings(
  loaded: LoadedSource,
): WebsitePublicationReviewDiagnostic[] {
  const warnings: WebsitePublicationReviewDiagnostic[] = [];
  if (
    hasMediaReference(loaded.source.site.theme) ||
    hasMediaReference(loaded.source.site.defaultSeo)
  ) {
    warnings.push({
      severity: "warning",
      code: "site_media_resolution_pending",
      path: "site",
      message:
        "Logo-, favicon- of social-mediareferenties worden pas publiek zichtbaar nadat de media/alt-tekstresolver is geleverd.",
    });
  }
  for (const page of loaded.source.pages) {
    if (hasMediaReference(page.seo)) {
      warnings.push({
        severity: "warning",
        code: "page_media_resolution_pending",
        path: `pages.${page.id}.seo`,
        message: `${page.title} bevat social media die nog niet door de publieke mediaresolver wordt geleverd.`,
      });
    }
    for (const section of page.sections) {
      if (hasMediaReference(section.content)) {
        warnings.push({
          severity: "warning",
          code: "section_media_resolution_pending",
          path: `pages.${page.id}.sections.${section.id}`,
          message: `${page.title} bevat sectiemedia die voorlopig als veilige placeholder wordt weergegeven; media en alt-tekst blijven een volgende fase.`,
        });
      }
      if (section.sectionKey === "contact_form" && section.isVisible) {
        warnings.push({
          severity: "warning",
          code: "form_processing_inactive",
          path: `pages.${page.id}.sections.${section.id}`,
          message: `${page.title} bevat een contactformulier waarvan verzending bewust uitgeschakeld blijft tot de beveiligde formulierfase.`,
        });
      }
    }
  }
  return warnings;
}

export async function getWebsitePublicationReview(
  rawInput: z.input<typeof reviewInputSchema>,
): Promise<WebsitePublicationReview> {
  const input = reviewInputSchema.parse(rawInput);
  const loaded = await loadWebsiteSource(pool, input.tenantId, input.siteId);
  const publication = compilerDiagnostics(() =>
    buildWebsitePublicationSnapshot(loaded.source),
  );
  const preview = compilerDiagnostics(() =>
    buildWebsiteDraftPreviewSnapshot(loaded.source),
  );

  const publicationRows = await pool.query<{
    id: string;
    sequence: number;
    source_revision: number;
    target_delivery_revision: number;
    content_hash: string;
    status: string;
    snapshot: unknown;
  }>(
    `SELECT id, sequence, source_revision, target_delivery_revision,
            content_hash, status, snapshot
     FROM public.website_publications
     WHERE tenant_id = $1 AND site_id = $2
       AND status IN ('ready', 'active')
     ORDER BY
       CASE WHEN status = 'active' THEN 0 ELSE 1 END,
       sequence DESC`,
    [input.tenantId, input.siteId],
  );
  const activeRow = publicationRows.rows.find((row) => row.status === "active");
  const readyRow = publicationRows.rows.find((row) => row.status === "ready");
  const activeSnapshot = activeRow
    ? websitePublicationSnapshotSchema.parse(activeRow.snapshot)
    : null;

  const diagnostics: WebsitePublicationReviewDiagnostic[] = [
    ...(loaded.hasCanonicalDomain
      ? []
      : [
          {
            severity: "error" as const,
            code: "primary_domain_missing",
            path: "site.canonicalHostname",
            message:
              "Een actief primair websitedomein is vereist voor publicatie.",
          },
        ]),
    ...publication.diagnostics.map((entry) => ({
      ...entry,
      severity: "error" as const,
    })),
    ...loaded.pages
      .filter((page) => page.status === "draft")
      .map((page) => ({
        severity: "warning" as const,
        code: "draft_page_excluded",
        path: `pages.${page.id}.status`,
        message: `${page.title} (${page.path}) staat nog op concept en wordt niet opgenomen in de publicatie.`,
      })),
    ...draftCapabilityWarnings(loaded),
  ];

  return {
    siteId: loaded.site.id,
    authoringRevision: Number(loaded.site.authoring_revision),
    deliveryRevision: Number(loaded.site.delivery_revision),
    deliveryMode: loaded.site.delivery_mode,
    canonicalHostname: loaded.site.canonical_hostname,
    activePublication: activeRow
      ? {
          id: activeRow.id,
          sequence: Number(activeRow.sequence),
          sourceRevision: Number(activeRow.source_revision),
          contentHash: activeRow.content_hash,
        }
      : null,
    readyPublication: readyRow
      ? {
          id: readyRow.id,
          sequence: Number(readyRow.sequence),
          sourceRevision: Number(readyRow.source_revision),
          targetDeliveryRevision: Number(readyRow.target_delivery_revision),
          contentHash: readyRow.content_hash,
        }
      : null,
    pages: loaded.pages.map((page) => ({
      id: page.id,
      title: page.title,
      path: page.path,
      status: page.status,
      authoringRevision: Number(page.authoring_revision),
    })),
    changes: publicationChanges(publication.snapshot, activeSnapshot),
    diagnostics,
    previewAvailable: preview.snapshot !== null,
    canPreparePublication:
      loaded.hasCanonicalDomain && publication.snapshot !== null,
  };
}

export async function createWebsitePreviewSession(
  rawInput: z.input<typeof createPreviewInputSchema>,
): Promise<WebsitePreviewSession> {
  const input = createPreviewInputSchema.parse(rawInput);
  return inTransaction(async (client) => {
    const lockResult = await client.query<{ authoring_revision: number }>(
      `SELECT authoring_revision
       FROM public.website_sites
       WHERE tenant_id = $1 AND id = $2 AND status <> 'disabled'
       FOR UPDATE`,
      [input.tenantId, input.siteId],
    );
    const locked = requireOne(lockResult.rows, "Website niet gevonden");
    if (Number(locked.authoring_revision) !== input.expectedAuthoringRevision) {
      throw new Error(
        "Website is intussen gewijzigd. Maak een nieuwe preview.",
      );
    }

    const loaded = await loadWebsiteSource(
      client,
      input.tenantId,
      input.siteId,
    );
    const snapshot = buildWebsiteDraftPreviewSnapshot(loaded.source);
    const result = await client.query<{
      source_revision: number;
      expires_at: Date | string;
    }>(
      `INSERT INTO public.website_preview_sessions (
         tenant_id, site_id, actor_user_id, token_hash, source_revision,
         snapshot, expires_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6::jsonb, now() + interval '10 minutes'
       )
       RETURNING source_revision, expires_at`,
      [
        input.tenantId,
        input.siteId,
        input.actorUserId,
        input.tokenHash,
        input.expectedAuthoringRevision,
        serializeWebsitePublication(snapshot),
      ],
    );
    const created = requireOne(result.rows, "Preview kon niet worden gemaakt");
    await client.query(
      `INSERT INTO public.audit_log (
         tenant_id, user_id, action, resource, resource_id, metadata
       ) VALUES (
         $1, $2, 'website_preview_created', 'website', $3,
         jsonb_build_object(
           'sourceRevision', $4::integer,
           'expiresAt', $5::timestamptz
         )
       )`,
      [
        input.tenantId,
        input.actorUserId,
        input.siteId,
        input.expectedAuthoringRevision,
        created.expires_at,
      ],
    );
    return {
      siteId: input.siteId,
      sourceRevision: Number(created.source_revision),
      expiresAt: new Date(created.expires_at).toISOString(),
      snapshot,
    };
  });
}

export async function loadWebsitePreviewSession(
  rawInput: z.input<typeof loadPreviewInputSchema>,
): Promise<WebsitePreviewSession | null> {
  const input = loadPreviewInputSchema.parse(rawInput);
  const result = await pool.query<{
    site_id: string;
    source_revision: number;
    expires_at: Date | string;
    snapshot: unknown;
  }>(
    `UPDATE public.website_preview_sessions preview
     SET last_used_at = now()
     FROM public.website_sites site
     JOIN public.tenants tenant ON tenant.id = site.tenant_id
     WHERE preview.tenant_id = $1
       AND preview.actor_user_id = $2
       AND preview.token_hash = $3
       AND preview.revoked_at IS NULL
       AND preview.expires_at > now()
       AND site.tenant_id = preview.tenant_id
       AND site.id = preview.site_id
       AND site.status <> 'disabled'
       AND site.authoring_revision = preview.source_revision
       AND tenant.is_active = true
       AND tenant.status IN ('trial', 'active')
       AND EXISTS (
         SELECT 1
         FROM public.tenant_modules entitlement
         JOIN public.modules module ON module.id = entitlement.module_id
         WHERE entitlement.tenant_id = preview.tenant_id
           AND module.key = 'website'
           AND entitlement.is_enabled = true
       )
     RETURNING preview.site_id, preview.source_revision, preview.expires_at,
               preview.snapshot`,
    [input.tenantId, input.actorUserId, input.tokenHash],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    siteId: row.site_id,
    sourceRevision: Number(row.source_revision),
    expiresAt: new Date(row.expires_at).toISOString(),
    snapshot: websitePublicationSnapshotSchema.parse(row.snapshot),
  };
}

export async function includeWebsitePageInPublication(
  rawInput: z.input<typeof includePageInputSchema>,
): Promise<{
  pageAuthoringRevision: number;
  siteAuthoringRevision: number;
}> {
  const input = includePageInputSchema.parse(rawInput);
  return inTransaction(async (client) => {
    const siteResult = await client.query<{ authoring_revision: number }>(
      `SELECT authoring_revision
       FROM public.website_sites
       WHERE tenant_id = $1 AND id = $2 AND status <> 'disabled'
       FOR UPDATE`,
      [input.tenantId, input.siteId],
    );
    const site = requireOne(siteResult.rows, "Website niet gevonden");
    if (Number(site.authoring_revision) !== input.expectedAuthoringRevision) {
      throw new Error("Website is intussen gewijzigd. Laad opnieuw.");
    }

    const pageResult = await client.query<{ authoring_revision: number }>(
      `UPDATE public.website_pages
       SET status = 'published',
           published_at = COALESCE(published_at, now()),
           authoring_revision = authoring_revision + 1,
           updated_by = $5,
           updated_at = now()
       WHERE tenant_id = $1
         AND site_id = $2
         AND id = $3
         AND authoring_revision = $4
         AND status = 'draft'
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
      "Conceptpagina is intussen gewijzigd of al opgenomen.",
    );
    const revisionResult = await client.query<{ authoring_revision: number }>(
      `SELECT authoring_revision
       FROM public.website_sites
       WHERE tenant_id = $1 AND id = $2`,
      [input.tenantId, input.siteId],
    );
    const revisedSite = requireOne(
      revisionResult.rows,
      "Website niet gevonden na paginawijziging",
    );
    await client.query(
      `INSERT INTO public.audit_log (
         tenant_id, user_id, action, resource, resource_id, metadata
       ) VALUES (
         $1, $2, 'website_page_included_for_publication', 'website_page', $3,
         jsonb_build_object(
           'siteId', $4::text,
           'fromSiteRevision', $5::integer,
           'toSiteRevision', $6::integer
         )
       )`,
      [
        input.tenantId,
        input.actorUserId,
        input.pageId,
        input.siteId,
        input.expectedAuthoringRevision,
        Number(revisedSite.authoring_revision),
      ],
    );
    return {
      pageAuthoringRevision: Number(page.authoring_revision),
      siteAuthoringRevision: Number(revisedSite.authoring_revision),
    };
  });
}
