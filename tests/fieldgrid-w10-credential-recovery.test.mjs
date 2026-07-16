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

test("W10 reset code is not set as the actual Supabase password", () => {
  const helper = read("artifacts/backoffice/src/lib/auth/portal-invites.ts");
  assertContains(helper, [
    "opts.temporaryPasswordKind === \"reset_code\"",
    "internalAuthPassword",
    "generateTemporaryPassword()",
    "password: internalAuthPassword",
  ], "portal invite helper reset password safety");
  assert.doesNotMatch(helper, /password:\s*opts\.temporaryPassword,/u);
});
