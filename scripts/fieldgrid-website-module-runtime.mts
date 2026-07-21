import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { pool } from "../lib/db/src/index.ts";

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
const customDeploymentId = randomUUID();
const domainId = randomUUID();
const hostname = `website-${randomUUID()}.runtime.fieldgrid.test`;
const contentHash = "a".repeat(64);

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

  const snapshot = {
    schemaVersion: 1,
    siteId,
    deliveryRevision: 1,
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
       snapshot, content_hash, status, created_by
     ) VALUES ($1, $2, $3, 1, 1, 1, $4::jsonb, $5, 'ready', $6)`,
    [
      publicationId,
      tenantA,
      siteId,
      JSON.stringify(snapshot),
      contentHash,
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
       SELECT public.activate_website_delivery($1, $2, 1, 'managed_cms', $3, $4, 'runtime managed activation') AS activated
     ) result`,
    [tenantA, siteId, publicationId, actorA],
  );
  assert.equal(managed.rows[0]?.delivery_revision, 2);
  assert.equal(managed.rows[0]?.delivery_mode, "managed_cms");

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
       '/api/health', 'ready', now(), $5, now(), '{"ok":true}'::jsonb, $5
     )`,
    [customDeploymentId, tenantA, siteId, hostname, actorA],
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

  const restoredManaged = await client.query<{ delivery_revision: number }>(
    `SELECT (activated).* FROM (
       SELECT public.activate_website_delivery($1, $2, 3, 'managed_cms', $3, $4, 'runtime managed rollback') AS activated
     ) result`,
    [tenantA, siteId, publicationId, actorA],
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
          managedRollback: true,
          exactRevision: true,
          enterpriseCustomGate: true,
          immutablePublication: true,
          immutableApprovedDeployment: true,
          appendOnlyActivationHistory: true,
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
