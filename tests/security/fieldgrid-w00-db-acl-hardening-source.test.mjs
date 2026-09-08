import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { assertSafeW00StagingPrincipalIdentity } from "../../scripts/fieldgrid-w00-staging-principal-identity.mts";
import { assertSafeStagingDatabaseUrl } from "../../scripts/fieldgrid-w00-staging-principal-url.mts";

const repoRoot = process.cwd();
const migrationPath =
  "lib/db/migrations/20260906120000_organization_settings_tenant_domains_acl_hardening.sql";
const roleControlMigrationPath =
  "lib/db/migrations/20260906121000_organization_settings_tenant_domains_role_control_guard.sql";
const runtimePath = "scripts/fieldgrid-w00-db-acl-hardening-runtime.mjs";
const stagingPrincipalGatePath =
  "scripts/fieldgrid-w00-staging-principal-gate.mts";
const aclClosurePath = "scripts/fieldgrid-w00-db-acl-closure.mjs";
const rlsHarnessPath = "scripts/fieldgrid-runtime-safety-rls-harness.mjs";
const dbRequire = createRequire(
  new URL("../../lib/db/package.json", import.meta.url),
);
const { Client } = dbRequire("pg");

function read(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function normalizeSql(sql) {
  return sql.replace(/\s+/gu, " ").trim();
}

function executableSql(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*--.*$/gmu, "");
}

test("W00 migrations are consecutive and forward-only", () => {
  const migrationName = migrationPath.split("/").at(-1);
  const roleControlMigrationName = roleControlMigrationPath.split("/").at(-1);
  const predecessor = "20260824150000_tenant_role_membership_scope.sql";
  const migrationNames = readdirSync(join(repoRoot, "lib/db/migrations"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && /^\d{14}_.+\.sql$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const migrationIndex = migrationNames.indexOf(migrationName);

  assert.ok(migrationIndex > 0, "W00 timestamp migration is missing.");
  assert.equal(migrationNames[migrationIndex - 1], predecessor);
  assert.equal(migrationNames[migrationIndex + 1], roleControlMigrationName);
  assert.match(read(migrationPath), /Forward-only rollback reasoning/u);
  assert.match(
    read(roleControlMigrationPath),
    /Forward-only rollback reasoning/u,
  );
});

test("W00 ACL migration fails hard when exact tables, roles, or tenant columns are absent", () => {
  const migration = normalizeSql(read(migrationPath));

  assert.match(
    migration,
    /VALUES \('anon'\), \('authenticated'\), \('service_role'\)/u,
  );
  assert.match(
    migration,
    /Fieldflow Calm W00 ACL hardening requires database roles/u,
  );
  assert.match(
    migration,
    /VALUES \('organization_settings'\), \('tenant_domains'\)/u,
  );
  assert.match(
    migration,
    /Fieldflow Calm W00 ACL hardening requires ordinary public tables/u,
  );
  assert.match(migration, /column_row\.attname = 'tenant_id'/u);
  assert.match(
    migration,
    /Fieldflow Calm W00 ACL hardening requires tenant_id on/u,
  );
  assert.match(migration, /ERRCODE = '42704'/u);
  assert.match(migration, /ERRCODE = '42P01'/u);
  assert.match(migration, /ERRCODE = '42703'/u);
});

test("W00 ACL migration enables non-forced RLS and removes every exact target policy dynamically", () => {
  const migration = normalizeSql(read(migrationPath));

  assert.match(migration, /table_row\.relkind = 'r'/u);
  assert.doesNotMatch(migration, /table_row\.relkind IN \('r', 'p'\)/u);

  for (const table of ["organization_settings", "tenant_domains"]) {
    assert.match(
      migration,
      new RegExp(
        `ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY;`,
        "u",
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `ALTER TABLE public\\.${table} NO FORCE ROW LEVEL SECURITY;`,
        "u",
      ),
    );
  }

  assert.match(migration, /FROM pg_catalog\.pg_policy policy/u);
  assert.match(
    migration,
    /table_row\.relname IN \('organization_settings', 'tenant_domains'\)/u,
  );
  assert.match(migration, /'DROP POLICY %I ON %I\.%I'/u);
  assert.match(
    migration,
    /IF EXISTS \( SELECT 1 FROM pg_catalog\.pg_policy policy/u,
  );
});

test("W00 ACL migration closes table, column, and only target-owned sequence access", () => {
  const raw = read(migrationPath);
  const migration = normalizeSql(raw);

  assert.match(
    migration,
    /REVOKE ALL PRIVILEGES ON TABLE public\.organization_settings, public\.tenant_domains FROM PUBLIC, anon, authenticated, service_role CASCADE;/u,
  );
  assert.match(migration, /FROM pg_catalog\.pg_depend dependency/u);
  assert.match(migration, /sequence_relation\.relkind = 'S'/u);
  assert.match(migration, /dependency\.deptype IN \('a', 'i'\)/u);
  assert.match(
    migration,
    /'REVOKE ALL PRIVILEGES ON SEQUENCE %I\.%I FROM PUBLIC, anon, authenticated, service_role CASCADE'/u,
  );
  assert.match(migration, /pg_catalog\.has_table_privilege/u);
  assert.match(migration, /pg_catalog\.has_column_privilege/u);
  assert.match(migration, /pg_catalog\.has_sequence_privilege/u);
  assert.match(migration, /pg_catalog\.aclexplode\(target_column\.attacl\)/u);
  assert.match(migration, /pg_catalog\.pg_has_role\(/u);
  assert.match(migration, /'SET'/u);
  assert.match(migration, /role_row\.oid <> target_role_row\.role_oid/u);
  assert.match(migration, /settable_role\.rolsuper/u);
  assert.match(migration, /settable_role\.rolbypassrls/u);
  assert.match(migration, /target_table\.owner_oid = settable_role\.role_oid/u);
  assert.match(
    migration,
    /target_sequence\.owner_oid = settable_role\.role_oid/u,
  );
  assert.match(migration, /SET-capable %s column privilege/u);
  assert.match(migration, /SET-capable %s sequence privilege/u);
  assert.ok(
    migration.indexOf("REVOKE ALL PRIVILEGES ON TABLE") <
      migration.indexOf("FOR target_role_row IN"),
    "SET-capability validation must run after direct ACL cleanup.",
  );

  const executable = executableSql(raw);
  assert.doesNotMatch(executable, /^\s*GRANT\b/gimu);
  assert.doesNotMatch(executable, /^\s*CREATE\s+POLICY\b/gimu);
  assert.doesNotMatch(executable, /\bALTER\s+DEFAULT\s+PRIVILEGES\b/iu);
  assert.doesNotMatch(executable, /\bON\s+SCHEMA\s+public\b/iu);
  assert.doesNotMatch(executable, /\bALL\s+TABLES\s+IN\s+SCHEMA\b/iu);
  assert.doesNotMatch(executable, /\bALL\s+SEQUENCES\s+IN\s+SCHEMA\b/iu);
  assert.doesNotMatch(
    executable,
    /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE)\s+(?:TABLE\s+)?public\.(?:organization_settings|tenant_domains)\b/iu,
  );
});

test("W00 forward-only role-control guard closes ADMIN OPTION paths", () => {
  const raw = read(roleControlMigrationPath);
  const guard = normalizeSql(raw);

  assert.match(
    guard,
    /VALUES \('anon'\), \('authenticated'\), \('service_role'\)/u,
  );
  assert.match(
    guard,
    /VALUES \('organization_settings'\), \('tenant_domains'\)/u,
  );
  assert.match(guard, /WITH RECURSIVE principals AS/u);
  assert.equal((guard.match(/table_row\.relkind = 'r'/gu) ?? []).length, 2);
  assert.doesNotMatch(guard, /table_row\.relkind IN \('r', 'p'\)/u);
  assert.match(
    guard,
    /controllable_roles\(source_oid, source_role, reachable_oid\)/u,
  );
  assert.match(guard, /pg_catalog\.pg_has_role\(/u);
  assert.match(guard, /'SET'/u);
  assert.match(guard, /FROM pg_catalog\.pg_auth_members membership/u);
  assert.match(
    guard,
    /JOIN pg_catalog\.pg_roles administered_role ON administered_role\.oid = membership\.roleid/u,
  );
  assert.match(guard, /membership\.admin_option/u);
  assert.match(guard, /NOT administered_role\.rolsuper/u);
  assert.match(
    guard,
    /pg_catalog\.pg_has_role\( controlled\.reachable_oid, membership\.member, 'USAGE' \)/u,
  );
  assert.match(guard, /reachable\.rolsuper OR reachable\.rolbypassrls/u);
  assert.match(guard, /target\.relowner = controlled\.reachable_oid/u);
  assert.match(guard, /pg_catalog\.has_table_privilege/u);
  assert.match(guard, /pg_catalog\.has_column_privilege/u);
  assert.match(guard, /pg_catalog\.has_sequence_privilege/u);
  assert.match(guard, /SET\/ADMIN-controllable %s role %I/u);
  assert.match(guard, /ERRCODE = '42501'/u);
  const executable = executableSql(raw);
  assert.doesNotMatch(executable, /\bREVOKE\b/iu);
  assert.doesNotMatch(executable, /\bGRANT\b/iu);
});

test("W00 PostgreSQL 17 runtime covers drift cleanup, idempotence, default-deny, and owner paths", () => {
  const runtime = read(runtimePath);

  assert.match(runtime, /server_version_num >= 170000/u);
  assert.match(runtime, /server_version_num < 180000/u);
  assert.match(runtime, /prepareOwnerAndDriftFixtures/u);
  assert.match(runtime, /force row level security/u);
  assert.match(runtime, /grant select \(smtp_password_encrypted\)/u);
  assert.match(runtime, /grant select \(verification_token\)/u);
  assert.match(runtime, /owned by public\.organization_settings\.id/u);
  assert.match(runtime, /owned by public\.tenant_domains\.id/u);
  assert.match(runtime, /nodeAssert\.deepEqual\(second, first\)/u);
  assert.match(runtime, /w00-db-acl-policy-free-rls-default-deny/u);
  assert.match(runtime, /w00-db-acl-owner-host-settings-tenant-a-b/u);
  assert.match(runtime, /w00-db-acl-shared-schema-privileges-unchanged/u);
  assert.match(runtime, /w00-db-acl-role-control-fail-closed/u);
  assert.match(runtime, /verifyW00AclClosure/u);
  assert.match(runtime, /w00-db-acl-shared-closure-drift-detection/u);
  assert.match(runtime, /public-table-grant/u);
  assert.match(runtime, /authenticated-column-grant/u);
  assert.match(runtime, /service-role-owned-sequence-grant/u);
  assert.match(runtime, /transitive-owner-set-role/u);
  assert.match(runtime, /transitive-bypass-set-role/u);
  assert.match(runtime, /direct-owner-admin-option/u);
  assert.match(runtime, /owner-admin-option-via-settable-bridge/u);
  assert.match(runtime, /adminOptionCanMintSet/u);
  assert.match(runtime, /inheritedAdminCanMintSet/u);
  assert.match(runtime, /adminOptionDirectBypass/u);
  assert.match(runtime, /owner-admin-option-via-inherited-bridge/u);
  assert.match(runtime, /inertSuperuserAdminOnly/u);
  assert.match(runtime, /permission denied to grant role/u);
  assert.match(runtime, /with admin true, inherit false, set false/u);
  assert.match(runtime, /with inherit false, set true/u);
  assert.match(runtime, /ADMIN-controllable target-table owner/u);
  assert.match(runtime, /ADMIN-controllable BYPASSRLS role/u);
  assert.match(runtime, /20260906121000_organization_settings/u);
  assert.match(runtime, /nodeAssert\.deepEqual\(ownerAfter, ownerBefore\)/u);
  assert.match(runtime, /nodeAssert\.deepEqual\(bypassAfter, bypassBefore\)/u);
  assert.match(runtime, /w00-db-acl-unrelated-sequence-default-acl-unchanged/u);
  assert.match(runtime, /pg_catalog\.pg_default_acl/u);
  assert.match(runtime, /fieldgrid_w00_unrelated_seq/u);
  assert.match(
    runtime,
    /nodeAssert\.deepEqual\(untouchedAfterFirst, untouchedBefore\)/u,
  );
  assert.match(
    runtime,
    /nodeAssert\.deepEqual\(untouchedAfterSecond, untouchedBefore\)/u,
  );
  assert.match(runtime, /Runtime Tenant A settings/u);
  assert.match(runtime, /Runtime Tenant B settings/u);
  assert.match(
    runtime,
    /requires ordinary public tables: organization_settings/u,
  );
  assert.match(runtime, /partition by hash \(tenant_id\)/u);
  assert.match(runtime, /requires ordinary public tables: tenant_domains/u);
  assert.match(runtime, /requires database roles: authenticated/u);
  assert.doesNotMatch(runtime, /FIELDGRID_RUNTIME_SAFETY_ALLOW_NONLOCAL/u);
  assert.doesNotMatch(runtime, /staging\.fieldgrid\.nl/u);
});

test("public RLS command preserves its root contract and executes the W00 closure", () => {
  const packageJson = JSON.parse(read("package.json"));
  const rlsHarness = read(rlsHarnessPath);
  const exactHeadWorkflow = read(
    ".github/workflows/main-exact-head-validation.yml",
  );

  assert.equal(
    packageJson.scripts["fieldgrid:test:rls-security"],
    "pnpm fieldgrid:runtime-safety:setup && pnpm fieldgrid:runtime-safety:fixtures && pnpm fieldgrid:runtime-safety:rls",
  );
  assert.match(rlsHarness, /W00_RUNTIME_POLICY_PROFILE/u);
  assert.match(rlsHarness, /verifyW00AclClosure/u);
  assert.match(rlsHarness, /policyProfile: W00_RUNTIME_POLICY_PROFILE/u);
  assert.match(rlsHarness, /runtime-data-extra-truncate/u);
  assert.match(rlsHarness, /runtime-data-rogue-login-member/u);
  assert.match(
    rlsHarness,
    /rls-w00-server-only-tenant-configuration-acl-closure/u,
  );

  const publicCommand = packageJson.scripts["fieldgrid:test:rls-security"];
  assert.equal(
    [...publicCommand.matchAll(/fieldgrid:runtime-safety:setup/gu)].length,
    1,
  );
  assert.equal(
    [...publicCommand.matchAll(/fieldgrid:runtime-safety:fixtures/gu)].length,
    1,
  );
  assert.match(exactHeadWorkflow, /lane: w00-db-acl-hardening/u);
  assert.match(
    exactHeadWorkflow,
    /command: pnpm fieldgrid:runtime-safety:setup && pnpm fieldgrid:runtime-safety:fixtures && node scripts\/fieldgrid-w00-db-acl-hardening-runtime\.mjs/u,
  );
});

test("W00 staging-principal gate is explicit, read-only, tenant A/B scoped, and credential-safe", () => {
  const gate = read(stagingPrincipalGatePath);
  const closure = read(aclClosurePath);

  assert.match(gate, /FIELDGRID_W00_STAGING_DATABASE_URL/u);
  assert.doesNotMatch(gate, /process\.env\.DATABASE_URL/u);
  assert.match(gate, /databaseNodePostgresSslConfig/u);
  assert.match(gate, /ssl: databaseNodePostgresSslConfig\(env\)/u);
  assert.doesNotMatch(gate, /ssl: \{ rejectUnauthorized: true \}/u);
  assert.match(gate, /fieldgrid-w00-staging-principal-read-only-v1/u);
  assert.match(gate, /begin transaction read only/u);
  assert.match(gate, /set local row_security = on/u);
  assert.match(gate, /env\.PGOPTIONS\?\.trim\(\)/u);
  assert.match(gate, /options: "-c role=none -c row_security=on"/u);
  assert.match(gate, /isFieldgridHostAllowedForRuntimeEnvironment/u);
  assert.match(gate, /isTenantDomainAllowedForRuntimeEnvironment/u);
  assert.match(gate, /isPlatformHost/u);
  assert.match(gate, /current_user::text as current_user/u);
  assert.match(gate, /session_user::text as session_user/u);
  assert.match(gate, /role_row\.rolbypassrls/u);
  assert.match(gate, /session_user_can_control_privileged_role/u);
  assert.match(
    gate,
    /with recursive controllable_roles[\s\S]*pg_catalog\.pg_has_role\([\s\S]*'SET'/u,
  );
  assert.match(gate, /from pg_catalog\.pg_auth_members membership/u);
  assert.match(gate, /membership\.admin_option/u);
  assert.match(gate, /not administered_role\.rolsuper/u);
  assert.match(gate, /membership\.member,[\s\S]*'USAGE'/u);
  assert.match(gate, /assertSafeW00StagingPrincipalIdentity\(identityRow\)/u);
  assert.match(
    gate,
    /pg_catalog\.pg_has_role\(current_user, table_row\.relowner, 'USAGE'\)/u,
  );
  assert.match(gate, /!row\.current_user_is_owner/u);
  assert.match(gate, /!row\.owner_privileges_effective/u);
  assert.match(
    gate,
    /new Set\(ownership\.rows\.map\(\(row\) => row\.owner\)\)\.size !== 1/u,
  );
  assert.match(gate, /table_row\.relrowsecurity as rls_enabled/u);
  assert.match(gate, /table_row\.relforcerowsecurity as rls_forced/u);
  assert.match(closure, /from pg_catalog\.pg_policy policy/u);
  assert.match(closure, /pg_catalog\.aclexplode/u);
  assert.match(closure, /pg_catalog\.has_table_privilege/u);
  assert.match(closure, /pg_catalog\.has_column_privilege/u);
  assert.match(closure, /pg_catalog\.has_sequence_privilege/u);
  assert.match(closure, /from pg_catalog\.pg_depend dependency/u);
  assert.match(closure, /pg_catalog\.pg_has_role/u);
  assert.match(closure, /'SET'/u);
  assert.match(closure, /from pg_catalog\.pg_auth_members membership/u);
  assert.match(closure, /membership\.admin_option/u);
  assert.match(closure, /not administered_role\.rolsuper/u);
  assert.match(closure, /membership\.member,[\s\S]*'USAGE'/u);
  assert.match(closure, /reachable\.rolsuper/u);
  assert.match(closure, /reachable\.rolbypassrls/u);
  assert.equal((closure.match(/table_row\.relkind = 'r'/gu) ?? []).length, 4);
  assert.doesNotMatch(closure, /table_row\.relkind in \('r', 'p'\)/u);
  assert.match(closure, /controllableRoleViolations: 0/u);
  assert.match(gate, /verifyW00AclClosure\(client/u);
  assert.match(gate, /assertSafeStagingDatabaseUrl/u);
  assert.match(
    gate,
    /domain_row\.verification_status in \('verified', 'active'\)/u,
  );
  assert.match(gate, /domain_row\.type <> 'platform_reserved'/u);
  assert.match(gate, /tenant_row\.status in \('trial', 'active'\)/u);
  assert.match(gate, /domain_row\.tls_status = 'active'/u);
  assert.match(gate, /settings\.tenant_id = domain_row\.tenant_id/u);
  assert.match(gate, /inputFingerprint/u);
  assert.match(gate, /credentialsLogged: false/u);
  assert.doesNotMatch(
    gate,
    /console\.(?:log|error)\([^\n]*(?:databaseUrl|password)/u,
  );
});

test("W00 staging-principal identity accepts only an unswitched least-privileged role", () => {
  const safeIdentity = {
    current_user: "fieldgrid_runtime_owner",
    session_user: "fieldgrid_runtime_owner",
    current_user_is_superuser: false,
    current_user_bypasses_rls: false,
    session_user_can_control_privileged_role: false,
    transaction_read_only: "on",
  };

  assert.doesNotThrow(() =>
    assertSafeW00StagingPrincipalIdentity(safeIdentity),
  );

  for (const unsafeIdentity of [
    undefined,
    { ...safeIdentity, transaction_read_only: "off" },
    { ...safeIdentity, current_user: "switched_owner" },
    { ...safeIdentity, current_user_is_superuser: true },
    { ...safeIdentity, current_user_bypasses_rls: true },
    { ...safeIdentity, session_user_can_control_privileged_role: true },
  ]) {
    assert.throws(() => assertSafeW00StagingPrincipalIdentity(unsafeIdentity));
  }
});

test("W00 staging-principal gate rejects incomplete endpoints and session overrides before connecting", () => {
  const projectRef = "abcdefghijklmnopqrst";
  const baseEnv = {
    ...process.env,
    APP_ENV: "staging",
    TARGET_ENVIRONMENT: "staging",
    EXPECTED_SUPABASE_PROJECT_REF: projectRef,
    NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
    FIELDGRID_W00_STAGING_PRINCIPAL_CONFIRM:
      "fieldgrid-w00-staging-principal-read-only-v1",
    FIELDGRID_W00_STAGING_TENANT_A_HOST: "tenant-alpha.staging.fieldgrid.nl",
    FIELDGRID_W00_STAGING_TENANT_A_ID: "11111111-1111-4111-8111-111111111111",
    FIELDGRID_W00_STAGING_TENANT_B_HOST: "tenant-bravo.staging.fieldgrid.nl",
    FIELDGRID_W00_STAGING_TENANT_B_ID: "22222222-2222-4222-8222-222222222222",
  };

  for (const tlsQuery of ["sslmode=disable", "sslmode=no-verify"]) {
    const env = {
      ...baseEnv,
      FIELDGRID_W00_STAGING_DATABASE_URL: `postgresql://credential-user:credential-password@db.${projectRef}.supabase.co:5432/postgres?${tlsQuery}`,
    };
    const result = spawnSync(
      "pnpm",
      [
        "--filter",
        "@workspace/db",
        "exec",
        "tsx",
        "../../scripts/fieldgrid-w00-staging-principal-gate.mts",
        "--strict",
      ],
      { cwd: repoRoot, encoding: "utf8", env },
    );
    assert.equal(result.status, 1, result.stdout);
    assert.match(
      result.stdout,
      /FG-W00-STAGING-PRINCIPAL status=failed mode=strict/u,
    );
    assert.doesNotMatch(
      `${result.stdout}\n${result.stderr}`,
      /credential-user|credential-password|db\.abcdefghijklmnopqrst\.supabase\.co|sslmode/u,
    );
  }

  for (const databaseUrl of [
    `postgresql://credential-user:credential-password@db.${projectRef}.supabase.co:5432`,
    `postgresql://credential-user:credential-password@db.${projectRef}.supabase.co/postgres`,
  ]) {
    const result = spawnSync(
      "pnpm",
      [
        "--filter",
        "@workspace/db",
        "exec",
        "tsx",
        "../../scripts/fieldgrid-w00-staging-principal-gate.mts",
        "--strict",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...baseEnv,
          FIELDGRID_W00_STAGING_DATABASE_URL: databaseUrl,
          PGDATABASE: "fieldgrid-shadow",
          PGPORT: "6543",
        },
      },
    );
    assert.equal(result.status, 1, result.stdout);
    assert.match(
      result.stdout,
      /FG-W00-STAGING-PRINCIPAL status=failed mode=strict/u,
    );
    assert.doesNotMatch(
      `${result.stdout}\n${result.stderr}`,
      /credential-user|credential-password|db\.abcdefghijklmnopqrst\.supabase\.co|fieldgrid-shadow/u,
    );
  }

  const pgOptions = spawnSync(
    "pnpm",
    [
      "--filter",
      "@workspace/db",
      "exec",
      "tsx",
      "../../scripts/fieldgrid-w00-staging-principal-gate.mts",
      "--strict",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...baseEnv,
        FIELDGRID_W00_STAGING_DATABASE_URL: `postgresql://credential-user:credential-password@db.${projectRef}.supabase.co:5432/postgres`,
        PGOPTIONS: "-c role=privileged_role -c row_security=off",
      },
    },
  );
  assert.equal(pgOptions.status, 1, pgOptions.stdout);
  assert.match(
    pgOptions.stdout,
    /FG-W00-STAGING-PRINCIPAL status=failed mode=strict/u,
  );
  assert.doesNotMatch(
    `${pgOptions.stdout}\n${pgOptions.stderr}`,
    /credential-user|credential-password|db\.abcdefghijklmnopqrst\.supabase\.co|privileged_role|row_security/u,
  );
});

test("W00 staging-principal URL contract rejects every connection override", () => {
  const direct =
    "postgresql://user:password@db.abcdefgh.supabase.co:5432/postgres";
  const pooler =
    "postgresql://postgres.abcdefgh:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";
  assert.equal(assertSafeStagingDatabaseUrl(direct), direct);
  assert.equal(assertSafeStagingDatabaseUrl(pooler), pooler);
  const client = new Client({
    connectionString: assertSafeStagingDatabaseUrl(direct),
    ssl: { rejectUnauthorized: true },
  });
  assert.deepEqual(client.connectionParameters.ssl, {
    rejectUnauthorized: true,
  });
  assert.deepEqual(
    {
      database: client.connectionParameters.database,
      host: client.connectionParameters.host,
      isDomainSocket: client.connectionParameters.isDomainSocket,
      port: client.connectionParameters.port,
    },
    {
      database: "postgres",
      host: "db.abcdefgh.supabase.co",
      isDomainSocket: false,
      port: 5432,
    },
  );

  const poolerClient = new Client({
    connectionString: assertSafeStagingDatabaseUrl(pooler),
    ssl: { rejectUnauthorized: true },
  });
  assert.deepEqual(
    {
      database: poolerClient.connectionParameters.database,
      host: poolerClient.connectionParameters.host,
      isDomainSocket: poolerClient.connectionParameters.isDomainSocket,
      port: poolerClient.connectionParameters.port,
    },
    {
      database: "postgres",
      host: "aws-0-eu-central-1.pooler.supabase.com",
      isDomainSocket: false,
      port: 6543,
    },
  );

  const encodedSocketUrl =
    "postgresql://postgres.abcdefgh:password@%2Ftmp%2Ffake.pooler.supabase.com:6543/postgres";
  const encodedSocketClient = new Client({
    connectionString: encodedSocketUrl,
    ssl: { rejectUnauthorized: true },
  });
  assert.equal(encodedSocketClient.connectionParameters.isDomainSocket, true);
  assert.throws(
    () => assertSafeStagingDatabaseUrl(encodedSocketUrl),
    /must bind its protocol, host, port, database, and credentials/u,
  );

  const ambientFallbackProbe = spawnSync(
    process.execPath,
    [
      "-e",
      `
        const { createRequire } = require("node:module");
        const { join } = require("node:path");
        const { pathToFileURL } = require("node:url");
        const dbRequire = createRequire(
          pathToFileURL(join(process.cwd(), "lib/db/package.json")),
        );
        const { Client } = dbRequire("pg");
        const client = new Client({
          connectionString:
            "postgresql://user:password@db.abcdefgh.supabase.co:5432/postgres",
          ssl: { rejectUnauthorized: true },
          options: "-c role=none -c row_security=on",
        });
        process.stdout.write(JSON.stringify({
          database: client.connectionParameters.database,
          port: client.connectionParameters.port,
        }));
      `,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PGDATABASE: "fieldgrid-shadow",
        PGPORT: "6543",
      },
    },
  );
  assert.equal(ambientFallbackProbe.status, 0, ambientFallbackProbe.stderr);
  assert.deepEqual(JSON.parse(ambientFallbackProbe.stdout), {
    database: "postgres",
    port: 5432,
  });

  for (const suffix of [
    "?sslmode=disable",
    "?sslmode=no-verify",
    "?ssl=0",
    "?sslrootcert=/tmp/ca",
    "?sslkey=/tmp/key",
    "?uselibpqcompat=true&sslmode=require",
    "?host=attacker.example",
    "?connect_timeout=10",
    "?%73slmode=disable",
    "#fragment",
  ]) {
    assert.throws(
      () => assertSafeStagingDatabaseUrl(`${direct}${suffix}`),
      /must not contain connection overrides/u,
    );
  }

  for (const invalid of [
    "not-a-url",
    "https://user:password@example.com/database",
    "postgresql://db.abcdefgh.supabase.co/postgres",
    "postgresql://user@db.abcdefgh.supabase.co/postgres",
    "postgresql://user:password@db.abcdefgh.supabase.co:5432",
    "postgresql://user:password@db.abcdefgh.supabase.co:5432/",
    "postgresql://user:password@db.abcdefgh.supabase.co/postgres",
    "postgresql://user:password@db.abcdefgh.supabase.co:0/postgres",
    "postgresql://user:password@db.abcdefgh.supabase.co:5432/postgres/extra",
    "postgresql://user:password@db%2Eabcdefgh.supabase.co:5432/postgres",
  ]) {
    assert.throws(() => assertSafeStagingDatabaseUrl(invalid));
  }
});

test("W00 staging-principal gate skips or fails safely without explicit staging env", () => {
  const env = { ...process.env };
  for (const name of [
    "FIELDGRID_W00_STAGING_PRINCIPAL_CONFIRM",
    "FIELDGRID_W00_STAGING_DATABASE_URL",
    "FIELDGRID_W00_STAGING_TENANT_A_HOST",
    "FIELDGRID_W00_STAGING_TENANT_A_ID",
    "FIELDGRID_W00_STAGING_TENANT_B_HOST",
    "FIELDGRID_W00_STAGING_TENANT_B_ID",
    "APP_ENV",
    "TARGET_ENVIRONMENT",
    "EXPECTED_SUPABASE_PROJECT_REF",
    "NEXT_PUBLIC_SUPABASE_URL",
  ]) {
    delete env[name];
  }
  env.DATABASE_URL =
    "postgresql://credential-user:credential-password@staging.example.invalid/fieldgrid";

  const check = spawnSync(
    "pnpm",
    [
      "--filter",
      "@workspace/db",
      "exec",
      "tsx",
      "../../scripts/fieldgrid-w00-staging-principal-gate.mts",
      "--check",
    ],
    { cwd: repoRoot, encoding: "utf8", env },
  );
  assert.equal(check.status, 0, check.stderr);
  assert.match(
    check.stdout,
    /FG-W00-STAGING-PRINCIPAL status=skipped mode=check/u,
  );
  assert.doesNotMatch(
    `${check.stdout}\n${check.stderr}`,
    /credential-user|credential-password|staging\.example\.invalid/u,
  );

  const strict = spawnSync(
    "pnpm",
    [
      "--filter",
      "@workspace/db",
      "exec",
      "tsx",
      "../../scripts/fieldgrid-w00-staging-principal-gate.mts",
      "--strict",
    ],
    { cwd: repoRoot, encoding: "utf8", env },
  );
  assert.equal(strict.status, 1, strict.stdout);
  assert.match(
    strict.stdout,
    /FG-W00-STAGING-PRINCIPAL status=failed mode=strict/u,
  );
  assert.doesNotMatch(
    `${strict.stdout}\n${strict.stderr}`,
    /credential-user|credential-password|staging\.example\.invalid/u,
  );
});
