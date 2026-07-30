import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import type { PoolClient } from "pg";
import { z } from "zod/v4";
import {
  CUSTOM_WEBSITE_MAX_HEALTH_AGE_MS,
  FIELDGRID_CUSTOM_WEBSITE_ROUTE_REGISTRY,
  WEBSITE_PUBLICATION_SCHEMA_VERSION,
  customWebsiteHealthEvidenceMatches,
  customWebsiteOriginAddressesArePublic,
  evaluateWebsiteActivationPreflight,
  serializeWebsitePublication,
  websiteActivationCommandSchema,
  websiteActivationErrorCode,
  websitePublicationCacheIdentity,
  websitePublicationSnapshotSchema,
  type CustomWebsiteHealthEvidence,
  type CustomWebsiteRouteIdentity,
  type CustomWebsiteRouteRegistry,
  type WebsiteActivationPreflightEvidence,
  type WebsiteDeliveryMode,
  type WebsitePublicationSnapshot,
} from "@workspace/website-core";
import { pool } from "./connection";
import { configuredFieldgridCustomWebsiteRouteRegistry } from "./website-public-runtime";

const uuidSchema = z.string().uuid();
const actorSchema = z.string().uuid();
const reasonSchema = z.string().trim().min(10).max(500);
const changeReferenceSchema = z
  .string()
  .trim()
  .min(3)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/# -]*$/u);
const identitySchema = z
  .object({
    providerKey: z.string().min(2).max(80),
    routeKey: z.string().min(2).max(240),
    releaseId: z.string().min(2).max(240),
    expectedHost: z.string().trim().toLowerCase().min(4).max(253),
    healthPath: z.string().min(1).max(500),
  })
  .strict();

const registerInputSchema = identitySchema.extend({
  tenantId: uuidSchema,
  siteId: uuidSchema,
  actorUserId: actorSchema,
  changeReference: changeReferenceSchema,
});
const deploymentCommandSchema = z
  .object({
    tenantId: uuidSchema,
    siteId: uuidSchema,
    deploymentId: uuidSchema,
    actorUserId: actorSchema,
    changeReference: changeReferenceSchema,
    reason: reasonSchema,
  })
  .strict();
const rollbackInputSchema = z
  .object({
    tenantId: uuidSchema,
    siteId: uuidSchema,
    expectedDeliveryRevision: z.number().int().positive(),
    expectedMode: z.enum(["managed_cms", "custom_nextjs"]),
    expectedTargetId: uuidSchema.nullable(),
    actorUserId: actorSchema,
    changeReference: changeReferenceSchema,
    reason: reasonSchema,
  })
  .strict();

export type PlatformWebsiteRouteCandidate = {
  providerKey: string;
  routeKey: string;
  releaseId: string;
  expectedHosts: string[];
  healthPath: string;
  status: "non_live" | "routable";
  blockers: string[];
};

export type PlatformWebsiteDeployment = {
  id: string;
  providerKey: string;
  routeKey: string;
  releaseId: string;
  expectedHost: string;
  healthPath: string;
  status: string;
  approvedAt: string | null;
  lastCheckedAt: string | null;
  healthStatus: "healthy" | "missing";
  createdAt: string;
};

export type PlatformWebsiteDeliveryOperation = {
  id: string;
  operationType: "activate" | "rollback";
  status: "succeeded" | "failed";
  fromMode: WebsiteDeliveryMode;
  fromTargetId: string | null;
  toMode: WebsiteDeliveryMode;
  toTargetId: string;
  rollbackSourceTargetId: string | null;
  expectedRevision: number;
  newRevision: number | null;
  changeReference: string;
  reason: string;
  errorCode: string | null;
  createdAt: string;
};

export type PlatformWebsiteDeliveryView = {
  routeConfiguration: "ready" | "non_live" | "invalid";
  routeConfigurationError: string | null;
  candidates: PlatformWebsiteRouteCandidate[];
  site: null | {
    id: string;
    name: string;
    status: string;
    deliveryMode: WebsiteDeliveryMode;
    deliveryRevision: number;
    activeTargetId: string | null;
    canonicalHostname: string | null;
    canonicalDomainActive: boolean;
    tenantActive: boolean;
    tenantPlanKey: string;
    websiteEntitled: boolean;
  };
  deployments: PlatformWebsiteDeployment[];
  operations: PlatformWebsiteDeliveryOperation[];
};

export type WebsiteActivationResult = {
  status: "succeeded" | "blocked";
  deliveryRevision: number | null;
  deliveryMode: WebsiteDeliveryMode;
  targetId: string;
  evidence: WebsiteActivationPreflightEvidence | Record<string, unknown>;
};

type SiteState = {
  id: string;
  tenant_id: string;
  name: string;
  status: string;
  delivery_mode: WebsiteDeliveryMode;
  delivery_revision: number;
  authoring_revision: number;
  active_publication_id: string | null;
  active_custom_deployment_id: string | null;
  canonical_hostname: string | null;
  canonical_binding_status: string | null;
  canonical_binding_verified_at: Date | string | null;
  tenant_is_active: boolean;
  tenant_status: string;
  tenant_plan_key: string;
  module_enabled: boolean;
};

type DeploymentRow = {
  id: string;
  tenant_id: string;
  site_id: string;
  provider_key: string;
  route_key: string;
  release_id: string;
  expected_host: string;
  health_path: string;
  status: string;
  approved_at: Date | string | null;
  approved_by: string | null;
  last_checked_at: Date | string | null;
  last_health: unknown;
  created_at: Date | string;
};

function asIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function activeTargetId(site: SiteState): string | null {
  return site.delivery_mode === "managed_cms"
    ? site.active_publication_id
    : site.active_custom_deployment_id;
}

function routeIdentity(deployment: DeploymentRow): CustomWebsiteRouteIdentity {
  return {
    providerKey: deployment.provider_key,
    routeKey: deployment.route_key,
    releaseId: deployment.release_id,
    expectedHost: deployment.expected_host,
    healthPath: deployment.health_path,
  };
}

function configuredRegistry(): CustomWebsiteRouteRegistry {
  return configuredFieldgridCustomWebsiteRouteRegistry();
}

function safeRouteCandidates(
  registry: CustomWebsiteRouteRegistry,
): PlatformWebsiteRouteCandidate[] {
  return registry.registrations.map((registration) => ({
    providerKey: registration.providerKey,
    routeKey: registration.routeKey,
    releaseId: registration.releaseId,
    expectedHosts: [...registration.expectedHosts],
    healthPath: registration.healthPath,
    status: registration.status,
    blockers:
      registration.status === "non_live" ? [...registration.blockers] : [],
  }));
}

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

async function loadSite(
  client: PoolClient,
  tenantId: string,
  siteId: string,
  lock = false,
): Promise<SiteState> {
  const result = await client.query<SiteState>(
    `SELECT
       site.id,
       site.tenant_id,
       site.name,
       site.status,
       site.delivery_mode,
       site.delivery_revision,
       site.authoring_revision,
       site.active_publication_id,
       site.active_custom_deployment_id,
       binding.hostname AS canonical_hostname,
       binding.status AS canonical_binding_status,
       binding.verified_at AS canonical_binding_verified_at,
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
       ) AS module_enabled
     FROM public.website_sites site
     JOIN public.tenants tenant ON tenant.id = site.tenant_id
     LEFT JOIN public.website_domain_bindings binding
       ON binding.tenant_id = site.tenant_id
      AND binding.site_id = site.id
      AND binding.is_primary = true
     WHERE site.tenant_id = $1 AND site.id = $2
     ${lock ? "FOR UPDATE OF site" : ""}
     LIMIT 1`,
    [tenantId, siteId],
  );
  const site = result.rows[0];
  if (!site) throw new Error("Website site not found");
  return site;
}

async function loadDeployment(
  client: PoolClient,
  tenantId: string,
  siteId: string,
  deploymentId: string,
  lock = false,
): Promise<DeploymentRow> {
  const result = await client.query<DeploymentRow>(
    `SELECT *
     FROM public.website_custom_deployments
     WHERE tenant_id = $1 AND site_id = $2 AND id = $3
     ${lock ? "FOR UPDATE" : ""}
     LIMIT 1`,
    [tenantId, siteId, deploymentId],
  );
  const deployment = result.rows[0];
  if (!deployment) throw new Error("Custom website deployment not found");
  return deployment;
}

function routeConfigurationSnapshot(): {
  registry: CustomWebsiteRouteRegistry;
  status: PlatformWebsiteDeliveryView["routeConfiguration"];
  error: string | null;
} {
  try {
    const registry = configuredRegistry();
    return {
      registry,
      status: registry.registrations.some(
        (registration) => registration.status === "routable",
      )
        ? "ready"
        : "non_live",
      error: null,
    };
  } catch {
    return {
      registry: FIELDGRID_CUSTOM_WEBSITE_ROUTE_REGISTRY,
      status: "invalid",
      error:
        "De operatorrouteconfiguratie is ongeldig en wordt fail-closed genegeerd.",
    };
  }
}

export async function getPlatformWebsiteDelivery(
  tenantIdInput: string,
): Promise<PlatformWebsiteDeliveryView> {
  const tenantId = uuidSchema.parse(tenantIdInput);
  const routeConfiguration = routeConfigurationSnapshot();
  const siteResult = await pool.query<SiteState>(
    `SELECT
       site.id,
       site.tenant_id,
       site.name,
       site.status,
       site.delivery_mode,
       site.delivery_revision,
       site.authoring_revision,
       site.active_publication_id,
       site.active_custom_deployment_id,
       binding.hostname AS canonical_hostname,
       binding.status AS canonical_binding_status,
       binding.verified_at AS canonical_binding_verified_at,
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
       ) AS module_enabled
     FROM public.website_sites site
     JOIN public.tenants tenant ON tenant.id = site.tenant_id
     LEFT JOIN public.website_domain_bindings binding
       ON binding.tenant_id = site.tenant_id
      AND binding.site_id = site.id
      AND binding.is_primary = true
     WHERE site.tenant_id = $1
       AND site.is_primary = true
       AND site.status <> 'disabled'
     LIMIT 1`,
    [tenantId],
  );
  const site = siteResult.rows[0] ?? null;
  if (!site) {
    return {
      routeConfiguration: routeConfiguration.status,
      routeConfigurationError: routeConfiguration.error,
      candidates: safeRouteCandidates(routeConfiguration.registry),
      site: null,
      deployments: [],
      operations: [],
    };
  }

  const [deploymentResult, operationResult] = await Promise.all([
    pool.query<DeploymentRow>(
      `SELECT *
       FROM public.website_custom_deployments
       WHERE tenant_id = $1 AND site_id = $2
       ORDER BY created_at DESC`,
      [tenantId, site.id],
    ),
    pool.query<{
      id: string;
      operation_type: "activate" | "rollback";
      status: "succeeded" | "failed";
      from_mode: WebsiteDeliveryMode;
      from_target_id: string | null;
      to_mode: WebsiteDeliveryMode;
      to_target_id: string;
      rollback_source_target_id: string | null;
      expected_revision: number;
      new_revision: number | null;
      change_reference: string;
      reason: string;
      error_code: string | null;
      created_at: Date | string;
    }>(
      `SELECT *
       FROM public.website_delivery_operations
       WHERE tenant_id = $1 AND site_id = $2
       ORDER BY created_at DESC
       LIMIT 30`,
      [tenantId, site.id],
    ),
  ]);

  return {
    routeConfiguration: routeConfiguration.status,
    routeConfigurationError: routeConfiguration.error,
    candidates: safeRouteCandidates(routeConfiguration.registry),
    site: {
      id: site.id,
      name: site.name,
      status: site.status,
      deliveryMode: site.delivery_mode,
      deliveryRevision: Number(site.delivery_revision),
      activeTargetId: activeTargetId(site),
      canonicalHostname: site.canonical_hostname,
      canonicalDomainActive:
        site.canonical_binding_status === "active" &&
        Boolean(site.canonical_binding_verified_at),
      tenantActive:
        site.tenant_is_active &&
        ["trial", "active"].includes(site.tenant_status),
      tenantPlanKey: site.tenant_plan_key,
      websiteEntitled: site.module_enabled,
    },
    deployments: deploymentResult.rows.map((deployment) => ({
      id: deployment.id,
      providerKey: deployment.provider_key,
      routeKey: deployment.route_key,
      releaseId: deployment.release_id,
      expectedHost: deployment.expected_host,
      healthPath: deployment.health_path,
      status: deployment.status,
      approvedAt: asIso(deployment.approved_at),
      lastCheckedAt: asIso(deployment.last_checked_at),
      healthStatus: customWebsiteHealthEvidenceMatches(
        deployment.last_health,
        routeIdentity(deployment),
      )
        ? "healthy"
        : "missing",
      createdAt: asIso(deployment.created_at)!,
    })),
    operations: operationResult.rows.map((operation) => ({
      id: operation.id,
      operationType: operation.operation_type,
      status: operation.status,
      fromMode: operation.from_mode,
      fromTargetId: operation.from_target_id,
      toMode: operation.to_mode,
      toTargetId: operation.to_target_id,
      rollbackSourceTargetId: operation.rollback_source_target_id,
      expectedRevision: Number(operation.expected_revision),
      newRevision:
        operation.new_revision === null ? null : Number(operation.new_revision),
      changeReference: operation.change_reference,
      reason: operation.reason,
      errorCode: operation.error_code,
      createdAt: asIso(operation.created_at)!,
    })),
  };
}

async function writeAudit(
  client: PoolClient,
  input: {
    tenantId: string;
    actorUserId: string;
    action: string;
    resourceId: string;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO public.audit_log (
       tenant_id, user_id, action, resource, resource_id, metadata
     ) VALUES ($1, $2, $3, 'website', $4, $5::jsonb)`,
    [
      input.tenantId,
      input.actorUserId,
      input.action,
      input.resourceId,
      JSON.stringify(input.metadata),
    ],
  );
}

export async function registerPlatformWebsiteDeployment(
  rawInput: z.input<typeof registerInputSchema>,
): Promise<{ id: string; created: boolean }> {
  const input = registerInputSchema.parse(rawInput);
  const identity = identitySchema.parse(input);
  const registry = configuredRegistry();
  const registration = registry.resolve(identity);
  if (!registration) {
    throw new Error("Custom website route is not operator-approved");
  }

  return inTransaction(async (client) => {
    const site = await loadSite(client, input.tenantId, input.siteId, true);
    if (site.canonical_hostname !== input.expectedHost) {
      throw new Error("Custom website deployment host does not match the site");
    }
    if (!input.expectedHost.endsWith(".staging.fieldgrid.nl")) {
      throw new Error("Phase 9 deployment registration is staging-only");
    }
    const id = randomUUID();
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO public.website_custom_deployments (
         id, tenant_id, site_id, provider_key, route_key, release_id,
         expected_host, health_path, status, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9)
       ON CONFLICT (site_id, provider_key, release_id) DO NOTHING
       RETURNING id`,
      [
        id,
        input.tenantId,
        input.siteId,
        input.providerKey,
        input.routeKey,
        input.releaseId,
        input.expectedHost,
        input.healthPath,
        input.actorUserId,
      ],
    );
    const insertedId = inserted.rows[0]?.id;
    if (!insertedId) {
      const existing = await client.query<{
        id: string;
        route_key: string;
        expected_host: string;
        health_path: string;
      }>(
        `SELECT id, route_key, expected_host, health_path
         FROM public.website_custom_deployments
         WHERE tenant_id = $1
           AND site_id = $2
           AND provider_key = $3
           AND release_id = $4
         LIMIT 1`,
        [input.tenantId, input.siteId, input.providerKey, input.releaseId],
      );
      const deployment = existing.rows[0];
      if (
        !deployment ||
        deployment.route_key !== input.routeKey ||
        deployment.expected_host !== input.expectedHost ||
        deployment.health_path !== input.healthPath
      ) {
        throw new Error("Custom website deployment release identity conflict");
      }
      return { id: deployment.id, created: false };
    }
    await writeAudit(client, {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: "website_custom_deployment_registered",
      resourceId: insertedId,
      metadata: {
        siteId: input.siteId,
        providerKey: input.providerKey,
        routeKey: input.routeKey,
        releaseId: input.releaseId,
        expectedHost: input.expectedHost,
        routeStatus: registration.status,
        changeReference: input.changeReference,
        environment: "staging",
      },
    });
    return { id: insertedId, created: true };
  });
}

async function requestHealthEvidence(
  registration: Extract<
    ReturnType<CustomWebsiteRouteRegistry["resolve"]>,
    { status: "routable" }
  >,
  identity: CustomWebsiteRouteIdentity,
): Promise<CustomWebsiteHealthEvidence> {
  if (!registration) throw new Error("Custom website route is not routable");
  const origin = new URL(registration.upstreamOrigin);
  const addresses = await lookup(origin.hostname, {
    all: true,
    verbatim: true,
  });
  const addressValues = addresses.map((address) => address.address);
  if (!customWebsiteOriginAddressesArePublic(addressValues)) {
    throw new Error("Custom website route resolved to a non-public address");
  }
  const selected = addresses[0]!;
  const path = new URL(identity.healthPath, `${origin.origin}/`);

  const raw = await new Promise<string>((resolvePromise, rejectPromise) => {
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: origin.hostname,
        port: 443,
        method: "GET",
        path: `${path.pathname}${path.search}`,
        servername: origin.hostname,
        rejectUnauthorized: true,
        headers: {
          Accept: "application/json",
          Host: origin.hostname,
          "User-Agent": "Fieldgrid-Website-Health/1",
        },
        lookup(_hostname, _options, callback) {
          callback(null, selected.address, selected.family);
        },
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          rejectPromise(
            new Error("Custom website health endpoint did not return HTTP 200"),
          );
          return;
        }
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          body += chunk;
          if (body.length > 32_768) {
            request.destroy(
              new Error("Custom website health response is too large"),
            );
          }
        });
        response.on("end", () => resolvePromise(body));
      },
    );
    request.setTimeout(8_000, () =>
      request.destroy(new Error("Custom website health request timed out")),
    );
    request.on("error", rejectPromise);
    request.end();
  });

  let evidence: unknown;
  try {
    evidence = JSON.parse(raw);
  } catch {
    throw new Error("Custom website health endpoint returned invalid JSON");
  }
  if (!customWebsiteHealthEvidenceMatches(evidence, identity)) {
    throw new Error("Custom website health evidence does not match deployment");
  }
  return evidence;
}

export async function checkPlatformWebsiteDeploymentHealth(
  rawInput: z.input<typeof deploymentCommandSchema>,
): Promise<{ checkedAt: string; status: "healthy" }> {
  const input = deploymentCommandSchema.parse(rawInput);
  const registry = configuredRegistry();

  try {
    const deployment = await inTransaction((client) =>
      loadDeployment(
        client,
        input.tenantId,
        input.siteId,
        input.deploymentId,
        false,
      ),
    );
    const identity = routeIdentity(deployment);
    const registration = registry.resolve(identity);
    if (!registration || registration.status !== "routable") {
      throw new Error("Custom website route is not routable");
    }
    const evidence = await requestHealthEvidence(registration, identity);
    const checkedAt = new Date();
    await inTransaction(async (client) => {
      const current = await loadDeployment(
        client,
        input.tenantId,
        input.siteId,
        input.deploymentId,
        true,
      );
      if (JSON.stringify(routeIdentity(current)) !== JSON.stringify(identity)) {
        throw new Error(
          "Custom website deployment changed during health check",
        );
      }
      await client.query(
        `UPDATE public.website_custom_deployments
         SET last_checked_at = $4,
             last_health = $5::jsonb,
             status = CASE WHEN approved_at IS NULL THEN 'draft' ELSE 'ready' END,
             updated_at = now()
         WHERE tenant_id = $1 AND site_id = $2 AND id = $3`,
        [
          input.tenantId,
          input.siteId,
          input.deploymentId,
          checkedAt,
          JSON.stringify(evidence),
        ],
      );
      await writeAudit(client, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "website_custom_deployment_health_passed",
        resourceId: input.deploymentId,
        metadata: {
          siteId: input.siteId,
          providerKey: identity.providerKey,
          routeKey: identity.routeKey,
          releaseId: identity.releaseId,
          expectedHost: identity.expectedHost,
          changeReference: input.changeReference,
          evidenceSchemaVersion: evidence.schemaVersion,
          responseRecorded: false,
          originRecorded: false,
        },
      });
    });
    return { checkedAt: checkedAt.toISOString(), status: "healthy" };
  } catch (error) {
    await inTransaction(async (client) => {
      await client.query(
        `UPDATE public.website_custom_deployments
         SET status = CASE WHEN status = 'active' THEN status ELSE 'failed' END,
             last_checked_at = now(),
             last_health = NULL,
             updated_at = now()
         WHERE tenant_id = $1 AND site_id = $2 AND id = $3`,
        [input.tenantId, input.siteId, input.deploymentId],
      );
      await writeAudit(client, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "website_custom_deployment_health_failed",
        resourceId: input.deploymentId,
        metadata: {
          siteId: input.siteId,
          changeReference: input.changeReference,
          errorCode: websiteActivationErrorCode(error),
          responseRecorded: false,
          originRecorded: false,
        },
      });
    }).catch(() => undefined);
    throw error;
  }
}

export async function approvePlatformWebsiteDeployment(
  rawInput: z.input<typeof deploymentCommandSchema>,
): Promise<{ status: "ready" }> {
  const input = deploymentCommandSchema.parse(rawInput);
  const registry = configuredRegistry();
  return inTransaction(async (client) => {
    const site = await loadSite(client, input.tenantId, input.siteId, true);
    const deployment = await loadDeployment(
      client,
      input.tenantId,
      input.siteId,
      input.deploymentId,
      true,
    );
    const identity = routeIdentity(deployment);
    const registration = registry.resolve(identity);
    const checkedAt = deployment.last_checked_at
      ? new Date(deployment.last_checked_at)
      : null;
    if (
      registration?.status !== "routable" ||
      !checkedAt ||
      Date.now() - checkedAt.getTime() > CUSTOM_WEBSITE_MAX_HEALTH_AGE_MS ||
      !customWebsiteHealthEvidenceMatches(deployment.last_health, identity)
    ) {
      throw new Error("Custom website health preflight is not current");
    }
    if (
      !site.tenant_is_active ||
      !["trial", "active"].includes(site.tenant_status) ||
      site.tenant_plan_key !== "enterprise" ||
      !site.module_enabled ||
      site.canonical_hostname !== deployment.expected_host ||
      site.canonical_binding_status !== "active" ||
      !site.canonical_binding_verified_at
    ) {
      throw new Error("Custom website entitlement or domain preflight failed");
    }
    await client.query(
      `UPDATE public.website_custom_deployments
       SET status = 'ready',
           approved_at = now(),
           approved_by = $4,
           updated_at = now()
       WHERE tenant_id = $1 AND site_id = $2 AND id = $3`,
      [input.tenantId, input.siteId, input.deploymentId, input.actorUserId],
    );
    await writeAudit(client, {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: "website_custom_deployment_approved",
      resourceId: input.deploymentId,
      metadata: {
        siteId: input.siteId,
        providerKey: deployment.provider_key,
        routeKey: deployment.route_key,
        releaseId: deployment.release_id,
        expectedHost: deployment.expected_host,
        changeReference: input.changeReference,
        environment: "staging",
      },
    });
    return { status: "ready" };
  });
}

function customActivationPreflight(
  site: SiteState,
  deployment: DeploymentRow,
  registry: CustomWebsiteRouteRegistry,
  expected: {
    mode: WebsiteDeliveryMode;
    targetId: string | null;
    revision: number;
  },
  now = new Date(),
): WebsiteActivationPreflightEvidence {
  const identity = routeIdentity(deployment);
  const registration = registry.resolve(identity);
  const healthMatches = customWebsiteHealthEvidenceMatches(
    deployment.last_health,
    identity,
  );
  const health = healthMatches
    ? (deployment.last_health as CustomWebsiteHealthEvidence)
    : null;
  const checkedAt = deployment.last_checked_at
    ? new Date(deployment.last_checked_at)
    : null;
  return evaluateWebsiteActivationPreflight({
    tenantActive:
      site.tenant_is_active && ["trial", "active"].includes(site.tenant_status),
    enterprisePlan: site.tenant_plan_key === "enterprise",
    websiteEntitled: site.module_enabled,
    siteActive: site.status === "active",
    primaryDomainActive:
      site.canonical_binding_status === "active" &&
      Boolean(site.canonical_binding_verified_at),
    stagingHostname:
      Boolean(site.canonical_hostname) &&
      site.canonical_hostname!.endsWith(".staging.fieldgrid.nl"),
    exactCurrentState:
      site.delivery_mode === expected.mode &&
      activeTargetId(site) === expected.targetId &&
      Number(site.delivery_revision) === expected.revision,
    candidateIdentityMatches:
      deployment.tenant_id === site.tenant_id &&
      deployment.site_id === site.id &&
      deployment.expected_host === site.canonical_hostname,
    candidateApproved:
      deployment.status === "ready" &&
      Boolean(deployment.approved_at) &&
      Boolean(deployment.approved_by),
    routeRoutable: registration?.status === "routable",
    healthFresh:
      Boolean(checkedAt) &&
      now.getTime() - checkedAt!.getTime() <=
        CUSTOM_WEBSITE_MAX_HEALTH_AGE_MS &&
      healthMatches,
    tlsValid: health?.tls.valid === true,
    publicAddressesOnly: health?.network.publicAddressesOnly === true,
    seoHealthy:
      health?.seo.canonical === true &&
      health.seo.robots === true &&
      health.seo.sitemap === true &&
      health.seo.structuredData === true,
    assetsHealthy: health?.assets.healthy === true,
    platformFormsConnected: health?.forms.platformEndpoint === true,
  });
}

async function insertOperation(
  client: PoolClient,
  input: {
    tenantId: string;
    siteId: string;
    operationType: "activate" | "rollback";
    status: "succeeded" | "failed";
    fromMode: WebsiteDeliveryMode;
    fromTargetId: string | null;
    toMode: WebsiteDeliveryMode;
    toTargetId: string;
    rollbackSourceTargetId?: string | null;
    expectedRevision: number;
    newRevision: number | null;
    changeReference: string;
    reason: string;
    preflightEvidence: Record<string, unknown>;
    errorCode: string | null;
    actorUserId: string;
  },
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO public.website_delivery_operations (
       id, tenant_id, site_id, operation_type, environment, status,
       from_mode, from_target_id, to_mode, to_target_id,
       rollback_source_target_id, expected_revision, new_revision,
       change_reference, reason, preflight_evidence, error_code, actor_user_id
     ) VALUES (
       $1, $2, $3, $4, 'staging', $5, $6, $7, $8, $9, $10,
       $11, $12, $13, $14, $15::jsonb, $16, $17
     )`,
    [
      id,
      input.tenantId,
      input.siteId,
      input.operationType,
      input.status,
      input.fromMode,
      input.fromTargetId,
      input.toMode,
      input.toTargetId,
      input.rollbackSourceTargetId ?? null,
      input.expectedRevision,
      input.newRevision,
      input.changeReference,
      input.reason,
      JSON.stringify(input.preflightEvidence),
      input.errorCode,
      input.actorUserId,
    ],
  );
  return id;
}

export async function activatePlatformWebsiteDeployment(
  rawInput: z.input<typeof websiteActivationCommandSchema> & {
    actorUserId: string;
  },
): Promise<WebsiteActivationResult> {
  const { actorUserId: rawActorUserId, ...rawCommand } = rawInput;
  const actorUserId = actorSchema.parse(rawActorUserId);
  const input = websiteActivationCommandSchema.parse(rawCommand);
  const registry = configuredRegistry();

  return inTransaction(async (client) => {
    const site = await loadSite(client, input.tenantId, input.siteId, true);
    const deployment = await loadDeployment(
      client,
      input.tenantId,
      input.siteId,
      input.deploymentId,
      true,
    );
    const fromTargetId = activeTargetId(site);
    const evidence = customActivationPreflight(site, deployment, registry, {
      mode: input.expectedMode,
      targetId: input.expectedTargetId,
      revision: input.expectedDeliveryRevision,
    });
    if (evidence.status !== "ready") {
      await insertOperation(client, {
        tenantId: input.tenantId,
        siteId: input.siteId,
        operationType: "activate",
        status: "failed",
        fromMode: site.delivery_mode,
        fromTargetId,
        toMode: "custom_nextjs",
        toTargetId: deployment.id,
        expectedRevision: input.expectedDeliveryRevision,
        newRevision: null,
        changeReference: input.changeReference,
        reason: input.reason,
        preflightEvidence: evidence,
        errorCode: "preflight_blocked",
        actorUserId,
      });
      return {
        status: "blocked",
        deliveryRevision: null,
        deliveryMode: "custom_nextjs",
        targetId: deployment.id,
        evidence,
      };
    }

    if (
      site.delivery_mode === "custom_nextjs" &&
      site.active_custom_deployment_id
    ) {
      await client.query(
        `UPDATE public.website_custom_deployments
         SET status = 'ready', updated_at = now()
         WHERE tenant_id = $1 AND site_id = $2 AND id = $3 AND status = 'active'`,
        [input.tenantId, input.siteId, site.active_custom_deployment_id],
      );
    }
    const result = await client.query<{
      id: string;
      delivery_revision: number;
      delivery_mode: WebsiteDeliveryMode;
      active_custom_deployment_id: string;
    }>(
      `SELECT (site).*
       FROM (
         SELECT public.activate_website_delivery(
           $1, $2, $3, 'custom_nextjs', $4, $5, $6
         ) AS site
       ) result`,
      [
        input.tenantId,
        input.siteId,
        input.expectedDeliveryRevision,
        deployment.id,
        actorUserId,
        input.reason,
      ],
    );
    const activated = result.rows[0];
    if (!activated) throw new Error("Custom website activation failed");
    await client.query(
      `UPDATE public.website_custom_deployments
       SET status = 'active', updated_at = now()
       WHERE tenant_id = $1 AND site_id = $2 AND id = $3`,
      [input.tenantId, input.siteId, deployment.id],
    );
    await insertOperation(client, {
      tenantId: input.tenantId,
      siteId: input.siteId,
      operationType: "activate",
      status: "succeeded",
      fromMode: site.delivery_mode,
      fromTargetId,
      toMode: "custom_nextjs",
      toTargetId: deployment.id,
      expectedRevision: input.expectedDeliveryRevision,
      newRevision: Number(activated.delivery_revision),
      changeReference: input.changeReference,
      reason: input.reason,
      preflightEvidence: evidence,
      errorCode: null,
      actorUserId,
    });
    await writeAudit(client, {
      tenantId: input.tenantId,
      actorUserId,
      action: "website_custom_delivery_activated",
      resourceId: deployment.id,
      metadata: {
        siteId: input.siteId,
        fromMode: site.delivery_mode,
        fromTargetId,
        toMode: "custom_nextjs",
        toTargetId: deployment.id,
        fromRevision: input.expectedDeliveryRevision,
        toRevision: Number(activated.delivery_revision),
        changeReference: input.changeReference,
        environment: "staging",
        productionChanged: false,
      },
    });
    return {
      status: "succeeded",
      deliveryRevision: Number(activated.delivery_revision),
      deliveryMode: "custom_nextjs",
      targetId: deployment.id,
      evidence,
    };
  });
}

function hashRollbackPublication(
  sourceRevision: number,
  canonicalSnapshot: string,
): string {
  return createHash("sha256")
    .update("fieldgrid-website-publication:v1\n")
    .update(`source-revision:${sourceRevision}\n`)
    .update(canonicalSnapshot)
    .digest("hex");
}

async function cloneManagedRollbackPublication(
  client: PoolClient,
  input: {
    tenantId: string;
    site: SiteState;
    sourcePublicationId: string;
    actorUserId: string;
  },
): Promise<{ id: string; sourceId: string }> {
  const sourceResult = await client.query<{
    source_revision: number;
    snapshot: WebsitePublicationSnapshot;
  }>(
    `SELECT source_revision, snapshot
     FROM public.website_publications
     WHERE tenant_id = $1 AND site_id = $2 AND id = $3
       AND status IN ('ready', 'active', 'superseded')
     FOR UPDATE`,
    [input.tenantId, input.site.id, input.sourcePublicationId],
  );
  const source = sourceResult.rows[0];
  if (!source) throw new Error("Managed rollback publication not found");
  const targetDeliveryRevision = Number(input.site.delivery_revision) + 1;
  const snapshot = websitePublicationSnapshotSchema.parse({
    ...source.snapshot,
    deliveryRevision: targetDeliveryRevision,
  });
  const canonicalSnapshot = serializeWebsitePublication(snapshot);
  const contentHash = hashRollbackPublication(
    Number(source.source_revision),
    canonicalSnapshot,
  );
  const { cacheKey } = websitePublicationCacheIdentity({
    tenantId: input.tenantId,
    siteId: input.site.id,
    deliveryRevision: targetDeliveryRevision,
    contentHash,
  });
  const sequenceResult = await client.query<{ sequence: number }>(
    `SELECT COALESCE(max(sequence), 0)::integer + 1 AS sequence
     FROM public.website_publications
     WHERE tenant_id = $1 AND site_id = $2`,
    [input.tenantId, input.site.id],
  );
  const id = randomUUID();
  await client.query(
    `INSERT INTO public.website_publications (
       id, tenant_id, site_id, sequence, schema_version, source_revision,
       target_delivery_revision, snapshot, content_hash, cache_key, status,
       validation, created_by, activated_by, activated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, 'active',
       '{"errors":[],"warnings":[],"compilerVersion":1,"rollbackClone":true}'::jsonb,
       $11, $11, now()
     )`,
    [
      id,
      input.tenantId,
      input.site.id,
      Number(sequenceResult.rows[0]?.sequence ?? 1),
      WEBSITE_PUBLICATION_SCHEMA_VERSION,
      Number(source.source_revision),
      targetDeliveryRevision,
      canonicalSnapshot,
      contentHash,
      cacheKey,
      input.actorUserId,
    ],
  );
  return { id, sourceId: input.sourcePublicationId };
}

function managedRollbackEvidence(
  site: SiteState,
  exactCurrentState: boolean,
  sourcePublicationFound: boolean,
): Record<string, unknown> {
  const checks = [
    {
      key: "tenantActive",
      status:
        site.tenant_is_active &&
        ["trial", "active"].includes(site.tenant_status)
          ? "pass"
          : "fail",
    },
    {
      key: "websiteEntitled",
      status: site.module_enabled ? "pass" : "fail",
    },
    {
      key: "primaryDomainActive",
      status:
        site.canonical_binding_status === "active" &&
        site.canonical_binding_verified_at
          ? "pass"
          : "fail",
    },
    {
      key: "stagingHostname",
      status: site.canonical_hostname?.endsWith(".staging.fieldgrid.nl")
        ? "pass"
        : "fail",
    },
    {
      key: "exactCurrentState",
      status: exactCurrentState ? "pass" : "fail",
    },
    {
      key: "managedSnapshotPreserved",
      status: sourcePublicationFound ? "pass" : "fail",
    },
  ];
  return {
    schemaVersion: 1,
    status: checks.every((check) => check.status === "pass")
      ? "ready"
      : "blocked",
    environment: "staging",
    productionEnabled: false,
    checks,
  };
}

export async function rollbackPlatformWebsiteDelivery(
  rawInput: z.input<typeof rollbackInputSchema>,
): Promise<WebsiteActivationResult> {
  const input = rollbackInputSchema.parse(rawInput);
  const registry = configuredRegistry();

  return inTransaction(async (client) => {
    const site = await loadSite(client, input.tenantId, input.siteId, true);
    const currentTargetId = activeTargetId(site);
    const exactCurrentState =
      site.delivery_mode === input.expectedMode &&
      currentTargetId === input.expectedTargetId &&
      Number(site.delivery_revision) === input.expectedDeliveryRevision;
    const activationResult = await client.query<{
      id: string;
      from_mode: WebsiteDeliveryMode;
      from_target_id: string | null;
      to_mode: WebsiteDeliveryMode;
      to_target_id: string;
    }>(
      `SELECT id, from_mode, from_target_id, to_mode, to_target_id
       FROM public.website_delivery_activations
       WHERE tenant_id = $1 AND site_id = $2
         AND new_revision = $3
         AND to_mode = $4
         AND to_target_id = $5
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [
        input.tenantId,
        input.siteId,
        input.expectedDeliveryRevision,
        input.expectedMode,
        input.expectedTargetId,
      ],
    );
    const activation = activationResult.rows[0];
    if (!activation?.from_target_id) {
      throw new Error("No exact previous website target is available");
    }

    let targetId = activation.from_target_id;
    let rollbackSourceTargetId: string | null = activation.from_target_id;
    let evidence: Record<string, unknown>;
    if (activation.from_mode === "custom_nextjs") {
      const deployment = await loadDeployment(
        client,
        input.tenantId,
        input.siteId,
        activation.from_target_id,
        true,
      );
      evidence = customActivationPreflight(site, deployment, registry, {
        mode: input.expectedMode,
        targetId: input.expectedTargetId,
        revision: input.expectedDeliveryRevision,
      });
    } else {
      const sourceExists = await client.query(
        `SELECT 1
         FROM public.website_publications
         WHERE tenant_id = $1 AND site_id = $2 AND id = $3
           AND status IN ('ready', 'active', 'superseded')`,
        [input.tenantId, input.siteId, activation.from_target_id],
      );
      evidence = managedRollbackEvidence(
        site,
        exactCurrentState,
        sourceExists.rowCount === 1,
      );
    }

    if (evidence.status !== "ready") {
      await insertOperation(client, {
        tenantId: input.tenantId,
        siteId: input.siteId,
        operationType: "rollback",
        status: "failed",
        fromMode: site.delivery_mode,
        fromTargetId: currentTargetId,
        toMode: activation.from_mode,
        toTargetId: targetId,
        rollbackSourceTargetId,
        expectedRevision: input.expectedDeliveryRevision,
        newRevision: null,
        changeReference: input.changeReference,
        reason: input.reason,
        preflightEvidence: evidence,
        errorCode: "preflight_blocked",
        actorUserId: input.actorUserId,
      });
      return {
        status: "blocked",
        deliveryRevision: null,
        deliveryMode: activation.from_mode,
        targetId,
        evidence,
      };
    }

    if (
      site.delivery_mode === "custom_nextjs" &&
      site.active_custom_deployment_id
    ) {
      await client.query(
        `UPDATE public.website_custom_deployments
         SET status = 'ready', updated_at = now()
         WHERE tenant_id = $1 AND site_id = $2 AND id = $3 AND status = 'active'`,
        [input.tenantId, input.siteId, site.active_custom_deployment_id],
      );
    }
    if (site.delivery_mode === "managed_cms" && site.active_publication_id) {
      await client.query(
        `UPDATE public.website_publications
         SET status = 'ready'
         WHERE tenant_id = $1 AND site_id = $2 AND id = $3 AND status = 'active'`,
        [input.tenantId, input.siteId, site.active_publication_id],
      );
    }

    if (activation.from_mode === "managed_cms") {
      const clone = await cloneManagedRollbackPublication(client, {
        tenantId: input.tenantId,
        site,
        sourcePublicationId: activation.from_target_id,
        actorUserId: input.actorUserId,
      });
      targetId = clone.id;
      rollbackSourceTargetId = clone.sourceId;
    }

    const activatedResult = await client.query<{
      delivery_revision: number;
      delivery_mode: WebsiteDeliveryMode;
    }>(
      `SELECT (site).*
       FROM (
         SELECT public.activate_website_delivery(
           $1, $2, $3, $4, $5, $6, $7
         ) AS site
       ) result`,
      [
        input.tenantId,
        input.siteId,
        input.expectedDeliveryRevision,
        activation.from_mode,
        targetId,
        input.actorUserId,
        input.reason,
      ],
    );
    const activated = activatedResult.rows[0];
    if (!activated) throw new Error("Website rollback activation failed");
    if (activation.from_mode === "custom_nextjs") {
      await client.query(
        `UPDATE public.website_custom_deployments
         SET status = 'active', updated_at = now()
         WHERE tenant_id = $1 AND site_id = $2 AND id = $3`,
        [input.tenantId, input.siteId, targetId],
      );
    }
    await insertOperation(client, {
      tenantId: input.tenantId,
      siteId: input.siteId,
      operationType: "rollback",
      status: "succeeded",
      fromMode: site.delivery_mode,
      fromTargetId: currentTargetId,
      toMode: activation.from_mode,
      toTargetId: targetId,
      rollbackSourceTargetId,
      expectedRevision: input.expectedDeliveryRevision,
      newRevision: Number(activated.delivery_revision),
      changeReference: input.changeReference,
      reason: input.reason,
      preflightEvidence: evidence,
      errorCode: null,
      actorUserId: input.actorUserId,
    });
    await writeAudit(client, {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: "website_delivery_rolled_back",
      resourceId: targetId,
      metadata: {
        siteId: input.siteId,
        fromMode: site.delivery_mode,
        fromTargetId: currentTargetId,
        toMode: activation.from_mode,
        toTargetId: targetId,
        rollbackSourceTargetId,
        fromRevision: input.expectedDeliveryRevision,
        toRevision: Number(activated.delivery_revision),
        changeReference: input.changeReference,
        environment: "staging",
        productionChanged: false,
      },
    });
    return {
      status: "succeeded",
      deliveryRevision: Number(activated.delivery_revision),
      deliveryMode: activation.from_mode,
      targetId,
      evidence,
    };
  });
}
