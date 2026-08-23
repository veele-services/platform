import assert from "node:assert/strict";
import test from "node:test";
import {
  computeObjectSecurityOtpHmac,
  decryptObjectSecurityPayload,
  encryptObjectSecurityPayload,
  generateObjectSecurityOtp,
  generateObjectSecurityUnlockHandle,
  hashObjectSecurityUnlockHandle,
  maskObjectSecurityEmail,
  objectSecurityAuthSessionId,
  objectSecurityBusinessEmailRevision,
  verifyObjectSecurityOtpHmac,
  type ObjectSecurityEncryptionContext,
} from "../../lib/db/src/object-security-crypto";

const keyring = {
  1: `hex:${"11".repeat(32)}`,
  2: `hex:${"22".repeat(32)}`,
};
const context: ObjectSecurityEncryptionContext = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  objectId: "22222222-2222-4222-8222-222222222222",
  recordId: "33333333-3333-4333-8333-333333333333",
  category: "alarm_code",
  version: 1,
  generation: 1,
};

test("object security payloads use authenticated encryption and explicit key versions", () => {
  const encrypted = encryptObjectSecurityPayload(
    { value: "1234", instruction: "Alleen tijdens de dienst" },
    context,
    { keyring, activeKeyVersion: 2 },
  );
  assert.equal(encrypted.keyVersion, 2);
  assert.doesNotMatch(encrypted.encryptedPayload, /1234|Alleen tijdens/u);
  assert.deepEqual(
    decryptObjectSecurityPayload(encrypted.encryptedPayload, context, { keyring }),
    { value: "1234", instruction: "Alleen tijdens de dienst" },
  );
});

test("ciphertext cannot move across tenant, object, category, version or generation", () => {
  const encrypted = encryptObjectSecurityPayload(
    { value: "secret" },
    context,
    { keyring, activeKeyVersion: 1 },
  );
  const changedContexts = [
    { ...context, tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    { ...context, objectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    { ...context, category: "key_code" },
    { ...context, version: 2 },
    { ...context, generation: 2 },
  ];
  for (const changed of changedContexts) {
    assert.throws(
      () => decryptObjectSecurityPayload(encrypted.encryptedPayload, changed, { keyring }),
      /authentication failed/u,
    );
  }
});

test("six digit OTPs use keyed HMAC and preserve leading zeroes", () => {
  const challengeId = "44444444-4444-4444-8444-444444444444";
  const options = { pepper: "p".repeat(64) };
  const hmac = computeObjectSecurityOtpHmac(challengeId, "000042", options);
  assert.match(hmac, /^[0-9a-f]{64}$/u);
  assert.equal(verifyObjectSecurityOtpHmac(challengeId, "000042", hmac, options), true);
  assert.equal(verifyObjectSecurityOtpHmac(challengeId, "000043", hmac, options), false);
  for (let index = 0; index < 100; index += 1) {
    assert.match(generateObjectSecurityOtp(), /^\d{6}$/u);
  }
});

test("opaque unlock handles are random, hash-only and e-mail is masked", () => {
  const first = generateObjectSecurityUnlockHandle();
  const second = generateObjectSecurityUnlockHandle();
  assert.notEqual(first, second);
  assert.match(hashObjectSecurityUnlockHandle(first), /^[0-9a-f]{64}$/u);
  assert.equal(maskObjectSecurityEmail("dienst@bedrijf.nl"), "d*****@bedrijf.nl");
  assert.equal(maskObjectSecurityEmail("invalid"), "Verborgen e-mailadres");
  assert.match(objectSecurityBusinessEmailRevision("DIENST@bedrijf.nl"), /^[0-9a-f]{64}$/u);
  assert.equal(
    objectSecurityBusinessEmailRevision("DIENST@bedrijf.nl"),
    objectSecurityBusinessEmailRevision("dienst@bedrijf.nl"),
  );
  const encodedClaims = Buffer.from(JSON.stringify({
    session_id: "55555555-5555-4555-8555-555555555555",
  })).toString("base64url");
  assert.equal(
    objectSecurityAuthSessionId(`header.${encodedClaims}.signature`),
    "55555555-5555-4555-8555-555555555555",
  );
  assert.throws(() => objectSecurityAuthSessionId("not-a-jwt"), /token is invalid/u);
});
