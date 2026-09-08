import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  RUNTIME_ROLE,
  assertRuntimePassword,
  assertRuntimeUrlDescriptor,
  buildScramVerifier,
} from "../../scripts/fieldgrid-w00-runtime-principal.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), "utf8");
const migration = read(
  "lib/db/migrations/20260909120000_runtime_least_privilege_principals.sql",
);

test("runtime-principal workflow separates immutable main describe from staging apply", () => {
  const workflow = read(".github/workflows/fieldgrid-w00-runtime-principal.yml");

  assert.match(
    workflow,
    /inputs\.action == 'describe' && github\.ref == 'refs\/heads\/main'/u,
  );
  assert.match(
    workflow,
    /inputs\.action == 'apply' && github\.ref == 'refs\/heads\/staging'/u,
  );
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/u);
  assert.match(workflow, /fetch-depth: 0/u);
  assert.match(workflow, /refs\/remotes\/origin\/main/u);
  assert.match(workflow, /refs\/remotes\/origin\/staging/u);
  assert.match(workflow, /chmod 0600 "\$descriptor_file"/u);
  assert.match(workflow, /stat -c '%a'/u);
  assert.match(workflow, /retention-days: 1/u);
  assert.match(workflow, /FIELDGRID_DATABASE_SSL_ROOT_CERT_BASE64/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(
    workflow,
    /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/u,
  );
  assert.match(
    workflow,
    /pnpm\/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1/u,
  );
  assert.match(
    workflow,
    /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/u,
  );
  assert.match(
    workflow,
    /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/u,
  );
  assert.doesNotMatch(workflow, /uses:\s+[^\s#]+@v\d+/u);

  const topLevelEnv = workflow.slice(
    workflow.indexOf("    env:"),
    workflow.indexOf("    steps:"),
  );
  assert.doesNotMatch(topLevelEnv, /FIELDGRID_MIGRATION_DATABASE_URL/u);
  assert.doesNotMatch(topLevelEnv, /FIELDGRID_RUNTIME_DATABASE_PASSWORD/u);
  assert.doesNotMatch(topLevelEnv, /FIELDGRID_RUNTIME_DATABASE_URL/u);
  assert.doesNotMatch(workflow, /\b(?:deploy|restart|systemctl|docker compose)\b/iu);
});

test("runtime roles, capability registries, and replay behavior fail closed", () => {
  assert.match(migration, /CREATE ROLE fieldgrid_runtime_data[\s\S]*?NOLOGIN NOSUPERUSER/u);
  assert.match(migration, /CREATE ROLE fieldgrid_runtime_app[\s\S]*?NOLOGIN NOSUPERUSER/u);
  assert.match(
    migration,
    /Existing runtime data role has privileged attributes[\s\S]*?ALTER ROLE fieldgrid_runtime_data\s+NOLOGIN NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD NULL/u,
  );
  assert.match(
    migration,
    /Existing runtime app role has privileged attributes[\s\S]*?ALTER ROLE fieldgrid_runtime_app\s+NOCREATEDB NOCREATEROLE INHERIT/u,
  );
  assert.match(
    migration,
    /GRANT fieldgrid_runtime_data TO fieldgrid_runtime_app[\s\S]*?INHERIT TRUE, SET FALSE, ADMIN FALSE/u,
  );
  assert.doesNotMatch(migration, /OWNER\s+TO\s+fieldgrid_runtime_/iu);
  assert.match(
    migration,
    /ALTER DEFAULT PRIVILEGES FOR ROLE current_user\s+REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/iu,
  );

  for (const registry of ["relation", "function", "sequence"]) {
    assert.match(
      migration,
      new RegExp(
        `CREATE TABLE IF NOT EXISTS app_private\\.fieldgrid_runtime_${registry}_capabilities[\\s\\S]*?source_migration text NOT NULL`,
        "u",
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `DELETE FROM app_private\\.fieldgrid_runtime_${registry}_capabilities\\s+WHERE source_migration\\s*=\\s*'20260909120000_runtime_least_privilege_principals\\.sql'`,
        "u",
      ),
    );
  }
});

test("previous live release receives the exact operation-minimal FORCE RLS owner surface", () => {
  const expected = new Map([
    ["credential_recovery_challenges", ["SELECT", "INSERT", "UPDATE"]],
    ["credential_recovery_events", ["SELECT", "INSERT"]],
    ["platform_users", ["SELECT", "INSERT", "UPDATE"]],
    ["support_access_grants", ["SELECT", "INSERT", "UPDATE"]],
    ["support_access_audit_log", ["SELECT", "INSERT"]],
    ["portal_onboarding_sessions", ["SELECT", "INSERT", "UPDATE"]],
    ["portal_onboarding_step_completions", ["SELECT", "INSERT", "UPDATE"]],
    ["portal_notification_preferences", ["SELECT", "INSERT", "UPDATE"]],
    ["offline_operation_receipts", ["SELECT", "INSERT", "UPDATE"]],
  ]);
  const gate = read("scripts/fieldgrid-w00-runtime-principal-gate.mjs");
  const compatibilityBlock = migration.match(
    /DO \$fieldgrid_migration_admin_force_rls_compatibility\$([\s\S]*?)\$fieldgrid_migration_admin_force_rls_compatibility\$;/u,
  )?.[1] ?? "";

  for (const [relation, operations] of expected) {
    assert.match(compatibilityBlock, new RegExp(`'${relation}'`, "u"));
    for (const operation of operations) {
      assert.match(migration, new RegExp(`'${operation}'`, "u"));
    }
  }
  assert.match(compatibilityBlock, /fieldgrid_migration_admin_compat_/u);
  assert.match(gate, /forcedServerOnlyRelations/u);
  assert.match(gate, /fieldgrid_migration_admin_compat_/u);
  assert.doesNotMatch(
    compatibilityBlock,
    /GRANT\s+fieldgrid_(?:runtime_app|runtime_data)\s+TO\s+current_user/iu,
  );
});

test("runtime auth lookup is function-only and callers no longer join auth.users", () => {
  const auth = read("artifacts/api-server/src/middleware/auth.ts");
  const notifications = read("artifacts/api-server/src/lib/notification-worker.ts");

  assert.match(migration, /STABLE\s+SECURITY DEFINER\s+SET search_path TO pg_catalog/u);
  assert.match(migration, /RETURNS TABLE \(\s+id uuid,\s+email text,\s+raw_app_meta_data jsonb/u);
  assert.match(migration, /REVOKE USAGE ON SCHEMA auth FROM fieldgrid_runtime_data/u);
  assert.match(auth, /app_private\.fieldgrid_auth_user_snapshot/u);
  assert.match(notifications, /JOIN LATERAL app_private\.fieldgrid_auth_user_snapshot/u);
  assert.doesNotMatch(auth, /auth\.users/u);
  assert.doesNotMatch(notifications, /auth\.users/u);
});

test("SCRAM provisioning and runtime endpoint validators are deterministic and strict", () => {
  const password = "fieldgrid_runtime_password_0123456789abcdef";
  assert.equal(
    buildScramVerifier(password, Buffer.alloc(16, 7)),
    "SCRAM-SHA-256$4096:BwcHBwcHBwcHBwcHBwcHBw==$kBGGo65sRQ7WXzet9tJ6VEg0aCSXcw0YG0QQiuJ7Hrs=:IAZLI5yGSRTY1IHAIyShSMHFJxkW/UwC5Esk4irD5Uw=",
  );
  assert.equal(assertRuntimePassword(password), undefined);
  assert.throws(() => assertRuntimePassword("short"));

  const host = "aws-1-eu-central-1.pooler.supabase.com";
  const url = `postgresql://${RUNTIME_ROLE}.olyfmekyqozxrbrwwszu:${password}@${host}:5432/postgres`;
  assert.equal(assertRuntimeUrlDescriptor(url, host).hostname, host);
  assert.throws(() => assertRuntimeUrlDescriptor(`${url}?sslmode=disable`, host));
  assert.throws(() => assertRuntimeUrlDescriptor(url, "pooler.example.test"));
});

test("runtime source capability inventory matches the migration manifest", () => {
  const result = JSON.parse(execFileSync(
    process.execPath,
    ["scripts/fieldgrid-runtime-database-capability-inventory.mjs", "--check"],
    { cwd: repoRoot, encoding: "utf8" },
  ));
  assert.equal(result.status, "passed");
  assert.ok(result.directRelations > 0);
  assert.ok(result.directFunctions > 0);
  assert.ok(result.catalogRelations > 0);
});
