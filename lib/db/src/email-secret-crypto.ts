import crypto from "node:crypto";

const ENCRYPTION_KEY_ENV = "FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY";
const LEGACY_ENCRYPTION_KEY_ENV = "PLATFORM_EMAIL_CONFIG_ENCRYPTION_KEY";
const ALGORITHM = "aes-256-gcm";
const ENVELOPE_VERSION = 1;

type EncryptedEmailSecretEnvelope = {
  v: typeof ENVELOPE_VERSION;
  alg: typeof ALGORITHM;
  iv: string;
  tag: string;
  data: string;
};

type EmailSecretCryptoOptions = {
  aad?: string;
  keyMaterial?: string;
};

function encryptionKey(keyMaterial?: string): Buffer {
  const secret =
    keyMaterial ??
    process.env[ENCRYPTION_KEY_ENV] ??
    process.env[LEGACY_ENCRYPTION_KEY_ENV];
  if (!secret) {
    throw new Error(`${ENCRYPTION_KEY_ENV} must be set before using e-mail secrets.`);
  }

  if (secret.startsWith("base64:")) {
    const decoded = Buffer.from(secret.slice("base64:".length), "base64");
    if (decoded.length === 32) return decoded;
    throw new Error(`${ENCRYPTION_KEY_ENV} base64 value must decode to 32 bytes.`);
  }

  if (secret.startsWith("hex:")) {
    const encoded = secret.slice("hex:".length);
    if (!/^[0-9a-f]{64}$/iu.test(encoded)) {
      throw new Error(`${ENCRYPTION_KEY_ENV} hex value must contain 64 hexadecimal characters.`);
    }
    return Buffer.from(encoded, "hex");
  }

  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

function decodeBase64Field(value: unknown, field: string, expectedLength?: number): Buffer {
  if (typeof value !== "string" || value.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) {
    throw new Error(`Encrypted e-mail secret has an invalid ${field} field.`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    throw new Error(`Encrypted e-mail secret has a non-canonical ${field} field.`);
  }
  if (expectedLength !== undefined && decoded.length !== expectedLength) {
    throw new Error(`Encrypted e-mail secret has an invalid ${field} length.`);
  }
  return decoded;
}

function parseEnvelope(value: string): EncryptedEmailSecretEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Encrypted e-mail secret is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Encrypted e-mail secret envelope is invalid.");
  }
  const record = parsed as Record<string, unknown>;
  if (record.v !== ENVELOPE_VERSION || record.alg !== ALGORITHM) {
    throw new Error("Encrypted e-mail secret envelope version or algorithm is unsupported.");
  }
  if (
    !["v", "alg", "iv", "tag", "data"].every((key) => Object.hasOwn(record, key)) ||
    Object.keys(record).some((key) => !["v", "alg", "iv", "tag", "data"].includes(key))
  ) {
    throw new Error("Encrypted e-mail secret envelope shape is invalid.");
  }
  return record as EncryptedEmailSecretEnvelope;
}

export function assertEmailEncryptionKeyConfigured(options: EmailSecretCryptoOptions = {}): void {
  encryptionKey(options.keyMaterial);
}

export function encryptEmailSecretJson(
  secret: Record<string, unknown>,
  options: EmailSecretCryptoOptions = {},
): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(options.keyMaterial), iv);
  if (options.aad) cipher.setAAD(Buffer.from(options.aad, "utf8"));
  const plaintext = Buffer.from(JSON.stringify(secret), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope: EncryptedEmailSecretEnvelope = {
    v: ENVELOPE_VERSION,
    alg: ALGORITHM,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
  };
  return JSON.stringify(envelope);
}

export function decryptEmailSecretJson(
  value: string,
  options: EmailSecretCryptoOptions = {},
): Record<string, unknown> {
  const envelope = parseEnvelope(value);
  const iv = decodeBase64Field(envelope.iv, "iv", 12);
  const tag = decodeBase64Field(envelope.tag, "tag", 16);
  const data = decodeBase64Field(envelope.data, "data");
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    encryptionKey(options.keyMaterial),
    iv,
  );
  if (options.aad) decipher.setAAD(Buffer.from(options.aad, "utf8"));
  decipher.setAuthTag(tag);
  let decrypted: string;
  try {
    decrypted = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Encrypted e-mail secret authentication failed.");
  }
  const parsed = JSON.parse(decrypted) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Decrypted e-mail secret payload is invalid.");
  }
  return parsed as Record<string, unknown>;
}

function tenantSmtpAad(tenantId: string): string {
  const normalized = tenantId.trim().toLowerCase();
  if (!normalized) throw new Error("Tenant-id is required for an SMTP secret.");
  return `fieldgrid:tenant-smtp-password:v1:${normalized}`;
}

export function encryptTenantSmtpPassword(
  tenantId: string,
  password: string,
  options: Omit<EmailSecretCryptoOptions, "aad"> = {},
): string {
  if (!password || password.length > 4096) {
    throw new Error("SMTP password must contain between 1 and 4096 characters.");
  }
  return encryptEmailSecretJson(
    { password },
    { ...options, aad: tenantSmtpAad(tenantId) },
  );
}

export function decryptTenantSmtpPassword(
  tenantId: string,
  encryptedPassword: string | null | undefined,
  options: Omit<EmailSecretCryptoOptions, "aad"> = {},
): string | null {
  if (!encryptedPassword) return null;
  const decrypted = decryptEmailSecretJson(encryptedPassword, {
    ...options,
    aad: tenantSmtpAad(tenantId),
  });
  if (
    typeof decrypted.password !== "string" ||
    !decrypted.password ||
    decrypted.password.length > 4096 ||
    Object.keys(decrypted).some((key) => key !== "password")
  ) {
    throw new Error("Decrypted tenant SMTP secret payload is invalid.");
  }
  return decrypted.password;
}
