import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

test("credential challenge migration stores only hashed challenge and grant material", () => {
  const migration = read("lib/db/migrations/20260712120000_credential_challenge_protocol.sql");
  for (const token of ["create table if not exists credential_challenges", "create table if not exists credential_reset_grants", "code_hash", "grant_hash", "email_hmac", "request_ip_hash", "user_agent_hash", "max_attempts", "resend_count", "verified_at", "consumed_at", "invalidated_at", "revoke all on table credential_challenges"]) {
    assert.ok(migration.toLowerCase().includes(token), token);
  }
  assert.doesNotMatch(migration.toLowerCase(), /plaintext|temporary_password|password_value|code_text|grant_secret/);
});

test("challenge service uses keyed hashes, timing-safe comparison and one-time reset grants", () => {
  const service = read("lib/db/src/credential-challenge-service.ts");
  for (const token of ["FIELDGRID_CREDENTIAL_CHALLENGE_HMAC_KEY", "FIELDGRID_CREDENTIAL_CHALLENGE_KEY_VERSION", "createHmac", "timingSafeEqual", "randomInt", "credentialResetGrantsTable", "consumeCredentialResetGrant"]) {
    assert.ok(service.includes(token), token);
  }
  assert.doesNotMatch(service, /password:\s*code|temporaryPassword/);
});

test("legacy invite and reset request paths no longer set a mailed code as the real auth password", () => {
  const inviteHelper = read("artifacts/backoffice/src/lib/auth/portal-invites.ts");
  assert.ok(inviteHelper.includes("password: internalAuthPassword"));
  assert.doesNotMatch(inviteHelper, /password:\s*temporaryPassword/);
  assert.doesNotMatch(inviteHelper, /password:\s*opts\.temporaryPassword/);

  for (const path of ["artifacts/backoffice/src/app/actions/auth.ts", "artifacts/klant-pwa/src/actions/auth.ts", "artifacts/personeel-pwa/src/actions/auth.ts"]) {
    const source = read(path);
    assert.ok(source.includes("createCredentialChallenge"), path);
    assert.doesNotMatch(source, /password:\s*code/, path);
    assert.doesNotMatch(source, /temporaryPassword:\s*code/, path);
  }
});
