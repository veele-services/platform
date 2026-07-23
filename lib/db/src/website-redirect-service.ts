import type { PoolClient } from "pg";
import { z } from "zod/v4";
import {
  websiteRedirectDraftItemSchema,
  websiteRedirectDraftSchema,
  websiteRouteKey,
  type WebsiteRedirectDraftItem,
} from "@workspace/website-core/redirects";
import { pool } from "./connection";

export type { WebsiteRedirectDraftItem } from "@workspace/website-core/redirects";

const tenantIdSchema = z.string().uuid();
const replaceRedirectsInputSchema = z
  .object({
    tenantId: tenantIdSchema,
    actorUserId: z.string().uuid(),
    siteId: z.string().uuid(),
    expectedAuthoringRevision: z.number().int().positive(),
    redirects: websiteRedirectDraftSchema,
  })
  .strict();

export type WebsiteRedirectPageOption = {
  id: string;
  locale: string;
  title: string;
  path: string;
  status: "draft" | "published";
};

export type WebsiteRedirectsView = {
  siteId: string;
  siteName: string;
  authoringRevision: number;
  deliveryMode: "managed_cms" | "custom_nextjs";
  defaultLocale: string;
  redirects: WebsiteRedirectDraftItem[];
  pages: WebsiteRedirectPageOption[];
};

type LockedSite = {
  id: string;
  name: string;
  authoring_revision: number;
  delivery_mode: "managed_cms" | "custom_nextjs";
  default_locale: string;
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

function canonicalRedirects(
  redirects: readonly WebsiteRedirectDraftItem[],
): string {
  return JSON.stringify(
    [...redirects]
      .sort(
        (left, right) =>
          left.locale.localeCompare(right.locale) ||
          left.sourcePath.localeCompare(right.sourcePath) ||
          left.id.localeCompare(right.id),
      )
      .map((redirect) => ({
        id: redirect.id,
        locale: redirect.locale,
        sourcePath: redirect.sourcePath,
        destinationType: redirect.destinationType,
        destination: redirect.destination,
        statusCode: redirect.statusCode,
        isActive: redirect.isActive,
      })),
  );
}

async function lockWebsiteSite(
  client: PoolClient,
  input: {
    tenantId: string;
    siteId: string;
    expectedAuthoringRevision: number;
  },
): Promise<LockedSite> {
  const result = await client.query<LockedSite>(
    `SELECT site.id, site.name, site.authoring_revision, site.delivery_mode,
            site.default_locale, tenant.is_active AS tenant_is_active,
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
    throw new Error("Website is intussen gewijzigd. Laad redirects opnieuw.");
  }
  return site;
}

export async function getWebsiteRedirects(
  tenantId: string,
): Promise<WebsiteRedirectsView | null> {
  const parsedTenantId = tenantIdSchema.parse(tenantId);
  const siteResult = await pool.query<{
    id: string;
    name: string;
    authoring_revision: number;
    delivery_mode: "managed_cms" | "custom_nextjs";
    default_locale: string;
  }>(
    `SELECT site.id, site.name, site.authoring_revision, site.delivery_mode,
            site.default_locale
     FROM public.website_sites site
     JOIN public.tenants tenant ON tenant.id = site.tenant_id
     WHERE site.tenant_id = $1
       AND site.is_primary = true
       AND site.status <> 'disabled'
       AND tenant.is_active = true
       AND tenant.status IN ('trial', 'active')
       AND EXISTS (
         SELECT 1
         FROM public.tenant_modules entitlement
         JOIN public.modules module ON module.id = entitlement.module_id
         WHERE entitlement.tenant_id = site.tenant_id
           AND module.key = 'website'
           AND entitlement.is_enabled = true
       )
     LIMIT 1`,
    [parsedTenantId],
  );
  const site = siteResult.rows[0];
  if (!site) return null;

  const [redirectResult, pageResult] = await Promise.all([
    pool.query<{
      id: string;
      locale: string;
      source_path: string;
      destination_type: "path" | "external";
      destination: string;
      status_code: 301 | 302 | 308;
      is_active: boolean;
    }>(
      `SELECT id, locale, source_path, destination_type, destination,
              status_code, is_active
       FROM public.website_redirects
       WHERE tenant_id = $1 AND site_id = $2
       ORDER BY locale, source_path, id`,
      [parsedTenantId, site.id],
    ),
    pool.query<{
      id: string;
      locale: string;
      title: string;
      path: string;
      status: "draft" | "published";
    }>(
      `SELECT id, locale, title, path, status
       FROM public.website_pages
       WHERE tenant_id = $1 AND site_id = $2 AND status <> 'archived'
       ORDER BY locale, is_homepage DESC, path, id`,
      [parsedTenantId, site.id],
    ),
  ]);

  return {
    siteId: site.id,
    siteName: site.name,
    authoringRevision: Number(site.authoring_revision),
    deliveryMode: site.delivery_mode,
    defaultLocale: site.default_locale,
    redirects: redirectResult.rows.map((row) =>
      websiteRedirectDraftItemSchema.parse({
        id: row.id,
        locale: row.locale,
        sourcePath: row.source_path,
        destinationType: row.destination_type,
        destination: row.destination,
        statusCode: Number(row.status_code),
        isActive: row.is_active,
      }),
    ),
    pages: pageResult.rows,
  };
}

export async function replaceWebsiteRedirects(
  rawInput: z.input<typeof replaceRedirectsInputSchema>,
): Promise<{ authoringRevision: number; changed: boolean }> {
  const input = replaceRedirectsInputSchema.parse(rawInput);
  const redirects = websiteRedirectDraftSchema.parse(input.redirects);

  return inTransaction(async (client) => {
    const site = await lockWebsiteSite(client, input);
    const pageResult = await client.query<{
      locale: string;
      path: string;
      status: "draft" | "published";
    }>(
      `SELECT locale, path, status
       FROM public.website_pages
       WHERE tenant_id = $1 AND site_id = $2 AND status <> 'archived'
       FOR SHARE`,
      [input.tenantId, input.siteId],
    );
    const pageRoutes = new Map(
      pageResult.rows.map((page) => [
        websiteRouteKey(page.locale, page.path),
        page,
      ]),
    );
    for (const redirect of redirects) {
      if (!redirect.isActive) continue;
      if (
        pageRoutes.has(websiteRouteKey(redirect.locale, redirect.sourcePath))
      ) {
        throw new Error(
          `Redirectbron ${redirect.sourcePath} botst met een bestaande pagina.`,
        );
      }
      if (
        redirect.destinationType === "path" &&
        !pageRoutes.has(websiteRouteKey(redirect.locale, redirect.destination))
      ) {
        throw new Error(
          `Redirectdoel ${redirect.destination} bestaat niet als actieve pagina in ${redirect.locale}.`,
        );
      }
    }

    const currentResult = await client.query<{
      id: string;
      locale: string;
      source_path: string;
      destination_type: "path" | "external";
      destination: string;
      status_code: 301 | 302 | 308;
      is_active: boolean;
    }>(
      `SELECT id, locale, source_path, destination_type, destination,
              status_code, is_active
       FROM public.website_redirects
       WHERE tenant_id = $1 AND site_id = $2
       ORDER BY locale, source_path, id
       FOR UPDATE`,
      [input.tenantId, input.siteId],
    );
    const current = currentResult.rows.map((row) => ({
      id: row.id,
      locale: row.locale,
      sourcePath: row.source_path,
      destinationType: row.destination_type,
      destination: row.destination,
      statusCode: Number(row.status_code) as 301 | 302 | 308,
      isActive: row.is_active,
    }));
    if (canonicalRedirects(current) === canonicalRedirects(redirects)) {
      return {
        authoringRevision: Number(site.authoring_revision),
        changed: false,
      };
    }

    const desiredIds = redirects.map((redirect) => redirect.id);
    const conflictingIdentity = await client.query(
      `SELECT 1
       FROM public.website_redirects
       WHERE id = ANY($1::uuid[])
         AND (tenant_id <> $2 OR site_id <> $3)
       LIMIT 1`,
      [desiredIds, input.tenantId, input.siteId],
    );
    if (conflictingIdentity.rowCount) {
      throw new Error("Redirectidentiteit hoort bij een andere website.");
    }

    await client.query(
      "SET CONSTRAINTS trg_website_redirect_integrity DEFERRED",
    );
    await client.query(
      `SELECT set_config('fieldgrid.website_child_authoring_touch', 'suppressed', true)`,
    );
    await client.query(
      `DELETE FROM public.website_redirects
       WHERE tenant_id = $1 AND site_id = $2
         AND NOT (id = ANY($3::uuid[]))`,
      [input.tenantId, input.siteId, desiredIds],
    );
    for (const redirect of redirects) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO public.website_redirects (
           id, tenant_id, site_id, locale, source_path, destination_type,
           destination, status_code, is_active, created_by, updated_by
         ) VALUES (
           $4, $1, $2, $5, $6, $7, $8, $9, $10, $3, $3
         )
         ON CONFLICT (id) DO UPDATE
         SET locale = EXCLUDED.locale,
             source_path = EXCLUDED.source_path,
             destination_type = EXCLUDED.destination_type,
             destination = EXCLUDED.destination,
             status_code = EXCLUDED.status_code,
             is_active = EXCLUDED.is_active,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()
         WHERE website_redirects.tenant_id = EXCLUDED.tenant_id
           AND website_redirects.site_id = EXCLUDED.site_id
         RETURNING id`,
        [
          input.tenantId,
          input.siteId,
          input.actorUserId,
          redirect.id,
          redirect.locale,
          redirect.sourcePath,
          redirect.destinationType,
          redirect.destination,
          redirect.statusCode,
          redirect.isActive,
        ],
      );
      requireOne(result.rows, "Redirect kon niet veilig worden opgeslagen.");
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
    const revised = requireOne(
      revisionResult.rows,
      "Website is intussen gewijzigd. Laad redirects opnieuw.",
    );
    await client.query(
      `INSERT INTO public.audit_log (
         tenant_id, user_id, action, resource, resource_id, metadata
       ) VALUES (
         $1, $2, 'website_redirects_replaced', 'website', $3,
         jsonb_build_object(
           'fromRevision', $4::integer,
           'toRevision', $5::integer,
           'redirectCount', $6::integer
         )
       )`,
      [
        input.tenantId,
        input.actorUserId,
        input.siteId,
        input.expectedAuthoringRevision,
        Number(revised.authoring_revision),
        redirects.length,
      ],
    );
    return {
      authoringRevision: Number(revised.authoring_revision),
      changed: true,
    };
  });
}
