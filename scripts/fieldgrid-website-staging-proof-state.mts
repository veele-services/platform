#!/usr/bin/env node
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const WEBSITE_STAGING_PROOF_STATE_VERSION =
  "fieldgrid-website-staging-proof-state-v1";
export const WEBSITE_STAGING_PROOF_MARKER =
  "FIELDGRID_WEBSITE_STAGING_PROOF_W00_V2";
export const MANAGED_PROOF_HOST = "managed-proof-w00-v2.staging.fieldgrid.nl";
export const MANAGED_PROOF_URL = `https://${MANAGED_PROOF_HOST}/`;
export const MANAGED_PROOF_SLUG = "managed-proof-w00-v2";
export const FIELD_DEMO_HOST = "field-demo.staging.fieldgrid.nl";
export const CUSTOM_PROOF_HOST = "veeleservices.staging.fieldgrid.nl";
export const CUSTOM_PROOF_URL = `https://${CUSTOM_PROOF_HOST}/`;

const PROVIDER_KEY = "fieldgrid_vps";
const HEALTH_PATH = "/api/health";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const CORE_STAGING_BASE_DIR = "/var/www/veele/staging";
const WEBSITE_STACK_STAGING_BASE_DIR = "/var/www/veele/website-stack-staging";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const CHANGE_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/# -]{2,159}$/u;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type ProofMode =
  | "check"
  | "prepare-managed"
  | "complete-custom"
  | "verify"
  | "rollback-custom";

type ProofOptions = {
  mode: ProofMode;
  expectedSha: string;
  changeReference: string;
  evidenceDir: string;
};

type ProofEnvironment = Record<string, string | undefined> & {
  APP_ENV?: string;
  TARGET_ENVIRONMENT?: string;
  GITHUB_REF_NAME?: string;
  GITHUB_SHA?: string;
  FIELDGRID_WEBSITE_STAGING_PROOF_CONFIRMATION?: string;
  FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID?: string;
  FIELDGRID_DATABASE_CONNECTION_PURPOSE?: string;
  FIELDGRID_MIGRATION_DATABASE_URL?: string;
  FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON?: string;
  FIELDGRID_CUSTOM_ROUTE_KEY?: string;
  FIELDGRID_CUSTOM_EXPECTED_HOST?: string;
  WEBSITE_MANAGED_ACCEPTANCE_URL?: string;
  WEBSITE_CUSTOM_ACCEPTANCE_URL?: string;
  DATABASE_URL?: string;
};

type Queryable = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
};

type DatabaseModule = typeof import("../lib/db/src/index.ts");

type RuntimeTenant = {
  tenantId: string;
  host: string;
  slug: string;
  planKey: string;
};

type ManagedProofSiteDomain = {
  canonicalHostname: string | null;
  canonicalDomainStatus: string | null;
};

type ManagedProofCandidate = {
  tenant_id: string;
  slug: string;
  plan_key: string;
  domain: string | null;
  marker: string | null;
  environment: string | null;
  provisioned_slug: string | null;
  provisioned_plan_key: string | null;
  provisioned_primary_domain: string | null;
  provisioned_owner_email: string | null;
  provisioned_requested_by: string | null;
  tenant_created_by: string | null;
};

type ManagedProofCandidateErrorCode =
  | "managed_proof_identity_ambiguous"
  | "managed_proof_identity_mismatch"
  | "managed_proof_plan_mismatch"
  | "managed_proof_ownership_mismatch";

type ProofStateErrorCode =
  | ManagedProofCandidateErrorCode
  | "runtime_host_binding_invalid"
  | "runtime_host_settings_invalid";

class ProofStateError extends Error {
  readonly code: ProofStateErrorCode;

  constructor(code: ProofStateErrorCode, message: string) {
    super(message);
    this.name = "ProofStateError";
    this.code = code;
  }
}

type ProofEvidence = {
  schemaVersion: 1;
  contract: typeof WEBSITE_STAGING_PROOF_STATE_VERSION;
  environment: "staging";
  mode: Exclude<ProofMode, "check">;
  expectedSha: string;
  status: "passed" | "failed";
  startedAt: string;
  completedAt: string;
  managed: {
    host: typeof MANAGED_PROOF_HOST;
    deliveryMode: "managed_cms" | null;
    active: boolean;
  };
  custom: {
    host: typeof CUSTOM_PROOF_HOST;
    releaseId: string | null;
    deliveryMode: "custom_nextjs" | null;
    active: boolean;
  };
  errorCode: string | null;
};

function parseArgs(argv: string[]): ProofOptions {
  const options: ProofOptions = {
    mode: "check",
    expectedSha: "",
    changeReference: "",
    evidenceDir: join(repoRoot, "artifacts", "website-staging-proof-state"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") options.mode = "check";
    else if (argument === "--prepare-managed") options.mode = "prepare-managed";
    else if (argument === "--complete-custom") options.mode = "complete-custom";
    else if (argument === "--verify") options.mode = "verify";
    else if (argument === "--rollback-custom") options.mode = "rollback-custom";
    else if (argument === "--expected-sha")
      options.expectedSha = argv[++index] ?? "";
    else if (argument === "--change-reference")
      options.changeReference = argv[++index] ?? "";
    else if (argument === "--evidence-dir")
      options.evidenceDir = resolve(argv[++index] ?? "");
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function expectedConfirmation(mode: ProofMode): string | null {
  if (mode === "prepare-managed") return "website-staging-prepare-managed";
  if (mode === "complete-custom") return "website-staging-complete-custom";
  if (mode === "rollback-custom") return "website-staging-rollback-custom";
  if (mode === "verify") return "website-staging-read-only";
  return null;
}

function exactHttpsRoot(value: string | undefined, expected: string): boolean {
  try {
    const url = new URL(value ?? "");
    return (
      url.href === expected &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function validateWebsiteStagingProofStateConfig(
  options: ProofOptions,
  environment: ProofEnvironment = process.env,
): string[] {
  if (options.mode === "check") return [];
  const errors: string[] = [];
  if (!SHA_PATTERN.test(options.expectedSha))
    errors.push("expected SHA must be an exact lowercase commit SHA");
  if (!CHANGE_REFERENCE_PATTERN.test(options.changeReference))
    errors.push("change reference is missing or invalid");
  if (environment.APP_ENV !== "staging") errors.push("APP_ENV must be staging");
  if (environment.TARGET_ENVIRONMENT !== "staging")
    errors.push("TARGET_ENVIRONMENT must be staging");
  const expectedRef = options.mode === "prepare-managed" ? "main" : "staging";
  if (environment.GITHUB_REF_NAME !== expectedRef)
    errors.push(`${options.mode} must run from ${expectedRef}`);
  if (environment.GITHUB_SHA !== options.expectedSha)
    errors.push("checkout SHA differs from the expected SHA");
  if (
    environment.FIELDGRID_WEBSITE_STAGING_PROOF_CONFIRMATION !==
    expectedConfirmation(options.mode)
  ) {
    errors.push(`confirmation does not authorize ${options.mode}`);
  }
  if (!environment.DATABASE_URL?.trim())
    errors.push("DATABASE_URL is required");
  const connectionPurpose =
    environment.FIELDGRID_DATABASE_CONNECTION_PURPOSE?.trim();
  if (options.mode === "prepare-managed") {
    if (connectionPurpose !== "migration") {
      errors.push("prepare-managed requires the migration connection purpose");
    }
    if (!environment.FIELDGRID_MIGRATION_DATABASE_URL?.trim()) {
      errors.push("prepare-managed requires the migration database URL");
    }
  } else if (connectionPurpose && connectionPurpose !== "runtime") {
    errors.push(`${options.mode} requires the runtime connection purpose`);
  }
  if (
    !exactHttpsRoot(
      environment.WEBSITE_MANAGED_ACCEPTANCE_URL,
      MANAGED_PROOF_URL,
    )
  ) {
    errors.push(`managed acceptance URL must be ${MANAGED_PROOF_URL}`);
  }
  if (
    !exactHttpsRoot(environment.WEBSITE_CUSTOM_ACCEPTANCE_URL, CUSTOM_PROOF_URL)
  ) {
    errors.push(`custom acceptance URL must be ${CUSTOM_PROOF_URL}`);
  }

  const actor =
    environment.FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID?.trim() ?? "";
  if (actor && !UUID_PATTERN.test(actor)) {
    errors.push("automation actor must be a UUID");
  }
  if (options.mode !== "prepare-managed" && !UUID_PATTERN.test(actor)) {
    errors.push("automation actor is required after prepare-managed");
  }

  if (["complete-custom", "verify", "rollback-custom"].includes(options.mode)) {
    if (environment.FIELDGRID_CUSTOM_EXPECTED_HOST !== CUSTOM_PROOF_HOST) {
      errors.push("custom expected host differs from the reviewed proof host");
    }
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]{1,239}$/u.test(
        environment.FIELDGRID_CUSTOM_ROUTE_KEY ?? "",
      )
    ) {
      errors.push("custom route key is missing or invalid");
    }
    try {
      const routes = JSON.parse(
        environment.FIELDGRID_CUSTOM_WEBSITE_ROUTES_JSON ?? "",
      ) as unknown;
      if (!Array.isArray(routes)) throw new Error("not an array");
      const exact = routes.filter(
        (route) =>
          route &&
          typeof route === "object" &&
          (route as Record<string, unknown>)["providerKey"] === PROVIDER_KEY &&
          (route as Record<string, unknown>)["routeKey"] ===
            environment.FIELDGRID_CUSTOM_ROUTE_KEY &&
          (route as Record<string, unknown>)["releaseId"] ===
            `git-commit:${options.expectedSha}` &&
          (route as Record<string, unknown>)["healthPath"] === HEALTH_PATH &&
          (route as Record<string, unknown>)["status"] === "routable" &&
          Array.isArray((route as Record<string, unknown>)["expectedHosts"]) &&
          (
            (route as Record<string, unknown>)["expectedHosts"] as unknown[]
          ).includes(CUSTOM_PROOF_HOST),
      );
      if (exact.length !== 1)
        errors.push("exact custom route identity is missing or ambiguous");
    } catch {
      errors.push("custom route registry is invalid");
    }
  }
  return errors;
}

export function safeErrorCode(error: unknown): string {
  if (error instanceof ProofStateError) return error.code;
  const message = error instanceof Error ? error.message : String(error);
  if (/collision/iu.test(message)) return "proof_state_collision";
  if (/actor/iu.test(message)) return "automation_actor_invalid";
  if (/health/iu.test(message)) return "custom_health_invalid";
  if (/public/iu.test(message)) return "public_verification_failed";
  if (/database|principal|credential|certificate|\btls\b/iu.test(message))
    return "database_configuration_invalid";
  return "proof_state_failed";
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(path, 0o600);
}

async function resolveAutomationActor(
  queryable: Queryable,
  configuredActor: string | undefined,
): Promise<string> {
  const requested = configuredActor?.trim() ?? "";
  const result = await queryable.query<{
    user_id: string;
    role: string;
    status: string;
  }>(
    `SELECT user_id, role, status
     FROM public.platform_users
     WHERE status = 'active' AND role IN ('owner', 'admin')
       AND ($1::uuid IS NULL OR user_id = $1::uuid)
     ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, user_id`,
    [requested || null],
  );
  return selectAutomationActor(result.rows, requested);
}

export function selectAutomationActor(
  candidates: ReadonlyArray<{ user_id: string; role: string }>,
  requested: string,
): string {
  if (requested) {
    if (candidates.length !== 1 || candidates[0]?.user_id !== requested) {
      throw new Error(
        "Configured automation actor is not an active platform owner/admin",
      );
    }
    return requested;
  }
  return selectDefaultAutomationActor(candidates);
}

export function selectDefaultAutomationActor(
  candidates: ReadonlyArray<{ user_id: string; role: string }>,
): string {
  const admins = candidates.filter((candidate) => candidate.role === "admin");
  if (admins.length === 1) return admins[0]!.user_id;
  if (admins.length > 1) {
    throw new Error(
      "Prepare-managed requires exactly one active platform admin when no actor is configured",
    );
  }
  const owners = candidates.filter((candidate) => candidate.role === "owner");
  if (owners.length !== 1) {
    throw new Error(
      "Prepare-managed requires exactly one active platform owner when no admin or actor is configured",
    );
  }
  return owners[0]!.user_id;
}

async function resolveRuntimeTenant(
  queryable: Queryable,
  host: string,
): Promise<RuntimeTenant> {
  const result = await queryable.query<{
    tenant_id: string;
    slug: string;
    plan_key: string;
    is_active: boolean;
    tenant_status: string;
    domain_type: string;
    is_primary: boolean;
    verification_status: string;
    disabled_at: Date | string | null;
  }>(
    `SELECT tenant.id AS tenant_id, tenant.slug, tenant.plan_key,
            tenant.is_active, tenant.status AS tenant_status,
            domain.type AS domain_type, domain.is_primary,
            domain.verification_status, domain.disabled_at
     FROM public.tenant_domains AS domain
     JOIN public.tenants AS tenant ON tenant.id = domain.tenant_id
     WHERE domain.domain = $1`,
    [host],
  );
  if (result.rows.length !== 1) {
    throw new ProofStateError(
      "runtime_host_binding_invalid",
      `Runtime host collision or missing binding: ${host}`,
    );
  }
  const row = result.rows[0]!;
  if (
    !row.is_active ||
    !["trial", "active"].includes(row.tenant_status) ||
    row.domain_type !== "fieldgrid_subdomain" ||
    !row.is_primary ||
    !["verified", "active"].includes(row.verification_status) ||
    row.disabled_at
  ) {
    throw new ProofStateError(
      "runtime_host_settings_invalid",
      `Runtime host settings are not active and verified: ${host}`,
    );
  }
  return {
    tenantId: row.tenant_id,
    host,
    slug: row.slug,
    planKey: row.plan_key,
  };
}

export function managedProofCandidateErrorCode(
  candidates: ReadonlyArray<ManagedProofCandidate>,
): ManagedProofCandidateErrorCode | null {
  if (candidates.length === 0) return null;
  if (candidates.length !== 1) return "managed_proof_identity_ambiguous";
  const candidate = candidates[0]!;
  if (
    candidate.slug !== MANAGED_PROOF_SLUG ||
    candidate.domain !== MANAGED_PROOF_HOST
  ) {
    return "managed_proof_identity_mismatch";
  }
  if (candidate.plan_key !== "enterprise") {
    return "managed_proof_plan_mismatch";
  }
  if (candidate.marker !== WEBSITE_STAGING_PROOF_MARKER) {
    return "managed_proof_ownership_mismatch";
  }
  if (
    candidate.environment !== "staging" ||
    candidate.provisioned_slug !== MANAGED_PROOF_SLUG ||
    candidate.provisioned_plan_key !== "enterprise" ||
    candidate.provisioned_primary_domain !== MANAGED_PROOF_HOST ||
    candidate.provisioned_owner_email !== null ||
    !candidate.provisioned_requested_by ||
    candidate.provisioned_requested_by !== candidate.tenant_created_by
  ) {
    return "managed_proof_ownership_mismatch";
  }
  return null;
}

async function findManagedProofTenant(
  queryable: Queryable,
): Promise<RuntimeTenant | null> {
  const result = await queryable.query<ManagedProofCandidate>(
    `SELECT tenant.id AS tenant_id, tenant.slug, tenant.plan_key,
            domain.domain, tenant.created_by AS tenant_created_by,
            provisioning.metadata ->> 'automationMarker' AS marker,
            provisioning.metadata ->> 'environment' AS environment,
            provisioning.slug AS provisioned_slug,
            provisioning.plan_key AS provisioned_plan_key,
            provisioning.primary_domain AS provisioned_primary_domain,
            provisioning.owner_email AS provisioned_owner_email,
            provisioning.requested_by AS provisioned_requested_by
     FROM public.tenants AS tenant
     LEFT JOIN public.tenant_domains AS domain
       ON domain.tenant_id = tenant.id AND domain.is_primary = true
     LEFT JOIN LATERAL (
       SELECT run.metadata, run.slug, run.plan_key, run.primary_domain,
              run.owner_email, run.requested_by
       FROM public.tenant_provisioning_runs AS run
       WHERE run.tenant_id = tenant.id
         AND run.status = 'succeeded'
         AND run.metadata ->> 'automationMarker' = $3
       ORDER BY run.completed_at DESC NULLS LAST, run.id
       LIMIT 1
     ) AS provisioning ON true
     WHERE tenant.slug = $1 OR domain.domain = $2`,
    [MANAGED_PROOF_SLUG, MANAGED_PROOF_HOST, WEBSITE_STAGING_PROOF_MARKER],
  );
  if (result.rows.length === 0) return null;
  const errorCode = managedProofCandidateErrorCode(result.rows);
  if (errorCode) {
    throw new ProofStateError(
      errorCode,
      "Managed proof candidate is not the exact automation-owned identity",
    );
  }
  const candidate = result.rows[0]!;
  const runtime = await resolveRuntimeTenant(queryable, MANAGED_PROOF_HOST);
  if (
    runtime.tenantId !== candidate.tenant_id ||
    runtime.slug !== candidate.slug ||
    runtime.planKey !== candidate.plan_key
  ) {
    throw new ProofStateError(
      "managed_proof_identity_mismatch",
      "Managed proof runtime binding changed during identity validation",
    );
  }
  return runtime;
}

function reviewedProofSection(
  section: Record<string, unknown>,
  isHomepage: boolean,
): Record<string, unknown> {
  const isProofHero = isHomepage && section["type"] === "hero";
  const rawContent = section["content"];
  const content =
    rawContent && typeof rawContent === "object" && !Array.isArray(rawContent)
      ? { ...(rawContent as Record<string, unknown>) }
      : rawContent;
  if (isProofHero && content && typeof content === "object") {
    Object.assign(content, {
      eyebrow: "Fieldgrid website-module",
      title: "Een heldere website, veilig beheerd vanuit Fieldgrid",
      subtitle:
        "Deze acceptatiesite toont de beheerde publicatieroute met rustige vormgeving, duidelijke navigatie en een veilige technische basis.",
      badges: ["Veilig gepubliceerd", "Geschikt voor mobiel"],
    });
  }
  return {
    id: section["id"],
    type: section["type"],
    schemaVersion: section["schemaVersion"],
    variant: section["variant"],
    visible: isProofHero,
    requiresReview: false,
    content,
  };
}

function sectionNeedsUpdate(
  current: Record<string, unknown>,
  desired: Record<string, unknown>,
): boolean {
  return (
    current["visible"] !== desired["visible"] ||
    current["requiresReview"] === true ||
    JSON.stringify(current["content"]) !== JSON.stringify(desired["content"])
  );
}

export function managedProofDomainBindingRequired(
  site: ManagedProofSiteDomain,
): boolean {
  if (
    site.canonicalHostname !== null &&
    site.canonicalHostname !== MANAGED_PROOF_HOST
  ) {
    throw new Error("Managed proof website is bound to a different domain");
  }
  return (
    site.canonicalHostname !== MANAGED_PROOF_HOST ||
    site.canonicalDomainStatus !== "active"
  );
}

async function ensureManagedProof(
  dbModule: DatabaseModule,
  actorUserId: string,
  expectedSha: string,
  changeReference: string,
): Promise<RuntimeTenant> {
  const { pool } = dbModule;
  let tenant = await findManagedProofTenant(pool);
  let createdTenant: { tenantId: string; runId: string } | null = null;
  let siteCreated = false;
  try {
    if (!tenant) {
      const provisioned = await dbModule.provisionTenant({
        name: "Fieldgrid Managed Website Acceptatie",
        slug: MANAGED_PROOF_SLUG,
        planKey: "enterprise",
        primaryDomain: MANAGED_PROOF_HOST,
        requestedBy: actorUserId,
        ownerEmail: null,
        moduleKeys: ["website"],
        metadata: {
          automationMarker: WEBSITE_STAGING_PROOF_MARKER,
          environment: "staging",
          expectedSha,
          changeReference,
        },
      });
      createdTenant = {
        tenantId: provisioned.tenantId,
        runId: provisioned.runId,
      };
      tenant = await findManagedProofTenant(pool);
      if (!tenant || tenant.tenantId !== provisioned.tenantId) {
        throw new Error(
          "Managed proof tenant did not resolve after provisioning",
        );
      }
    }

    let overview = await dbModule.getWebsiteAdminOverview(tenant.tenantId);
    if (!overview.site) {
      const settings = dbModule.createInitialWebsiteSettings(
        "Fieldgrid Managed Website Acceptatie",
      );
      settings.defaultSeo.title = "Fieldgrid managed website acceptatie";
      settings.defaultSeo.description =
        "Controleerbare staging-publicatie van de beheerde Fieldgrid website-module.";
      await dbModule.initializeManagedWebsite({
        tenantId: tenant.tenantId,
        actorUserId,
        templateKey: "trust_conversion",
        settings,
      });
      siteCreated = true;
      overview = await dbModule.getWebsiteAdminOverview(tenant.tenantId);
    }
    if (!overview.site) {
      throw new Error("Managed proof website initialization is missing");
    }
    if (managedProofDomainBindingRequired(overview.site)) {
      await dbModule.bindPrimaryTenantDomainToWebsite({
        tenantId: tenant.tenantId,
        siteId: overview.site.id,
        expectedAuthoringRevision: overview.site.authoringRevision,
        actorUserId,
        reason: "Staging acceptatie koppelt het beheerde proof-domein.",
      });
      overview = await dbModule.getWebsiteAdminOverview(tenant.tenantId);
    }
    if (
      !overview.site ||
      overview.site.canonicalHostname !== MANAGED_PROOF_HOST ||
      overview.site.canonicalDomainStatus !== "active"
    ) {
      throw new Error("Managed proof website domain is not exactly active");
    }

    let pages = await dbModule.listWebsitePages(tenant.tenantId);
    if (!pages || pages.siteId !== overview.site.id) {
      throw new Error("Managed proof website pages are missing");
    }
    for (const pageSummary of pages.pages) {
      let page = await dbModule.getWebsitePage(tenant.tenantId, pageSummary.id);
      if (!page) throw new Error("Managed proof page disappeared");
      for (const section of page.sections) {
        const current = section as unknown as Record<string, unknown>;
        const desired = reviewedProofSection(current, page.isHomepage);
        if (!sectionNeedsUpdate(current, desired)) continue;
        const updated = await dbModule.updateWebsiteSection({
          tenantId: tenant.tenantId,
          siteId: page.siteId,
          pageId: page.id,
          actorUserId,
          expectedAuthoringRevision: page.siteAuthoringRevision,
          expectedPageRevision: page.authoringRevision,
          expectedSectionRevision: section.authoringRevision,
          section: desired as never,
        });
        page = {
          ...page,
          siteAuthoringRevision: updated.siteAuthoringRevision,
          authoringRevision: updated.pageAuthoringRevision,
          sections: page.sections.map((candidate) =>
            candidate.id === section.id
              ? ({
                  ...candidate,
                  ...desired,
                  authoringRevision: updated.sectionAuthoringRevision!,
                } as typeof candidate)
              : candidate,
          ),
        };
      }
      if (page.status === "draft") {
        await dbModule.includeWebsitePageInPublication({
          tenantId: tenant.tenantId,
          siteId: page.siteId,
          pageId: page.id,
          actorUserId,
          expectedAuthoringRevision: page.siteAuthoringRevision,
          expectedPageRevision: page.authoringRevision,
        });
      }
    }

    const review = await dbModule.getWebsitePublicationReview({
      tenantId: tenant.tenantId,
      siteId: overview.site.id,
    });
    const errorCodes = review.diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.code);
    if (!review.canPreparePublication || errorCodes.length > 0) {
      throw new Error(
        `Managed proof publication review failed: ${errorCodes.join(",")}`,
      );
    }

    overview = await dbModule.getWebsiteAdminOverview(tenant.tenantId);
    if (
      !overview.site ||
      overview.site.deliveryMode !== "managed_cms" ||
      overview.site.status !== "active" ||
      review.activePublication?.sourceRevision !== review.authoringRevision
    ) {
      const ready =
        review.readyPublication &&
        review.readyPublication.sourceRevision === review.authoringRevision &&
        review.readyPublication.targetDeliveryRevision ===
          review.deliveryRevision + 1
          ? review.readyPublication
          : await dbModule.createManagedWebsitePublication({
              tenantId: tenant.tenantId,
              siteId: review.siteId,
              actorUserId,
              expectedAuthoringRevision: review.authoringRevision,
              reason:
                "Staging acceptatie bereidt de beheerde proof-publicatie voor.",
            });
      await dbModule.activateManagedWebsitePublication({
        tenantId: tenant.tenantId,
        siteId: review.siteId,
        publicationId: ready.id,
        actorUserId,
        expectedAuthoringRevision: review.authoringRevision,
        expectedDeliveryRevision: review.deliveryRevision,
        reason: "Staging acceptatie activeert de gereviewde proof-publicatie.",
      });
    }

    overview = await dbModule.getWebsiteAdminOverview(tenant.tenantId);
    if (
      !overview.site ||
      overview.site.status !== "active" ||
      overview.site.deliveryMode !== "managed_cms" ||
      overview.site.canonicalHostname !== MANAGED_PROOF_HOST ||
      !overview.site.activePublicationHash ||
      overview.site.draftPageCount !== 0
    ) {
      throw new Error("Managed proof website is not fully active");
    }
    return assertManagedProof(dbModule);
  } catch (error) {
    if (createdTenant && !siteCreated) {
      await dbModule
        .rollbackProvisionedTenant({
          tenantId: createdTenant.tenantId,
          runId: createdTenant.runId,
          requestedBy: actorUserId,
          reason: "Automatische rollback vóór website-initialisatie.",
        })
        .catch(() => undefined);
    }
    throw error;
  }
}

async function assertManagedProof(
  dbModule: DatabaseModule,
): Promise<RuntimeTenant> {
  const tenant = await findManagedProofTenant(dbModule.pool);
  if (!tenant) throw new Error("Managed proof tenant is missing");
  const overview = await dbModule.getWebsiteAdminOverview(tenant.tenantId);
  if (
    !overview.site ||
    overview.site.status !== "active" ||
    overview.site.deliveryMode !== "managed_cms" ||
    overview.site.canonicalHostname !== MANAGED_PROOF_HOST ||
    overview.site.canonicalDomainStatus !== "active" ||
    !overview.site.activePublicationHash ||
    overview.site.draftPageCount !== 0
  ) {
    throw new Error("Managed proof website settings are not exact");
  }
  const review = await dbModule.getWebsitePublicationReview({
    tenantId: tenant.tenantId,
    siteId: overview.site.id,
  });
  if (
    review.activePublication?.sourceRevision !== review.authoringRevision ||
    review.diagnostics.some((diagnostic) => diagnostic.severity === "error")
  ) {
    throw new Error(
      "Managed proof publication is not the current authoring state",
    );
  }
  const pages = await dbModule.listWebsitePages(tenant.tenantId);
  if (!pages || pages.siteId !== overview.site.id || pages.pages.length === 0) {
    throw new Error("Managed proof pages are missing");
  }
  let visibleHomepageHeroes = 0;
  for (const summary of pages.pages) {
    const page = await dbModule.getWebsitePage(tenant.tenantId, summary.id);
    if (!page || page.status !== "published") {
      throw new Error("Managed proof pages are not all published");
    }
    for (const section of page.sections) {
      const current = section as unknown as Record<string, unknown>;
      const desired = reviewedProofSection(current, page.isHomepage);
      if (sectionNeedsUpdate(current, desired)) {
        throw new Error(
          "Managed proof sections differ from reviewed proof content",
        );
      }
      if (page.isHomepage && section.type === "hero" && section.visible) {
        visibleHomepageHeroes += 1;
      }
    }
  }
  if (visibleHomepageHeroes !== 1) {
    throw new Error("Managed proof requires exactly one visible homepage hero");
  }
  return tenant;
}

async function fetchMode(url: string, expectedMode: string): Promise<void> {
  const response = await fetch(url, {
    redirect: "error",
    headers: { Accept: "text/html" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (
    response.status !== 200 ||
    response.headers.get("x-fieldgrid-website-delivery") !== expectedMode
  ) {
    await response.body?.cancel();
    throw new Error(`Public proof did not resolve as ${expectedMode}`);
  }
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error("Public proof response exceeds the bounded size");
  }
  if (!response.body) throw new Error("Public proof response has no body");
  const reader = response.body.getReader();
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Public proof response exceeds the bounded size");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function assertExactReleaseMarkers(expectedSha: string): Promise<void> {
  for (const baseDirectory of [
    CORE_STAGING_BASE_DIR,
    WEBSITE_STACK_STAGING_BASE_DIR,
  ]) {
    const actual = (
      await readFile(
        join(baseDirectory, "current", ".fieldgrid-release-sha"),
        "utf8",
      )
    ).trim();
    if (actual !== expectedSha) {
      throw new Error(
        "Core and website stack must both run the exact staging SHA",
      );
    }
  }
}

async function resolveCustomSite(dbModule: DatabaseModule): Promise<{
  tenant: RuntimeTenant;
  siteId: string;
}> {
  const tenant = await resolveRuntimeTenant(dbModule.pool, CUSTOM_PROOF_HOST);
  const delivery = await dbModule.getPlatformWebsiteDelivery(tenant.tenantId);
  if (
    !delivery.site ||
    delivery.site.canonicalHostname !== CUSTOM_PROOF_HOST ||
    !delivery.site.canonicalDomainActive ||
    !delivery.site.tenantActive ||
    delivery.site.tenantPlanKey !== "enterprise" ||
    !delivery.site.websiteEntitled
  ) {
    throw new Error("Custom proof tenant/site settings are not exact");
  }
  return { tenant, siteId: delivery.site.id };
}

function exactCustomRegistration(
  dbModule: DatabaseModule,
  expectedSha: string,
  environment: ProofEnvironment,
) {
  const registry =
    dbModule.configuredFieldgridCustomWebsiteRouteRegistry(environment);
  const releaseId = `git-commit:${expectedSha}`;
  const registrations = registry.registrations.filter(
    (candidate) =>
      candidate.status === "routable" &&
      candidate.providerKey === PROVIDER_KEY &&
      candidate.routeKey === environment.FIELDGRID_CUSTOM_ROUTE_KEY &&
      candidate.releaseId === releaseId &&
      candidate.healthPath === HEALTH_PATH &&
      candidate.expectedHosts.includes(CUSTOM_PROOF_HOST),
  );
  if (registrations.length !== 1) {
    throw new Error("Exact custom proof registration is missing or ambiguous");
  }
  return registrations[0]!;
}

async function ensureCustomProof(
  dbModule: DatabaseModule,
  actorUserId: string,
  expectedSha: string,
  changeReference: string,
  environment: ProofEnvironment,
): Promise<{ releaseId: string; activated: boolean }> {
  await assertManagedProof(dbModule);
  const { tenant, siteId } = await resolveCustomSite(dbModule);
  const registration = exactCustomRegistration(
    dbModule,
    expectedSha,
    environment,
  );
  const releaseId = registration.releaseId;
  let delivery = await dbModule.getPlatformWebsiteDelivery(tenant.tenantId);
  let deployment = delivery.deployments.find(
    (candidate) =>
      candidate.providerKey === registration.providerKey &&
      candidate.routeKey === registration.routeKey &&
      candidate.releaseId === registration.releaseId &&
      candidate.expectedHost === CUSTOM_PROOF_HOST &&
      candidate.healthPath === registration.healthPath,
  );
  if (!deployment) {
    const registered = await dbModule.registerPlatformWebsiteDeployment({
      tenantId: tenant.tenantId,
      siteId,
      actorUserId,
      providerKey: registration.providerKey,
      routeKey: registration.routeKey,
      releaseId: registration.releaseId,
      expectedHost: CUSTOM_PROOF_HOST,
      healthPath: registration.healthPath,
      changeReference,
    });
    delivery = await dbModule.getPlatformWebsiteDelivery(tenant.tenantId);
    deployment = delivery.deployments.find(
      (candidate) => candidate.id === registered.id,
    );
  }
  if (!deployment)
    throw new Error("Custom deployment registration disappeared");

  const alreadyActive =
    delivery.site?.deliveryMode === "custom_nextjs" &&
    delivery.site.activeTargetId === deployment.id &&
    deployment.releaseId === releaseId;
  if (alreadyActive) {
    await assertCustomProof(dbModule, expectedSha, environment);
    await fetchMode(CUSTOM_PROOF_URL, "custom_nextjs");
    return { releaseId, activated: false };
  }

  const checkedAt = deployment.lastCheckedAt
    ? new Date(deployment.lastCheckedAt).getTime()
    : 0;
  if (
    deployment?.healthStatus !== "healthy" ||
    !Number.isFinite(checkedAt) ||
    Date.now() - checkedAt > 4 * 60 * 1_000
  ) {
    await dbModule.checkPlatformWebsiteDeploymentHealth({
      tenantId: tenant.tenantId,
      siteId,
      deploymentId: deployment.id,
      actorUserId,
      changeReference,
      reason: "Staging acceptatie controleert de exacte custom release.",
    });
    delivery = await dbModule.getPlatformWebsiteDelivery(tenant.tenantId);
    deployment = delivery.deployments.find(
      (candidate) => candidate.id === deployment!.id,
    )!;
  }
  if (!deployment.approvedAt) {
    await dbModule.approvePlatformWebsiteDeployment({
      tenantId: tenant.tenantId,
      siteId,
      deploymentId: deployment.id,
      actorUserId,
      changeReference,
      reason: "Staging acceptatie keurt de exact gecontroleerde release goed.",
    });
  }

  delivery = await dbModule.getPlatformWebsiteDelivery(tenant.tenantId);
  if (!delivery.site) throw new Error("Custom website site disappeared");
  const activation = await dbModule.activatePlatformWebsiteDeployment({
    tenantId: tenant.tenantId,
    siteId,
    deploymentId: deployment.id,
    actorUserId,
    expectedDeliveryRevision: delivery.site.deliveryRevision,
    expectedMode: delivery.site.deliveryMode,
    expectedTargetId: delivery.site.activeTargetId,
    changeReference,
    reason: "Staging acceptatie activeert de exacte custom Next.js release.",
  });
  if (activation.status !== "succeeded" || !activation.deliveryRevision) {
    throw new Error("Custom website activation preflight was blocked");
  }

  try {
    await fetchMode(CUSTOM_PROOF_URL, "custom_nextjs");
  } catch (error) {
    const rollback = await dbModule.rollbackPlatformWebsiteDelivery({
      tenantId: tenant.tenantId,
      siteId,
      expectedDeliveryRevision: activation.deliveryRevision,
      expectedMode: "custom_nextjs",
      expectedTargetId: deployment.id,
      actorUserId,
      changeReference,
      reason: "Automatische rollback na mislukte publieke custom verificatie.",
    });
    if (rollback.status !== "succeeded") {
      throw new Error("Custom public verification and exact rollback failed");
    }
    throw error;
  }
  return { releaseId, activated: true };
}

async function assertCustomProof(
  dbModule: DatabaseModule,
  expectedSha: string,
  environment: ProofEnvironment,
): Promise<string> {
  const { tenant } = await resolveCustomSite(dbModule);
  const registration = exactCustomRegistration(
    dbModule,
    expectedSha,
    environment,
  );
  const delivery = await dbModule.getPlatformWebsiteDelivery(tenant.tenantId);
  const deployment = delivery.deployments.find(
    (candidate) =>
      candidate.releaseId === registration.releaseId &&
      candidate.routeKey === registration.routeKey &&
      candidate.expectedHost === CUSTOM_PROOF_HOST,
  );
  const checkedAt = deployment?.lastCheckedAt
    ? new Date(deployment.lastCheckedAt).getTime()
    : 0;
  if (
    !delivery.site ||
    delivery.site.deliveryMode !== "custom_nextjs" ||
    delivery.site.activeTargetId !== deployment?.id ||
    deployment?.status !== "active" ||
    deployment.healthStatus !== "healthy" ||
    !Number.isFinite(checkedAt) ||
    Date.now() - checkedAt > 5 * 60 * 1_000
  ) {
    throw new Error("Exact custom proof delivery is not active and fresh");
  }
  return registration.releaseId;
}

async function rollbackCustomProof(
  dbModule: DatabaseModule,
  actorUserId: string,
  expectedSha: string,
  changeReference: string,
  environment: ProofEnvironment,
): Promise<void> {
  const { tenant, siteId } = await resolveCustomSite(dbModule);
  const registration = exactCustomRegistration(
    dbModule,
    expectedSha,
    environment,
  );
  const delivery = await dbModule.getPlatformWebsiteDelivery(tenant.tenantId);
  if (!delivery.site) throw new Error("Custom website site is missing");
  if (delivery.site.deliveryMode !== "custom_nextjs") return;
  const deployment = delivery.deployments.find(
    (candidate) =>
      candidate.id === delivery.site?.activeTargetId &&
      candidate.providerKey === registration.providerKey &&
      candidate.routeKey === registration.routeKey &&
      candidate.releaseId === registration.releaseId &&
      candidate.expectedHost === CUSTOM_PROOF_HOST &&
      candidate.healthPath === registration.healthPath,
  );
  if (!deployment) {
    throw new Error("Refusing to rollback a different custom release");
  }
  const rollback = await dbModule.rollbackPlatformWebsiteDelivery({
    tenantId: tenant.tenantId,
    siteId,
    expectedDeliveryRevision: delivery.site.deliveryRevision,
    expectedMode: "custom_nextjs",
    expectedTargetId: deployment.id,
    actorUserId,
    changeReference,
    reason: "Expliciete staging-only rollback van de custom proof-delivery.",
  });
  if (rollback.status !== "succeeded") {
    throw new Error("Explicit custom proof rollback was blocked");
  }
}

async function writePrincipalFixtures(
  dbModule: DatabaseModule,
  managed: RuntimeTenant,
  actorUserId: string,
  expectedSha: string,
  evidenceDir: string,
): Promise<void> {
  const demo = await resolveRuntimeTenant(dbModule.pool, FIELD_DEMO_HOST);
  if (demo.tenantId === managed.tenantId) {
    throw new Error("Principal fixture tenants must be distinct");
  }
  await writeJson(join(evidenceDir, "w00-principal-fixtures.json"), {
    schemaVersion: 1,
    contract: "fieldgrid-w00-principal-fixtures-v1",
    environment: "staging",
    expectedMainSha: expectedSha,
    automationActorUserId: actorUserId,
    tenants: [
      { host: FIELD_DEMO_HOST, tenantId: demo.tenantId },
      { host: MANAGED_PROOF_HOST, tenantId: managed.tenantId },
    ],
  });
}

async function run(options: ProofOptions, environment: ProofEnvironment) {
  const startedAt = new Date().toISOString();
  let dbModule: DatabaseModule | null = null;
  const evidence: ProofEvidence = {
    schemaVersion: 1,
    contract: WEBSITE_STAGING_PROOF_STATE_VERSION,
    environment: "staging",
    mode: options.mode as Exclude<ProofMode, "check">,
    expectedSha: options.expectedSha,
    status: "failed",
    startedAt,
    completedAt: startedAt,
    managed: {
      host: MANAGED_PROOF_HOST,
      deliveryMode: null,
      active: false,
    },
    custom: {
      host: CUSTOM_PROOF_HOST,
      releaseId: null,
      deliveryMode: null,
      active: false,
    },
    errorCode: null,
  };
  try {
    const errors = validateWebsiteStagingProofStateConfig(options, environment);
    if (errors.length > 0) throw new Error(errors.join("\n"));
    dbModule = await import("../lib/db/src/index.ts");
    const actorUserId = await resolveAutomationActor(
      dbModule.pool,
      environment.FIELDGRID_WEBSITE_AUTOMATION_ACTOR_USER_ID,
    );
    if (options.mode === "prepare-managed") {
      // Principal evidence always needs the stable field-demo fixture. Prove that
      // binding before provisioning or publishing a new managed-proof tenant so
      // an unrelated fixture problem cannot leave another active proof behind.
      await resolveRuntimeTenant(dbModule.pool, FIELD_DEMO_HOST);
      const managed = await ensureManagedProof(
        dbModule,
        actorUserId,
        options.expectedSha,
        options.changeReference,
      );
      await fetchMode(MANAGED_PROOF_URL, "managed_cms");
      await resolveAutomationActor(dbModule.pool, actorUserId);
      await writePrincipalFixtures(
        dbModule,
        managed,
        actorUserId,
        options.expectedSha,
        options.evidenceDir,
      );
      evidence.managed = {
        host: MANAGED_PROOF_HOST,
        deliveryMode: "managed_cms",
        active: true,
      };
    } else if (options.mode === "complete-custom") {
      await fetchMode(MANAGED_PROOF_URL, "managed_cms");
      await assertExactReleaseMarkers(options.expectedSha);
      const custom = await ensureCustomProof(
        dbModule,
        actorUserId,
        options.expectedSha,
        options.changeReference,
        environment,
      );
      evidence.managed = {
        host: MANAGED_PROOF_HOST,
        deliveryMode: "managed_cms",
        active: true,
      };
      evidence.custom = {
        host: CUSTOM_PROOF_HOST,
        releaseId: custom.releaseId,
        deliveryMode: "custom_nextjs",
        active: true,
      };
    } else if (options.mode === "verify") {
      await assertExactReleaseMarkers(options.expectedSha);
      await assertManagedProof(dbModule);
      const releaseId = await assertCustomProof(
        dbModule,
        options.expectedSha,
        environment,
      );
      await Promise.all([
        fetchMode(MANAGED_PROOF_URL, "managed_cms"),
        fetchMode(CUSTOM_PROOF_URL, "custom_nextjs"),
      ]);
      evidence.managed = {
        host: MANAGED_PROOF_HOST,
        deliveryMode: "managed_cms",
        active: true,
      };
      evidence.custom = {
        host: CUSTOM_PROOF_HOST,
        releaseId,
        deliveryMode: "custom_nextjs",
        active: true,
      };
    } else if (options.mode === "rollback-custom") {
      await rollbackCustomProof(
        dbModule,
        actorUserId,
        options.expectedSha,
        options.changeReference,
        environment,
      );
      evidence.managed = {
        host: MANAGED_PROOF_HOST,
        deliveryMode: "managed_cms",
        active: true,
      };
    }
    evidence.status = "passed";
    return evidence;
  } catch (error) {
    evidence.errorCode = safeErrorCode(error);
    throw error;
  } finally {
    evidence.completedAt = new Date().toISOString();
    try {
      await writeJson(
        join(options.evidenceDir, `${options.mode}.json`),
        evidence,
      );
    } finally {
      await dbModule?.pool.end();
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === "check") {
    const managedHost: string = MANAGED_PROOF_HOST;
    const customHost: string = CUSTOM_PROOF_HOST;
    const managedSlug: string = MANAGED_PROOF_SLUG;
    if (
      managedHost === customHost ||
      managedSlug === "managed" ||
      !managedHost.startsWith(`${managedSlug}.`)
    ) {
      throw new Error("Website staging proof constants are unsafe");
    }
    console.log(`${WEBSITE_STAGING_PROOF_STATE_VERSION}: contract valid`);
    return;
  }
  const evidence = await run(options, process.env);
  console.log(
    JSON.stringify({
      status: evidence.status,
      mode: evidence.mode,
      expectedSha: evidence.expectedSha,
      managed: evidence.managed.active,
      custom: evidence.custom.active,
    }),
  );
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(
      `${WEBSITE_STAGING_PROOF_STATE_VERSION}: ${safeErrorCode(error)}`,
    );
    process.exitCode = 1;
  });
}
