import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  initializeManagedWebsite,
  pool,
  resolveWebsiteDeliveryByHost,
  type WebsiteRuntimeQuery,
} from "../lib/db/src/index.ts";
import {
  MULTI_SERVICE_COMPANY_TEMPLATE_V1,
  createCustomWebsiteRouteRegistry,
} from "../lib/website-core/src/index.ts";

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, "DATABASE_URL is required");
const parsed = new URL(databaseUrl);
assert.ok(
  ["127.0.0.1", "localhost", "::1", "postgres"].includes(parsed.hostname),
  "Website runtime proof only runs against local/disposable PostgreSQL",
);
assert.match(
  parsed.pathname,
  /(runtime|safety|test|smoke)/u,
  "Database name must clearly identify a disposable runtime database",
);

const tenantA = "10000000-0000-4000-8000-000000000001";
const tenantB = "10000000-0000-4000-8000-000000000002";
const actorA = "20000000-0000-4000-8000-000000000101";
const siteId = randomUUID();
const publicationId = randomUUID();
const rollbackPublicationId = randomUUID();
const customDeploymentId = randomUUID();
const domainId = randomUUID();
const hostname = `website-${randomUUID()}.runtime.fieldgrid.test`;
const contentHash = "a".repeat(64);
const rollbackContentHash = "b".repeat(64);

const theme = {
  schemaVersion: 1,
  colors: {
    background: "#ffffff",
    foreground: "#0f172a",
    primary: "#0f766e",
    primaryForeground: "#ffffff",
    accent: "#ccfbf1",
    accentForeground: "#134e4a",
  },
  headingFont: "manrope",
  bodyFont: "inter",
  radius: "medium",
  spacing: "comfortable",
  logoMediaId: null,
  faviconMediaId: null,
};
const contact = {
  companyName: "Runtime Website",
  email: "runtime@example.test",
  phone: "+31100000000",
  street: null,
  postalCode: null,
  city: null,
  countryCode: "NL",
  openingHours: [],
};
const seo = {
  title: "Runtime Website",
  description:
    "Disposable runtime validation for the Fieldgrid website foundation.",
  socialImageMediaId: null,
  indexable: true,
};

async function verifyTemplateInitialization(): Promise<void> {
  const tenantId = randomUUID();
  const actorId = randomUUID();
  const slug = `website-template-${tenantId.slice(0, 8)}`;
  let siteId: string | null = null;
  try {
    await pool.query(
      `INSERT INTO public.tenants (id, slug, name, is_active, status, plan_key)
       VALUES ($1, $2, 'Website template runtime', true, 'active', 'enterprise')`,
      [tenantId, slug],
    );
    await pool.query(
      `INSERT INTO public.tenant_modules (
         tenant_id, module_id, is_enabled, source, enabled_at
       )
       SELECT $1, id, true, 'manual', now()
       FROM public.modules
       WHERE key = 'website'`,
      [tenantId],
    );

    const initialized = await initializeManagedWebsite({
      tenantId,
      actorUserId: actorId,
      templateKey: "multi_service_company",
      settings: {
        schemaVersion: 1,
        name: "Website template runtime",
        defaultLocale: "nl-NL",
        theme: MULTI_SERVICE_COMPANY_TEMPLATE_V1.defaultTheme,
        contact,
        socialLinks: [],
        defaultSeo: {
          ...seo,
          canonicalPath: null,
          socialImageUrl: null,
        },
        analytics: { provider: "none" },
        seoSettings: {
          schemaVersion: 1,
          structuredData: {
            enabled: true,
            organizationType: "organization",
          },
          webmasterVerification: { google: null, bing: null },
        },
      },
    });
    siteId = initialized.siteId;
    assert.equal(initialized.authoringRevision, 1);

    const proof = await pool.query<{
      template_key: string;
      template_version: number;
      authoring_revision: number;
      page_count: number;
      section_count: number;
      navigation_count: number;
      all_sections_require_review: boolean;
      copied_fixture_ids: number;
    }>(
      `SELECT
         site.template_key,
         site.template_version,
         site.authoring_revision,
         (SELECT count(*)::integer
            FROM public.website_pages page
           WHERE page.tenant_id = site.tenant_id AND page.site_id = site.id
         ) AS page_count,
         (SELECT count(*)::integer
            FROM public.website_page_sections section
           WHERE section.tenant_id = site.tenant_id AND section.site_id = site.id
         ) AS section_count,
         (SELECT count(*)::integer
            FROM public.website_navigation_items item
           WHERE item.tenant_id = site.tenant_id AND item.site_id = site.id
         ) AS navigation_count,
         (SELECT bool_and(section.requires_review)
            FROM public.website_page_sections section
           WHERE section.tenant_id = site.tenant_id AND section.site_id = site.id
         ) AS all_sections_require_review,
         (SELECT count(*)::integer
            FROM public.website_page_sections section
           WHERE section.tenant_id = site.tenant_id
             AND section.site_id = site.id
             AND section.id = ANY($3::uuid[])
         ) AS copied_fixture_ids
       FROM public.website_sites site
       WHERE site.tenant_id = $1 AND site.id = $2`,
      [
        tenantId,
        siteId,
        MULTI_SERVICE_COMPANY_TEMPLATE_V1.pages.flatMap((page) =>
          page.sections.map((section) => section.id),
        ),
      ],
    );
    const row = proof.rows[0];
    assert.ok(row);
    assert.equal(row.template_key, "multi_service_company");
    assert.equal(Number(row.template_version), 1);
    assert.equal(Number(row.authoring_revision), 1);
    assert.equal(
      Number(row.page_count),
      MULTI_SERVICE_COMPANY_TEMPLATE_V1.pages.length,
    );
    assert.equal(
      Number(row.section_count),
      MULTI_SERVICE_COMPANY_TEMPLATE_V1.pages.reduce(
        (total, page) => total + page.sections.length,
        0,
      ),
    );
    assert.equal(
      Number(row.navigation_count),
      MULTI_SERVICE_COMPANY_TEMPLATE_V1.navigation.length,
    );
    assert.equal(row.all_sections_require_review, true);
    assert.equal(Number(row.copied_fixture_ids), 0);

    await assert.rejects(
      initializeManagedWebsite({
        tenantId,
        actorUserId: actorId,
        templateKey: "trust_conversion",
        settings: {
          schemaVersion: 1,
          name: "Mag niet overschrijven",
          defaultLocale: "nl-NL",
          theme: MULTI_SERVICE_COMPANY_TEMPLATE_V1.defaultTheme,
          contact,
          socialLinks: [],
          defaultSeo: {
            ...seo,
            canonicalPath: null,
            socialImageUrl: null,
          },
          analytics: { provider: "none" },
          seoSettings: {
            schemaVersion: 1,
            structuredData: {
              enabled: true,
              organizationType: "organization",
            },
            webmasterVerification: { google: null, bing: null },
          },
        },
      }),
      /Er bestaat al een website/u,
    );
    const siteCount = await pool.query<{ count: number }>(
      `SELECT count(*)::integer AS count
       FROM public.website_sites
       WHERE tenant_id = $1`,
      [tenantId],
    );
    assert.equal(Number(siteCount.rows[0]?.count), 1);
  } finally {
    if (siteId) {
      await pool.query(
        `DELETE FROM public.website_forms WHERE tenant_id = $1 AND site_id = $2`,
        [tenantId, siteId],
      );
      await pool.query(
        `DELETE FROM public.website_navigation_items WHERE tenant_id = $1 AND site_id = $2`,
        [tenantId, siteId],
      );
      await pool.query(
        `DELETE FROM public.website_page_sections WHERE tenant_id = $1 AND site_id = $2`,
        [tenantId, siteId],
      );
      await pool.query(
        `DELETE FROM public.website_pages WHERE tenant_id = $1 AND site_id = $2`,
        [tenantId, siteId],
      );
      await pool.query(
        `DELETE FROM public.website_sites WHERE tenant_id = $1 AND id = $2`,
        [tenantId, siteId],
      );
    }
    await pool.query(`DELETE FROM public.audit_log WHERE tenant_id = $1`, [
      tenantId,
    ]);
    await pool.query(`DELETE FROM public.tenant_modules WHERE tenant_id = $1`, [
      tenantId,
    ]);
    await pool.query(`DELETE FROM public.tenants WHERE id = $1`, [tenantId]);
  }
}

type SqlError = Error & { code?: string };

async function expectSqlFailure(
  client: { query: (...args: any[]) => Promise<any> },
  query: string,
  params: unknown[],
  expected: RegExp | string,
): Promise<SqlError> {
  const savepoint = `website_probe_${randomUUID().replaceAll("-", "")}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  let failure: SqlError | null = null;
  try {
    await client.query(query, params);
  } catch (error) {
    failure = error as SqlError;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  assert.ok(failure, `Expected SQL failure for ${query}`);
  if (typeof expected === "string") {
    assert.equal(failure.code, expected);
  } else {
    assert.match(failure.message, expected);
  }
  return failure;
}

const client = await pool.connect();
try {
  await verifyTemplateInitialization();
  await client.query("BEGIN");

  const catalog = await client.query<{
    tables: number;
    rls: number;
    triggers: number;
  }>(
    `SELECT
      (SELECT count(*)::integer FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'website_%') AS tables,
      (SELECT count(*)::integer FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'website_%' AND rowsecurity) AS rls,
      (SELECT count(*)::integer FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text LIKE 'website_%') AS triggers`,
  );
  assert.ok(Number(catalog.rows[0]?.tables) >= 8);
  assert.equal(catalog.rows[0]?.rls, catalog.rows[0]?.tables);
  assert.ok(Number(catalog.rows[0]?.triggers) >= 6);

  await client.query(
    `UPDATE public.tenants SET plan_key = 'enterprise' WHERE id = $1`,
    [tenantA],
  );
  await client.query(
    `INSERT INTO public.tenant_modules (tenant_id, module_id, is_enabled, source, enabled_at)
     SELECT $1, id, true, 'manual', now() FROM public.modules WHERE key = 'website'
     ON CONFLICT (tenant_id, module_id) DO UPDATE SET is_enabled = true, enabled_at = now(), disabled_at = NULL`,
    [tenantA],
  );

  const domain = await client.query<{ verified_at: Date }>(
    `INSERT INTO public.tenant_domains (
       id, tenant_id, domain, type, verification_status, verified_at
     ) VALUES ($1, $2, $3, 'custom_domain', 'verified', now())
     RETURNING verified_at`,
    [domainId, tenantA, hostname],
  );
  const verifiedAt = domain.rows[0]?.verified_at;
  assert.ok(verifiedAt);

  await client.query(
    `INSERT INTO public.website_sites (
       id, tenant_id, name, status, is_primary, delivery_mode, delivery_revision,
       template_key, template_version, theme, contact, default_seo, created_by, updated_by
     ) VALUES (
       $1, $2, 'Runtime website', 'draft', true, 'managed_cms', 1,
       'trust_conversion', 1, $3::jsonb, $4::jsonb, $5::jsonb, $6, $6
     )`,
    [
      siteId,
      tenantA,
      JSON.stringify(theme),
      JSON.stringify(contact),
      JSON.stringify(seo),
      actorA,
    ],
  );
  await client.query(
    `INSERT INTO public.website_domain_bindings (
       tenant_id, site_id, tenant_domain_id, hostname, status, is_primary,
       verified_at, created_by, updated_by
     ) VALUES ($1, $2, $3, $4, 'active', true, $5, $6, $6)`,
    [tenantA, siteId, domainId, hostname, verifiedAt, actorA],
  );

  const authoring = await client.query<{ authoring_revision: number }>(
    `SELECT authoring_revision FROM public.website_sites WHERE id = $1`,
    [siteId],
  );
  const sourceRevision = Number(authoring.rows[0]?.authoring_revision);
  assert.equal(sourceRevision, 2);

  const snapshot = {
    schemaVersion: 1,
    siteId,
    deliveryRevision: 2,
    canonicalHostname: hostname,
    defaultLocale: "nl-NL",
    theme,
    contact,
    socialLinks: [],
    defaultSeo: seo,
    pages: [
      {
        id: randomUUID(),
        locale: "nl-NL",
        path: "/",
        pageType: "home",
        title: "Home",
        seo,
        sections: [],
      },
    ],
    navigation: [],
  };
  await client.query(
    `INSERT INTO public.website_publications (
       id, tenant_id, site_id, sequence, schema_version, source_revision,
       target_delivery_revision, snapshot, content_hash, cache_key, status, created_by
     ) VALUES ($1, $2, $3, 1, 1, $4, 2, $5::jsonb, $6, $7, 'ready', $8)`,
    [
      publicationId,
      tenantA,
      siteId,
      sourceRevision,
      JSON.stringify(snapshot),
      contentHash,
      `website-publication:v1:${tenantA}:${siteId}:r2:${contentHash}`,
      actorA,
    ],
  );

  await expectSqlFailure(
    client,
    `UPDATE public.website_sites
     SET status = 'active', active_publication_id = $3, delivery_revision = 2
     WHERE tenant_id = $1 AND id = $2`,
    [tenantA, siteId, publicationId],
    /must use activate_website_delivery/u,
  );

  const managed = await client.query<{
    delivery_revision: number;
    delivery_mode: string;
  }>(
    `SELECT (activated).* FROM (
       SELECT public.activate_managed_website_publication($1, $2, $3, $4, 1, $5, 'runtime managed activation') AS activated
     ) result`,
    [tenantA, siteId, publicationId, sourceRevision, actorA],
  );
  assert.equal(managed.rows[0]?.delivery_revision, 2);
  assert.equal(managed.rows[0]?.delivery_mode, "managed_cms");
  await expectSqlFailure(
    client,
    `UPDATE public.website_sites
     SET delivery_revision = 3
     WHERE tenant_id = $1 AND id = $2`,
    [tenantA, siteId],
    /must use activate_website_delivery/u,
  );

  await expectSqlFailure(
    client,
    `INSERT INTO public.website_pages (
       tenant_id, site_id, locale, title, slug, path, page_type, status,
       seo, created_by, updated_by
     ) VALUES ($1, $2, 'nl-NL', 'Cross tenant', 'cross-tenant', '/cross-tenant',
       'standard', 'draft', $3::jsonb, $4, $4)`,
    [tenantB, siteId, JSON.stringify(seo), actorA],
    "23503",
  );

  await expectSqlFailure(
    client,
    `INSERT INTO public.website_custom_deployments (
       tenant_id, site_id, provider_key, route_key, release_id, expected_host,
       status, approved_at, approved_by, last_checked_at, created_by
     ) VALUES ($1, $2, 'fieldgrid_vps', 'https://127.0.0.1:3000', 'bad-release', $3,
       'ready', now(), $4, now(), $4)`,
    [tenantA, siteId, hostname, actorA],
    "23514",
  );

  await client.query(
    `INSERT INTO public.website_custom_deployments (
       id, tenant_id, site_id, provider_key, route_key, release_id, expected_host,
       health_path, status, approved_at, approved_by, last_checked_at, last_health, created_by
     ) VALUES (
       $1, $2, $3, 'fieldgrid_vps', 'veele_marketing_primary', 'runtime-release-1', $4,
       '/api/health', 'ready', now(), $5, now(), $6::jsonb, $5
     )`,
    [
      customDeploymentId,
      tenantA,
      siteId,
      hostname,
      actorA,
      JSON.stringify({
        schemaVersion: 3,
        status: "healthy",
        providerKey: "fieldgrid_vps",
        routeKey: "veele_marketing_primary",
        releaseId: "runtime-release-1",
        expectedHost: hostname,
        tls: { valid: true },
        network: { publicAddressesOnly: true },
        seo: {
          canonical: true,
          robots: true,
          sitemap: true,
          structuredData: true,
        },
        assets: { healthy: true },
        forms: { platformEndpoint: true },
      }),
    ],
  );

  const custom = await client.query<{
    delivery_revision: number;
    delivery_mode: string;
    active_publication_id: string;
  }>(
    `SELECT (activated).* FROM (
       SELECT public.activate_website_delivery($1, $2, 2, 'custom_nextjs', $3, $4, 'runtime custom activation') AS activated
     ) result`,
    [tenantA, siteId, customDeploymentId, actorA],
  );
  assert.equal(custom.rows[0]?.delivery_revision, 3);
  assert.equal(custom.rows[0]?.delivery_mode, "custom_nextjs");
  assert.equal(custom.rows[0]?.active_publication_id, publicationId);

  const runtimeRoutes = createCustomWebsiteRouteRegistry([
    {
      providerKey: "fieldgrid_vps",
      routeKey: "veele_marketing_primary",
      releaseId: "runtime-release-1",
      expectedHosts: [hostname],
      healthPath: "/api/health",
      status: "routable",
      upstreamOrigin: "https://custom-runtime.fieldgrid.nl",
    },
  ]);
  const transactionQuery: WebsiteRuntimeQuery = async (text, values) => {
    const result = await client.query(text, [...values]);
    return { rows: result.rows };
  };
  const customResolution = await resolveWebsiteDeliveryByHost(hostname, {
    query: transactionQuery,
    customRoutes: runtimeRoutes,
    now: new Date(),
  });
  assert.equal(customResolution.status, "ready");
  if (customResolution.status === "ready") {
    assert.equal(customResolution.deliveryMode, "custom_nextjs");
  }

  await client.query(
    `UPDATE public.website_custom_deployments
     SET last_checked_at = now() - interval '10 minutes'
     WHERE tenant_id = $1 AND id = $2`,
    [tenantA, customDeploymentId],
  );
  const staleCustomResolution = await resolveWebsiteDeliveryByHost(hostname, {
    query: transactionQuery,
    customRoutes: runtimeRoutes,
    now: new Date(),
  });
  assert.deepEqual(staleCustomResolution, {
    status: "unavailable",
    reason: "custom_health_stale",
  });
  await client.query(
    `UPDATE public.website_custom_deployments
     SET last_checked_at = now()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantA, customDeploymentId],
  );

  const preservedManagedPublication = await client.query<{ status: string }>(
    `SELECT status
     FROM public.website_publications
     WHERE tenant_id = $1 AND site_id = $2 AND id = $3`,
    [tenantA, siteId, publicationId],
  );
  assert.equal(preservedManagedPublication.rows[0]?.status, "superseded");

  await expectSqlFailure(
    client,
    `UPDATE public.website_custom_deployments SET route_key = 'rewritten_route' WHERE id = $1`,
    [customDeploymentId],
    /approved custom website deployments are immutable/u,
  );
  await expectSqlFailure(
    client,
    `UPDATE public.website_publications SET snapshot = '{"rewritten":true}'::jsonb WHERE id = $1`,
    [publicationId],
    /ready website publications are immutable/u,
  );
  await expectSqlFailure(
    client,
    `UPDATE public.website_delivery_activations SET reason = 'rewritten' WHERE site_id = $1`,
    [siteId],
    /append-only/u,
  );

  const rollbackSnapshot = { ...snapshot, deliveryRevision: 4 };
  await client.query(
    `INSERT INTO public.website_publications (
       id, tenant_id, site_id, sequence, schema_version, source_revision,
       target_delivery_revision, snapshot, content_hash, cache_key, status, created_by
     ) VALUES ($1, $2, $3, 2, 1, $4, 4, $5::jsonb, $6, $7, 'ready', $8)`,
    [
      rollbackPublicationId,
      tenantA,
      siteId,
      sourceRevision,
      JSON.stringify(rollbackSnapshot),
      rollbackContentHash,
      `website-publication:v1:${tenantA}:${siteId}:r4:${rollbackContentHash}`,
      actorA,
    ],
  );

  const restoredManaged = await client.query<{ delivery_revision: number }>(
    `SELECT (activated).* FROM (
       SELECT public.activate_managed_website_publication($1, $2, $3, $4, 3, $5, 'runtime managed rollback') AS activated
     ) result`,
    [tenantA, siteId, rollbackPublicationId, sourceRevision, actorA],
  );
  assert.equal(restoredManaged.rows[0]?.delivery_revision, 4);

  await client.query(
    `UPDATE public.tenants SET plan_key = 'professional' WHERE id = $1`,
    [tenantA],
  );
  await expectSqlFailure(
    client,
    `SELECT public.activate_website_delivery($1, $2, 4, 'custom_nextjs', $3, $4, 'runtime non-enterprise probe')`,
    [tenantA, siteId, customDeploymentId, actorA],
    /requires an enterprise tenant/u,
  );
  await expectSqlFailure(
    client,
    `SELECT public.activate_website_delivery($1, $2, 3, 'custom_nextjs', $3, $4, 'runtime stale revision probe')`,
    [tenantA, siteId, customDeploymentId, actorA],
    /revision conflict/u,
  );

  const deliveryOperationId = randomUUID();
  await client.query(
    `INSERT INTO public.website_delivery_operations (
       id, tenant_id, site_id, operation_type, environment, status,
       from_mode, from_target_id, to_mode, to_target_id,
       expected_revision, new_revision, change_reference, reason,
       preflight_evidence, actor_user_id
     ) VALUES (
       $1, $2, $3, 'activate', 'staging', 'succeeded',
       'managed_cms', $4, 'custom_nextjs', $5,
       2, 3, 'FG-WEB-9/runtime', 'Runtime append-only operation evidence.',
       '{"schemaVersion":1,"status":"ready","productionEnabled":false}'::jsonb,
       $6
     )`,
    [
      deliveryOperationId,
      tenantA,
      siteId,
      publicationId,
      customDeploymentId,
      actorA,
    ],
  );
  await expectSqlFailure(
    client,
    `UPDATE public.website_delivery_operations
     SET reason = 'rewritten'
     WHERE id = $1`,
    [deliveryOperationId],
    /append-only/u,
  );
  await expectSqlFailure(
    client,
    `INSERT INTO public.website_delivery_operations (
       tenant_id, site_id, operation_type, environment, status,
       from_mode, to_mode, to_target_id, expected_revision, new_revision,
       change_reference, reason, preflight_evidence, actor_user_id
     ) VALUES (
       $1, $2, 'activate', 'production', 'failed',
       'managed_cms', 'custom_nextjs', $3, 1, NULL,
       'FG-WEB-9/production', 'Production must be rejected.',
       '{"schemaVersion":1,"status":"blocked"}'::jsonb, $4
     )`,
    [tenantA, siteId, customDeploymentId, actorA],
    "23514",
  );

  const roleSavepoint = `website_role_${randomUUID().replaceAll("-", "")}`;
  await client.query(`SAVEPOINT ${roleSavepoint}`);
  await client.query("SET LOCAL ROLE authenticated");
  await client.query("SET LOCAL row_security = on");
  let directReadError: SqlError | null = null;
  try {
    await client.query(`SELECT id FROM public.website_sites WHERE id = $1`, [
      siteId,
    ]);
  } catch (error) {
    directReadError = error as SqlError;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${roleSavepoint}`);
  await client.query(`RELEASE SAVEPOINT ${roleSavepoint}`);
  assert.equal(directReadError?.code, "42501");

  const activationRows = await client.query<{ count: number }>(
    `SELECT count(*)::integer AS count FROM public.website_delivery_activations WHERE site_id = $1`,
    [siteId],
  );
  assert.equal(activationRows.rows[0]?.count, 3);

  const auditRows = await client.query<{ count: number }>(
    `SELECT count(*)::integer AS count
     FROM public.audit_log
     WHERE tenant_id = $1 AND resource = 'website' AND resource_id = $2`,
    [tenantA, siteId],
  );
  assert.equal(auditRows.rows[0]?.count, 3);

  process.stdout.write(
    `${JSON.stringify(
      {
        websiteModuleRuntime: "passed",
        assertions: {
          schemaAndRls: true,
          directBrowserRoleDenied: true,
          compositeTenantOwnership: true,
          arbitraryUpstreamRejected: true,
          managedActivation: true,
          customActivation: true,
          allowlistedCustomResolution: true,
          staleCustomHealthFailsClosed: true,
          managedPublicationDemotedInCustomMode: true,
          managedRollback: true,
          exactRevision: true,
          enterpriseCustomGate: true,
          immutablePublication: true,
          immutableApprovedDeployment: true,
          appendOnlyActivationHistory: true,
          appendOnlyOperationEvidence: true,
          productionOperationRejected: true,
          auditTrail: true,
        },
      },
      null,
      2,
    )}\n`,
  );

  await client.query("ROLLBACK");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
