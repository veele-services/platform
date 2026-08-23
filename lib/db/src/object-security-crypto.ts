import crypto from "node:crypto";

const ENCRYPTION_KEYS_ENV = "FIELDGRID_OBJECT_SECURITY_ENCRYPTION_KEYS";
const ACTIVE_KEY_VERSION_ENV = "FIELDGRID_OBJECT_SECURITY_ACTIVE_KEY_VERSION";
const OTP_PEPPER_ENV = "FIELDGRID_OBJECT_SECURITY_OTP_PEPPER";
const ALGORITHM = "aes-256-gcm";
const ENVELOPE_VERSION = 1;

export type ObjectSecurityEncryptionContext = {
  tenantId: string;
  objectId: string;
  recordId: string;
  category: string;
  version: number;
  generation: number;
};

type EncryptedObjectSecurityEnvelope = {
  v: typeof ENVELOPE_VERSION;
  alg: typeof ALGORITHM;
  keyVersion: number;
  iv: string;
  tag: string;
  data: string;
};

type ObjectSecurityCryptoOptions = {
  activeKeyVersion?: number;
  keyring?: Readonly<Record<number, string>>;
};

type OtpCryptoOptions = {
  pepper?: string;
};

function decodeKeyMaterial(value: string, label: string): Buffer {
  if (value.startsWith("base64:")) {
    const decoded = Buffer.from(value.slice("base64:".length), "base64");
    if (decoded.length === 32) return decoded;
    throw new Error(`${label} base64 value must decode to 32 bytes.`);
  }
  if (value.startsWith("hex:")) {
    const encoded = value.slice("hex:".length);
    if (!/^[0-9a-f]{64}$/iu.test(encoded)) {
      throw new Error(`${label} hex value must contain 64 hexadecimal characters.`);
    }
    return Buffer.from(encoded, "hex");
  }
  throw new Error(`${label} must use a base64: or hex: prefix.`);
}

function configuredKeyring(
  supplied?: Readonly<Record<number, string>>,
): Readonly<Record<number, string>> {
  if (supplied) return supplied;
  const raw = process.env[ENCRYPTION_KEYS_ENV];
  if (!raw) throw new Error(`${ENCRYPTION_KEYS_ENV} must be configured.`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${ENCRYPTION_KEYS_ENV} must be a JSON object.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${ENCRYPTION_KEYS_ENV} must be a JSON object.`);
  }

  const keyring: Record<number, string> = {};
  for (const [rawVersion, material] of Object.entries(parsed)) {
    const version = Number(rawVersion);
    if (!Number.isSafeInteger(version) || version < 1 || typeof material !== "string") {
      throw new Error(`${ENCRYPTION_KEYS_ENV} contains an invalid key version.`);
    }
    decodeKeyMaterial(material, `${ENCRYPTION_KEYS_ENV}[${version}]`);
    keyring[version] = material;
  }
  if (Object.keys(keyring).length === 0) {
    throw new Error(`${ENCRYPTION_KEYS_ENV} must contain at least one key.`);
  }
  return keyring;
}

function activeKeyVersion(options: ObjectSecurityCryptoOptions): number {
  const raw = options.activeKeyVersion ?? Number(process.env[ACTIVE_KEY_VERSION_ENV]);
  if (!Number.isSafeInteger(raw) || raw < 1) {
    throw new Error(`${ACTIVE_KEY_VERSION_ENV} must be a positive integer.`);
  }
  return raw;
}

function encryptionKey(
  version: number,
  options: ObjectSecurityCryptoOptions,
): Buffer {
  const keyring = configuredKeyring(options.keyring);
  const material = keyring[version];
  if (!material) throw new Error(`Object security encryption key version ${version} is unavailable.`);
  return decodeKeyMaterial(material, `${ENCRYPTION_KEYS_ENV}[${version}]`);
}

function normalizedUuid(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(normalized)) {
    throw new Error(`${label} must be a UUID.`);
  }
  return normalized;
}

function associatedData(context: ObjectSecurityEncryptionContext): string {
  if (!context.category.trim()) throw new Error("Object security category is required.");
  if (!Number.isSafeInteger(context.version) || context.version < 1) {
    throw new Error("Object security version must be positive.");
  }
  if (!Number.isSafeInteger(context.generation) || context.generation < 1) {
    throw new Error("Object security generation must be positive.");
  }
  return [
    "fieldgrid:object-security:v1",
    normalizedUuid(context.tenantId, "Tenant id"),
    normalizedUuid(context.objectId, "Object id"),
    normalizedUuid(context.recordId, "Record id"),
    context.category.trim(),
    String(context.version),
    String(context.generation),
  ].join(":");
}

function canonicalBase64(value: unknown, label: string, length?: number): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) {
    throw new Error(`Encrypted object security payload has an invalid ${label}.`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value || (length !== undefined && decoded.length !== length)) {
    throw new Error(`Encrypted object security payload has an invalid ${label}.`);
  }
  return decoded;
}

function parseEnvelope(value: string): EncryptedObjectSecurityEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Encrypted object security payload is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Encrypted object security payload is invalid.");
  }
  const record = parsed as Record<string, unknown>;
  const allowed = ["v", "alg", "keyVersion", "iv", "tag", "data"];
  if (
    record.v !== ENVELOPE_VERSION ||
    record.alg !== ALGORITHM ||
    !Number.isSafeInteger(record.keyVersion) ||
    Number(record.keyVersion) < 1 ||
    allowed.some((key) => !Object.hasOwn(record, key)) ||
    Object.keys(record).some((key) => !allowed.includes(key))
  ) {
    throw new Error("Encrypted object security envelope is unsupported.");
  }
  return record as EncryptedObjectSecurityEnvelope;
}

export function assertObjectSecurityCryptoConfigured(
  options: ObjectSecurityCryptoOptions = {},
): void {
  const version = activeKeyVersion(options);
  encryptionKey(version, options);
  otpPepper();
}

export function encryptObjectSecurityPayload(
  payload: Readonly<Record<string, unknown>>,
  context: ObjectSecurityEncryptionContext,
  options: ObjectSecurityCryptoOptions = {},
): { encryptedPayload: string; keyVersion: number } {
  if (Object.keys(payload).length === 0) throw new Error("Object security payload is empty.");
  const keyVersion = activeKeyVersion(options);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(keyVersion, options), iv);
  cipher.setAAD(Buffer.from(associatedData(context), "utf8"));
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
    cipher.final(),
  ]);
  const envelope: EncryptedObjectSecurityEnvelope = {
    v: ENVELOPE_VERSION,
    alg: ALGORITHM,
    keyVersion,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
  };
  return { encryptedPayload: JSON.stringify(envelope), keyVersion };
}

export function decryptObjectSecurityPayload(
  encryptedPayload: string,
  context: ObjectSecurityEncryptionContext,
  options: ObjectSecurityCryptoOptions = {},
): Readonly<Record<string, unknown>> {
  const envelope = parseEnvelope(encryptedPayload);
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    encryptionKey(envelope.keyVersion, options),
    canonicalBase64(envelope.iv, "iv", 12),
  );
  decipher.setAAD(Buffer.from(associatedData(context), "utf8"));
  decipher.setAuthTag(canonicalBase64(envelope.tag, "tag", 16));
  let plaintext: string;
  try {
    plaintext = Buffer.concat([
      decipher.update(canonicalBase64(envelope.data, "data")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Encrypted object security payload authentication failed.");
  }
  const parsed = JSON.parse(plaintext) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Decrypted object security payload is invalid.");
  }
  return parsed as Readonly<Record<string, unknown>>;
}

function otpPepper(options: OtpCryptoOptions = {}): string {
  const pepper = options.pepper ?? process.env[OTP_PEPPER_ENV];
  if (!pepper || Buffer.byteLength(pepper, "utf8") < 32) {
    throw new Error(`${OTP_PEPPER_ENV} must contain at least 32 bytes.`);
  }
  return pepper;
}

export function generateObjectSecurityOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function computeObjectSecurityOtpHmac(
  challengeId: string,
  code: string,
  options: OtpCryptoOptions = {},
): string {
  if (!/^\d{6}$/u.test(code)) throw new Error("OTP must contain exactly six digits.");
  const challenge = normalizedUuid(challengeId, "Challenge id");
  return crypto
    .createHmac("sha256", otpPepper(options))
    .update(`fieldgrid:object-security-otp:v1:${challenge}:${code}`, "utf8")
    .digest("hex");
}

export function verifyObjectSecurityOtpHmac(
  challengeId: string,
  code: string,
  expectedHmac: string,
  options: OtpCryptoOptions = {},
): boolean {
  if (!/^[0-9a-f]{64}$/u.test(expectedHmac)) return false;
  const actual = computeObjectSecurityOtpHmac(challengeId, code, options);
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expectedHmac, "hex"));
}

export function generateObjectSecurityUnlockHandle(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashObjectSecurityUnlockHandle(handle: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(handle)) throw new Error("Unlock handle is invalid.");
  return crypto
    .createHash("sha256")
    .update(`fieldgrid:object-security-unlock:v1:${handle}`, "utf8")
    .digest("hex");
}

function contextRevision(domain: string, value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) throw new Error(`${domain} context is required.`);
  return crypto
    .createHash("sha256")
    .update(`fieldgrid:object-security:${domain}:v1:${normalized}`, "utf8")
    .digest("hex");
}

/**
 * Non-reversible binding for the server-sourced verified business address.
 * The address itself never needs to be copied into challenge/session rows.
 */
export function objectSecurityBusinessEmailRevision(email: string, verifiedAt: string): string {
  return contextRevision("business-email", `${email}:${verifiedAt}`);
}

/** Extract the server-verified Supabase session id without persisting a JWT. */
export function objectSecurityAuthSessionId(accessToken: string): string {
  const parts = accessToken.split(".");
  if (parts.length !== 3 || !parts[1]) throw new Error("Auth session token is invalid.");
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("Auth session token claims are invalid.");
  }
  const sessionId = claims && typeof claims === "object"
    ? (claims as Record<string, unknown>).session_id
    : null;
  if (typeof sessionId !== "string") throw new Error("Auth session id is unavailable.");
  return normalizedUuid(sessionId, "Auth session id");
}

export function maskObjectSecurityEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.indexOf("@");
  if (at < 1 || at === normalized.length - 1) return "Verborgen e-mailadres";
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  return `${local[0]}${"*".repeat(Math.max(3, Math.min(local.length - 1, 8)))}@${domain}`;
}
