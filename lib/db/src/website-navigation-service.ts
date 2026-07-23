import type { PoolClient } from "pg";
import { z } from "zod/v4";
import {
  positionWebsiteNavigationItems,
  websiteNavigationDraftItemSchema,
  websiteNavigationDraftSchema,
  type WebsiteNavigationDraftItem,
} from "@workspace/website-core/navigation";
import { pool } from "./connection";

export type { WebsiteNavigationDraftItem } from "@workspace/website-core/navigation";

const tenantIdSchema = z.string().uuid();

const replaceNavigationInputSchema = z
  .object({
    tenantId: tenantIdSchema,
    actorUserId: z.string().uuid(),
    siteId: z.string().uuid(),
    expectedAuthoringRevision: z.number().int().positive(),
    items: websiteNavigationDraftSchema,
  })
  .strict();

export type WebsiteNavigationPageOption = {
  id: string;
  title: string;
  navigationLabel: string | null;
  path: string;
  status: "draft" | "published";
};

export type WebsiteNavigationItemView = WebsiteNavigationDraftItem & {
  position: number;
  pageTitle: string | null;
  pagePath: string | null;
  pageStatus: "draft" | "published" | null;
};

export type WebsiteNavigationView = {
  siteId: string;
  siteName: string;
  authoringRevision: number;
  deliveryMode: "managed_cms" | "custom_nextjs";
  defaultLocale: string;
  items: WebsiteNavigationItemView[];
  pages: WebsiteNavigationPageOption[];
};

type LockedSiteRow = {
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

function canonicalNavigation(
  items: Array<WebsiteNavigationDraftItem & { position: number }>,
): string {
  return JSON.stringify(
    [...items]
      .sort(
        (left, right) =>
          left.location.localeCompare(right.location) ||
          left.position - right.position ||
          left.id.localeCompare(right.id),
      )
      .map((item) => ({
        id: item.id,
        label: item.label,
        location: item.location,
        parentId: item.parentId,
        pageId: item.pageId,
        linkType: item.linkType,
        href: item.href,
        target: item.target,
        position: item.position,
        isVisible: item.isVisible,
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
): Promise<LockedSiteRow> {
  const result = await client.query<LockedSiteRow>(
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
    throw new Error(
      "Website is intussen gewijzigd. Laad de navigatie opnieuw.",
    );
  }
  return site;
}

export async function getWebsiteNavigation(
  tenantId: string,
): Promise<WebsiteNavigationView | null> {
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

  const [navigationResult, pagesResult] = await Promise.all([
    pool.query<{
      id: string;
      label: string;
      location: "header" | "footer_primary" | "footer_legal";
      parent_id: string | null;
      page_id: string | null;
      link_type: "page" | "external" | "dropdown";
      href: string | null;
      target: "self" | "blank";
      position: number;
      is_visible: boolean;
      page_title: string | null;
      page_path: string | null;
      page_status: "draft" | "published" | "archived" | null;
    }>(
      `SELECT navigation.id, navigation.label, navigation.location,
              navigation.parent_id, navigation.page_id, navigation.link_type,
              navigation.href, navigation.target, navigation.position,
              navigation.is_visible, page.title AS page_title,
              page.path AS page_path, page.status AS page_status
       FROM public.website_navigation_items navigation
       LEFT JOIN public.website_pages page
         ON page.tenant_id = navigation.tenant_id
        AND page.site_id = navigation.site_id
        AND page.id = navigation.page_id
       WHERE navigation.tenant_id = $1 AND navigation.site_id = $2
       ORDER BY navigation.location, navigation.position, navigation.id`,
      [parsedTenantId, site.id],
    ),
    pool.query<{
      id: string;
      title: string;
      navigation_label: string | null;
      path: string;
      status: "draft" | "published";
    }>(
      `SELECT id, title, navigation_label, path, status
       FROM public.website_pages
       WHERE tenant_id = $1 AND site_id = $2
         AND locale = $3 AND status <> 'archived'
       ORDER BY is_homepage DESC, path, id`,
      [parsedTenantId, site.id, site.default_locale],
    ),
  ]);

  return {
    siteId: site.id,
    siteName: site.name,
    authoringRevision: Number(site.authoring_revision),
    deliveryMode: site.delivery_mode,
    defaultLocale: site.default_locale,
    items: navigationResult.rows.map((row) => ({
      ...websiteNavigationDraftItemSchema.parse({
        id: row.id,
        label: row.label,
        location: row.location,
        parentId: row.parent_id,
        pageId: row.page_id,
        linkType: row.link_type,
        href: row.href,
        target: row.target,
        isVisible: row.is_visible,
      }),
      position: Number(row.position),
      pageTitle: row.page_title,
      pagePath: row.page_path,
      pageStatus:
        row.page_status === "draft" || row.page_status === "published"
          ? row.page_status
          : null,
    })),
    pages: pagesResult.rows.map((page) => ({
      id: page.id,
      title: page.title,
      navigationLabel: page.navigation_label,
      path: page.path,
      status: page.status,
    })),
  };
}

export async function replaceWebsiteNavigation(
  rawInput: z.input<typeof replaceNavigationInputSchema>,
): Promise<{ authoringRevision: number; changed: boolean }> {
  const input = replaceNavigationInputSchema.parse(rawInput);
  const positionedItems = positionWebsiteNavigationItems(input.items);

  return inTransaction(async (client) => {
    const site = await lockWebsiteSite(client, input);
    const pageIds = [
      ...new Set(
        positionedItems
          .map((item) => item.pageId)
          .filter((pageId): pageId is string => Boolean(pageId)),
      ),
    ];
    const pageResult = await client.query<{
      id: string;
      locale: string;
      status: "draft" | "published" | "archived";
    }>(
      `SELECT id, locale, status
       FROM public.website_pages
       WHERE tenant_id = $1 AND site_id = $2
         AND id = ANY($3::uuid[])
       FOR SHARE`,
      [input.tenantId, input.siteId, pageIds],
    );
    if (
      pageResult.rows.length !== pageIds.length ||
      pageResult.rows.some(
        (page) =>
          page.status === "archived" || page.locale !== site.default_locale,
      )
    ) {
      throw new Error(
        "Elke interne link moet naar een actieve pagina in de standaardtaal verwijzen.",
      );
    }

    const currentResult = await client.query<{
      id: string;
      label: string;
      location: "header" | "footer_primary" | "footer_legal";
      parent_id: string | null;
      page_id: string | null;
      link_type: "page" | "external" | "dropdown";
      href: string | null;
      target: "self" | "blank";
      position: number;
      is_visible: boolean;
    }>(
      `SELECT id, label, location, parent_id, page_id, link_type, href, target,
              position, is_visible
       FROM public.website_navigation_items
       WHERE tenant_id = $1 AND site_id = $2
       ORDER BY location, position, id
       FOR UPDATE`,
      [input.tenantId, input.siteId],
    );
    const currentItems = currentResult.rows.map((row) => ({
      id: row.id,
      label: row.label,
      location: row.location,
      parentId: row.parent_id,
      pageId: row.page_id,
      linkType: row.link_type,
      href: row.href,
      target: row.target,
      position: Number(row.position),
      isVisible: row.is_visible,
    }));
    if (
      canonicalNavigation(currentItems) === canonicalNavigation(positionedItems)
    ) {
      return {
        authoringRevision: Number(site.authoring_revision),
        changed: false,
      };
    }

    const desiredIds = positionedItems.map((item) => item.id);
    const conflictingIdentity = await client.query(
      `SELECT 1
       FROM public.website_navigation_items
       WHERE id = ANY($1::uuid[])
         AND (tenant_id <> $2 OR site_id <> $3)
       LIMIT 1`,
      [desiredIds, input.tenantId, input.siteId],
    );
    if (conflictingIdentity.rowCount) {
      throw new Error("Navigatie-identiteit hoort bij een andere website.");
    }

    await client.query(
      "SET CONSTRAINTS website_navigation_items_position_unique DEFERRED",
    );
    await client.query(
      `SELECT set_config('fieldgrid.website_child_authoring_touch', 'suppressed', true)`,
    );
    await client.query(
      `UPDATE public.website_navigation_items
       SET parent_id = NULL
       WHERE tenant_id = $1 AND site_id = $2 AND parent_id IS NOT NULL`,
      [input.tenantId, input.siteId],
    );
    await client.query(
      `DELETE FROM public.website_navigation_items
       WHERE tenant_id = $1 AND site_id = $2
         AND NOT (id = ANY($3::uuid[]))`,
      [input.tenantId, input.siteId, desiredIds],
    );

    const writeOrder = [
      ...positionedItems.filter((item) => !item.parentId),
      ...positionedItems.filter((item) => item.parentId),
    ];
    for (const item of writeOrder) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO public.website_navigation_items (
           id, tenant_id, site_id, parent_id, page_id, location, label,
           link_type, href, target, position, is_visible, created_by, updated_by
         ) VALUES (
           $4, $1, $2, $5, $6, $7, $8, $9, $10, $11, $12, $13, $3, $3
         )
         ON CONFLICT (id) DO UPDATE
         SET parent_id = EXCLUDED.parent_id,
             page_id = EXCLUDED.page_id,
             location = EXCLUDED.location,
             label = EXCLUDED.label,
             link_type = EXCLUDED.link_type,
             href = EXCLUDED.href,
             target = EXCLUDED.target,
             position = EXCLUDED.position,
             is_visible = EXCLUDED.is_visible,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()
         WHERE website_navigation_items.tenant_id = EXCLUDED.tenant_id
           AND website_navigation_items.site_id = EXCLUDED.site_id
         RETURNING id`,
        [
          input.tenantId,
          input.siteId,
          input.actorUserId,
          item.id,
          item.parentId,
          item.pageId,
          item.location,
          item.label,
          item.linkType,
          item.href,
          item.target,
          item.position,
          item.isVisible,
        ],
      );
      requireOne(result.rows, "Navigatie kon niet veilig worden opgeslagen.");
    }

    const persistedCount = await client.query<{ count: number }>(
      `SELECT count(*)::integer AS count
       FROM public.website_navigation_items
       WHERE tenant_id = $1 AND site_id = $2`,
      [input.tenantId, input.siteId],
    );
    if (Number(persistedCount.rows[0]?.count) !== positionedItems.length) {
      throw new Error("Navigatie is niet volledig opgeslagen.");
    }

    await client.query(
      `SELECT set_config('fieldgrid.website_authoring_touch', 'allowed', true)`,
    );
    const revisionResult = await client.query<{
      authoring_revision: number;
    }>(
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
    const revisedSite = requireOne(
      revisionResult.rows,
      "Website is intussen gewijzigd. Laad de navigatie opnieuw.",
    );
    await client.query(
      `INSERT INTO public.audit_log (
         tenant_id, user_id, action, resource, resource_id, metadata
       ) VALUES (
         $1, $2, 'website_navigation_replaced', 'website_navigation', $3,
         jsonb_build_object(
           'fromRevision', $4::integer,
           'toRevision', $5::integer,
           'itemCount', $6::integer,
           'visibleCount', $7::integer
         )
       )`,
      [
        input.tenantId,
        input.actorUserId,
        input.siteId,
        input.expectedAuthoringRevision,
        Number(revisedSite.authoring_revision),
        positionedItems.length,
        positionedItems.filter((item) => item.isVisible).length,
      ],
    );
    return {
      authoringRevision: Number(revisedSite.authoring_revision),
      changed: true,
    };
  });
}
