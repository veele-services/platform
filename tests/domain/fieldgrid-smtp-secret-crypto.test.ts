import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptTenantSmtpPassword,
  encryptTenantSmtpPassword,
} from "../../lib/db/src/email-secret-crypto.ts";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "10000000-0000-4000-8000-000000000002";
const KEY_A = "test-only-email-encryption-key-a";
const KEY_B = "test-only-email-encryption-key-b";

test("tenant SMTP secret encrypts and decrypts with AES-256-GCM", () => {
  const plaintext = "smtp-test-password-value";
  const encrypted = encryptTenantSmtpPassword(TENANT_A, plaintext, {
    keyMaterial: KEY_A,
  });

  assert.equal(
    decryptTenantSmtpPassword(TENANT_A, encrypted, { keyMaterial: KEY_A }),
    plaintext,
  );
  assert.doesNotMatch(encrypted, new RegExp(plaintext, "u"));
  assert.deepEqual(Object.keys(JSON.parse(encrypted)).sort(), ["alg", "data", "iv", "tag", "v"]);
});

test("wrong key, wrong tenant AAD and damaged ciphertext fail authentication", () => {
  const encrypted = encryptTenantSmtpPassword(TENANT_A, "smtp-secret", {
    keyMaterial: KEY_A,
  });
  assert.throws(
    () => decryptTenantSmtpPassword(TENANT_A, encrypted, { keyMaterial: KEY_B }),
    /authentication failed/u,
  );
  assert.throws(
    () => decryptTenantSmtpPassword(TENANT_B, encrypted, { keyMaterial: KEY_A }),
    /authentication failed/u,
  );

  const envelope = JSON.parse(encrypted) as Record<string, unknown>;
  envelope.data = `${String(envelope.data).slice(0, -4)}AAAA`;
  assert.throws(
    () =>
      decryptTenantSmtpPassword(TENANT_A, JSON.stringify(envelope), {
        keyMaterial: KEY_A,
      }),
    /authentication failed|invalid data/u,
  );
});

test("missing encryption key fails closed without revealing the secret", () => {
  const current = process.env.FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY;
  const legacy = process.env.PLATFORM_EMAIL_CONFIG_ENCRYPTION_KEY;
  delete process.env.FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY;
  delete process.env.PLATFORM_EMAIL_CONFIG_ENCRYPTION_KEY;
  const secret = "must-not-appear-in-errors";
  try {
    assert.throws(
      () => encryptTenantSmtpPassword(TENANT_A, secret),
      (error: unknown) =>
        error instanceof Error &&
        /FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY/u.test(error.message) &&
        !error.message.includes(secret),
    );
  } finally {
    if (current === undefined) delete process.env.FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY;
    else process.env.FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY = current;
    if (legacy === undefined) delete process.env.PLATFORM_EMAIL_CONFIG_ENCRYPTION_KEY;
    else process.env.PLATFORM_EMAIL_CONFIG_ENCRYPTION_KEY = legacy;
  }
});

test("malformed and extended envelopes are rejected", () => {
  const encrypted = encryptTenantSmtpPassword(TENANT_A, "smtp-secret", {
    keyMaterial: KEY_A,
  });
  const envelope = JSON.parse(encrypted) as Record<string, unknown>;
  envelope.untrusted = "value";
  assert.throws(
    () =>
      decryptTenantSmtpPassword(TENANT_A, JSON.stringify(envelope), {
        keyMaterial: KEY_A,
      }),
    /envelope shape/u,
  );
  assert.throws(
    () => decryptTenantSmtpPassword(TENANT_A, "not-json", { keyMaterial: KEY_A }),
    /not valid JSON/u,
  );
});
