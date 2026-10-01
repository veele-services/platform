import { createHmac, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyAuthMailHook, verifySendGridEvent } from "./webhook-security";
const now = Date.UTC(2026, 9, 1), timestamp = String(now / 1000);
describe("mail webhook authenticity", () => {
  it("checks Standard Webhooks raw bytes, rotation signatures and timestamp", () => {
    const key = randomBytes(32), raw = Buffer.from('{"test":"fictitious"}'), signature = createHmac("sha256", key).update(`test-id.${timestamp}.`).update(raw).digest("base64");
    const headers = new Headers({ "webhook-id": "test-id", "webhook-timestamp": timestamp, "webhook-signature": `v1,invalid v1,${signature}` }), secret = `v1,whsec_${key.toString("base64")}`;
    expect(verifyAuthMailHook(raw, headers, secret, now)).toBe(true);
    expect(verifyAuthMailHook(Buffer.from('{}'), headers, secret, now)).toBe(false);
    expect(verifyAuthMailHook(raw, headers, secret, now + 301000)).toBe(false);
    headers.set("webhook-id", "other"); expect(verifyAuthMailHook(raw, headers, secret, now)).toBe(false);
  });
  it("checks SendGrid ECDSA signature, freshness and unmodified body", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), raw = Buffer.from('[{"event":"delivered"}]');
    const signature = sign("sha256", Buffer.concat([Buffer.from(timestamp), raw]), privateKey).toString("base64"), key = publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const headers = new Headers({ "x-twilio-email-event-webhook-timestamp": timestamp, "x-twilio-email-event-webhook-signature": signature });
    expect(verifySendGridEvent(raw, headers, key, now)).toBe(true);
    expect(verifySendGridEvent(Buffer.from("[]"), headers, key, now)).toBe(false);
    expect(verifySendGridEvent(raw, headers, key, now + 301000)).toBe(false);
    expect(verifySendGridEvent(raw, headers, "not a key", now)).toBe(false);
  });
});
