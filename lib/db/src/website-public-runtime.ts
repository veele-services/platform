import {
  WEBSITE_PUBLICATION_SCHEMA_VERSION,
  normalizeWebsiteRequestHost,
  parseWebsitePublicationForRuntime,
  websitePublicationCacheIdentity,
  type RuntimePublicationDiagnostic,
  type WebsitePublicationSnapshot,
} from "@workspace/website-core";

export type ManagedWebsiteUnavailableReason =
  | "ambiguous_host"
  | "domain_inactive"
  | "tenant_inactive"
  | "module_disabled"
  | "site_inactive"
  | "delivery_mode_mismatch"
  | "publication_inactive"
  | "publication_revision_mismatch"
  | "publication_identity_mismatch"
  | "publication_unsupported";

export type ManagedWebsiteResolution =
  | { status: "not_found" }
  | { status: "unavailable"; reason: ManagedWebsiteUnavailableReason }
  | {
      status: "ready";
      tenantId: string;
      siteId: string;
      publicationId: string;
      requestHostname: string;
      canonicalHostname: string;
      deliveryRevision: number;
      contentHash: string;
      cacheKey: string;
      etag: string;
      snapshot: WebsitePublicationSnapshot;
      diagnostics: RuntimePublicationDiagnostic[];
    };

export type WebsiteRuntimeDatabaseRow = {
  request_hostname: string;
  binding_status: string;
  binding_verified_at: Date | string | null;
  tenant_domain_hostname: string;
  tenant_domain_type: string;
  tenant_domain_verification_status: string;
  tenant_domain_verified_at: Date | string | null;
  tenant_domain_disabled_at: Date | string | null;
  tenant_id: string;
  tenant_is_active: boolean;
  tenant_status: string;
  module_enabled: boolean;
  site_id: string;
  site_status: string;
  delivery_mode: string;
  delivery_revision: number;
  active_publication_id: string | null;
  canonical_hostname: string | null;
  canonical_binding_status: string | null;
  canonical_binding_verified_at: Date | string | null;
  canonical_domain_hostname: string | null;
  canonical_domain_type: string | null;
  canonical_domain_verification_status: string | null;
  canonical_domain_verified_at: Date | string | null;
  canonical_domain_disabled_at: Date | string | null;
  publication_id: string | null;
  publication_status: string | null;
  publication_schema_version: number | null;
  publication_target_delivery_revision: number | null;
  publication_snapshot: unknown;
  publication_content_hash: string | null;
  publication_cache_key: string | null;
};

export type WebsiteRuntimeQuery = (
  text: string,
  values: readonly unknown[],
) => Promise<{ rows: WebsiteRuntimeDatabaseRow[] }>;

const RESOLVE_MANAGED_WEBSITE_SQL = `
SELECT
  binding.hostname AS request_hostname,
  binding.status AS binding_status,
  binding.verified_at AS binding_verified_at,
  tenant_domain.domain AS tenant_domain_hostname,
  tenant_domain.type AS tenant_domain_type,
  tenant_domain.verification_status AS tenant_domain_verification_status,
  tenant_domain.verified_at AS tenant_domain_verified_at,
  tenant_domain.disabled_at AS tenant_domain_disabled_at,
  tenant.id AS tenant_id,
  tenant.is_active AS tenant_is_active,
  tenant.status AS tenant_status,
  EXISTS (
    SELECT 1
    FROM public.tenant_modules entitlement
    JOIN public.modules module ON module.id = entitlement.module_id
    WHERE entitlement.tenant_id = tenant.id
      AND module.key = 'website'
      AND entitlement.is_enabled = true
  ) AS module_enabled,
  site.id AS site_id,
  site.status AS site_status,
  site.delivery_mode,
  site.delivery_revision,
  site.active_publication_id,
  canonical_binding.hostname AS canonical_hostname,
  canonical_binding.status AS canonical_binding_status,
  canonical_binding.verified_at AS canonical_binding_verified_at,
  canonical_domain.domain AS canonical_domain_hostname,
  canonical_domain.type AS canonical_domain_type,
  canonical_domain.verification_status AS canonical_domain_verification_status,
  canonical_domain.verified_at AS canonical_domain_verified_at,
  canonical_domain.disabled_at AS canonical_domain_disabled_at,
  publication.id AS publication_id,
  publication.status AS publication_status,
  publication.schema_version AS publication_schema_version,
  publication.target_delivery_revision AS publication_target_delivery_revision,
  publication.snapshot AS publication_snapshot,
  publication.content_hash AS publication_content_hash,
  publication.cache_key AS publication_cache_key
FROM public.website_domain_bindings binding
JOIN public.tenant_domains tenant_domain
  ON tenant_domain.tenant_id = binding.tenant_id
 AND tenant_domain.id = binding.tenant_domain_id
JOIN public.tenants tenant ON tenant.id = binding.tenant_id
JOIN public.website_sites site
  ON site.tenant_id = binding.tenant_id
 AND site.id = binding.site_id
LEFT JOIN public.website_domain_bindings canonical_binding
  ON canonical_binding.tenant_id = site.tenant_id
 AND canonical_binding.site_id = site.id
 AND canonical_binding.is_primary = true
LEFT JOIN public.tenant_domains canonical_domain
  ON canonical_domain.tenant_id = canonical_binding.tenant_id
 AND canonical_domain.id = canonical_binding.tenant_domain_id
LEFT JOIN public.website_publications publication
  ON publication.tenant_id = site.tenant_id
 AND publication.site_id = site.id
 AND publication.id = site.active_publication_id
WHERE binding.hostname = $1
LIMIT 2`;

const defaultWebsiteRuntimeQuery: WebsiteRuntimeQuery = async (
  text,
  values,
) => {
  const { pool } = await import("./connection");
  const result = await pool.query<WebsiteRuntimeDatabaseRow>(text, [...values]);
  return { rows: result.rows };
};

function unavailable(
  reason: ManagedWebsiteUnavailableReason,
): ManagedWebsiteResolution {
  return { status: "unavailable", reason };
}

/**
 * Resolves one trusted Host header to one active immutable managed publication.
 * It intentionally never reads website authoring pages or sections.
 */
export async function resolveManagedWebsiteByHost(
  rawHost: string,
  query: WebsiteRuntimeQuery = defaultWebsiteRuntimeQuery,
): Promise<ManagedWebsiteResolution> {
  const hostname = normalizeWebsiteRequestHost(rawHost);
  if (!hostname) return { status: "not_found" };

  const result = await query(RESOLVE_MANAGED_WEBSITE_SQL, [hostname]);
  if (result.rows.length === 0) return { status: "not_found" };
  if (result.rows.length !== 1) return unavailable("ambiguous_host");

  const row = result.rows[0]!;
  if (
    row.request_hostname !== hostname ||
    row.tenant_domain_hostname !== hostname ||
    row.binding_status !== "active" ||
    !row.binding_verified_at ||
    row.tenant_domain_type === "platform_reserved" ||
    !["verified", "active"].includes(row.tenant_domain_verification_status) ||
    !row.tenant_domain_verified_at ||
    row.tenant_domain_disabled_at
  ) {
    return unavailable("domain_inactive");
  }
  if (
    !row.tenant_is_active ||
    !["trial", "active"].includes(row.tenant_status)
  ) {
    return unavailable("tenant_inactive");
  }
  if (!row.module_enabled) return unavailable("module_disabled");
  if (row.site_status !== "active") return unavailable("site_inactive");
  if (row.delivery_mode !== "managed_cms") {
    return unavailable("delivery_mode_mismatch");
  }
  if (
    !row.active_publication_id ||
    !row.publication_id ||
    row.publication_id !== row.active_publication_id ||
    row.publication_status !== "active"
  ) {
    return unavailable("publication_inactive");
  }

  const deliveryRevision = Number(row.delivery_revision);
  if (
    !Number.isSafeInteger(deliveryRevision) ||
    deliveryRevision <= 0 ||
    Number(row.publication_target_delivery_revision) !== deliveryRevision
  ) {
    return unavailable("publication_revision_mismatch");
  }
  if (
    row.publication_schema_version !== WEBSITE_PUBLICATION_SCHEMA_VERSION ||
    !row.canonical_hostname ||
    row.canonical_binding_status !== "active" ||
    !row.canonical_binding_verified_at ||
    row.canonical_domain_hostname !== row.canonical_hostname ||
    row.canonical_domain_type === "platform_reserved" ||
    !row.canonical_domain_verification_status ||
    !["verified", "active"].includes(
      row.canonical_domain_verification_status,
    ) ||
    !row.canonical_domain_verified_at ||
    row.canonical_domain_disabled_at
  ) {
    return unavailable("publication_unsupported");
  }

  const parsed = parseWebsitePublicationForRuntime(row.publication_snapshot);
  if (!parsed.success) return unavailable("publication_unsupported");
  if (
    parsed.snapshot.siteId !== row.site_id ||
    parsed.snapshot.deliveryRevision !== deliveryRevision ||
    parsed.snapshot.canonicalHostname !== row.canonical_hostname ||
    !row.publication_content_hash ||
    !row.publication_cache_key
  ) {
    return unavailable("publication_identity_mismatch");
  }

  let identity: { cacheKey: string; etag: string };
  try {
    identity = websitePublicationCacheIdentity({
      tenantId: row.tenant_id,
      siteId: row.site_id,
      deliveryRevision,
      contentHash: row.publication_content_hash,
    });
  } catch {
    return unavailable("publication_identity_mismatch");
  }
  if (identity.cacheKey !== row.publication_cache_key) {
    return unavailable("publication_identity_mismatch");
  }

  return {
    status: "ready",
    tenantId: row.tenant_id,
    siteId: row.site_id,
    publicationId: row.publication_id,
    requestHostname: hostname,
    canonicalHostname: parsed.snapshot.canonicalHostname,
    deliveryRevision,
    contentHash: row.publication_content_hash,
    cacheKey: identity.cacheKey,
    etag: identity.etag,
    snapshot: parsed.snapshot,
    diagnostics: parsed.diagnostics,
  };
}
