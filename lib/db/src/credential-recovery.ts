import {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

export type CredentialRecoverySurface =
  | "tenant-backoffice"
  | "personnel-portal"
  | "customer-portal"
  | "platform-admin";
export type CredentialRecoveryPurpose = "activation" | "password-reset";
export type CredentialRecoveryState =
  | "valid"
  | "processing"
  | "expired"
  | "used"
  | "invalid"
  | "too-many-attempts"
  | "cooldown";

export const CREDENTIAL_RECOVERY_CODE_TTL_MS = 30 * 60 * 1000;
export const CREDENTIAL_RECOVERY_GRANT_TTL_MS = 10 * 60 * 1000;
export const CREDENTIAL_RECOVERY_RESEND_COOLDOWN_MS = 2 * 60 * 1000;
export const CREDENTIAL_RECOVERY_MAX_ATTEMPTS = 6;
export const CREDENTIAL_RECOVERY_CODE_DIGITS = 8;
export const CREDENTIAL_RECOVERY_GENERIC_RESPONSE =
  "Als dit account bestaat, ontvangt u een e-mail met de vervolgstappen.";

const LOOKUP_DOMAIN = "fieldgrid:v1:credential-recovery:lookup";
const CODE_DOMAIN = "fieldgrid:v1:credential-recovery:code";
const GRANT_DOMAIN = "fieldgrid:v1:credential-recovery:grant";
const FINGERPRINT_DOMAIN = "fieldgrid:v1:credential-recovery:fingerprint";
const HANDOFF_DOMAIN = "fieldgrid:v1:credential-recovery:handoff";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function normalizeRecoveryAccountIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

export function generateCredentialRecoveryCode(): string {
  let code = "";
  for (let i = 0; i < CREDENTIAL_RECOVERY_CODE_DIGITS; i += 1)
    code += String(randomInt(10));
  return code;
}

export function generateInternalAuthPassword(): string {
  return randomBytes(24).toString("base64url");
}

export function generateResetGrant(): string {
  return randomBytes(32).toString("base64url");
}

function requireRecoverySecret(
  secret = process.env.FIELDGRID_CREDENTIAL_RECOVERY_SECRET,
): string {
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "test" || process.env.CI)
    return "fieldgrid-ci-credential-recovery-secret-32b";
  throw new Error(
    "FIELDGRID_CREDENTIAL_RECOVERY_SECRET is required for credential recovery.",
  );
}

function hmacHex(domain: string, value: string, secret?: string): string {
  return createHmac("sha256", requireRecoverySecret(secret))
    .update(domain)
    .update("\0")
    .update(value)
    .digest("hex");
}

export function credentialRecoveryLookupHmac(opts: {
  surface: CredentialRecoverySurface;
  tenantId: string | null;
  accountIdentifier: string;
  secret?: string;
}): string {
  const tenant = opts.surface === "platform-admin" ? "platform" : opts.tenantId;
  if (!tenant)
    throw new Error("Tenant-bound recovery surfaces require a tenant id.");
  return hmacHex(
    LOOKUP_DOMAIN,
    `${opts.surface}\0${tenant}\0${normalizeRecoveryAccountIdentifier(opts.accountIdentifier)}`,
    opts.secret,
  );
}

export function credentialRecoveryRequestFingerprintHmac(opts: {
  networkSignal?: string | null;
  clientSignal?: string | null;
  secret?: string;
}): string {
  const network = opts.networkSignal?.trim().toLowerCase() || "unknown-network";
  const client =
    opts.clientSignal?.trim().toLowerCase().slice(0, 512) || "unknown-client";
  return hmacHex(FINGERPRINT_DOMAIN, `${network}\0${client}`, opts.secret);
}

export function credentialRecoveryCodeHash(opts: {
  lookupHmac: string;
  code: string;
  secret?: string;
}): string {
  return hmacHex(
    CODE_DOMAIN,
    `${opts.lookupHmac}\0${opts.code.trim()}`,
    opts.secret,
  );
}

export function credentialRecoveryGrantHash(
  grant: string,
  secret?: string,
): string {
  return hmacHex(GRANT_DOMAIN, grant.trim(), secret);
}

/**
 * Build an opaque, integrity-protected reference for a recovery e-mail link.
 *
 * The handoff deliberately contains neither the account identifier nor the
 * recovery code. Possession of this reference is not sufficient to reset a
 * password: the separately delivered one-time code is still required.
 */
export function createCredentialRecoveryHandoff(
  challengeId: string,
  secret?: string,
): string {
  const normalizedChallengeId = challengeId.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalizedChallengeId)) {
    throw new Error(
      "Credential recovery handoff requires a valid challenge id.",
    );
  }
  return `${normalizedChallengeId}.${hmacHex(
    HANDOFF_DOMAIN,
    normalizedChallengeId,
    secret,
  )}`;
}

export function verifyCredentialRecoveryHandoff(
  handoff: string,
  secret?: string,
): string | null {
  const [challengeId, signature, extra] = handoff.trim().split(".");
  if (
    extra !== undefined ||
    !challengeId ||
    !signature ||
    !UUID_PATTERN.test(challengeId) ||
    !/^[0-9a-f]{64}$/u.test(signature)
  ) {
    return null;
  }

  const expected = hmacHex(HANDOFF_DOMAIN, challengeId, secret);
  return safeCompareRecoveryDigest(signature, expected) ? challengeId : null;
}

export function safeCompareRecoveryDigest(
  left: string,
  right: string,
): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
function recoveryTimestampMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function classifyCredentialRecoveryChallenge(opts: {
  now?: Date;
  expiresAt: Date | string;
  attemptsRemaining: number;
  usedAt?: Date | string | null;
  invalidatedAt?: Date | string | null;
  resendAvailableAt?: Date | string | null;
  codeMatches?: boolean;
}): CredentialRecoveryState {
  const now = opts.now ?? new Date();
  if (opts.usedAt) return "used";
  if (opts.invalidatedAt) return "invalid";
  if (recoveryTimestampMs(opts.expiresAt) <= now.getTime()) return "expired";
  if (opts.attemptsRemaining <= 0) return "too-many-attempts";
  if (opts.codeMatches === false) return "invalid";
  return "valid";
}

export function resolveCredentialRecoveryOrigin(opts: {
  configuredOrigin: string;
  allowedOrigins?: readonly string[];
  allowHttpLocalhost?: boolean;
  deploymentEnvironment?: "staging" | "production";
}): string {
  const candidate = new URL(opts.configuredOrigin);
  const localHttp =
    opts.allowHttpLocalhost === true &&
    candidate.protocol === "http:" &&
    (candidate.hostname === "localhost" || candidate.hostname === "127.0.0.1");
  if (candidate.protocol !== "https:" && !localHttp) {
    throw new Error(
      "Credential recovery requires an HTTPS application origin.",
    );
  }
  if (candidate.username || candidate.password) {
    throw new Error("Credential recovery origins may not contain credentials.");
  }
  const deploymentEnvironment =
    opts.deploymentEnvironment ??
    (process.env.APP_ENV === "staging" || process.env.APP_ENV === "production"
      ? process.env.APP_ENV
      : null);
  const fieldgridOwned =
    candidate.hostname === "fieldgrid.nl" ||
    candidate.hostname.endsWith(".fieldgrid.nl");
  if (
    deploymentEnvironment === "staging" &&
    fieldgridOwned &&
    candidate.hostname !== "staging.fieldgrid.nl" &&
    !candidate.hostname.endsWith(".staging.fieldgrid.nl")
  ) {
    throw new Error(
      "Credential recovery staging origin belongs to production.",
    );
  }
  if (
    deploymentEnvironment === "production" &&
    (candidate.hostname === "staging.fieldgrid.nl" ||
      candidate.hostname.endsWith(".staging.fieldgrid.nl"))
  ) {
    throw new Error(
      "Credential recovery production origin belongs to staging.",
    );
  }
  const origin = candidate.origin;
  const allowlist = new Set(
    (opts.allowedOrigins ?? [origin]).map((value) => new URL(value).origin),
  );
  if (!allowlist.has(origin))
    throw new Error("Credential recovery origin is not allowlisted.");
  return origin;
}
