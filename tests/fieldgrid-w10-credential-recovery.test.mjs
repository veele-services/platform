import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) assert.ok(content.includes(phrase), `${label} should contain ${phrase}`);
}

test("W10 migration stores only non-reversible recovery challenge material", () => {
  const migration = read("lib/db/migrations/20260716123000_credential_recovery_challenges.sql");
  assertContains(migration, [
    "credential_recovery_challenges",
    "account_lookup_hmac bytea NOT NULL",
    "code_hash bytea NOT NULL",
    "grant_hash bytea",
    "expires_at timestamptz NOT NULL",
    "resend_available_at timestamptz NOT NULL",
    "attempts_remaining integer NOT NULL DEFAULT 6",
    "used_at timestamptz",
    "credential_recovery_tenant_bound_check",
    "credential_recovery_one_active_challenge_idx",
    "credential_recovery_one_active_grant_idx",
  ], "credential recovery migration");
  assert.doesNotMatch(migration, /email\s+varchar|code\s+varchar|password\s+varchar/u);
});

test("W10 shared recovery service provides HMAC lookup, hashed codes, grants and explicit states", () => {
  const service = read("lib/db/src/credential-recovery.ts");
  assertContains(service, [
    "createHmac",
    "timingSafeEqual",
    "CredentialRecoverySurface",
    "tenant-backoffice",
    "personnel-portal",
    "customer-portal",
    "generateInternalAuthPassword",
    "generateResetGrant",
    "credentialRecoveryLookupHmac",
    "credentialRecoveryCodeHash",
    "credentialRecoveryGrantHash",
    "expired",
    "used",
    "invalid",
    "too-many-attempts",
    "cooldown",
    "FIELDGRID_CREDENTIAL_RECOVERY_SECRET",
    "process.env.CI",
  ], "credential recovery service");
});

test("Phase 2B activation code is never set or returned as the Supabase password", () => {
  const helper = read("artifacts/backoffice/src/lib/auth/portal-invites.ts");
  const recovery = read("lib/db/src/credential-recovery-service.ts");
  assertContains(helper, [
    "generateInternalAuthPassword",
    "password: generateInternalAuthPassword()",
    "issueCredentialRecoveryChallenge",
    "buildAccountActivationEmail",
  ], "portal activation safety");
  assertContains(recovery, ["code_hash", "grant_hash", "safeCompareRecoveryDigest"], "recovery lifecycle");
  assert.doesNotMatch(helper, /temporaryPassword|password:\s*(?:code|challenge\.code|opts\.)/u);
});
