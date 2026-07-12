import crypto from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "./connection";
import { credentialChallengesTable, credentialResetGrantsTable, type CredentialChallengePurpose, type CredentialPortal } from "./schema";

export const CREDENTIAL_CHALLENGE_HMAC_SECRET_ENV = "FIELDGRID_CREDENTIAL_CHALLENGE_HMAC_KEY";
export const CREDENTIAL_CHALLENGE_KEY_VERSION_ENV = "FIELDGRID_CREDENTIAL_CHALLENGE_KEY_VERSION";
export const CREDENTIAL_CHALLENGE_GENERIC_MESSAGE = "Als dit account bekend is, ontvangt u een e-mail met een herstelcode.";
export const CREDENTIAL_CHALLENGE_LIMITS = { codeDigits: 8, expiresMinutes: 30, grantExpiresMinutes: 15, maxAttempts: 5, resendCooldownSeconds: 120, rateWindowMinutes: 60, ipWindowLimit: 20, accountWindowLimit: 5, tenantWindowLimit: 100, globalWindowLimit: 500 } as const;

function requiredSecret() {
  const key = process.env[CREDENTIAL_CHALLENGE_HMAC_SECRET_ENV];
  const version = process.env[CREDENTIAL_CHALLENGE_KEY_VERSION_ENV];
  if (!key || key.length < 32) throw new Error(CREDENTIAL_CHALLENGE_HMAC_SECRET_ENV + " must be set to at least 32 characters.");
  if (!version) throw new Error(CREDENTIAL_CHALLENGE_KEY_VERSION_ENV + " must be set.");
  return { key, version };
}
function hmac(value: string): string { return crypto.createHmac("sha256", requiredSecret().key).update(value, "utf8").digest("hex"); }
function normalizeEmail(value: string): string { return value.trim().toLowerCase(); }
function normalizeHost(value: string): string { return value.trim().toLowerCase().replace(/\/+$/u, ""); }
function normalizeCode(value: string): string { return value.replace(/\D/gu, ""); }
function hashNullable(label: string, value?: string | null): string | null { return value ? hmac(label + ":" + value.trim().toLowerCase()) : null; }
function addMinutes(date: Date, minutes: number): Date { return new Date(date.getTime() + minutes * 60 * 1000); }
function challengeCodeHash(input: { challengeId: string; purpose: string; portal: string; tenantId?: string | null; hostClass: string; code: string }): string {
  return hmac(["code", input.challengeId, input.purpose, input.portal, input.tenantId ?? "platform", normalizeHost(input.hostClass), normalizeCode(input.code)].join(":"));
}
function grantHash(grantId: string, secret: string): string { return hmac("grant:" + grantId + ":" + secret); }
function timingSafeHexEqual(a: string, b: string): boolean { const left = Buffer.from(a, "hex"); const right = Buffer.from(b, "hex"); return left.length === right.length && crypto.timingSafeEqual(left, right); }
export function generateCredentialChallengeCode(digits = CREDENTIAL_CHALLENGE_LIMITS.codeDigits): string { let code = ""; for (let i = 0; i < digits; i += 1) code += String(crypto.randomInt(10)); return code; }
export function createSyntheticCredentialChallengeResponse() { return { success: true as const, message: CREDENTIAL_CHALLENGE_GENERIC_MESSAGE, challengeId: crypto.randomUUID(), delivered: false }; }
export type CredentialChallengeRequest = { purpose: CredentialChallengePurpose; userId: string; email: string; portal: CredentialPortal; tenantId?: string | null; hostClass: string; ip?: string | null; userAgent?: string | null; metadata?: Record<string, unknown> };
export async function createCredentialChallenge(input: CredentialChallengeRequest) {
  const now = new Date();
  const id = crypto.randomUUID();
  const code = generateCredentialChallengeCode();
  const hostClass = normalizeHost(input.hostClass);
  const emailHmac = hmac("email:" + normalizeEmail(input.email));
  const ipHash = hashNullable("ip", input.ip);
  const uaHash = hashNullable("ua", input.userAgent);
  const windowStart = new Date(now.getTime() - CREDENTIAL_CHALLENGE_LIMITS.rateWindowMinutes * 60 * 1000);
  const recentRows = await db.select({ count: sql<number>`count(*)::int` }).from(credentialChallengesTable).where(and(eq(credentialChallengesTable.purpose, input.purpose), gt(credentialChallengesTable.createdAt, windowStart)));
  if ((recentRows[0]?.count ?? 0) >= CREDENTIAL_CHALLENGE_LIMITS.globalWindowLimit) throw new Error("Credential challenge global rate limit exceeded.");
  const activeRows = await db.select({ createdAt: credentialChallengesTable.createdAt }).from(credentialChallengesTable).where(and(eq(credentialChallengesTable.purpose, input.purpose), eq(credentialChallengesTable.userId, input.userId), eq(credentialChallengesTable.portal, input.portal), input.tenantId ? eq(credentialChallengesTable.tenantId, input.tenantId) : isNull(credentialChallengesTable.tenantId), eq(credentialChallengesTable.hostClass, hostClass), isNull(credentialChallengesTable.consumedAt), isNull(credentialChallengesTable.invalidatedAt))).limit(1);
  if (activeRows[0]?.createdAt && activeRows[0].createdAt.getTime() > now.getTime() - CREDENTIAL_CHALLENGE_LIMITS.resendCooldownSeconds * 1000) throw new Error("Credential challenge resend cooldown is active.");
  const { version } = requiredSecret();
  const expiresAt = addMinutes(now, CREDENTIAL_CHALLENGE_LIMITS.expiresMinutes);
  const codeHash = challengeCodeHash({ challengeId: id, purpose: input.purpose, portal: input.portal, tenantId: input.tenantId, hostClass, code });
  await db.transaction(async (tx) => {
    await tx.update(credentialChallengesTable).set({ invalidatedAt: now, status: "invalidated" }).where(and(eq(credentialChallengesTable.purpose, input.purpose), eq(credentialChallengesTable.userId, input.userId), eq(credentialChallengesTable.portal, input.portal), input.tenantId ? eq(credentialChallengesTable.tenantId, input.tenantId) : isNull(credentialChallengesTable.tenantId), eq(credentialChallengesTable.hostClass, hostClass), isNull(credentialChallengesTable.consumedAt), isNull(credentialChallengesTable.invalidatedAt)));
    await tx.insert(credentialChallengesTable).values({ id, purpose: input.purpose, userId: input.userId, portal: input.portal, tenantId: input.tenantId ?? null, hostClass, emailHmac, codeHash, keyVersion: version, expiresAt, maxAttempts: CREDENTIAL_CHALLENGE_LIMITS.maxAttempts, requestIpHash: ipHash, userAgentHash: uaHash, metadata: input.metadata ?? {} });
  });
  return { success: true as const, message: CREDENTIAL_CHALLENGE_GENERIC_MESSAGE, challengeId: id, delivered: true, code, emailHmac };
}
export async function verifyCredentialChallenge(input: { challengeId: string; purpose: CredentialChallengePurpose; code: string; portal: CredentialPortal; tenantId?: string | null; hostClass: string }) {
  const hostClass = normalizeHost(input.hostClass);
  const rows = await db.select().from(credentialChallengesTable).where(and(eq(credentialChallengesTable.id, input.challengeId), eq(credentialChallengesTable.purpose, input.purpose), eq(credentialChallengesTable.portal, input.portal), input.tenantId ? eq(credentialChallengesTable.tenantId, input.tenantId) : isNull(credentialChallengesTable.tenantId), eq(credentialChallengesTable.hostClass, hostClass), isNull(credentialChallengesTable.consumedAt), isNull(credentialChallengesTable.invalidatedAt))).limit(1);
  const challenge = rows[0];
  if (!challenge) return { success: false as const, reason: "invalid" as const };
  const now = new Date();
  if (challenge.expiresAt <= now) { await db.update(credentialChallengesTable).set({ invalidatedAt: now, status: "expired" }).where(eq(credentialChallengesTable.id, challenge.id)); return { success: false as const, reason: "expired" as const }; }
  if (challenge.attempts >= challenge.maxAttempts) return { success: false as const, reason: "attempts_exceeded" as const };
  const submittedHash = challengeCodeHash({ challengeId: challenge.id, purpose: challenge.purpose, portal: challenge.portal, tenantId: challenge.tenantId, hostClass, code: input.code });
  if (!timingSafeHexEqual(submittedHash, challenge.codeHash)) {
    const nextAttempts = challenge.attempts + 1;
    await db.update(credentialChallengesTable).set({ attempts: nextAttempts, invalidatedAt: nextAttempts >= challenge.maxAttempts ? now : null, status: nextAttempts >= challenge.maxAttempts ? "invalidated" : challenge.status }).where(eq(credentialChallengesTable.id, challenge.id));
    return nextAttempts >= challenge.maxAttempts ? { success: false as const, reason: "attempts_exceeded" as const } : { success: false as const, reason: "invalid" as const };
  }
  const grantId = crypto.randomUUID();
  const grantSecret = crypto.randomBytes(32).toString("base64url");
  const { version } = requiredSecret();
  await db.transaction(async (tx) => {
    await tx.update(credentialChallengesTable).set({ verifiedAt: now, status: "verified" }).where(and(eq(credentialChallengesTable.id, challenge.id), isNull(credentialChallengesTable.verifiedAt), isNull(credentialChallengesTable.consumedAt), isNull(credentialChallengesTable.invalidatedAt)));
    await tx.insert(credentialResetGrantsTable).values({ id: grantId, challengeId: challenge.id, userId: challenge.userId, purpose: challenge.purpose, tenantId: challenge.tenantId, hostClass, grantHash: grantHash(grantId, grantSecret), keyVersion: version, expiresAt: addMinutes(now, CREDENTIAL_CHALLENGE_LIMITS.grantExpiresMinutes), metadata: { portal: challenge.portal } });
  });
  return { success: true as const, grantId, grantSecret, userId: challenge.userId, challengeId: challenge.id, purpose: challenge.purpose, tenantId: challenge.tenantId };
}
export async function consumeCredentialResetGrant(input: { grantId: string; grantSecret: string; purpose: CredentialChallengePurpose; tenantId?: string | null; hostClass: string }) {
  const hostClass = normalizeHost(input.hostClass);
  const grants = await db.select().from(credentialResetGrantsTable).where(and(eq(credentialResetGrantsTable.id, input.grantId), eq(credentialResetGrantsTable.purpose, input.purpose), input.tenantId ? eq(credentialResetGrantsTable.tenantId, input.tenantId) : isNull(credentialResetGrantsTable.tenantId), eq(credentialResetGrantsTable.hostClass, hostClass), isNull(credentialResetGrantsTable.consumedAt), isNull(credentialResetGrantsTable.invalidatedAt))).limit(1);
  const grant = grants[0];
  if (!grant) return { success: false as const, reason: "invalid" as const };
  const now = new Date();
  if (grant.expiresAt <= now) { await db.update(credentialResetGrantsTable).set({ invalidatedAt: now, status: "expired" }).where(eq(credentialResetGrantsTable.id, grant.id)); return { success: false as const, reason: "expired" as const }; }
  if (!timingSafeHexEqual(grantHash(grant.id, input.grantSecret), grant.grantHash)) return { success: false as const, reason: "invalid" as const };
  const consumed = await db.transaction(async (tx) => {
    const [updatedGrant] = await tx.update(credentialResetGrantsTable).set({ consumedAt: now, status: "consumed" }).where(and(eq(credentialResetGrantsTable.id, grant.id), isNull(credentialResetGrantsTable.consumedAt), isNull(credentialResetGrantsTable.invalidatedAt))).returning();
    if (!updatedGrant) return null;
    const [challenge] = await tx.update(credentialChallengesTable).set({ consumedAt: now, status: "consumed" }).where(eq(credentialChallengesTable.id, grant.challengeId)).returning();
    return challenge ? { grant: updatedGrant, challenge } : null;
  });
  return consumed ? { success: true as const, ...consumed } : { success: false as const, reason: "invalid" as const };
}
export function credentialChallengeStartupRequirements(): string[] { return [CREDENTIAL_CHALLENGE_HMAC_SECRET_ENV, CREDENTIAL_CHALLENGE_KEY_VERSION_ENV, "FIELDGRID_CREDENTIAL_CHALLENGE_EXPIRES_MINUTES", "FIELDGRID_CREDENTIAL_CHALLENGE_MAX_ATTEMPTS", "FIELDGRID_CREDENTIAL_CHALLENGE_RATE_LIMITS"]; }
