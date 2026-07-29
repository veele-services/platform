import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

const surfaceActions = [
  "artifacts/backoffice/src/app/actions/auth.ts",
  "artifacts/klant-pwa/src/actions/auth.ts",
  "artifacts/personeel-pwa/src/actions/auth.ts",
];

test("FG-HARD-025: no surface treats a reset or activation code as a password", () => {
  const invite = read("artifacts/backoffice/src/lib/auth/portal-invites.ts");
  assert.doesNotMatch(
    invite,
    /temporaryPassword|buildTemporaryPasswordEmail|password:\s*(?:code|challenge\.code|opts\.)/u,
  );
  assert.match(invite, /password:\s*generateInternalAuthPassword\(\)/u);
  assert.match(invite, /issueCredentialRecoveryChallenge/u);

  for (const path of surfaceActions) {
    const source = read(path);
    assert.doesNotMatch(
      source,
      /password:\s*(?:code|resetCode|challenge\.code)/u,
      path,
    );
    assert.match(source, /consumeCredentialRecoveryGrant/u, path);
    assert.match(source, /admin\.auth\.admin\.updateUserById/u, path);
    assert.match(source, /credential_recovery_challenge_id/u, path);
    assert.match(source, /providerAlreadyApplied/u, path);
  }
});

test("public recovery requests are generic and tenant/surface bound", () => {
  for (const path of surfaceActions) {
    const source = read(path);
    assert.ok(
      source.includes("CREDENTIAL_RECOVERY_GENERIC_RESPONSE") ||
        /const publicResult:[^=]*= \{ success: true \}/u.test(source),
      `${path} must use a generic public response`,
    );
    assert.match(source, /issueCredentialRecoveryChallenge/u, path);
    assert.match(source, /verifyCredentialRecoveryChallenge/u, path);
    assert.match(source, /consumeCredentialRecoveryGrant/u, path);
    assert.match(source, /markCredentialRecoveryDelivery/u, path);
    assert.match(source, /recordCredentialRecoveryProviderOutcome/u, path);
  }

  const customer = read("artifacts/klant-pwa/src/actions/auth.ts");
  const personnel = read("artifacts/personeel-pwa/src/actions/auth.ts");
  assert.match(customer, /eq\(customerUsersTable\.tenantId, tenantId\)/u);
  assert.match(
    customer,
    /eq\(customersTable\.tenantId, customerUsersTable\.tenantId\)/u,
  );
  assert.match(personnel, /eq\(personnelTable\.tenantId, tenantId\)/u);
  assert.match(customer, /inArray\(customerUsersTable\.status/u);
  assert.match(personnel, /eq\(personnelTable\.isActive, true\)/u);
});

test("challenge lifecycle stores hashes only and is atomic under concurrency", () => {
  const migration = read(
    "lib/db/migrations/20260718180000_complete_credential_recovery.sql",
  );
  const service = read("lib/db/src/credential-recovery-service.ts");

  for (const fragment of [
    "account_lookup_hmac bytea",
    "code_hash",
    "grant_hash",
    "issued_at",
    "expires_at",
    "used_at",
    "invalidated_at",
    "FORCE ROW LEVEL SECURITY",
    "FROM PUBLIC, anon, authenticated",
    "cleanup_expired_credential_recovery_challenges",
    "SET search_path = pg_catalog, public",
  ]) {
    assert.ok(
      migration.includes(fragment),
      `migration must contain ${fragment}`,
    );
  }
  assert.doesNotMatch(
    migration,
    /(?:raw_)?(?:code|token|password)\s+(?:text|varchar)/u,
  );

  for (const fragment of [
    "pg_advisory_xact_lock",
    "FOR UPDATE",
    "safeCompareRecoveryDigest",
    "grant_expires_at",
    "AND used_at IS NULL",
    "RETURNING id",
    "provider_claim_id",
    "provider_claim_expires_at",
    "provider_claim_duplicate",
    "provider_password_update_failed",
    "challenge_superseded",
    "request_limited",
    "grant_context_mismatch",
  ]) {
    assert.ok(service.includes(fragment), `service must contain ${fragment}`);
  }
  assert.ok(
    service.indexOf("provider_claim_id") <
      service.indexOf("SET used_at = CASE WHEN"),
  );
  assert.doesNotMatch(
    service,
    /console\.(?:log|info|warn|error)\([^\n]*(?:code|grant)/u,
  );
});

test("redirects, cookies, service role and test email transport fail closed", () => {
  const invite = read("artifacts/backoffice/src/lib/auth/portal-invites.ts");
  const helper = read("lib/db/src/credential-recovery.ts");
  const email = read("lib/db/src/email-service.ts");
  assert.match(
    surfaceActions.map(read).join("\n"),
    /FIELDGRID_RECOVERY_ALLOWED_ORIGINS/u,
  );
  assert.match(helper, /allowlist\.has\(origin\)/u);
  assert.ok(
    invite.indexOf(
      "const redirectOrigin = trustedActivationOrigin(",
    ) <
      invite.indexOf("admin.auth.admin.createUser("),
    "activation origin must fail closed before auth state changes",
  );
  assert.match(helper, /randomInt/u);
  assert.match(helper, /randomBytes/u);
  assert.match(helper, /timingSafeEqual/u);

  for (const path of [
    "artifacts/backoffice/src/lib/supabase/admin.ts",
    "artifacts/klant-pwa/src/lib/supabase/admin.ts",
    "artifacts/personeel-pwa/src/lib/supabase/admin.ts",
  ]) {
    assert.match(read(path), /import "server-only"/u, path);
  }

  for (const path of surfaceActions) {
    const source = read(path);
    assert.match(source, /httpOnly:\s*true/u, path);
    assert.match(source, /sameSite:\s*"strict"/u, path);
    assert.ok(
      /secure:\s*(?:process\.env\.NODE_ENV === "production"|(?:recoveryOrigin\(\)|context\.origin)\.startsWith\("https:\/\/"\))/u.test(
        source,
      ),
      `${path} must secure the recovery cookie on HTTPS`,
    );
  }

  assert.match(email, /FIELDGRID_EMAIL_TEST_OUTBOX_PATH/u);
  assert.match(email, /NODE_ENV === "test"/u);
  assert.match(email, /FIELDGRID_E2E_AUTH_ENABLED/u);
  assert.match(email, /mode:\s*0o600/u);
  assert.ok(
    email.indexOf("FIELDGRID_EMAIL_TEST_OUTBOX_PATH") <
      email.indexOf("provider = await resolveActiveProvider"),
  );
});

test("recovery UI and routes use safe server-side states", () => {
  const pages = [
    "artifacts/backoffice/src/app/(auth)/wachtwoord-vergeten/page.tsx",
    "artifacts/klant-pwa/src/app/(auth)/wachtwoord-vergeten/page.tsx",
    "artifacts/personeel-pwa/src/app/(auth)/wachtwoord-vergeten/page.tsx",
  ];
  for (const path of pages) {
    const source = read(path);
    assert.match(source, /Herstelcode/u, path);
    assert.match(source, /Code controleren/u, path);
    assert.match(source, /herstelcode is verlopen/u, path);
    assert.match(source, /herstelcode is al gebruikt/u, path);
    assert.match(source, /herstelcode is ongeldig/u, path);
    assert.doesNotMatch(source, /signInWithPassword|verifyOtp/u, path);
  }

  const request = read(
    "artifacts/klant-pwa/src/app/api/auth/password-reset/request/route.ts",
  );
  const verify = read(
    "artifacts/klant-pwa/src/app/api/auth/password-reset/verify/route.ts",
  );
  const complete = read(
    "artifacts/klant-pwa/src/app/api/auth/password-reset/complete/route.ts",
  );
  for (const source of [request, verify, complete]) {
    assert.match(source, /Cache-Control/u);
    assert.match(source, /no-store/u);
  }
});
