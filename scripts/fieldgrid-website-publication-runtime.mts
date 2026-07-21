import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  activateManagedWebsitePublication,
  createManagedWebsitePublication,
  pool,
  setPrimaryWebsiteDomain,
} from "../lib/db/src/index.ts";

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, "DATABASE_URL is required");
const parsed = new URL(databaseUrl);
assert.ok(
  ["127.0.0.1", "localhost", "::1", "postgres"].includes(parsed.hostname),
  "Website publication runtime proof only runs against local/disposable PostgreSQL",
);
assert.match(
  parsed.pathname,
  /(runtime|safety|test|smoke)/u,
  "Database name must clearly identify a disposable runtime database",
);

const tenantA = "10000000-0000-4000-8000-000000000001";
const actorA = "20000000-0000-4000-8000-000000000201";
const siteId = randomUUID();
const competingSiteId = randomUUID();
const domainId = randomUUID();
const hostname = `publication-${randomUUID()}.runtime.fieldgrid.test`;
const homePageId = randomUUID();
const contactPageId = randomUUID();
const heroSectionId = randomUUID();
const homeNavigationId = randomUUID();
const contactNavigationId = randomUUID();

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
  companyName: "Publication Runtime",
  email: "publication@example.test",
  phone: "+31100000000",
  street: null,
  postalCode: null,
  city: null,
  countryCode: "NL",
  openingHours: [],
};
const seo = {
  title: "Publication Runtime",
  description:
    "Disposable runtime validation for exact website publication revisions.",
  socialImageMediaId: null,
  indexable: true,
};

async function currentAuthoringRevision(): Promise<number> {
  const result = await pool.query<{ authoring_revision: number }>(
    `SELECT authoring_revision
     FROM public.website_sites
     WHERE tenant_id = $1 AND id = $2`,
    [tenantA, siteId],
  );
  return Number(result.rows[0]?.authoring_revision);
}

try {
  await pool.query(
    `UPDATE public.tenants
     SET is_active = true, status = 'active', plan_key = 'enterprise'
     WHERE id = $1`,
    [tenantA],
  );
  await pool.query(
    `INSERT INTO public.tenant_modules (
       tenant_id, module_id, is_enabled, source, enabled_at
     )
     SELECT $1, id, true, 'manual', now()
     FROM public.modules
     WHERE key = 'website'
     ON CONFLICT (tenant_id, module_id) DO UPDATE
     SET is_enabled = true, enabled_at = now(), disabled_at = NULL`,
    [tenantA],
  );
  await pool.query(
    `INSERT INTO public.tenant_domains (
       id, tenant_id, domain, type, verification_status, verified_at
     ) VALUES ($1, $2, $3, 'custom_domain', 'verified', now())`,
    [domainId, tenantA, hostname],
  );
  await pool.query(
    `INSERT INTO public.website_sites (
       id, tenant_id, name, status, is_primary, delivery_mode,
       template_key, template_version, theme, contact, default_seo,
       created_by, updated_by
     ) VALUES (
       $1, $2, 'Publication runtime', 'draft', false, 'managed_cms',
       'trust_conversion', 1, $3::jsonb, $4::jsonb, $5::jsonb, $6, $6
     ), (
       $7, $2, 'Competing runtime site', 'draft', false, 'managed_cms',
       'trust_conversion', 1, $3::jsonb, $4::jsonb, $5::jsonb, $6, $6
     )`,
    [
      siteId,
      tenantA,
      JSON.stringify(theme),
      JSON.stringify(contact),
      JSON.stringify(seo),
      actorA,
      competingSiteId,
    ],
  );

  const domain = await setPrimaryWebsiteDomain({
    tenantId: tenantA,
    siteId,
    tenantDomainId: domainId,
    expectedAuthoringRevision: 1,
    actorUserId: actorA,
    reason: "runtime verified primary domain",
  });
  assert.equal(domain.hostname, hostname);
  assert.equal(domain.authoringRevision, 2);

  await assert.rejects(
    setPrimaryWebsiteDomain({
      tenantId: tenantA,
      siteId,
      tenantDomainId: domainId,
      expectedAuthoringRevision: 1,
      actorUserId: actorA,
      reason: "runtime stale domain revision",
    }),
    /authoring revision conflict/u,
  );
  await assert.rejects(
    setPrimaryWebsiteDomain({
      tenantId: tenantA,
      siteId: competingSiteId,
      tenantDomainId: domainId,
      expectedAuthoringRevision: 1,
      actorUserId: actorA,
      reason: "runtime domain reuse probe",
    }),
    /already bound to another site/u,
  );

  await pool.query(
    `INSERT INTO public.website_pages (
       id, tenant_id, site_id, locale, title, slug, path, page_type,
       status, is_homepage, seo, published_at, created_by, updated_by
     ) VALUES (
       $1, $2, $3, 'nl-NL', 'Home versie één', '', '/', 'home',
       'published', true, $4::jsonb, now(), $5, $5
     ), (
       $6, $2, $3, 'nl-NL', 'Contact', 'contact', '/contact', 'contact',
       'published', false, $4::jsonb, now(), $5, $5
     )`,
    [homePageId, tenantA, siteId, JSON.stringify(seo), actorA, contactPageId],
  );
  await pool.query(
    `INSERT INTO public.website_page_sections (
       id, tenant_id, site_id, page_id, section_key, schema_version,
       variant_key, position, content, is_visible, created_by, updated_by
     ) VALUES (
       $1, $2, $3, $4, 'hero', 1, 'split', 0, $5::jsonb, true, $6, $6
     )`,
    [
      heroSectionId,
      tenantA,
      siteId,
      homePageId,
      JSON.stringify({
        title: "Veilig gepubliceerd",
        primaryAction: {
          kind: "page",
          label: "Contact",
          pageId: contactPageId,
        },
        badges: [],
      }),
      actorA,
    ],
  );
  await pool.query(
    `INSERT INTO public.website_navigation_items (
       id, tenant_id, site_id, page_id, location, label, link_type,
       target, position, is_visible, created_by, updated_by
     ) VALUES (
       $1, $2, $3, $4, 'header', 'Home', 'page', 'self', 0, true, $5, $5
     ), (
       $6, $2, $3, $7, 'header', 'Contact', 'page', 'self', 1, true, $5, $5
     )`,
    [
      homeNavigationId,
      tenantA,
      siteId,
      homePageId,
      actorA,
      contactNavigationId,
      contactPageId,
    ],
  );

  await assert.rejects(
    pool.query(
      `UPDATE public.website_domain_bindings
       SET site_id = $3, updated_by = $4, updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantA, domain.id, competingSiteId, actorA],
    ),
    /website child ownership is immutable/u,
  );

  const revisionOne = await currentAuthoringRevision();
  assert.ok(revisionOne > 2, "Child mutations must advance authoring revision");
  const [candidateOne, idempotentCandidate] = await Promise.all([
    createManagedWebsitePublication({
      tenantId: tenantA,
      siteId,
      expectedAuthoringRevision: revisionOne,
      actorUserId: actorA,
      reason: "runtime first immutable candidate",
    }),
    createManagedWebsitePublication({
      tenantId: tenantA,
      siteId,
      expectedAuthoringRevision: revisionOne,
      actorUserId: actorA,
      reason: "runtime concurrent idempotent publication retry",
    }),
  ]);
  assert.equal(candidateOne.targetDeliveryRevision, 2);
  assert.equal(candidateOne.snapshot.pages[0]?.title, "Home versie één");
  assert.match(candidateOne.cacheKey, new RegExp(`${siteId}:r2:`, "u"));
  assert.equal(idempotentCandidate.id, candidateOne.id);

  const storedCandidate = await pool.query<{
    target_delivery_revision: number;
    cache_key: string;
  }>(
    `SELECT target_delivery_revision, cache_key
     FROM public.website_publications
     WHERE id = $1`,
    [candidateOne.id],
  );
  assert.equal(storedCandidate.rows[0]?.target_delivery_revision, 2);
  assert.equal(storedCandidate.rows[0]?.cache_key, candidateOne.cacheKey);

  await pool.query(
    `UPDATE public.website_pages
     SET navigation_label = 'Home', updated_by = $3, updated_at = now()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantA, homePageId, actorA],
  );
  const metadataOnlyRevision = await currentAuthoringRevision();
  assert.equal(metadataOnlyRevision, revisionOne + 1);
  const sameOutputCandidate = await createManagedWebsitePublication({
    tenantId: tenantA,
    siteId,
    expectedAuthoringRevision: metadataOnlyRevision,
    actorUserId: actorA,
    reason: "runtime revision-bound identical output candidate",
  });
  assert.notEqual(sameOutputCandidate.id, candidateOne.id);
  assert.notEqual(sameOutputCandidate.contentHash, candidateOne.contentHash);
  assert.deepEqual(sameOutputCandidate.snapshot, candidateOne.snapshot);

  await pool.query(
    `UPDATE public.website_pages
     SET title = 'Home versie twee', updated_by = $3, updated_at = now()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantA, homePageId, actorA],
  );
  const revisionTwo = await currentAuthoringRevision();
  assert.equal(revisionTwo, metadataOnlyRevision + 1);
  assert.equal(candidateOne.snapshot.pages[0]?.title, "Home versie één");

  await assert.rejects(
    activateManagedWebsitePublication({
      tenantId: tenantA,
      siteId,
      publicationId: candidateOne.id,
      expectedAuthoringRevision: revisionOne,
      expectedDeliveryRevision: 1,
      actorUserId: actorA,
      reason: "runtime stale source activation",
    }),
    /authoring revision conflict/u,
  );

  const candidateTwo = await createManagedWebsitePublication({
    tenantId: tenantA,
    siteId,
    expectedAuthoringRevision: revisionTwo,
    actorUserId: actorA,
    reason: "runtime current immutable candidate",
  });
  const firstActivation = await activateManagedWebsitePublication({
    tenantId: tenantA,
    siteId,
    publicationId: candidateTwo.id,
    expectedAuthoringRevision: revisionTwo,
    expectedDeliveryRevision: 1,
    actorUserId: actorA,
    reason: "runtime exact first activation",
  });
  assert.equal(firstActivation.deliveryRevision, 2);
  assert.equal(firstActivation.publicationId, candidateTwo.id);

  await assert.rejects(
    pool.query(
      `UPDATE public.website_publications
       SET snapshot = '{"rewritten":true}'::jsonb
       WHERE id = $1`,
      [candidateTwo.id],
    ),
    /immutable/u,
  );

  await pool.query(
    `UPDATE public.website_pages
     SET title = 'Home versie drie', updated_by = $3, updated_at = now()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantA, homePageId, actorA],
  );
  const revisionThree = await currentAuthoringRevision();
  const candidateThree = await createManagedWebsitePublication({
    tenantId: tenantA,
    siteId,
    expectedAuthoringRevision: revisionThree,
    actorUserId: actorA,
    reason: "runtime replacement candidate",
  });
  assert.equal(candidateThree.targetDeliveryRevision, 3);

  await assert.rejects(
    activateManagedWebsitePublication({
      tenantId: tenantA,
      siteId,
      publicationId: candidateThree.id,
      expectedAuthoringRevision: revisionThree,
      expectedDeliveryRevision: 1,
      actorUserId: actorA,
      reason: "runtime stale delivery activation",
    }),
    /delivery revision conflict/u,
  );

  const replacement = await activateManagedWebsitePublication({
    tenantId: tenantA,
    siteId,
    publicationId: candidateThree.id,
    expectedAuthoringRevision: revisionThree,
    expectedDeliveryRevision: 2,
    actorUserId: actorA,
    reason: "runtime exact replacement activation",
  });
  assert.equal(replacement.deliveryRevision, 3);

  const publicationStates = await pool.query<{
    id: string;
    status: string;
  }>(
    `SELECT id, status
     FROM public.website_publications
     WHERE tenant_id = $1 AND site_id = $2`,
    [tenantA, siteId],
  );
  const statuses = new Map(
    publicationStates.rows.map((row) => [row.id, row.status]),
  );
  assert.equal(statuses.get(candidateTwo.id), "superseded");
  assert.equal(statuses.get(candidateThree.id), "active");
  assert.equal(
    publicationStates.rows.filter((row) => row.status === "active").length,
    1,
  );

  await pool.query(
    `UPDATE public.website_pages
     SET title = 'Niet live concept', updated_by = $3, updated_at = now()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantA, homePageId, actorA],
  );
  const liveSnapshot = await pool.query<{
    title: string;
  }>(
    `SELECT snapshot #>> '{pages,0,title}' AS title
     FROM public.website_publications
     WHERE id = $1`,
    [candidateThree.id],
  );
  assert.equal(liveSnapshot.rows[0]?.title, "Home versie drie");

  const browserClient = await pool.connect();
  try {
    await browserClient.query("BEGIN");
    await browserClient.query("SET LOCAL ROLE authenticated");
    await browserClient.query("SET LOCAL row_security = on");
    await assert.rejects(
      browserClient.query(
        `SELECT public.activate_managed_website_publication(
           $1, $2, $3, $4, $5, $6, 'forbidden browser activation'
         )`,
        [tenantA, siteId, candidateThree.id, revisionThree, 3, actorA],
      ),
      (error: unknown) =>
        Boolean(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "42501",
        ),
    );
    await browserClient.query("ROLLBACK");
  } finally {
    browserClient.release();
  }

  const audit = await pool.query<{ count: number }>(
    `SELECT count(*)::integer AS count
     FROM public.audit_log
     WHERE tenant_id = $1
       AND resource = 'website'
       AND (
         resource_id = $2
         OR metadata ->> 'siteId' = $2
       )`,
    [tenantA, siteId],
  );
  assert.ok(Number(audit.rows[0]?.count) >= 6);

  process.stdout.write(
    `${JSON.stringify(
      {
        websitePublicationRuntime: "passed",
        assertions: {
          verifiedPrimaryDomainOnly: true,
          staleDomainRevisionRejected: true,
          domainReuseRejected: true,
          childMutationAdvancesRevision: true,
          childOwnershipImmutable: true,
          deterministicPublicationCreated: true,
          exactCacheIdentityPersisted: true,
          concurrentIdempotentPublicationRetry: true,
          identicalOutputBoundToSourceRevision: true,
          staleAuthoringActivationRejected: true,
          staleDeliveryActivationRejected: true,
          immutableSnapshot: true,
          previousPublicationSuperseded: true,
          exactlyOneActiveManagedPublication: true,
          draftCannotAlterLiveSnapshot: true,
          browserExecutionDenied: true,
          auditTrail: true,
        },
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await pool.end();
}
