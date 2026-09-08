#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { assertDatabaseEnvironmentIsolation } from "../lib/db/src/database-environment.ts";
import {
  isFieldgridHostAllowedForRuntimeEnvironment,
  isTenantDomainAllowedForRuntimeEnvironment,
} from "../lib/db/src/tenant-environment.ts";
import { isPlatformHost } from "../lib/db/src/tenant-context.ts";
import {
  W00_RUNTIME_POLICY_PROFILE,
  verifyW00AclClosure,
} from "./fieldgrid-w00-db-acl-closure.mjs";
import { databaseNodePostgresSslConfig } from "./fieldgrid-database-root-cert.mjs";
import { writeJsonArtifact } from "./fieldgrid-runtime-safety-lib.mjs";
import {
  assertSafeW00StagingPrincipalIdentity,
  type W00StagingPrincipalIdentity,
} from "./fieldgrid-w00-staging-principal-identity.mts";
import { assertSafeStagingDatabaseUrl } from "./fieldgrid-w00-staging-principal-url.mts";

const CONFIRMATION = "fieldgrid-w00-staging-principal-read-only-v1";
const REPORT_PATH = "reports/w00-staging-principal-gate.json";
const TARGET_TABLES = ["organization_settings", "tenant_domains"] as const;
const EXPLICIT_NAMES = [
  "FIELDGRID_W00_STAGING_PRINCIPAL_CONFIRM",
  "FIELDGRID_W00_STAGING_DATABASE_URL",
  "FIELDGRID_W00_STAGING_TENANT_A_HOST",
  "FIELDGRID_W00_STAGING_TENANT_A_ID",
  "FIELDGRID_W00_STAGING_TENANT_B_HOST",
  "FIELDGRID_W00_STAGING_TENANT_B_ID",
] as const;
const REQUIRED_NAMES = [
  ...EXPLICIT_NAMES,
  "APP_ENV",
  "TARGET_ENVIRONMENT",
  "EXPECTED_SUPABASE_PROJECT_REF",
  "NEXT_PUBLIC_SUPABASE_URL",
] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const dbRequire = createRequire(
  new URL("../lib/db/package.json", import.meta.url),
);
const { Client } = dbRequire("pg");

type Mode = "check" | "strict";
type GateStatus = "passed" | "failed" | "skipped";
type OwnershipRow = {
  table_name: string;
  owner: string;
  current_user_is_owner: boolean;
  owner_privileges_effective: boolean;
  owner_role_settable: boolean;
  rls_enabled: boolean;
  rls_forced: boolean;
};
type TenantPathRow = {
  host_tenant_id: string;
  settings_tenant_id: string;
};

function parseMode(argv: string[]): Mode {
  if (argv.length !== 1 || !["--check", "--strict"].includes(argv[0] ?? "")) {
    throw new Error(
      "Usage: fieldgrid-w00-staging-principal-gate.mts --check|--strict",
    );
  }
  return argv[0] === "--strict" ? "strict" : "check";
}

function missingNames(env: NodeJS.ProcessEnv): string[] {
  return REQUIRED_NAMES.filter((name) => !env[name]?.trim());
}

function normalizeExplicitHost(value: string, name: string): string {
  if (value.includes("://")) {
    throw new Error(`${name} must contain a hostname only.`);
  }
  const parsed = new URL(`https://${value}`);
  if (
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${name} must contain a hostname only.`);
  }
  return parsed.hostname.toLowerCase();
}

function fingerprint(label: string, ...values: string[]): string {
  return createHash("sha256")
    .update(["fieldgrid-w00-staging-principal", label, ...values].join(":"))
    .digest("hex");
}

function safeFailure(error: unknown): { code: string | null; kind: string } {
  const candidate = error as { code?: unknown; name?: unknown };
  return {
    code: typeof candidate?.code === "string" ? candidate.code : null,
    kind: typeof candidate?.name === "string" ? candidate.name : "UnknownError",
  };
}

async function persist(
  mode: Mode,
  status: GateStatus,
  evidence: Record<string, unknown>,
): Promise<void> {
  await writeJsonArtifact(REPORT_PATH, {
    name: "fieldgrid-w00-staging-principal-gate",
    status,
    mode,
    destructive: false,
    transactionMode: "read only",
    completedAt: new Date().toISOString(),
    evidence,
  });
  console.log(`FG-W00-STAGING-PRINCIPAL status=${status} mode=${mode}`);
}

async function runLiveReadOnlyGate(
  env: NodeJS.ProcessEnv,
): Promise<Record<string, unknown>> {
  const databaseUrl = assertSafeStagingDatabaseUrl(
    env.FIELDGRID_W00_STAGING_DATABASE_URL!.trim(),
  );
  const tenantAHost = normalizeExplicitHost(
    env.FIELDGRID_W00_STAGING_TENANT_A_HOST!.trim(),
    "FIELDGRID_W00_STAGING_TENANT_A_HOST",
  );
  const tenantBHost = normalizeExplicitHost(
    env.FIELDGRID_W00_STAGING_TENANT_B_HOST!.trim(),
    "FIELDGRID_W00_STAGING_TENANT_B_HOST",
  );
  const tenantAId = env.FIELDGRID_W00_STAGING_TENANT_A_ID!.trim();
  const tenantBId = env.FIELDGRID_W00_STAGING_TENANT_B_ID!.trim();

  if (!UUID_PATTERN.test(tenantAId) || !UUID_PATTERN.test(tenantBId)) {
    throw new Error("Both explicit staging tenant IDs must be UUIDs.");
  }
  if (tenantAHost === tenantBHost || tenantAId === tenantBId) {
    throw new Error("Tenant A and Tenant B staging inputs must be distinct.");
  }
  if (env.FIELDGRID_W00_STAGING_PRINCIPAL_CONFIRM !== CONFIRMATION) {
    throw new Error(
      "The explicit W00 staging-principal confirmation is invalid.",
    );
  }
  if (env.PGOPTIONS?.trim()) {
    throw new Error(
      "Ambient PostgreSQL session options are forbidden for this gate.",
    );
  }

  const isolation = assertDatabaseEnvironmentIsolation({
    ...env,
    DATABASE_URL: databaseUrl,
  });
  if (isolation.environment !== "staging") {
    throw new Error("The W00 staging-principal gate only accepts staging.");
  }
  for (const host of [tenantAHost, tenantBHost]) {
    if (
      !isFieldgridHostAllowedForRuntimeEnvironment(host, "staging") ||
      !isTenantDomainAllowedForRuntimeEnvironment(host, "staging") ||
      isPlatformHost(host)
    ) {
      throw new Error(
        "An explicit host is not an allowed staging tenant host.",
      );
    }
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: databaseNodePostgresSslConfig(env),
    application_name: "fieldgrid-w00-staging-principal-read-only",
    options: "-c role=none -c row_security=on",
  });
  await client.connect();
  let transactionOpen = false;
  try {
    await client.query("begin transaction read only");
    transactionOpen = true;
    await client.query("set local row_security = on");
    await client.query("set local statement_timeout = '10s'");
    await client.query("set local lock_timeout = '3s'");

    // ADMIN OPTION held by an inherited role is usable by the session role.
    // Expand direct ADMIN edges from the USAGE closure to avoid accepting that
    // bypass without over-classifying wholly inert membership chains. An
    // ADMIN-only superuser membership is also inert because a non-superuser
    // cannot re-grant it; an actual SET path remains blocked.
    const identity = (await client.query(`
        with recursive controllable_roles(role_oid) as (
          select session_user::pg_catalog.regrole::oid

          union

          select next_role.role_oid
          from controllable_roles controlled
          cross join lateral (
            select reachable_role.oid as role_oid
            from pg_catalog.pg_roles reachable_role
            where reachable_role.oid <> controlled.role_oid
              and pg_catalog.pg_has_role(
                controlled.role_oid,
                reachable_role.oid,
                'SET'
              )

            union

            select membership.roleid
            from pg_catalog.pg_auth_members membership
            join pg_catalog.pg_roles administered_role
              on administered_role.oid = membership.roleid
            where membership.admin_option
              and not administered_role.rolsuper
              and pg_catalog.pg_has_role(
                controlled.role_oid,
                membership.member,
                'USAGE'
              )
          ) next_role
        )
        select
          current_user::text as current_user,
          session_user::text as session_user,
          role_row.rolsuper as current_user_is_superuser,
          role_row.rolbypassrls as current_user_bypasses_rls,
          exists (
            select 1
            from controllable_roles controlled
            join pg_catalog.pg_roles reachable_role
              on reachable_role.oid = controlled.role_oid
            where controlled.role_oid <> role_row.oid
              and (
                reachable_role.rolsuper
                or reachable_role.rolbypassrls
              )
          ) as session_user_can_control_privileged_role,
          current_setting('transaction_read_only') as transaction_read_only
        from pg_catalog.pg_roles role_row
        where role_row.rolname = current_user
      `)) as { rows: W00StagingPrincipalIdentity[] };
    const identityRow = identity.rows[0];
    assertSafeW00StagingPrincipalIdentity(identityRow);

    const ownership = (await client.query(
      `
        select
          table_row.relname as table_name,
          pg_catalog.pg_get_userbyid(table_row.relowner) as owner,
          table_row.relowner = current_user::pg_catalog.regrole::oid
            as current_user_is_owner,
          pg_catalog.pg_has_role(current_user, table_row.relowner, 'USAGE')
            as owner_privileges_effective,
          pg_catalog.pg_has_role(current_user, table_row.relowner, 'SET')
            as owner_role_settable,
          table_row.relrowsecurity as rls_enabled,
          table_row.relforcerowsecurity as rls_forced
        from pg_catalog.pg_class table_row
        join pg_catalog.pg_namespace namespace_row
          on namespace_row.oid = table_row.relnamespace
        where namespace_row.nspname = 'public'
          and table_row.relkind in ('r', 'p')
          and table_row.relname = any($1::text[])
        order by table_row.relname
      `,
      [[...TARGET_TABLES]],
    )) as { rows: OwnershipRow[] };
    if (
      ownership.rows.length !== TARGET_TABLES.length ||
      ownership.rows.some(
        (row) =>
          !row.current_user_is_owner ||
          !row.owner_privileges_effective ||
          !row.rls_enabled ||
          row.rls_forced,
      ) ||
      new Set(ownership.rows.map((row) => row.owner)).size !== 1
    ) {
      throw new Error(
        "The staging runtime principal is not the exact and effective shared owner for both targets.",
      );
    }

    const catalogClosure = await verifyW00AclClosure(client, {
      policyProfile: W00_RUNTIME_POLICY_PROFILE,
      requireCurrentUserOwner: true,
    });

    const paths = [];
    for (const [label, host, tenantId] of [
      ["tenant-a", tenantAHost, tenantAId],
      ["tenant-b", tenantBHost, tenantBId],
    ] as const) {
      const resolved = (await client.query(
        `
          select
            domain_row.tenant_id::text as host_tenant_id,
            settings.tenant_id::text as settings_tenant_id
          from public.tenant_domains domain_row
          join public.tenants tenant_row
            on tenant_row.id = domain_row.tenant_id
          join public.organization_settings settings
            on settings.tenant_id = domain_row.tenant_id
          where domain_row.domain = $1
            and domain_row.verification_status in ('verified', 'active')
            and domain_row.type <> 'platform_reserved'
            and tenant_row.is_active = true
            and tenant_row.status in ('trial', 'active')
            and (
              domain_row.type <> 'custom_domain'
              or domain_row.tls_status = 'active'
            )
          limit 2
        `,
        [host],
      )) as { rows: TenantPathRow[] };
      if (
        resolved.rows.length !== 1 ||
        resolved.rows[0]?.host_tenant_id !== tenantId ||
        resolved.rows[0]?.settings_tenant_id !== tenantId
      ) {
        throw new Error(
          `${label} did not resolve through the real host-to-settings path.`,
        );
      }
      paths.push({
        label,
        inputFingerprint: fingerprint(label, host, tenantId),
        resolvedExactlyOnce: true,
        hostTenantMatched: true,
        settingsTenantMatched: true,
      });
    }

    return {
      projectFingerprint: isolation.projectFingerprint,
      currentUser: identityRow.current_user,
      sessionUser: identityRow.session_user,
      currentUserIsSuperuser: false,
      currentUserBypassesRls: false,
      sessionIdentityMatches: true,
      sessionUserCanControlPrivilegedRole: false,
      transactionReadOnly: true,
      tables: ownership.rows,
      catalogClosure,
      paths,
      tenantPathsDistinct: true,
    };
  } finally {
    if (transactionOpen) await client.query("rollback").catch(() => {});
    await client.end().catch(() => {});
  }
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const explicitConfigured = EXPLICIT_NAMES.some((name) =>
    Boolean(process.env[name]?.trim()),
  );
  const missing = missingNames(process.env);

  if (!explicitConfigured && mode === "check") {
    await persist(mode, "skipped", {
      reason: "explicit-staging-environment-absent",
      missingEnvironmentNames: missing,
      connectionAttempted: false,
    });
    return;
  }
  if (missing.length > 0) {
    await persist(mode, "failed", {
      reason: "explicit-staging-environment-incomplete",
      missingEnvironmentNames: missing,
      connectionAttempted: false,
    });
    process.exitCode = 1;
    return;
  }

  try {
    const evidence = await runLiveReadOnlyGate(process.env);
    await persist(mode, "passed", evidence);
  } catch (error) {
    await persist(mode, "failed", {
      reason: "staging-principal-proof-failed",
      failure: safeFailure(error),
      credentialsLogged: false,
    });
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  await persist("strict", "failed", {
    reason: "staging-principal-gate-error",
    failure: safeFailure(error),
    credentialsLogged: false,
  }).catch(() => {});
  process.exitCode = 1;
});
