import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CONFIRMATION, PRODUCTION_CONFIRMATION, PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF,
  assertExactCheckoutSha, assertExactRuntimeEnvironment, assertMigrationAdminUrl,
  assertProductionBindings, assertRuntimeBindings, assertRuntimePoolerHost,
  assertRuntimeUrl, assertRuntimeUrlDescriptor, assertStagingBindings,
  resolveRuntimePoolerHost, runtimePrincipalProfile, validateProductionRuntimeConfig,
} from "../../scripts/fieldgrid-w00-runtime-principal.mjs";
import { runStrictGate } from "../../scripts/fieldgrid-w00-runtime-principal-gate.mjs";
import { SUPABASE_ROOT_2021_CA_PEM } from "../fixtures/fieldgrid-supabase-root-2021-ca.mjs";

const sha = "a".repeat(40);
const otherSha = "b".repeat(40);
const host = "aws-1-eu-central-1.pooler.supabase.com";
const password = "production_runtime_synthetic_0123456789abcdef";
const adminPassword = "production_admin_synthetic_0123456789abcdef";
const runtimeUrl = `postgresql://fieldgrid_runtime_app.${PRODUCTION_PROJECT_REF}:${password}@${host}:5432/postgres`;
const adminUrl = `postgresql://supabase_admin.${PRODUCTION_PROJECT_REF}:${adminPassword}@${host}:5432/postgres`;

function productionBindings(expectedSha = sha) {
  return {
    APP_ENV: "production", TARGET_ENVIRONMENT: "production", TARGET: "production",
    EXPECTED_SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
    GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REPOSITORY: "veele-services/platform", GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: expectedSha, EXPECTED_MAIN_SHA: expectedSha, FIELDGRID_RUNTIME_EXPECTED_SHA: expectedSha,
    DEPLOYMENT_MODE: "production", DEPLOY_CONFIRMATION: "fieldgrid-production-deploy-exact-sha",
    FIELDGRID_RUNTIME_PRINCIPAL_CONFIRM: PRODUCTION_CONFIRMATION,
  };
}

function fixture(context) {
  const baseDir = mkdtempSync(path.join(tmpdir(), "fieldgrid-production-principal-"));
  context.after(() => rmSync(baseDir, { recursive: true, force: true }));
  const root = path.join(baseDir, "releases", `20260920120000-${sha.slice(0, 7)}`);
  mkdirSync(root, { recursive: true });
  const marker = path.join(root, ".fieldgrid-release-sha");
  writeFileSync(marker, `${sha}\n`);
  const certificate = path.join(baseDir, "supabase-root.crt");
  writeFileSync(certificate, SUPABASE_ROOT_2021_CA_PEM, { mode: 0o600 });
  return { root, marker, env: { ...productionBindings(), BASE_DIR: baseDir, RELEASE: root,
    FIELDGRID_PRODUCTION_DATABASE_POOLER_HOST: host,
    FIELDGRID_MIGRATION_DATABASE_URL: adminUrl,
    FIELDGRID_RUNTIME_DATABASE_URL: runtimeUrl,
    FIELDGRID_RUNTIME_DATABASE_PASSWORD: password,
    FIELDGRID_DATABASE_SSL_ROOT_CERT: certificate,
    PGSSLMODE: "verify-full", DB_SSL: "true", DB_SSL_REJECT_UNAUTHORIZED: "true" } };
}

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

test("runtime profiles are fixed, immutable and retain staging defaults", () => {
  assert.equal(runtimePrincipalProfile().projectRef, STAGING_PROJECT_REF);
  const production = runtimePrincipalProfile("production");
  assert.equal(production.projectRef, "ckdtiuemeygrnujjibnw");
  assert.equal(production.username, "fieldgrid_runtime_app.ckdtiuemeygrnujjibnw");
  assert.equal(production.poolerHostEnv, "FIELDGRID_PRODUCTION_DATABASE_POOLER_HOST");
  assert.equal(Object.isFrozen(production), true);
  assert.notEqual(PRODUCTION_CONFIRMATION, CONFIRMATION);
  for (const value of [null, "preview", "__proto__", "constructor", {}]) {
    assert.throws(() => runtimePrincipalProfile(value));
  }
});

test("production requires the complete exact-main manual dispatch identity and distinct confirmation", () => {
  const env = productionBindings();
  assert.doesNotThrow(() => assertProductionBindings(env));
  assert.doesNotThrow(() => assertRuntimeBindings(env));
  assert.throws(() => assertStagingBindings(env));
  for (const name of Object.keys(env)) {
    const missing = { ...env }; delete missing[name];
    assert.throws(() => assertProductionBindings(missing), name);
  }
  for (const [name, value] of Object.entries({
    APP_ENV: "staging", TARGET_ENVIRONMENT: "staging", TARGET: "staging",
    EXPECTED_SUPABASE_PROJECT_REF: STAGING_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
    GITHUB_EVENT_NAME: "push", GITHUB_ACTIONS: "false", GITHUB_REPOSITORY: "other/platform",
    GITHUB_REF: "refs/heads/staging", GITHUB_SHA: otherSha, EXPECTED_MAIN_SHA: otherSha,
    FIELDGRID_RUNTIME_EXPECTED_SHA: "not-a-sha", FIELDGRID_RUNTIME_PRINCIPAL_CONFIRM: CONFIRMATION,
    DEPLOYMENT_MODE: "staging-recovery", DEPLOY_CONFIRMATION: "staging-recovery-only",
    PGOPTIONS: "-c role=postgres",
  })) assert.throws(() => assertProductionBindings({ ...env, [name]: value }), name);
});

test("production URLs cannot inherit staging identity, a privileged runtime role or endpoint overrides", () => {
  assert.equal(assertRuntimeUrlDescriptor(runtimeUrl, host, "production").hostname, host);
  assert.equal(assertRuntimeUrl(runtimeUrl, password, host, "production"), runtimeUrl);
  assert.equal(assertMigrationAdminUrl(adminUrl, "production"), adminUrl);
  assert.throws(() => assertRuntimeUrlDescriptor(runtimeUrl, host));
  assert.throws(() => assertMigrationAdminUrl(adminUrl));
  for (const url of [
    runtimeUrl.replace(PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF),
    runtimeUrl.replace("fieldgrid_runtime_app.", "postgres."),
    runtimeUrl.replace(":5432/", ":6543/"), runtimeUrl.replace("/postgres", "/other"),
    runtimeUrl.replace(host, "db.ckdtiuemeygrnujjibnw.supabase.co"),
    `${runtimeUrl}?sslmode=disable`, `${runtimeUrl}#override`,
  ]) assert.throws(() => assertRuntimeUrlDescriptor(url, host, "production"));
  for (const url of [adminUrl.replace(PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF), runtimeUrl,
    adminUrl.replace(":5432/", ":6543/"), `${adminUrl}?options=-c%20role=postgres`]) {
    assert.throws(() => assertMigrationAdminUrl(url, "production"));
  }
  assert.throws(() => assertRuntimeUrl(runtimeUrl, `${password}wrong`, host, "production"));
});

test("production host is explicit and independent for direct and pooler migration endpoints", () => {
  const env = { APP_ENV: "production", FIELDGRID_PRODUCTION_DATABASE_POOLER_HOST: host };
  const direct = `postgresql://postgres:${adminPassword}@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`;
  for (const url of [adminUrl, direct]) {
    assert.equal(resolveRuntimePoolerHost(url, env), host);
    assert.throws(() => resolveRuntimePoolerHost(url, {
      APP_ENV: "production", FIELDGRID_STAGING_DATABASE_POOLER_HOST: host,
    }), /FIELDGRID_PRODUCTION_DATABASE_POOLER_HOST/u);
  }
  assert.throws(() => resolveRuntimePoolerHost(adminUrl, {
    ...env, FIELDGRID_PRODUCTION_DATABASE_POOLER_HOST: "aws-0-eu-west-1.pooler.supabase.com",
  }), /conflicts/u);
  for (const candidate of ["pooler.example.test", "127.0.0.1", `${host}.evil.test`, `${host}:5432`,
    "aws-1-eu-central-1.pooler.supabase.com/path", "", undefined]) {
    assert.throws(() => assertRuntimePoolerHost(candidate, "production"));
  }
  assert.equal(assertRuntimePoolerHost("aws-0-us-east-1.pooler.supabase.com", "production"),
    "aws-0-us-east-1.pooler.supabase.com");
  assert.throws(() => assertRuntimePoolerHost("aws-0-us-east-1.pooler.supabase.com"));
});

test("production checkout proves both HEAD and the fetched exact main ref", (context) => {
  const f = fixture(context);
  git(f.root, "init", "--initial-branch=test");
  git(f.root, "-c", "user.name=Fieldgrid Test", "-c", "user.email=production@example.test", "commit", "--allow-empty", "-m", "fixture");
  const actual = git(f.root, "rev-parse", "HEAD");
  const env = productionBindings(actual);
  assert.throws(() => assertExactRuntimeEnvironment(env, f));
  git(f.root, "update-ref", "refs/remotes/origin/main", actual);
  assert.equal(assertExactRuntimeEnvironment(env, f), actual);
  git(f.root, "-c", "user.name=Fieldgrid Test", "-c", "user.email=production@example.test", "commit", "--allow-empty", "-m", "moved");
  const moved = git(f.root, "rev-parse", "HEAD");
  assert.throws(() => assertExactRuntimeEnvironment(productionBindings(moved), f), /fetched production main/u);
  assert.throws(() => assertExactRuntimeEnvironment(env, f), /checkout does not match/u);
});

test("production release copies require the guarded marker and cannot borrow staging or recovery dispatches", (context) => {
  const f = fixture(context);
  assert.equal(assertExactRuntimeEnvironment(f.env, f), sha);
  for (const [name, value] of Object.entries({
    GITHUB_REF: "refs/heads/staging", EXPECTED_MAIN_SHA: otherSha, GITHUB_SHA: otherSha,
    DEPLOYMENT_MODE: "normal", DEPLOY_CONFIRMATION: "fieldgrid-staging-deploy-exact-sha",
    RELEASE: f.env.BASE_DIR, TARGET_ENVIRONMENT: "staging", FIELDGRID_RUNTIME_PRINCIPAL_CONFIRM: CONFIRMATION,
  })) assert.throws(() => assertExactRuntimeEnvironment({ ...f.env, [name]: value }, f), name);
  writeFileSync(f.marker, otherSha);
  assert.throws(() => assertExactRuntimeEnvironment(f.env, f), /marker does not match/u);
  rmSync(f.marker);
  const external = path.join(f.env.BASE_DIR, "external-marker");
  writeFileSync(external, sha);
  symlinkSync(external, f.marker);
  assert.throws(() => assertExactRuntimeEnvironment(f.env, f), /regular SHA file/u);
});

test("production configuration preflight validates independent passwords and pinned TLS without returning secrets", (context) => {
  const f = fixture(context);
  const descriptor = validateProductionRuntimeConfig(f.env, f);
  assert.equal(descriptor.environment, "production");
  assert.equal(descriptor.projectRef, PRODUCTION_PROJECT_REF);
  assert.equal(descriptor.exactSha, sha);
  assert.equal(descriptor.username, `fieldgrid_runtime_app.${PRODUCTION_PROJECT_REF}`);
  for (const secret of [password, adminPassword, runtimeUrl, adminUrl, f.env.FIELDGRID_DATABASE_SSL_ROOT_CERT]) {
    assert.equal(JSON.stringify(descriptor).includes(secret), false);
  }
  for (const [name, value] of Object.entries({
    FIELDGRID_RUNTIME_DATABASE_URL: runtimeUrl.replace(PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF),
    FIELDGRID_MIGRATION_DATABASE_URL: adminUrl.replace(PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF),
    FIELDGRID_RUNTIME_DATABASE_PASSWORD: `${password}wrong`,
    FIELDGRID_PRODUCTION_DATABASE_POOLER_HOST: "",
    FIELDGRID_DATABASE_SSL_ROOT_CERT: "", PGSSLMODE: "disable", DB_SSL: "false", DB_SSL_REJECT_UNAUTHORIZED: "false",
  })) assert.throws(() => validateProductionRuntimeConfig({ ...f.env, [name]: value }, f), name);
  assert.throws(() => validateProductionRuntimeConfig({ ...f.env,
    FIELDGRID_MIGRATION_DATABASE_URL: adminUrl.replace(adminPassword, password),
  }, f), /must be distinct/u);
});

test("invalid production strict-gate dispatch fails before loading a database client", async () => {
  await assert.rejects(runStrictGate({ ...productionBindings(), GITHUB_REF: "refs/heads/staging" }), /production dispatch/u);
  await assert.rejects(runStrictGate({ ...productionBindings(), FIELDGRID_RUNTIME_PRINCIPAL_CONFIRM: CONFIRMATION }), /production dispatch/u);
  const source = readFileSync(new URL("../../scripts/fieldgrid-w00-runtime-principal-gate.mjs", import.meta.url), "utf8");
  const gate = source.slice(source.indexOf("async function runStrictGate"), source.indexOf("async function main"));
  for (const proof of ["assertIdentityAndTopology", "assertRelationClosure", "assertSequenceClosure",
    "assertFunctionClosure", "assertRepresentativeRuntime"]) assert.match(gate, new RegExp(`await ${proof}\\(`, "u"));
  assert.match(gate, /begin transaction read only/u);
  assert.match(gate, /databaseNodePostgresSslConfig\(env\)/u);
  assert.doesNotMatch(gate, /if\s*\([^)]*(?:production|staging)/u);
});

test("existing staging marker semantics are retained by the generic exact-source verifier", (context) => {
  const f = fixture(context);
  const env = { ...f.env, APP_ENV: "staging", TARGET_ENVIRONMENT: "staging", TARGET: "staging",
    EXPECTED_SUPABASE_PROJECT_REF: STAGING_PROJECT_REF, NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`,
    GITHUB_REF: "refs/heads/staging", DEPLOYMENT_MODE: "normal", DEPLOY_CONFIRMATION: "fieldgrid-staging-deploy-exact-sha",
    EXPECTED_STAGING_SHA: sha, FIELDGRID_RUNTIME_PRINCIPAL_CONFIRM: CONFIRMATION };
  assert.equal(assertExactCheckoutSha(env, f), sha);
  assert.equal(assertExactRuntimeEnvironment(env, f), sha);
  assert.equal(assertExactRuntimeEnvironment({ ...env, GITHUB_REF: "refs/heads/main",
    DEPLOYMENT_MODE: "staging-recovery", DEPLOY_CONFIRMATION: "staging-recovery-only", EXPECTED_STAGING_SHA: otherSha }, f), sha);
});
