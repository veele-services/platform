import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  convertWebsiteSubmissionToLead,
  getWebsiteSubmission,
  pool,
  redactWebsiteSubmission,
  submitPublicWebsiteForm,
} from "../lib/db/src/index.ts";
import {
  websitePublicationCacheIdentity,
  websitePublicationSnapshotSchema,
} from "../lib/website-core/src/index.ts";

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, "DATABASE_URL is required");
const parsed = new URL(databaseUrl);
assert.ok(
  ["127.0.0.1", "localhost", "::1", "postgres"].includes(parsed.hostname),
  "Website forms runtime proof only runs against local/disposable PostgreSQL",
);
assert.match(
  parsed.pathname,
  /(runtime|safety|test|smoke)/u,
  "Database name must clearly identify a disposable runtime database",
);

process.env.WEBSITE_FORM_HASH_SECRET =
  "runtime-only-website-form-secret-000000000000000000000000";
process.env.NODE_ENV = "test";

const tenantA = "10000000-0000-4000-8000-000000000001";
const tenantB = "10000000-0000-4000-8000-000000000002";
const actorA = "20000000-0000-4000-8000-000000000102";
const siteId = randomUUID();
const domainId = randomUUID();
const bindingId = randomUUID();
const formId = randomUUID();
const pageId = randomUUID();
const publicationId = randomUUID();
const hostname = `forms-${randomUUID()}.runtime.fieldgrid.test`;
const leadEmail = `lead-${randomUUID()}@example.test`;
const contentHash = "6".repeat(64);

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
  companyName: "Forms Runtime",
  email: null,
  phone: null,
  street: null,
  postalCode: null,
  city: null,
  countryCode: "NL",
  openingHours: [],
};
const seo = {
  title: "Forms Runtime",
  description: "Disposable proof for tenant-scoped website forms.",
  socialImageMediaId: null,
  indexable: false,
};
const fields = [
  {
    key: "name",
    label: "Naam",
    required: true,
    placeholder: null,
  },
  {
    key: "email",
    label: "E-mailadres",
    required: true,
    placeholder: null,
  },
  {
    key: "message",
    label: "Bericht",
    required: true,
    placeholder: null,
  },
];

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
       delivery_revision, default_locale, theme, contact, default_seo,
       created_by, updated_by
     ) VALUES (
       $1, $2, 'Forms runtime', 'draft', false, 'managed_cms',
       1, 'nl-NL', $3::jsonb, $4::jsonb, $5::jsonb, $6, $6
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
  await pool.query(
    `INSERT INTO public.website_domain_bindings (
       id, tenant_id, site_id, tenant_domain_id, hostname, status, is_primary,
       verified_at, created_by, updated_by
     ) VALUES ($1, $2, $3, $4, $5, 'active', true, now(), $6, $6)`,
    [bindingId, tenantA, siteId, domainId, hostname, actorA],
  );
  await pool.query(
    `INSERT INTO public.website_forms (
       id, tenant_id, site_id, key, locale, kind, name, fields,
       submit_label, success_message, notification_email, status,
       created_by, updated_by
     ) VALUES (
       $1, $2, $3, 'contact', 'nl-NL', 'contact', 'Contactformulier',
       $4::jsonb, 'Versturen', 'Bedankt.', NULL, 'published', $5, $5
     )`,
    [formId, tenantA, siteId, JSON.stringify(fields), actorA],
  );
  const revisionResult = await pool.query<{ authoring_revision: number }>(
    `SELECT authoring_revision
     FROM public.website_sites
     WHERE tenant_id = $1 AND id = $2`,
    [tenantA, siteId],
  );
  const sourceRevision = Number(revisionResult.rows[0]?.authoring_revision);
  assert.ok(sourceRevision >= 3);

  const snapshot = websitePublicationSnapshotSchema.parse({
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
        id: pageId,
        locale: "nl-NL",
        path: "/",
        pageType: "home",
        title: "Home",
        seo,
        sections: [],
      },
    ],
    navigation: [],
    redirects: [],
    blog: { categories: [], tags: [], posts: [] },
    forms: [
      {
        id: formId,
        key: "contact",
        locale: "nl-NL",
        kind: "contact",
        name: "Contactformulier",
        fields,
        submitLabel: "Versturen",
        successMessage: "Bedankt.",
      },
    ],
  });
  const identity = websitePublicationCacheIdentity({
    tenantId: tenantA,
    siteId,
    deliveryRevision: 2,
    contentHash,
  });
  await pool.query(
    `INSERT INTO public.website_publications (
       id, tenant_id, site_id, sequence, schema_version, source_revision,
       target_delivery_revision, snapshot, content_hash, cache_key, status,
       created_by
     ) VALUES (
       $1, $2, $3, 1, 1, $4, 2, $5::jsonb, $6, $7, 'ready', $8
     )`,
    [
      publicationId,
      tenantA,
      siteId,
      sourceRevision,
      JSON.stringify(snapshot),
      contentHash,
      identity.cacheKey,
      actorA,
    ],
  );
  await pool.query(
    `SELECT public.activate_managed_website_publication(
       $1, $2, $3, $4, 1, $5, 'Phase 6 runtime activation'
     )`,
    [tenantA, siteId, publicationId, sourceRevision, actorA],
  );

  const idempotencyKey = `runtime-${randomUUID()}`;
  const payload = {
    name: "Runtime Lead",
    email: leadEmail,
    message: "Graag contact opnemen.",
  };
  const first = await submitPublicWebsiteForm({
    host: hostname,
    formId,
    data: payload,
    idempotencyKey,
    networkSignal: "runtime-network-main",
    userAgent: "fieldgrid-runtime",
    honeypot: "",
  });
  assert.equal(first.accepted, true);
  assert.equal(first.replayed, false);

  const replay = await submitPublicWebsiteForm({
    host: hostname,
    formId,
    data: payload,
    idempotencyKey,
    networkSignal: "runtime-network-main",
    userAgent: "fieldgrid-runtime",
    honeypot: "",
  });
  assert.equal(replay.reference, first.reference);
  assert.equal(replay.replayed, true);
  await assert.rejects(
    submitPublicWebsiteForm({
      host: hostname,
      formId,
      data: { ...payload, message: "Andere inhoud." },
      idempotencyKey,
      networkSignal: "runtime-network-main",
      userAgent: "fieldgrid-runtime",
      honeypot: "",
    }),
    /idempotentiesleutel/u,
  );
  await assert.rejects(
    submitPublicWebsiteForm({
      host: "unknown.runtime.fieldgrid.test",
      formId,
      data: payload,
      idempotencyKey: `runtime-${randomUUID()}`,
      networkSignal: "runtime-network-unknown",
      userAgent: "fieldgrid-runtime",
      honeypot: "",
    }),
    /niet beschikbaar/u,
  );

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const acceptedSpam = await submitPublicWebsiteForm({
      host: hostname,
      formId,
      data: {},
      idempotencyKey: `runtime-${randomUUID()}`,
      networkSignal: "runtime-network-throttle",
      userAgent: "fieldgrid-runtime",
      honeypot: "https://spam.invalid",
    });
    assert.equal(acceptedSpam.accepted, true);
  }
  await assert.rejects(
    submitPublicWebsiteForm({
      host: hostname,
      formId,
      data: {},
      idempotencyKey: `runtime-${randomUUID()}`,
      networkSignal: "runtime-network-throttle",
      userAgent: "fieldgrid-runtime",
      honeypot: "https://spam.invalid",
    }),
    /Te veel formulierverzoeken/u,
  );

  const storedSubmission = await getWebsiteSubmission(tenantA, first.reference);
  assert.equal(storedSubmission?.notificationStatus, "skipped");
  assert.equal(await getWebsiteSubmission(tenantB, first.reference), null);

  const converted = await convertWebsiteSubmissionToLead({
    tenantId: tenantA,
    actorUserId: actorA,
    submissionId: first.reference,
  });
  assert.equal(converted.created, true);
  const replayedConversion = await convertWebsiteSubmissionToLead({
    tenantId: tenantA,
    actorUserId: actorA,
    submissionId: first.reference,
  });
  assert.deepEqual(replayedConversion, {
    customerId: converted.customerId,
    created: false,
  });
  const customer = await pool.query<{ status: string; tenant_id: string }>(
    `SELECT status, tenant_id
     FROM public.customers
     WHERE id = $1`,
    [converted.customerId],
  );
  assert.deepEqual(customer.rows[0], {
    status: "lead",
    tenant_id: tenantA,
  });

  await redactWebsiteSubmission({
    tenantId: tenantA,
    actorUserId: actorA,
    submissionId: first.reference,
  });
  const redacted = await getWebsiteSubmission(tenantA, first.reference);
  assert.equal(redacted?.isRedacted, true);
  assert.deepEqual(redacted?.payload, {});
  assert.equal(redacted?.contactEmail, null);
  assert.equal(redacted?.customerId, converted.customerId);
  assert.ok(
    redacted?.events.some((event) => event.eventType === "converted_to_lead"),
  );
  assert.ok(redacted?.events.some((event) => event.eventType === "redacted"));

  await assert.rejects(
    pool.query(
      `UPDATE public.website_form_submissions
       SET tenant_id = $2
       WHERE tenant_id = $1 AND id = $3`,
      [tenantA, tenantB, first.reference],
    ),
    /source identity is immutable/u,
  );
  const privileges = await pool.query<{
    form_read: boolean;
    submission_read: boolean;
  }>(
    `SELECT
       has_table_privilege(
         'authenticated', 'public.website_forms', 'SELECT'
       ) AS form_read,
       has_table_privilege(
         'authenticated', 'public.website_form_submissions', 'SELECT'
       ) AS submission_read`,
  );
  assert.deepEqual(privileges.rows[0], {
    form_read: false,
    submission_read: false,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        websiteFormsRuntime: "passed",
        assertions: {
          exactHostTenantResolution: true,
          activeManagedSnapshotContract: true,
          durableSubmissionBeforeNotification: true,
          stableIdempotentReplay: true,
          conflictingReplayRejected: true,
          unknownHostRejected: true,
          durableThrottling: true,
          honeypotSuppressed: true,
          tenantInboxIsolation: true,
          notificationStateDurable: true,
          explicitLeadConversion: true,
          idempotentLeadConversion: true,
          tenantOwnedLead: true,
          irreversibleRedaction: true,
          lifecycleTimeline: true,
          directBrowserReadDenied: true,
          immutableSubmissionOwnership: true,
        },
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await pool.end();
}
