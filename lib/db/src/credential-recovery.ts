import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export type CredentialRecoverySurface = "tenant-backoffice" | "personnel-portal" | "customer-portal" | "platform-admin";
export type CredentialRecoveryPurpose = "activation" | "password-reset";
export type CredentialRecoveryState = "valid" | "expired" | "used" | "invalid" | "too-many-attempts" | "cooldown";

export const CREDENTIAL_RECOVERY_CODE_TTL_MS = 30 * 60 * 1000;
export const CREDENTIAL_RECOVERY_RESEND_COOLDOWN_MS = 2 * 60 * 1000;
export const CREDENTIAL_RECOVERY_MAX_ATTEMPTS = 6;

const LOOKUP_DOMAIN = "fieldgrid:v1:credential-recovery:lookup";
const CODE_DOMAIN = "fieldgrid:v1:credential-recovery:code";
const GRANT_DOMAIN = "fieldgrid:v1:credential-recovery:grant";

export function normalizeRecoveryAccountIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

export function generateCredentialRecoveryCode(): string {
  let code = "";
  for (let i = 0; i < 6; i += 1) code += String(randomInt(10));
  return code;
}

export function generateInternalAuthPassword(): string {
  return randomBytes(24).toString("base64url");
}

export function generateResetGrant(): string {
  return randomBytes(32).toString("base64url");
}

function requireRecoverySecret(secret = process.env.FIELDGRID_CREDENTIAL_RECOVERY_SECRET): string {
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "test" || process.env.CI) return "fieldgrid-ci-credential-recovery-secret-32b";
  throw new Error("FIELDGRID_CREDENTIAL_RECOVERY_SECRET is required for credential recovery.");
}

function hmacHex(domain: string, value: string, secret?: string): string {
  return createHmac("sha256", requireRecoverySecret(secret)).update(domain).update("\0").update(value).digest("hex");
}

export function credentialRecoveryLookupHmac(opts: {
  surface: CredentialRecoverySurface;
  tenantId: string | null;
  accountIdentifier: string;
  secret?: string;
}): string {
  const tenant = opts.surface === "platform-admin" ? "platform" : opts.tenantId;
  if (!tenant) throw new Error("Tenant-bound recovery surfaces require a tenant id.");
  return hmacHex(LOOKUP_DOMAIN, `${opts.surface}\0${tenant}\0${normalizeRecoveryAccountIdentifier(opts.accountIdentifier)}`, opts.secret);
}

export function credentialRecoveryCodeHash(opts: {
  lookupHmac: string;
  code: string;
  secret?: string;
}): string {
  return hmacHex(CODE_DOMAIN, `${opts.lookupHmac}\0${opts.code.trim()}`, opts.secret);
}

export function credentialRecoveryGrantHash(grant: string, secret?: string): string {
  return hmacHex(GRANT_DOMAIN, grant.trim(), secret);
}

export function safeCompareRecoveryDigest(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function classifyCredentialRecoveryChallenge(opts: {
  now?: Date;
  expiresAt: Date;
  attemptsRemaining: number;
  usedAt?: Date | null;
  invalidatedAt?: Date | null;
  resendAvailableAt?: Date | null;
  codeMatches?: boolean;
}): CredentialRecoveryState {
  const now = opts.now ?? new Date();
  if (opts.usedAt) return "used";
  if (opts.invalidatedAt) return "invalid";
  if (opts.expiresAt.getTime() <= now.getTime()) return "expired";
  if (opts.attemptsRemaining <= 0) return "too-many-attempts";
  if (opts.resendAvailableAt && opts.resendAvailableAt.getTime() > now.getTime()) return "cooldown";
  if (opts.codeMatches === false) return "invalid";
  return "valid";
}
