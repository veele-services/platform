#!/usr/bin/env node
import assert from "node:assert/strict";
import { FIXTURE, connect, databaseUrl, writeJsonArtifact } from "./fieldgrid-runtime-safety-lib.mjs";

const parsedDatabase = new URL(databaseUrl());
assert.ok(["127.0.0.1", "localhost", "::1", "postgres"].includes(parsedDatabase.hostname));
process.env.FIELDGRID_CREDENTIAL_RECOVERY_SECRET ??=
  "fieldgrid-phase2b-runtime-only-secret-000000000000000000000000";

const {
  CREDENTIAL_RECOVERY_RESEND_COOLDOWN_MS,
  consumeCredentialRecoveryGrant,
  issueCredentialRecoveryChallenge,
  markCredentialRecoveryDelivery,
  recordCredentialRecoveryProviderOutcome,
  revokeCredentialRecoveryChallenges,
  verifyCredentialRecoveryChallenge,
} = await import("../lib/db/src/index.ts");
const { pool } = await import("../lib/db/src/connection.ts");

const tenantA = FIXTURE.tenants.a;
const tenantB = FIXTURE.tenants.b;
const customerA = FIXTURE.users.tenantACustomer;
const personnelA = FIXTURE.users.tenantAPersonnel;
const origin = "https://tenant-a.runtime.fieldgrid.test";
const baseNow = new Date("2026-07-18T12:00:00.000Z");
const runtimeStartedAt = new Date().toISOString();

function context(overrides = {}) {
  return {
    surface: "customer-portal",
    purpose: "password-reset",
    tenantId: tenantA,
    accountIdentifier: "customer@tenant-a.runtime.fieldgrid.test",
    redirectOrigin: origin,
    networkSignal: "198.51.100.0/24",
    clientSignal: "phase2b-runtime",
    now: baseNow,
    ...overrides,
  };
}

async function issue(accountIdentifier, overrides = {}) {
  return issueCredentialRecoveryChallenge({
    ...context({ accountIdentifier, ...overrides }),
    subjectUserId: overrides.subjectUserId === undefined ? customerA : overrides.subjectUserId,
  });
}

const client = await connect();
try {
  await client.query("delete from public.credential_recovery_events");
  await client.query("delete from public.credential_recovery_challenges");

  const existing = await issue("existing@example.test");
  const missing = await issueCredentialRecoveryChallenge({
    ...context({ accountIdentifier: "missing@example.test" }),
    subjectUserId: null,
  });
  assert.equal(existing.status, "issued");
  assert.equal(missing.status, "accepted");
  assert.ok(existing.challengeId && existing.code && existing.expiresAt);
  assert.equal(missing.code, null);
  await markCredentialRecoveryDelivery(existing.challengeId, true, baseNow);

  const stored = await client.query(
    `select *, encode(code_hash, 'hex') as code_hex, encode(account_lookup_hmac, 'hex') as lookup_hex
       from public.credential_recovery_challenges where id = $1`,
    [existing.challengeId],
  );
  assert.equal(stored.rows.length, 1);
  assert.equal(stored.rows[0].code_hex.length, 64);
  assert.equal(stored.rows[0].lookup_hex.length, 64);
  assert.notEqual(stored.rows[0].code_hex, existing.code);
  assert.equal(stored.rows[0].issued_at.toISOString(), baseNow.toISOString());
  assert.equal(stored.rows[0].delivery_status, "sent");
  assert.doesNotMatch(JSON.stringify(stored.rows[0]), new RegExp(existing.code));

  const invalidCode = await verifyCredentialRecoveryChallenge({
    ...context({ accountIdentifier: "existing@example.test" }),
    code: "00000000",
  });
  assert.equal(invalidCode.state, "invalid");

  const verified = await verifyCredentialRecoveryChallenge({
    ...context({ accountIdentifier: "existing@example.test" }),
    code: existing.code,
  });
  assert.equal(verified.state, "valid");
  assert.ok(verified.grant && verified.grantExpiresAt);

  const replayedVerification = await verifyCredentialRecoveryChallenge({
    ...context({ accountIdentifier: "existing@example.test" }),
    code: existing.code,
  });
  assert.equal(replayedVerification.state, "used");

  const wrongPurpose = await consumeCredentialRecoveryGrant({
    ...context({ purpose: "activation" }),
    grant: verified.grant,
  });
  const wrongSurface = await consumeCredentialRecoveryGrant({
    ...context({ surface: "personnel-portal" }),
    grant: verified.grant,
  });
  const wrongTenant = await consumeCredentialRecoveryGrant({
    ...context({ tenantId: tenantB, redirectOrigin: "https://tenant-b.runtime.fieldgrid.test" }),
    grant: verified.grant,
  });
  const malformed = await consumeCredentialRecoveryGrant({
    ...context(),
    grant: "malformed",
  });
  assert.deepEqual(
    [wrongPurpose.state, wrongSurface.state, wrongTenant.state, malformed.state],
    ["invalid", "invalid", "invalid", "invalid"],
  );

  const consumed = await consumeCredentialRecoveryGrant({
    ...context(),
    grant: verified.grant,
    assertSubjectEligible: async (subjectUserId) => subjectUserId === customerA,
  });
  assert.equal(consumed.state, "valid");
  assert.equal(consumed.subjectUserId, customerA);
  assert.ok(consumed.claimId);
  const replayedGrant = await consumeCredentialRecoveryGrant({
    ...context(),
    grant: verified.grant,
  });
  assert.equal(replayedGrant.state, "processing");
  await recordCredentialRecoveryProviderOutcome({
    challengeId: consumed.challengeId,
    claimId: consumed.claimId,
    success: true,
    sessionRevoked: true,
    now: baseNow,
  });
  const finalizedReplay = await consumeCredentialRecoveryGrant({ ...context(), grant: verified.grant });
  assert.equal(finalizedReplay.state, "used");

  const retryable = await issue("provider-retry@example.test");
  const retryableVerified = await verifyCredentialRecoveryChallenge({
    ...context({ accountIdentifier: "provider-retry@example.test" }),
    code: retryable.code,
  });
  const failedClaim = await consumeCredentialRecoveryGrant({ ...context(), grant: retryableVerified.grant });
  assert.equal(failedClaim.state, "valid");
  assert.ok(failedClaim.challengeId && failedClaim.claimId);
  await recordCredentialRecoveryProviderOutcome({
    challengeId: failedClaim.challengeId,
    claimId: failedClaim.claimId,
    success: false,
    sessionRevoked: false,
    now: baseNow,
  });
  const retriedClaim = await consumeCredentialRecoveryGrant({
    ...context({ now: new Date(baseNow.getTime() + 1) }),
    grant: retryableVerified.grant,
  });
  assert.equal(retriedClaim.state, "valid");
  assert.notEqual(retriedClaim.claimId, failedClaim.claimId);

  const expired = await issue("expired@example.test", {
    now: new Date("2026-07-18T10:00:00.000Z"),
  });
  const expiredResult = await verifyCredentialRecoveryChallenge({
    ...context({ accountIdentifier: "expired@example.test" }),
    code: expired.code,
  });
  assert.equal(expiredResult.state, "expired");

  const supersededFirst = await issue("superseded@example.test");
  const supersededSecond = await issue("superseded@example.test", {
    now: new Date(baseNow.getTime() + CREDENTIAL_RECOVERY_RESEND_COOLDOWN_MS + 1),
  });
  assert.equal(supersededSecond.status, "issued");
  const supersededResult = await verifyCredentialRecoveryChallenge({
    ...context({
      accountIdentifier: "superseded@example.test",
      now: new Date(baseNow.getTime() + CREDENTIAL_RECOVERY_RESEND_COOLDOWN_MS + 2),
    }),
    code: supersededFirst.code,
  });
  assert.equal(supersededResult.state, "invalid");

  const revoked = await issue("revoked@example.test");
  const revokedCount = await revokeCredentialRecoveryChallenges({
    tenantId: tenantA,
    surface: "customer-portal",
    purpose: "password-reset",
    subjectUserId: customerA,
    actorUserId: FIXTURE.users.tenantAAdmin,
    reason: "admin_revoked",
    now: baseNow,
  });
  assert.ok(revokedCount >= 1);
  const revokedResult = await verifyCredentialRecoveryChallenge({
    ...context({ accountIdentifier: "revoked@example.test" }),
    code: revoked.code,
  });
  assert.equal(revokedResult.state, "invalid");

  const ineligible = await issue("ineligible@example.test", { subjectUserId: personnelA });
  const ineligibleVerified = await verifyCredentialRecoveryChallenge({
    ...context({ accountIdentifier: "ineligible@example.test" }),
    code: ineligible.code,
  });
  assert.equal(ineligibleVerified.state, "valid");
  const ineligibleConsumed = await consumeCredentialRecoveryGrant({
    ...context(),
    grant: ineligibleVerified.grant,
    assertSubjectEligible: async () => false,
  });
  assert.equal(ineligibleConsumed.state, "invalid");

  const concurrent = await issue("concurrent@example.test");
  const concurrentVerified = await verifyCredentialRecoveryChallenge({
    ...context({ accountIdentifier: "concurrent@example.test" }),
    code: concurrent.code,
  });
  assert.equal(concurrentVerified.state, "valid");
  const concurrentResults = await Promise.all([
    consumeCredentialRecoveryGrant({ ...context(), grant: concurrentVerified.grant }),
    consumeCredentialRecoveryGrant({ ...context(), grant: concurrentVerified.grant }),
  ]);
  assert.deepEqual(
    concurrentResults.map((result) => result.state).sort(),
    ["processing", "valid"],
  );

  const tenantBound = await issue("tenant-bound@example.test");
  const tenantBCrossUse = await verifyCredentialRecoveryChallenge({
    ...context({
      tenantId: tenantB,
      redirectOrigin: "https://tenant-b.runtime.fieldgrid.test",
      accountIdentifier: "tenant-bound@example.test",
    }),
    code: tenantBound.code,
  });
  const personnelCrossUse = await verifyCredentialRecoveryChallenge({
    ...context({
      surface: "personnel-portal",
      accountIdentifier: "tenant-bound@example.test",
    }),
    code: tenantBound.code,
  });
  assert.equal(tenantBCrossUse.state, "invalid");
  assert.equal(personnelCrossUse.state, "invalid");

  for (let index = 0; index < 5; index += 1) {
    const accepted = await issueCredentialRecoveryChallenge({
      ...context({
        accountIdentifier: "limited@example.test",
        networkSignal: `203.0.113.${index}`,
        clientSignal: `limit-${index}`,
        now: new Date(baseNow.getTime() + index),
      }),
      subjectUserId: null,
    });
    assert.equal(accepted.status, "accepted");
  }
  const limited = await issueCredentialRecoveryChallenge({
    ...context({
      accountIdentifier: "limited@example.test",
      networkSignal: "203.0.113.99",
      clientSignal: "limit-final",
      now: new Date(baseNow.getTime() + 10),
    }),
    subjectUserId: null,
  });
  assert.equal(limited.status, "rate-limited");

  const security = await client.query(`
    select
      c.relname,
      c.relrowsecurity,
      c.relforcerowsecurity,
      has_table_privilege('anon', c.oid, 'select') as anon_select,
      has_table_privilege('authenticated', c.oid, 'select') as authenticated_select,
      has_table_privilege('service_role', c.oid, 'select') as service_select
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('credential_recovery_challenges', 'credential_recovery_events')
    order by c.relname
  `);
  assert.equal(security.rows.length, 2);
  for (const row of security.rows) {
    assert.equal(row.relrowsecurity, true);
    assert.equal(row.relforcerowsecurity, true);
    assert.equal(row.anon_select, false);
    assert.equal(row.authenticated_select, false);
    assert.equal(row.service_select, true);
  }

  const audit = await client.query(
    `select event_type, metadata::text as metadata
       from public.credential_recovery_events order by created_at, id`,
  );
  const eventTypes = new Set(audit.rows.map((row) => row.event_type));
  for (const required of [
    "request_accepted",
    "request_issued",
    "delivery_succeeded",
    "grant_issued",
    "provider_claimed",
    "provider_password_updated",
    "provider_password_update_failed",
    "challenge_superseded",
    "verify_invalid",
    "verify_replayed",
    "request_limited",
  ]) {
    assert.ok(eventTypes.has(required), `missing audit event ${required}`);
  }
  const persistedAudit = JSON.stringify(audit.rows);
  for (const secret of [
    existing.code,
    verified.grant,
    concurrent.code,
    concurrentVerified.grant,
    tenantBound.code,
  ]) {
    assert.equal(persistedAudit.includes(secret), false);
  }

  const runtimeResult = {
    schemaVersion: "1.0.0",
    name: "fieldgrid-credential-recovery-runtime",
    status: "passed",
    startedAt: runtimeStartedAt,
    completedAt: new Date().toISOString(),
    checks: [
      "generic-request-response",
      "hash-only-storage",
      "valid-token-and-successful-provider-update",
      "invalid-expired-used-token",
      "wrong-tenant-purpose-and-surface-token",
      "supersede-and-revoke",
      "deactivated-eligibility",
      "concurrent-single-use",
      "durable-rate-limit",
      "audit-redaction",
      "rls-and-acl",
    ].map((name) => ({ name, status: "passed" })),
    tenantFixtureIds: [tenantA, tenantB],
  };
  await writeJsonArtifact("reports/credential-recovery.json", runtimeResult);
  console.log(JSON.stringify(runtimeResult));
} finally {
  await client.end();
  await pool.end();
}
