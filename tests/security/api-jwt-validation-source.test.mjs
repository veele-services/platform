import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const auth = readFileSync(
  "artifacts/api-server/src/middleware/auth.ts",
  "utf8",
);
const harness = readFileSync(
  "scripts/fieldgrid-runtime-safety-api-harness.mjs",
  "utf8",
);

test("FG-HARD-030 validates the complete access-token envelope", () => {
  for (const fragment of [
    "SUPABASE_JWT_ISSUER",
    "SUPABASE_JWT_AUDIENCE",
    'algorithms: ["HS256"]',
    'requiredClaims: ["sub", "iss", "aud", "iat", "exp"]',
    "SUPABASE_JWT_MAX_LIFETIME_SECONDS",
    "expiresAt - issuedAt > SUPABASE_JWT_MAX_LIFETIME_SECONDS",
    'payload["role"] !== "authenticated"',
    "validateLiveAuthSubject",
    'metadata["password_changed_at"]',
    'metadata["session_revoked_at"]',
  ])
    assert.ok(auth.includes(fragment), fragment);
});

test("runtime API proof includes envelope, revocation, surface and metadata rejection", () => {
  for (const fragment of [
    "wrong-issuer",
    "wrong-audience",
    "wrong-role",
    "wrong-algorithm",
    "expired",
    "not-yet-valid",
    "malformed-claims",
    "excessive-lifetime",
    "revoked-session",
    "wrong-surface",
    "writable-metadata-privilege",
  ]) {
    assert.ok(harness.includes(fragment), fragment);
  }
});

test("runtime API proof uses disposable external hosts instead of deployment domains", () => {
  assert.match(
    harness,
    /const API_RUNTIME_HOST = "api\.runtime\.fieldgrid\.test"/u,
  );
  assert.match(
    harness,
    /const UNKNOWN_API_RUNTIME_HOST = "unknown\.runtime\.fieldgrid\.test"/u,
  );
  assert.match(harness, /delete env\.APP_ENV/u);
  assert.match(harness, /PLATFORM_HOSTS: API_RUNTIME_HOST/u);
  assert.doesNotMatch(harness, /"x-forwarded-host": "fieldgrid\.nl"/u);
  assert.doesNotMatch(
    harness,
    /"x-forwarded-host": "unknown\.runtime\.fieldgrid\.nl"/u,
  );
});
