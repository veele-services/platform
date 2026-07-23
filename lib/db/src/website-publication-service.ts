import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod/v4";
import {
  WEBSITE_PUBLICATION_SCHEMA_VERSION,
  buildWebsitePublicationSnapshot,
  serializeWebsitePublication,
  websitePublicationCacheIdentity,
  websitePublicationSourceSchema,
  type WebsitePublicationSnapshot,
} from "@workspace/website-core";
import { pool } from "./connection";
import { loadWebsiteBlogSource } from "./website-blog-service";
import { loadWebsiteFormSource } from "./website-form-service";

const commandContextSchema = z
  .object({
    tenantId: z.string().uuid(),
    siteId: z.string().uuid(),
    actorUserId: z.string().uuid(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const createPublicationInputSchema = commandContextSchema.extend({
  expectedAuthoringRevision: z.number().int().positive(),
});

const activatePublicationInputSchema = commandContextSchema.extend({
  publicationId: z.string().uuid(),
  expectedAuthoringRevision: z.number().int().positive(),
  expectedDeliveryRevision: z.number().int().positive(),
});

const setPrimaryDomainInputSchema = commandContextSchema.extend({
  tenantDomainId: z.string().uuid(),
  expectedAuthoringRevision: z.number().int().positive(),
});

export type CreateManagedWebsitePublicationInput = z.input<
  typeof createPublicationInputSchema
>;
export type ActivateManagedWebsitePublicationInput = z.input<
  typeof activatePublicationInputSchema
>;
export type SetPrimaryWebsiteDomainInput = z.input<
  typeof setPrimaryDomainInputSchema
>;

export type ManagedWebsitePublicationCandidate = {
  id: string;
  tenantId: string;
  siteId: string;
  sequence: number;
  sourceRevision: number;
  targetDeliveryRevision: number;
  contentHash: string;
  cacheKey: string;
  etag: string;
  status: "ready";
  snapshot: WebsitePublicationSnapshot;
};

export type PrimaryWebsiteDomainResult = {
  id: string;
  tenantId: string;
  siteId: string;
  tenantDomainId: string;
  hostname: string;
  status: string;
  isPrimary: boolean;
  verifiedAt: Date;
  authoringRevision: number;
};

export type ManagedWebsiteActivationResult = {
  siteId: string;
  tenantId: string;
  publicationId: string;
  authoringRevision: number;
  deliveryRevision: number;
  deliveryMode: "managed_cms";
  status: string;
};

type SiteRow = {
  id: string;
  tenant_id: string;
  status: string;
  authoring_revision: number;
  delivery_revision: number;
  default_locale: string;
  theme: unknown;
  contact: unknown;
  social_links: unknown;
  default_seo: unknown;
  tenant_is_active: boolean;
  tenant_status: string;
  module_enabled: boolean;
};

type PageRow = {
  id: string;
  locale: string;
  path: string;
  page_type: string;
  title: string;
  seo: unknown;
  status: string;
  is_homepage: boolean;
};

type SectionRow = {
  id: string;
  page_id: string;
  section_key: string;
  schema_version: number;
  variant_key: string;
  position: number;
  content: unknown;
  is_visible: boolean;
};

type NavigationRow = {
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

type RedirectRow = {
  id: string;
  locale: string;
  source_path: string;
  destination_type: "path" | "external";
  destination: string;
  status_code: 301 | 302 | 308;
  is_active: boolean;
};

type ExistingPublicationRow = {
  id: string;
  sequence: number;
  source_revision: number;
  target_delivery_revision: number;
  snapshot: WebsitePublicationSnapshot;
  content_hash: string;
  cache_key: string;
  status: string;
};

async function inSerializableTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
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

function isRetryablePublicationConflict(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return error.code === "40001" || error.code === "23505";
}

function hashWebsitePublication(
  sourceRevision: number,
  canonicalSnapshot: string,
): string {
  return createHash("sha256")
    .update("fieldgrid-website-publication:v1\n")
    .update(`source-revision:${sourceRevision}\n`)
    .update(canonicalSnapshot)
    .digest("hex");
}

export async function createManagedWebsitePublication(
  rawInput: CreateManagedWebsitePublicationInput,
): Promise<ManagedWebsitePublicationCandidate> {
  const input = createPublicationInputSchema.parse(rawInput);

  const createOnce = () =>
    inSerializableTransaction(async (client) => {
      const siteResult = await client.query<SiteRow>(
        `SELECT
         site.id,
         site.tenant_id,
         site.status,
         site.authoring_revision,
         site.delivery_revision,
         site.default_locale,
         site.theme,
         site.contact,
         site.social_links,
         site.default_seo,
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
       FOR UPDATE OF site`,
        [input.tenantId, input.siteId],
      );
      const site = requireOne(siteResult.rows, "Website site not found");
      if (
        !site.tenant_is_active ||
        !["trial", "active"].includes(site.tenant_status)
      ) {
        throw new Error("Website tenant is not active");
      }
      if (!site.module_enabled) {
        throw new Error("Website module entitlement is required");
      }
      if (site.status === "disabled") {
        throw new Error("Disabled website cannot be published");
      }
      if (site.authoring_revision !== input.expectedAuthoringRevision) {
        throw new Error("Website authoring revision conflict");
      }

      const domainResult = await client.query<{ hostname: string }>(
        `SELECT hostname
       FROM public.website_domain_bindings
       WHERE tenant_id = $1
         AND site_id = $2
         AND status = 'active'
         AND is_primary = true
       LIMIT 2`,
        [input.tenantId, input.siteId],
      );
      if (domainResult.rows.length !== 1) {
        throw new Error(
          "Exactly one active primary website domain is required",
        );
      }

      const pageResult = await client.query<PageRow>(
        `SELECT id, locale, path, page_type, title, seo, status, is_homepage
       FROM public.website_pages
       WHERE tenant_id = $1 AND site_id = $2
       ORDER BY locale, path, id`,
        [input.tenantId, input.siteId],
      );
      const sectionResult = await client.query<SectionRow>(
        `SELECT
         section.id,
         section.page_id,
         section.section_key,
         section.schema_version,
         section.variant_key,
         section.position,
         section.content,
         section.is_visible
       FROM public.website_page_sections section
       WHERE section.tenant_id = $1 AND section.site_id = $2
       ORDER BY section.page_id, section.position, section.id`,
        [input.tenantId, input.siteId],
      );
      const navigationResult = await client.query<NavigationRow>(
        `SELECT
         id,
         label,
         location,
         parent_id,
         page_id,
         link_type,
         href,
         target,
         position,
         is_visible
       FROM public.website_navigation_items
       WHERE tenant_id = $1 AND site_id = $2
       ORDER BY location, position, id`,
        [input.tenantId, input.siteId],
      );
      const redirectResult = await client.query<RedirectRow>(
        `SELECT id, locale, source_path, destination_type, destination,
                status_code, is_active
         FROM public.website_redirects
         WHERE tenant_id = $1 AND site_id = $2
         ORDER BY locale, source_path, id`,
        [input.tenantId, input.siteId],
      );
      const blog = await loadWebsiteBlogSource(
        client,
        input.tenantId,
        input.siteId,
      );
      const forms = await loadWebsiteFormSource(
        client,
        input.tenantId,
        input.siteId,
      );

      const sectionsByPage = new Map<string, SectionRow[]>();
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
        canonicalHostname: domainResult.rows[0]!.hostname,
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
        blog,
        forms,
      });
      const snapshot = buildWebsitePublicationSnapshot(source);
      const canonicalSnapshot = serializeWebsitePublication(snapshot);
      const contentHash = hashWebsitePublication(
        input.expectedAuthoringRevision,
        canonicalSnapshot,
      );
      const { cacheKey, etag } = websitePublicationCacheIdentity({
        tenantId: input.tenantId,
        siteId: input.siteId,
        deliveryRevision: snapshot.deliveryRevision,
        contentHash,
      });

      const existingResult = await client.query<ExistingPublicationRow>(
        `SELECT
         id,
         sequence,
         source_revision,
         target_delivery_revision,
         snapshot,
         content_hash,
         cache_key,
         status
       FROM public.website_publications
       WHERE tenant_id = $1 AND site_id = $2 AND content_hash = $3
       LIMIT 1`,
        [input.tenantId, input.siteId, contentHash],
      );
      const existing = existingResult.rows[0];
      if (existing) {
        const existingCanonical = serializeWebsitePublication(
          existing.snapshot,
        );
        if (
          existing.status !== "ready" ||
          Number(existing.source_revision) !==
            input.expectedAuthoringRevision ||
          Number(existing.target_delivery_revision) !==
            snapshot.deliveryRevision ||
          existing.cache_key !== cacheKey ||
          existingCanonical !== canonicalSnapshot
        ) {
          throw new Error("Website publication hash identity conflict");
        }
        return {
          id: existing.id,
          tenantId: input.tenantId,
          siteId: input.siteId,
          sequence: Number(existing.sequence),
          sourceRevision: Number(existing.source_revision),
          targetDeliveryRevision: Number(existing.target_delivery_revision),
          contentHash: existing.content_hash,
          cacheKey: existing.cache_key,
          etag,
          status: "ready" as const,
          snapshot: existing.snapshot,
        };
      }

      const publicationId = randomUUID();

      const sequenceResult = await client.query<{ sequence: number }>(
        `SELECT COALESCE(max(sequence), 0)::integer + 1 AS sequence
       FROM public.website_publications
       WHERE tenant_id = $1 AND site_id = $2`,
        [input.tenantId, input.siteId],
      );
      const sequence = Number(
        requireOne(sequenceResult.rows, "Publication sequence query failed")
          .sequence,
      );

      await client.query(
        `INSERT INTO public.website_publications (
         id,
         tenant_id,
         site_id,
         sequence,
         schema_version,
         source_revision,
         target_delivery_revision,
         snapshot,
         content_hash,
         cache_key,
         status,
         validation,
         created_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, 'ready',
         '{"errors":[],"warnings":[],"compilerVersion":1}'::jsonb,
         $11
       )`,
        [
          publicationId,
          input.tenantId,
          input.siteId,
          sequence,
          WEBSITE_PUBLICATION_SCHEMA_VERSION,
          input.expectedAuthoringRevision,
          snapshot.deliveryRevision,
          canonicalSnapshot,
          contentHash,
          cacheKey,
          input.actorUserId,
        ],
      );

      await client.query(
        `INSERT INTO public.audit_log (
         tenant_id, user_id, action, resource, resource_id, metadata
       ) VALUES (
         $1, $2, 'website_publication_created', 'website', $3,
         jsonb_build_object(
           'siteId', $4::text,
           'sourceRevision', $5::integer,
           'targetDeliveryRevision', $6::integer,
           'contentHash', $7::text,
           'cacheKey', $8::text,
           'reason', $9::text
         )
       )`,
        [
          input.tenantId,
          input.actorUserId,
          publicationId,
          input.siteId,
          input.expectedAuthoringRevision,
          snapshot.deliveryRevision,
          contentHash,
          cacheKey,
          input.reason,
        ],
      );

      return {
        id: publicationId,
        tenantId: input.tenantId,
        siteId: input.siteId,
        sequence,
        sourceRevision: input.expectedAuthoringRevision,
        targetDeliveryRevision: snapshot.deliveryRevision,
        contentHash,
        cacheKey,
        etag,
        status: "ready" as const,
        snapshot,
      };
    });

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await createOnce();
    } catch (error) {
      lastError = error;
      if (!isRetryablePublicationConflict(error) || attempt === 2) throw error;
    }
  }
  throw lastError;
}

export async function setPrimaryWebsiteDomain(
  rawInput: SetPrimaryWebsiteDomainInput,
): Promise<PrimaryWebsiteDomainResult> {
  const input = setPrimaryDomainInputSchema.parse(rawInput);
  const result = await pool.query<{
    id: string;
    tenant_id: string;
    site_id: string;
    tenant_domain_id: string;
    hostname: string;
    status: string;
    is_primary: boolean;
    verified_at: Date;
  }>(
    `SELECT (binding).*
     FROM (
       SELECT public.set_primary_website_domain($1, $2, $3, $4, $5, $6) AS binding
     ) result`,
    [
      input.tenantId,
      input.siteId,
      input.tenantDomainId,
      input.expectedAuthoringRevision,
      input.actorUserId,
      input.reason,
    ],
  );
  const binding = requireOne(result.rows, "Primary website domain was not set");
  return {
    id: binding.id,
    tenantId: binding.tenant_id,
    siteId: binding.site_id,
    tenantDomainId: binding.tenant_domain_id,
    hostname: binding.hostname,
    status: binding.status,
    isPrimary: binding.is_primary,
    verifiedAt: binding.verified_at,
    authoringRevision: input.expectedAuthoringRevision + 1,
  };
}

export async function activateManagedWebsitePublication(
  rawInput: ActivateManagedWebsitePublicationInput,
): Promise<ManagedWebsiteActivationResult> {
  const input = activatePublicationInputSchema.parse(rawInput);
  const result = await pool.query<{
    id: string;
    tenant_id: string;
    active_publication_id: string;
    authoring_revision: number;
    delivery_revision: number;
    delivery_mode: "managed_cms";
    status: string;
  }>(
    `SELECT (site).*
     FROM (
       SELECT public.activate_managed_website_publication(
         $1, $2, $3, $4, $5, $6, $7
       ) AS site
     ) result`,
    [
      input.tenantId,
      input.siteId,
      input.publicationId,
      input.expectedAuthoringRevision,
      input.expectedDeliveryRevision,
      input.actorUserId,
      input.reason,
    ],
  );
  const site = requireOne(
    result.rows,
    "Managed website publication was not activated",
  );
  return {
    siteId: site.id,
    tenantId: site.tenant_id,
    publicationId: site.active_publication_id,
    authoringRevision: Number(site.authoring_revision),
    deliveryRevision: Number(site.delivery_revision),
    deliveryMode: site.delivery_mode,
    status: site.status,
  };
}
