import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const filename = new URL(
  "../../lib/db/src/credential-recovery.ts",
  import.meta.url,
);
const source = readFileSync(filename, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(
  compiled,
  {
    module,
    exports: module.exports,
    require,
    process: { env: { NODE_ENV: "test" } },
    Buffer,
    URL,
  },
  { filename: filename.pathname },
);
const recovery = module.exports;

test("credential recovery generates high-entropy separated challenge material", () => {
  const codes = new Set(
    Array.from({ length: 128 }, () =>
      recovery.generateCredentialRecoveryCode(),
    ),
  );
  assert.equal(codes.size, 128);
  for (const code of codes) assert.match(code, /^\d{8}$/u);

  const grants = new Set(
    Array.from({ length: 64 }, () => recovery.generateResetGrant()),
  );
  assert.equal(grants.size, 64);
  for (const grant of grants) assert.ok(grant.length >= 43);

  const secret = "test-secret-with-at-least-thirty-two-bytes";
  const base = {
    surface: "customer-portal",
    tenantId: "10000000-0000-4000-8000-000000000001",
    accountIdentifier: "  USER@Example.Test ",
    secret,
  };
  const lookup = recovery.credentialRecoveryLookupHmac(base);
  assert.equal(lookup.length, 64);
  assert.equal(
    lookup,
    recovery.credentialRecoveryLookupHmac({
      ...base,
      accountIdentifier: "user@example.test",
    }),
  );
  assert.notEqual(
    lookup,
    recovery.credentialRecoveryLookupHmac({
      ...base,
      surface: "personnel-portal",
    }),
  );
  assert.notEqual(
    lookup,
    recovery.credentialRecoveryLookupHmac({
      ...base,
      tenantId: "10000000-0000-4000-8000-000000000002",
    }),
  );

  const code = [...codes][0];
  const codeHash = recovery.credentialRecoveryCodeHash({
    lookupHmac: lookup,
    code,
    secret,
  });
  const grant = [...grants][0];
  const grantHash = recovery.credentialRecoveryGrantHash(grant, secret);
  assert.equal(codeHash.length, 64);
  assert.equal(grantHash.length, 64);
  assert.equal(codeHash.includes(code), false);
  assert.equal(grantHash.includes(grant), false);
  assert.equal(recovery.safeCompareRecoveryDigest(codeHash, codeHash), true);
  assert.equal(recovery.safeCompareRecoveryDigest(codeHash, grantHash), false);
  assert.equal(
    recovery.safeCompareRecoveryDigest(codeHash, "malformed"),
    false,
  );
});

test("credential recovery handoff is signed and contains no account or code", () => {
  const challengeId = "10000000-0000-4000-8000-000000000001";
  const secret = "test-secret-with-at-least-thirty-two-bytes";
  const handoff = recovery.createCredentialRecoveryHandoff(challengeId, secret);

  assert.match(
    handoff,
    /^10000000-0000-4000-8000-000000000001\.[0-9a-f]{64}$/u,
  );
  assert.equal(
    recovery.verifyCredentialRecoveryHandoff(handoff, secret),
    challengeId,
  );
  assert.equal(
    recovery.verifyCredentialRecoveryHandoff(
      handoff.replace(/^1/u, "2"),
      secret,
    ),
    null,
  );
  assert.equal(
    recovery.verifyCredentialRecoveryHandoff(
      handoff,
      "different-test-secret-with-at-least-thirty-two-bytes",
    ),
    null,
  );
  assert.equal(
    recovery.verifyCredentialRecoveryHandoff("not-a-handoff", secret),
    null,
  );
  assert.throws(
    () => recovery.createCredentialRecoveryHandoff("not-a-uuid", secret),
    /valid challenge id/u,
  );
  assert.equal(handoff.includes("user@example.test"), false);
  assert.equal(handoff.includes("87654321"), false);
});

test("credential recovery classifies expiry, use and invalidation deterministically", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
  const future = new Date("2026-07-18T12:30:00.000Z");
  const past = new Date("2026-07-18T11:59:59.000Z");
  const classify = (overrides = {}) =>
    recovery.classifyCredentialRecoveryChallenge({
      now,
      expiresAt: future,
      attemptsRemaining: 6,
      codeMatches: true,
      ...overrides,
    });

  assert.equal(classify(), "valid");
  assert.equal(classify({ usedAt: past }), "used");
  assert.equal(classify({ invalidatedAt: past }), "invalid");
  assert.equal(classify({ expiresAt: past }), "expired");
  assert.equal(classify({ attemptsRemaining: 0 }), "too-many-attempts");
  assert.equal(classify({ codeMatches: false }), "invalid");
});

test("credential recovery origins are exact, allowlisted and HTTPS", () => {
  assert.equal(
    recovery.resolveCredentialRecoveryOrigin({
      configuredOrigin: "https://tenant-a.fieldgrid.test/path?ignored=1",
      allowedOrigins: ["https://tenant-a.fieldgrid.test"],
    }),
    "https://tenant-a.fieldgrid.test",
  );
  assert.throws(
    () =>
      recovery.resolveCredentialRecoveryOrigin({
        configuredOrigin: "https://evil.example.test",
        allowedOrigins: ["https://tenant-a.fieldgrid.test"],
      }),
    /not allowlisted/u,
  );
  assert.throws(
    () =>
      recovery.resolveCredentialRecoveryOrigin({
        configuredOrigin: "http://tenant-a.fieldgrid.test",
      }),
    /HTTPS/u,
  );
  assert.equal(
    recovery.resolveCredentialRecoveryOrigin({
      configuredOrigin: "http://127.0.0.1:9323",
      allowHttpLocalhost: true,
    }),
    "http://127.0.0.1:9323",
  );
  assert.throws(
    () =>
      recovery.resolveCredentialRecoveryOrigin({
        configuredOrigin: "https://tenant-a.fieldgrid.nl",
        deploymentEnvironment: "staging",
      }),
    /belongs to production/u,
  );
  assert.throws(
    () =>
      recovery.resolveCredentialRecoveryOrigin({
        configuredOrigin: "https://tenant-a.staging.fieldgrid.nl",
        deploymentEnvironment: "production",
      }),
    /belongs to staging/u,
  );
});
