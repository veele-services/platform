import type {
  ManagedWebsiteResolution,
  WebsiteRuntimeDatabaseRow,
} from "@workspace/db/website-public-runtime";
import {
  TRUST_CONVERSION_TEMPLATE_V1,
  websitePublicationCacheIdentity,
  websitePublicationSnapshotSchema,
  type WebsitePublicationSnapshot,
} from "@workspace/website-core";

export const TEST_IDS = {
  tenant: "20000000-0000-4000-8000-000000000001",
  site: "20000000-0000-4000-8000-000000000002",
  publication: "20000000-0000-4000-8000-000000000003",
  page: "20000000-0000-4000-8000-000000000004",
  customDeployment: "20000000-0000-4000-8000-000000000005",
};

export const TEST_HASH = "a".repeat(64);

export function publicationSnapshot(
  hostname = "alpha.fieldgrid.nl",
  deliveryRevision = 3,
): WebsitePublicationSnapshot {
  return websitePublicationSnapshotSchema.parse({
    schemaVersion: 1,
    siteId: TEST_IDS.site,
    deliveryRevision,
    canonicalHostname: hostname,
    defaultLocale: "nl-NL",
    theme: {
      schemaVersion: 1,
      colors: {
        background: "#ffffff",
        foreground: "#10233f",
        primary: "#086788",
        primaryForeground: "#ffffff",
        accent: "#e9f7fb",
        accentForeground: "#10233f",
      },
      headingFont: "manrope",
      bodyFont: "inter",
      radius: "medium",
      spacing: "comfortable",
      logoMediaId: null,
      faviconMediaId: null,
    },
    contact: {
      companyName: "Alpha Service",
      email: "info@alpha.example",
      phone: "+31101234567",
      street: "Voorbeeldstraat 1",
      postalCode: "3011AA",
      city: "Rotterdam",
      countryCode: "NL",
      openingHours: ["Ma–vr 08:00–17:00"],
    },
    socialLinks: [],
    defaultSeo: {
      title: "Alpha Service",
      description: "Betrouwbare lokale service.",
      socialImageMediaId: null,
      indexable: true,
    },
    pages: [
      {
        id: TEST_IDS.page,
        locale: "nl-NL",
        path: "/",
        pageType: "home",
        title: "Home",
        seo: {
          title: "Alpha Service | Home",
          description: "Betrouwbare lokale service.",
          socialImageMediaId: null,
          indexable: true,
        },
        sections: structuredClone(
          TRUST_CONVERSION_TEMPLATE_V1.pages[0].sections,
        ),
      },
    ],
    navigation: [],
  });
}

export function databaseRow(
  overrides: Partial<WebsiteRuntimeDatabaseRow> = {},
): WebsiteRuntimeDatabaseRow {
  const snapshot = publicationSnapshot();
  const identity = websitePublicationCacheIdentity({
    tenantId: TEST_IDS.tenant,
    siteId: TEST_IDS.site,
    deliveryRevision: snapshot.deliveryRevision,
    contentHash: TEST_HASH,
  });
  return {
    request_hostname: "alpha.fieldgrid.nl",
    binding_status: "active",
    binding_verified_at: "2026-07-22T00:00:00.000Z",
    tenant_domain_hostname: "alpha.fieldgrid.nl",
    tenant_domain_type: "fieldgrid_subdomain",
    tenant_domain_verification_status: "verified",
    tenant_domain_verified_at: "2026-07-22T00:00:00.000Z",
    tenant_domain_disabled_at: null,
    tenant_id: TEST_IDS.tenant,
    tenant_is_active: true,
    tenant_status: "active",
    tenant_plan_key: "enterprise",
    module_enabled: true,
    site_id: TEST_IDS.site,
    site_status: "active",
    delivery_mode: "managed_cms",
    delivery_revision: 3,
    active_publication_id: TEST_IDS.publication,
    active_custom_deployment_id: null,
    canonical_hostname: "alpha.fieldgrid.nl",
    canonical_binding_status: "active",
    canonical_binding_verified_at: "2026-07-22T00:00:00.000Z",
    canonical_domain_hostname: "alpha.fieldgrid.nl",
    canonical_domain_type: "fieldgrid_subdomain",
    canonical_domain_verification_status: "verified",
    canonical_domain_verified_at: "2026-07-22T00:00:00.000Z",
    canonical_domain_disabled_at: null,
    publication_id: TEST_IDS.publication,
    publication_status: "active",
    publication_schema_version: 1,
    publication_target_delivery_revision: 3,
    publication_snapshot: snapshot,
    publication_content_hash: TEST_HASH,
    publication_cache_key: identity.cacheKey,
    custom_deployment_id: null,
    custom_deployment_status: null,
    custom_provider_key: null,
    custom_route_key: null,
    custom_release_id: null,
    custom_expected_host: null,
    custom_health_path: null,
    custom_approved_at: null,
    custom_approved_by: null,
    custom_last_checked_at: null,
    custom_last_health: null,
    ...overrides,
  };
}

export function readyResolution(
  snapshot = publicationSnapshot(),
): Extract<ManagedWebsiteResolution, { status: "ready" }> {
  const identity = websitePublicationCacheIdentity({
    tenantId: TEST_IDS.tenant,
    siteId: TEST_IDS.site,
    deliveryRevision: snapshot.deliveryRevision,
    contentHash: TEST_HASH,
  });
  return {
    status: "ready",
    tenantId: TEST_IDS.tenant,
    siteId: TEST_IDS.site,
    publicationId: TEST_IDS.publication,
    requestHostname: "alpha.fieldgrid.nl",
    canonicalHostname: snapshot.canonicalHostname,
    deliveryRevision: snapshot.deliveryRevision,
    contentHash: TEST_HASH,
    cacheKey: identity.cacheKey,
    etag: identity.etag,
    snapshot,
    diagnostics: [],
  };
}

export function websiteRequest(
  pathname = "/",
  headers: Record<string, string> = {},
): Request {
  return new Request(`https://alpha.fieldgrid.nl${pathname}`, {
    headers: { host: "alpha.fieldgrid.nl", ...headers },
  });
}
