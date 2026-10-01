import { createHmac, createPublicKey, timingSafeEqual, verify } from "node:crypto";

function recent(timestamp: string | null, now: number) {
  return timestamp !== null && /^\d{10}$/.test(timestamp) && Math.abs(now / 1000 - Number(timestamp)) <= 300;
}
/** Verify raw bytes before parsing. Never log the body: Auth hooks contain OTPs. */
export function verifyAuthMailHook(raw: Uint8Array, headers: Headers, secret: string, now = Date.now()) {
  const id = headers.get("webhook-id"), timestamp = headers.get("webhook-timestamp"), signature = headers.get("webhook-signature");
  if (!id || id.length > 200 || !recent(timestamp, now) || !signature || signature.length > 2000 || raw.byteLength > 131072) return false;
  const encoded = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
  const key = Buffer.from(encoded, "base64"); if (key.byteLength < 32) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.`).update(raw).digest();
  return signature.split(/\s+/).some(part => {
    const [version, value] = part.split(","); if (version !== "v1" || !value) return false;
    const supplied = Buffer.from(value, "base64"); return supplied.byteLength === expected.byteLength && timingSafeEqual(supplied, expected);
  });
}
export function verifySendGridEvent(raw: Uint8Array, headers: Headers, publicKey: string, now = Date.now()) {
  const timestamp = headers.get("x-twilio-email-event-webhook-timestamp"), signature = headers.get("x-twilio-email-event-webhook-signature");
  if (!recent(timestamp, now) || !signature || signature.length > 500 || raw.byteLength > 1048576) return false;
  try {
    const key = publicKey.includes("BEGIN PUBLIC KEY") ? createPublicKey(publicKey) : createPublicKey({ key: Buffer.from(publicKey, "base64"), type: "spki", format: "der" });
    if (key.asymmetricKeyType !== "ec") return false;
    return verify("sha256", Buffer.concat([Buffer.from(timestamp!), raw]), key, Buffer.from(signature, "base64"));
  } catch { return false; }
}
