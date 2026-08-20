import { createCipheriv, createECDH, createHash, createHmac, randomBytes } from "node:crypto";
import { importJWK, SignJWT, type JWK } from "jose";

export type BrowserPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type WebPushPayload = {
  title: string;
  body?: string | null;
  href?: string | null;
  tag?: string | null;
  [key: string]: unknown;
};

export type WebPushSendResult =
  | { success: true; status: number }
  | {
      success: false;
      status: number;
      error: string;
      permanent: boolean;
    };
export type WebPushUrgency = "very-low" | "low" | "normal" | "high";

const MAX_PAYLOAD_BYTES = 3072;

type AnyBuffer = Buffer<ArrayBufferLike>;

function base64UrlToBuffer(value: string): AnyBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

function bufferToBase64Url(buffer: AnyBuffer): string {
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function hmacSha256(key: AnyBuffer, data: AnyBuffer): AnyBuffer {
  return createHmac("sha256", key).update(data).digest();
}

function hkdfExpand(prk: AnyBuffer, info: AnyBuffer, length: number): AnyBuffer {
  const blocks: AnyBuffer[] = [];
  let previous: AnyBuffer = Buffer.alloc(0);
  let counter = 1;

  while (Buffer.concat(blocks).length < length) {
    previous = hmacSha256(
      prk,
      Buffer.concat([previous, info, Buffer.from([counter])]),
    );
    blocks.push(previous);
    counter += 1;
  }

  return Buffer.concat(blocks).subarray(0, length);
}

function getVapidConfig() {
  const publicKey =
    process.env["VAPID_PUBLIC_KEY"] ??
    process.env["NEXT_PUBLIC_VAPID_PUBLIC_KEY"] ??
    "";
  const privateKey = process.env["VAPID_PRIVATE_KEY"] ?? "";
  const subject = process.env["VAPID_SUBJECT"] ?? "";

  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "VAPID_PUBLIC_KEY/NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must be configured.",
    );
  }

  const publicBytes = base64UrlToBuffer(publicKey);
  const privateBytes = base64UrlToBuffer(privateKey);

  if (publicBytes.length !== 65 || publicBytes[0] !== 4) {
    throw new Error("VAPID public key must be an uncompressed P-256 public key.");
  }

  if (privateBytes.length !== 32) {
    throw new Error("VAPID private key must be a 32-byte P-256 private key.");
  }

  return { publicKey, publicBytes, privateKey, subject };
}

async function createVapidAuthorization(endpoint: string): Promise<string> {
  const { publicKey, publicBytes, privateKey, subject } = getVapidConfig();
  const audience = new URL(endpoint).origin;
  const jwk: JWK = {
    kty: "EC",
    crv: "P-256",
    x: bufferToBase64Url(publicBytes.subarray(1, 33)),
    y: bufferToBase64Url(publicBytes.subarray(33, 65)),
    d: privateKey,
    ext: true,
  };
  const key = await importJWK(jwk, "ES256");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setAudience(audience)
    .setSubject(subject)
    .setExpirationTime("12h")
    .sign(key);

  return `vapid t=${token}, k=${publicKey}`;
}

function encryptPayload(subscription: BrowserPushSubscription, payload: WebPushPayload): Buffer {
  const receiverPublicKey = base64UrlToBuffer(subscription.p256dh);
  const authSecret = base64UrlToBuffer(subscription.auth);

  if (receiverPublicKey.length !== 65 || receiverPublicKey[0] !== 4) {
    throw new Error("Subscription p256dh key is invalid.");
  }

  if (authSecret.length === 0) {
    throw new Error("Subscription auth secret is invalid.");
  }

  const payloadBuffer = Buffer.from(JSON.stringify(payload), "utf8");
  if (payloadBuffer.length > MAX_PAYLOAD_BYTES) {
    throw new Error(`Push payload exceeds ${MAX_PAYLOAD_BYTES} bytes.`);
  }

  const ecdh = createECDH("prime256v1");
  const senderPublicKey = ecdh.generateKeys();
  const sharedSecret = ecdh.computeSecret(receiverPublicKey);

  const prkKey = hmacSha256(authSecret, sharedSecret);
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    receiverPublicKey,
    senderPublicKey,
  ]);
  const ikm = hkdfExpand(prkKey, keyInfo, 32);

  const salt = randomBytes(16);
  const prk = hmacSha256(salt, ikm);
  const contentEncryptionKey = hkdfExpand(
    prk,
    Buffer.from("Content-Encoding: aes128gcm\0", "utf8"),
    16,
  );
  const nonce = hkdfExpand(
    prk,
    Buffer.from("Content-Encoding: nonce\0", "utf8"),
    12,
  );
  const plaintext = Buffer.concat([payloadBuffer, Buffer.from([0x02])]);
  const cipher = createCipheriv("aes-128-gcm", contentEncryptionKey, nonce);
  const encrypted = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);

  return Buffer.concat([
    salt,
    recordSize,
    Buffer.from([senderPublicKey.length]),
    senderPublicKey,
    encrypted,
  ]);
}

export async function sendWebPush(
  subscription: BrowserPushSubscription,
  payload: WebPushPayload,
  ttlSeconds = 3600,
  urgency: WebPushUrgency = "normal",
): Promise<WebPushSendResult> {
  try {
    const body = encryptPayload(subscription, payload);
    const authorization = await createVapidAuthorization(subscription.endpoint);
    const topic = typeof payload.tag === "string"
      ? createHash("sha256").update(payload.tag).digest("base64url").slice(0, 32)
      : null;
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(ttlSeconds),
        Urgency: urgency,
        ...(topic ? { Topic: topic } : {}),
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });

    if (response.ok) {
      return { success: true, status: response.status };
    }

    const text = await response.text().catch(() => "");
    return {
      success: false,
      status: response.status,
      error: text || `Web Push service returned HTTP ${response.status}`,
      permanent: response.status === 404 || response.status === 410,
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      error: error instanceof Error ? error.message : "Unknown Web Push error",
      permanent: false,
    };
  }
}
