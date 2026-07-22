import {
  CUSTOM_WEBSITE_MAX_HEALTH_AGE_MS,
  FIELDGRID_CUSTOM_WEBSITE_ROUTE_REGISTRY,
  WEBSITE_PUBLICATION_SCHEMA_VERSION,
  customWebsiteHealthEvidenceMatches,
  normalizeWebsiteRequestHost,
  parseWebsitePublicationForRuntime,
  websitePublicationCacheIdentity,
  type CustomWebsiteRouteRegistry,
  type RoutableCustomWebsiteRouteRegistration,
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

export type CustomWebsiteUnavailableReason =
  | "custom_enterprise_required"
  | "custom_deployment_inactive"
  | "custom_deployment_unapproved"
  | "custom_deployment_identity_mismatch"
  | "custom_health_invalid"
  | "custom_health_stale"
  | "custom_route_not_routable";

export type WebsiteDeliveryUnavailableReason =
  | ManagedWebsiteUnavailableReason
  | CustomWebsiteUnavailableReason;

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

export type ReadyManagedWebsiteResolution = Extract<
  ManagedWebsiteResolution,
  { status: "ready" }
>;

export type ReadyCustomWebsiteResolution = {
  status: "ready";
  tenantId: string;
  siteId: string;
  deploymentId: string;
  requestHostname: string;
  canonicalHostname: string;
  deliveryRevision: number;
  providerKey: string;
  routeKey: string;
  releaseId: string;
  healthPath: string;
  checkedAt: string;
  route: RoutableCustomWebsiteRouteRegistration;
};

export type WebsiteDeliveryResolution =
  | { status: "not_found" }
  | { status: "unavailable"; reason: WebsiteDeliveryUnavailableReason }
  | {
      status: "ready";
      deliveryMode: "managed_cms";
      website: ReadyManagedWebsiteResolution;
    }
  | {
      status: "ready";
      deliveryMode: "custom_nextjs";
      website: ReadyCustomWebsiteResolution;
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
  tenant_plan_key: string;
  module_enabled: boolean;
  site_id: string;
  site_status: string;
  delivery_mode: string;
  delivery_revision: number;
  active_publication_id: string | null;
  active_custom_deployment_id: string | null;
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
  custom_deployment_id: string | null;
  custom_deployment_status: string | null;
  custom_provider_key: string | null;
  custom_route_key: string | null;
  custom_release_id: string | null;
  custom_expected_host: string | null;
  custom_health_path: string | null;
  custom_approved_at: Date | string | null;
  custom_approved_by: string | null;
  custom_last_checked_at: Date | string | null;
  custom_last_health: unknown;
};

export type WebsiteRuntimeQuery = (
  text: string,
  values: readonly unknown[],
) => Promise<{ rows: WebsiteRuntimeDatabaseRow[] }>;

export type WebsiteDeliveryResolverOptions = {
  query?: WebsiteRuntimeQuery;
  customRoutes?: CustomWebsiteRouteRegistry;
  now?: Date;
};

const RESOLVE_WEBSITE_DELIVERY_SQL = `
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
  tenant.plan_key AS tenant_plan_key,
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
  site.active_custom_deployment_id,
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
  publication.cache_key AS publication_cache_key,
  custom_deployment.id AS custom_deployment_id,
  custom_deployment.status AS custom_deployment_status,
  custom_deployment.provider_key AS custom_provider_key,
  custom_deployment.route_key AS custom_route_key,
  custom_deployment.release_id AS custom_release_id,
  custom_deployment.expected_host AS custom_expected_host,
  custom_deployment.health_path AS custom_health_path,
  custom_deployment.approved_at AS custom_approved_at,
  custom_deployment.approved_by AS custom_approved_by,
  custom_deployment.last_checked_at AS custom_last_checked_at,
  custom_deployment.last_health AS custom_last_health
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
LEFT JOIN public.website_custom_deployments custom_deployment
  ON custom_deployment.tenant_id = site.tenant_id
 AND custom_deployment.site_id = site.id
 AND custom_deployment.id = site.active_custom_deployment_id
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

type LoadedWebsiteRuntimeRow =
  | { status: "not_found" }
  | { status: "unavailable"; reason: "ambiguous_host" }
  | { status: "ready"; hostname: string; row: WebsiteRuntimeDatabaseRow };

async function loadWebsiteRuntimeRow(
  rawHost: string,
  query: WebsiteRuntimeQuery,
): Promise<LoadedWebsiteRuntimeRow> {
  const hostname = normalizeWebsiteRequestHost(rawHost);
  if (!hostname) return { status: "not_found" };
  const result = await query(RESOLVE_WEBSITE_DELIVERY_SQL, [hostname]);
  if (result.rows.length === 0) return { status: "not_found" };
  if (result.rows.length !== 1) {
    return { status: "unavailable", reason: "ambiguous_host" };
  }
  return { status: "ready", hostname, row: result.rows[0]! };
}

function commonUnavailableReason(
  row: WebsiteRuntimeDatabaseRow,
  hostname: string,
): ManagedWebsiteUnavailableReason | null {
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
    return "domain_inactive";
  }
  if (
    !row.tenant_is_active ||
    !["trial", "active"].includes(row.tenant_status)
  ) {
    return "tenant_inactive";
  }
  if (!row.module_enabled) return "module_disabled";
  if (row.site_status !== "active") return "site_inactive";
  return null;
}

function canonicalDomainIsActive(row: WebsiteRuntimeDatabaseRow): boolean {
  return Boolean(
    row.canonical_hostname &&
    row.canonical_binding_status === "active" &&
    row.canonical_binding_verified_at &&
    row.canonical_domain_hostname === row.canonical_hostname &&
    row.canonical_domain_type !== "platform_reserved" &&
    row.canonical_domain_verification_status &&
    ["verified", "active"].includes(row.canonical_domain_verification_status) &&
    row.canonical_domain_verified_at &&
    !row.canonical_domain_disabled_at,
  );
}

function resolveManagedWebsiteRow(
  row: WebsiteRuntimeDatabaseRow,
  hostname: string,
): ManagedWebsiteResolution {
  if (row.delivery_mode !== "managed_cms") {
    return { status: "unavailable", reason: "delivery_mode_mismatch" };
  }
  if (
    !row.active_publication_id ||
    !row.publication_id ||
    row.publication_id !== row.active_publication_id ||
    row.publication_status !== "active"
  ) {
    return { status: "unavailable", reason: "publication_inactive" };
  }

  const deliveryRevision = Number(row.delivery_revision);
  if (
    !Number.isSafeInteger(deliveryRevision) ||
    deliveryRevision <= 0 ||
    Number(row.publication_target_delivery_revision) !== deliveryRevision
  ) {
    return {
      status: "unavailable",
      reason: "publication_revision_mismatch",
    };
  }
  if (
    row.publication_schema_version !== WEBSITE_PUBLICATION_SCHEMA_VERSION ||
    !canonicalDomainIsActive(row)
  ) {
    return { status: "unavailable", reason: "publication_unsupported" };
  }

  const parsed = parseWebsitePublicationForRuntime(row.publication_snapshot);
  if (!parsed.success) {
    return { status: "unavailable", reason: "publication_unsupported" };
  }
  if (
    parsed.snapshot.siteId !== row.site_id ||
    parsed.snapshot.deliveryRevision !== deliveryRevision ||
    parsed.snapshot.canonicalHostname !== row.canonical_hostname ||
    !row.publication_content_hash ||
    !row.publication_cache_key
  ) {
    return {
      status: "unavailable",
      reason: "publication_identity_mismatch",
    };
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
    return {
      status: "unavailable",
      reason: "publication_identity_mismatch",
    };
  }
  if (identity.cacheKey !== row.publication_cache_key) {
    return {
      status: "unavailable",
      reason: "publication_identity_mismatch",
    };
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

function resolveCustomWebsiteRow(
  row: WebsiteRuntimeDatabaseRow,
  hostname: string,
  options: Required<
    Pick<WebsiteDeliveryResolverOptions, "customRoutes" | "now">
  >,
):
  | ReadyCustomWebsiteResolution
  | {
      status: "unavailable";
      reason: CustomWebsiteUnavailableReason;
    } {
  if (row.tenant_plan_key !== "enterprise") {
    return { status: "unavailable", reason: "custom_enterprise_required" };
  }
  if (!canonicalDomainIsActive(row)) {
    return {
      status: "unavailable",
      reason: "custom_deployment_identity_mismatch",
    };
  }
  if (
    !row.active_custom_deployment_id ||
    !row.custom_deployment_id ||
    row.custom_deployment_id !== row.active_custom_deployment_id ||
    !["ready", "active"].includes(row.custom_deployment_status ?? "")
  ) {
    return { status: "unavailable", reason: "custom_deployment_inactive" };
  }
  if (
    !row.custom_approved_at ||
    !row.custom_approved_by ||
    !row.custom_last_checked_at
  ) {
    return { status: "unavailable", reason: "custom_deployment_unapproved" };
  }
  if (
    !row.custom_provider_key ||
    !row.custom_route_key ||
    !row.custom_release_id ||
    !row.custom_expected_host ||
    !row.custom_health_path ||
    row.custom_expected_host !== row.canonical_hostname
  ) {
    return {
      status: "unavailable",
      reason: "custom_deployment_identity_mismatch",
    };
  }

  const deliveryRevision = Number(row.delivery_revision);
  if (!Number.isSafeInteger(deliveryRevision) || deliveryRevision <= 0) {
    return {
      status: "unavailable",
      reason: "custom_deployment_identity_mismatch",
    };
  }

  const routeIdentity = {
    providerKey: row.custom_provider_key,
    routeKey: row.custom_route_key,
    releaseId: row.custom_release_id,
    expectedHost: row.custom_expected_host,
    healthPath: row.custom_health_path,
  };
  const route = options.customRoutes.resolve(routeIdentity);
  if (!route || route.status !== "routable") {
    return { status: "unavailable", reason: "custom_route_not_routable" };
  }
  if (
    !customWebsiteHealthEvidenceMatches(row.custom_last_health, routeIdentity)
  ) {
    return { status: "unavailable", reason: "custom_health_invalid" };
  }

  const checkedAt = new Date(row.custom_last_checked_at);
  const checkedAtMs = checkedAt.getTime();
  const nowMs = options.now.getTime();
  if (!Number.isFinite(checkedAtMs) || checkedAtMs > nowMs + 60_000) {
    return { status: "unavailable", reason: "custom_health_invalid" };
  }
  if (nowMs - checkedAtMs > CUSTOM_WEBSITE_MAX_HEALTH_AGE_MS) {
    return { status: "unavailable", reason: "custom_health_stale" };
  }

  return {
    status: "ready",
    tenantId: row.tenant_id,
    siteId: row.site_id,
    deploymentId: row.custom_deployment_id,
    requestHostname: hostname,
    canonicalHostname: row.custom_expected_host,
    deliveryRevision,
    providerKey: row.custom_provider_key,
    routeKey: row.custom_route_key,
    releaseId: row.custom_release_id,
    healthPath: row.custom_health_path,
    checkedAt: checkedAt.toISOString(),
    route,
  };
}

/**
 * Resolves one trusted Host header to one active immutable managed publication.
 * It intentionally never reads website authoring pages or sections.
 */
export async function resolveManagedWebsiteByHost(
  rawHost: string,
  query: WebsiteRuntimeQuery = defaultWebsiteRuntimeQuery,
): Promise<ManagedWebsiteResolution> {
  const loaded = await loadWebsiteRuntimeRow(rawHost, query);
  if (loaded.status !== "ready") return loaded;
  const commonReason = commonUnavailableReason(loaded.row, loaded.hostname);
  if (commonReason) return { status: "unavailable", reason: commonReason };
  return resolveManagedWebsiteRow(loaded.row, loaded.hostname);
}

/**
 * Shared server-side delivery decision for both website modes. A custom-mode
 * failure is returned as unavailable and never falls back to managed content.
 */
export async function resolveWebsiteDeliveryByHost(
  rawHost: string,
  resolverOptions: WebsiteDeliveryResolverOptions = {},
): Promise<WebsiteDeliveryResolution> {
  const query = resolverOptions.query ?? defaultWebsiteRuntimeQuery;
  const loaded = await loadWebsiteRuntimeRow(rawHost, query);
  if (loaded.status !== "ready") return loaded;
  const commonReason = commonUnavailableReason(loaded.row, loaded.hostname);
  if (commonReason) return { status: "unavailable", reason: commonReason };

  if (loaded.row.delivery_mode === "managed_cms") {
    const website = resolveManagedWebsiteRow(loaded.row, loaded.hostname);
    if (website.status !== "ready") return website;
    return { status: "ready", deliveryMode: "managed_cms", website };
  }
  if (loaded.row.delivery_mode !== "custom_nextjs") {
    return { status: "unavailable", reason: "delivery_mode_mismatch" };
  }

  const website = resolveCustomWebsiteRow(loaded.row, loaded.hostname, {
    customRoutes:
      resolverOptions.customRoutes ?? FIELDGRID_CUSTOM_WEBSITE_ROUTE_REGISTRY,
    now: resolverOptions.now ?? new Date(),
  });
  if (website.status !== "ready") return website;
  return { status: "ready", deliveryMode: "custom_nextjs", website };
}
