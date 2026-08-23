import { sql, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "./connection";
import {
  computeObjectSecurityOtpHmac,
  decryptObjectSecurityPayload,
  encryptObjectSecurityPayload,
  generateObjectSecurityOtp,
  generateObjectSecurityUnlockHandle,
  hashObjectSecurityUnlockHandle,
  verifyObjectSecurityOtpHmac,
  type ObjectSecurityEncryptionContext,
} from "./object-security-crypto";
import type { ObjectSecurityCategory } from "./schema/object-security";

export const OBJECT_SECURITY_OTP_TTL_MS = 10 * 60 * 1000;
export const OBJECT_SECURITY_OTP_COOLDOWN_MS = 60 * 1000;
export const OBJECT_SECURITY_UNLOCK_IDLE_MS = 2 * 60 * 1000;
export const OBJECT_SECURITY_UNLOCK_ABSOLUTE_MS = 10 * 60 * 1000;

const OBJECT_SECURITY_MAX_ATTEMPTS = 5;
const OBJECT_SECURITY_REQUEST_WINDOW_MS = 15 * 60 * 1000;
const OBJECT_SECURITY_MAX_REQUESTS_PER_WINDOW = 5;
const MANAGEMENT_POLICY_REVISION = 1;

type SqlResult<T> = { rows?: T[] };
type ObjectSecurityExecutor = { execute(query: SQL): Promise<unknown> };

function rowsFrom<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as SqlResult<T>).rows;
    return Array.isArray(rows) ? rows : [];
  }
  return [];
}

function timestampMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

async function writeAccessAudit(
  executor: ObjectSecurityExecutor,
  input: {
    tenantId: string;
    userId: string;
    objectId: string;
    challengeId?: string | null;
    unlockSessionId?: string | null;
    securityRecordId?: string | null;
    eventType: string;
    result: "allowed" | "denied" | "failed" | "invalidated" | "completed";
    category?: ObjectSecurityCategory | null;
    reasonCode?: string | null;
    requestId?: string | null;
  },
): Promise<void> {
  await executor.execute(sql`
    INSERT INTO public.object_security_access_audit (
      tenant_id, actor_user_id, object_id, challenge_id, unlock_session_id,
      security_record_id, access_path, event_type, result, category,
      reason_code, policy_revision, request_id, safe_metadata
    ) VALUES (
      ${input.tenantId}::uuid, ${input.userId}::uuid, ${input.objectId}::uuid,
      ${input.challengeId ?? null}::uuid, ${input.unlockSessionId ?? null}::uuid,
      ${input.securityRecordId ?? null}::uuid, 'management', ${input.eventType},
      ${input.result}, ${input.category ?? null}, ${input.reasonCode ?? null},
      ${MANAGEMENT_POLICY_REVISION}, ${input.requestId ?? null}, '{}'::jsonb
    )
  `);
}

async function lockManagementContext(
  executor: ObjectSecurityExecutor,
  input: { tenantId: string; userId: string; objectId: string },
): Promise<boolean> {
  await executor.execute(sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`object-security:${input.tenantId}:${input.userId}:${input.objectId}:management`}, 0)
    )
  `);
  const [object] = rowsFrom<{ id: string }>(
    await executor.execute(sql`
      SELECT id
      FROM public.objects
      WHERE id = ${input.objectId}::uuid
        AND tenant_id = ${input.tenantId}::uuid
        AND is_active = true
      FOR UPDATE
    `),
  );
  return Boolean(object);
}

async function hasActiveAuthSession(
  executor: ObjectSecurityExecutor,
  input: { authSessionId: string; userId: string; now: Date },
): Promise<boolean> {
  const [session] = rowsFrom<{ id: string }>(
    await executor.execute(sql`
      SELECT id
      FROM auth.sessions
      WHERE id = ${input.authSessionId}::uuid
        AND user_id = ${input.userId}::uuid
        AND (not_after IS NULL OR not_after > ${input.now})
      FOR SHARE
    `),
  );
  return Boolean(session);
}

export type IssueObjectSecurityChallengeResult =
  | { status: "issued"; challengeId: string; code: string; expiresAt: Date }
  | { status: "cooldown" | "rate-limited" | "ineligible"; challengeId: null; code: null; expiresAt: null };

export async function createManagementObjectSecurityRecord(input: {
  tenantId: string;
  userId: string;
  objectId: string;
  category: ObjectSecurityCategory;
  title: string;
  payload: Readonly<Record<string, unknown>>;
  changeReason: string;
  validFrom?: Date;
  validUntil?: Date | null;
  requestId?: string | null;
  now?: Date;
}): Promise<{ recordId: string; version: number }> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    if (!(await lockManagementContext(tx, input))) {
      throw new Error("Object security context is unavailable.");
    }
    const [previous] = rowsFrom<{ id: string; version: number }>(
      await tx.execute(sql`
        SELECT id, version
        FROM public.object_security_records
        WHERE tenant_id = ${input.tenantId}::uuid
          AND object_id = ${input.objectId}::uuid
          AND category = ${input.category}
          AND status = 'active'
        LIMIT 1
        FOR UPDATE
      `),
    );
    const [latest] = rowsFrom<{ version: number }>(
      await tx.execute(sql`
        SELECT version
        FROM public.object_security_records
        WHERE tenant_id = ${input.tenantId}::uuid
          AND object_id = ${input.objectId}::uuid
          AND category = ${input.category}
        ORDER BY version DESC
        LIMIT 1
        FOR UPDATE
      `),
    );
    if (previous) {
      await tx.execute(sql`
        UPDATE public.object_security_records
        SET status = 'superseded', revoked_by = ${input.userId}::uuid,
            revoked_at = ${now}
        WHERE id = ${previous.id}::uuid
          AND tenant_id = ${input.tenantId}::uuid
          AND status = 'active'
      `);
    }

    const [revision] = rowsFrom<{ generation: number }>(
      await tx.execute(sql`
        SELECT generation
        FROM public.object_security_object_revisions
        WHERE tenant_id = ${input.tenantId}::uuid
          AND object_id = ${input.objectId}::uuid
        FOR UPDATE
      `),
    );
    const generation = Number(revision?.generation ?? 0) + 1;
    const version = Number(latest?.version ?? 0) + 1;
    const recordId = randomUUID();
    const encrypted = encryptObjectSecurityPayload(input.payload, {
      tenantId: input.tenantId,
      objectId: input.objectId,
      recordId,
      category: input.category,
      version,
      generation,
    });
    await tx.execute(sql`
      INSERT INTO public.object_security_records (
        id, tenant_id, object_id, category, title, encrypted_payload,
        encryption_key_version, version, generation, status, valid_from,
        valid_until, source, change_reason, supersedes_record_id, created_by,
        reviewed_by, reviewed_at, created_at, updated_at
      ) VALUES (
        ${recordId}::uuid, ${input.tenantId}::uuid, ${input.objectId}::uuid,
        ${input.category}, ${input.title}, ${encrypted.encryptedPayload},
        ${encrypted.keyVersion}, ${version}, ${generation}, 'active',
        ${input.validFrom ?? now}, ${input.validUntil ?? null}, 'management',
        ${input.changeReason}, ${previous?.id ?? null}::uuid, ${input.userId}::uuid,
        ${input.userId}::uuid, ${now}, ${now}, ${now}
      )
    `);
    await writeAccessAudit(tx, {
      ...input,
      securityRecordId: recordId,
      eventType: "record_version_created",
      result: "completed",
      category: input.category,
      reasonCode: previous ? "version_replaced" : "record_created",
    });
    return { recordId, version };
  });
}

/**
 * Creates a management OTP challenge. The plaintext code is returned exactly
 * once to the caller for synchronous delivery and is never written to storage.
 */
export async function issueManagementObjectSecurityChallenge(input: {
  tenantId: string;
  userId: string;
  objectId: string;
  businessEmailRevision: string;
  requestId?: string | null;
  now?: Date;
}): Promise<IssueObjectSecurityChallengeResult> {
  const now = input.now ?? new Date();
  const code = generateObjectSecurityOtp();
  const challengeId = randomUUID();
  const codeHmac = computeObjectSecurityOtpHmac(challengeId, code);
  const expiresAt = new Date(now.getTime() + OBJECT_SECURITY_OTP_TTL_MS);
  const resendAfter = new Date(now.getTime() + OBJECT_SECURITY_OTP_COOLDOWN_MS);
  const windowStart = new Date(now.getTime() - OBJECT_SECURITY_REQUEST_WINDOW_MS);

  return db.transaction(async (tx) => {
    if (!(await lockManagementContext(tx, input))) {
      return { status: "ineligible", challengeId: null, code: null, expiresAt: null };
    }

    const [rate] = rowsFrom<{ request_count: number }>(
      await tx.execute(sql`
        SELECT count(*)::int AS request_count
        FROM public.object_security_challenges
        WHERE tenant_id = ${input.tenantId}::uuid
          AND user_id = ${input.userId}::uuid
          AND object_id = ${input.objectId}::uuid
          AND access_path = 'management'
          AND created_at >= ${windowStart}
      `),
    );
    if (Number(rate?.request_count ?? 0) >= OBJECT_SECURITY_MAX_REQUESTS_PER_WINDOW) {
      await writeAccessAudit(tx, {
        ...input,
        eventType: "otp_request",
        result: "denied",
        reasonCode: "rate_limited",
      });
      return { status: "rate-limited", challengeId: null, code: null, expiresAt: null };
    }

    const [openChallenge] = rowsFrom<{ id: string; resend_after: Date | string; expires_at: Date | string }>(
      await tx.execute(sql`
        SELECT id, resend_after, expires_at
        FROM public.object_security_challenges
        WHERE tenant_id = ${input.tenantId}::uuid
          AND user_id = ${input.userId}::uuid
          AND object_id = ${input.objectId}::uuid
          AND access_path = 'management'
          AND status IN ('pending_delivery', 'delivered')
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
      `),
    );
    if (
      openChallenge &&
      timestampMs(openChallenge.expires_at) > now.getTime() &&
      timestampMs(openChallenge.resend_after) > now.getTime()
    ) {
      await writeAccessAudit(tx, {
        ...input,
        challengeId: openChallenge.id,
        eventType: "otp_request",
        result: "denied",
        reasonCode: "cooldown",
      });
      return { status: "cooldown", challengeId: null, code: null, expiresAt: null };
    }

    await tx.execute(sql`
      UPDATE public.object_security_challenges
      SET status = 'invalidated', invalidated_at = ${now}, invalidation_reason = 'superseded'
      WHERE tenant_id = ${input.tenantId}::uuid
        AND user_id = ${input.userId}::uuid
        AND object_id = ${input.objectId}::uuid
        AND access_path = 'management'
        AND status IN ('pending_delivery', 'delivered')
    `);
    await tx.execute(sql`
      INSERT INTO public.object_security_challenges (
        id, tenant_id, user_id, object_id, access_path, code_hmac,
        business_email_revision, status, max_attempts, expires_at,
        resend_after, delivery_started_at, created_at
      ) VALUES (
        ${challengeId}::uuid, ${input.tenantId}::uuid, ${input.userId}::uuid,
        ${input.objectId}::uuid, 'management', ${codeHmac},
        ${input.businessEmailRevision}, 'pending_delivery',
        ${OBJECT_SECURITY_MAX_ATTEMPTS}, ${expiresAt}, ${resendAfter}, ${now}, ${now}
      )
    `);
    await writeAccessAudit(tx, {
      ...input,
      challengeId,
      eventType: "otp_request",
      result: "completed",
      reasonCode: "pending_delivery",
    });
    return { status: "issued", challengeId, code, expiresAt };
  });
}

export async function markObjectSecurityChallengeDelivery(input: {
  tenantId: string;
  userId: string;
  objectId: string;
  challengeId: string;
  delivered: boolean;
  requestId?: string | null;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  await db.transaction(async (tx) => {
    const [challenge] = rowsFrom<{ id: string }>(
      await tx.execute(sql`
        SELECT id FROM public.object_security_challenges
        WHERE id = ${input.challengeId}::uuid
          AND tenant_id = ${input.tenantId}::uuid
          AND user_id = ${input.userId}::uuid
          AND object_id = ${input.objectId}::uuid
          AND access_path = 'management'
          AND status = 'pending_delivery'
        FOR UPDATE
      `),
    );
    if (!challenge) throw new Error("Object security challenge is no longer deliverable.");
    await tx.execute(sql`
      UPDATE public.object_security_challenges
      SET status = ${input.delivered ? "delivered" : "delivery_failed"},
          delivered_at = ${input.delivered ? now : null},
          invalidated_at = ${input.delivered ? null : now},
          invalidation_reason = ${input.delivered ? null : "delivery_failed"},
          code_hmac = CASE WHEN ${input.delivered} THEN code_hmac ELSE NULL END
      WHERE id = ${input.challengeId}::uuid
    `);
    await writeAccessAudit(tx, {
      ...input,
      eventType: "otp_delivery",
      result: input.delivered ? "completed" : "failed",
      reasonCode: input.delivered ? "provider_accepted" : "delivery_failed",
    });
  });
}

type ChallengeRow = {
  id: string;
  code_hmac: string | null;
  business_email_revision: string;
  status: string;
  failed_attempts: number;
  max_attempts: number;
  expires_at: Date | string;
};

export type VerifyObjectSecurityChallengeResult =
  | { state: "valid"; handle: string; absoluteExpiresAt: Date }
  | { state: "invalid" | "expired" | "used" | "too-many-attempts"; handle: null; absoluteExpiresAt: null };

export async function verifyManagementObjectSecurityChallenge(input: {
  tenantId: string;
  userId: string;
  objectId: string;
  challengeId: string;
  code: string;
  businessEmailRevision: string;
  authSessionId: string;
  requestId?: string | null;
  now?: Date;
}): Promise<VerifyObjectSecurityChallengeResult> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    if (
      !(await lockManagementContext(tx, input)) ||
      !(await hasActiveAuthSession(tx, {
        authSessionId: input.authSessionId,
        userId: input.userId,
        now,
      }))
    ) {
      return { state: "invalid", handle: null, absoluteExpiresAt: null };
    }
    const [challenge] = rowsFrom<ChallengeRow>(
      await tx.execute(sql`
        SELECT id, code_hmac, business_email_revision, status,
               failed_attempts, max_attempts, expires_at
        FROM public.object_security_challenges
        WHERE id = ${input.challengeId}::uuid
          AND tenant_id = ${input.tenantId}::uuid
          AND user_id = ${input.userId}::uuid
          AND object_id = ${input.objectId}::uuid
          AND access_path = 'management'
        FOR UPDATE
      `),
    );
    if (!challenge) {
      await writeAccessAudit(tx, {
        ...input,
        eventType: "otp_verify",
        result: "denied",
        reasonCode: "context_mismatch",
      });
      return { state: "invalid", handle: null, absoluteExpiresAt: null };
    }
    if (challenge.status === "used") {
      return { state: "used", handle: null, absoluteExpiresAt: null };
    }
    if (
      challenge.status !== "delivered" ||
      !challenge.code_hmac ||
      challenge.business_email_revision !== input.businessEmailRevision
    ) {
      await writeAccessAudit(tx, {
        ...input,
        eventType: "otp_verify",
        result: "denied",
        reasonCode: "invalid_challenge",
      });
      return { state: "invalid", handle: null, absoluteExpiresAt: null };
    }
    if (timestampMs(challenge.expires_at) <= now.getTime()) {
      await tx.execute(sql`
        UPDATE public.object_security_challenges
        SET status = 'expired', invalidated_at = ${now}, invalidation_reason = 'expired'
        WHERE id = ${challenge.id}::uuid
      `);
      await writeAccessAudit(tx, {
        ...input,
        eventType: "otp_verify",
        result: "denied",
        reasonCode: "expired",
      });
      return { state: "expired", handle: null, absoluteExpiresAt: null };
    }
    if (!verifyObjectSecurityOtpHmac(challenge.id, input.code, challenge.code_hmac)) {
      const failedAttempts = challenge.failed_attempts + 1;
      const blocked = failedAttempts >= challenge.max_attempts;
      await tx.execute(sql`
        UPDATE public.object_security_challenges
        SET failed_attempts = ${failedAttempts},
            status = CASE WHEN ${blocked} THEN 'blocked' ELSE status END,
            invalidated_at = CASE WHEN ${blocked} THEN ${now} ELSE invalidated_at END,
            invalidation_reason = CASE WHEN ${blocked} THEN 'too_many_attempts' ELSE invalidation_reason END
        WHERE id = ${challenge.id}::uuid
      `);
      await writeAccessAudit(tx, {
        ...input,
        eventType: "otp_verify",
        result: "denied",
        reasonCode: blocked ? "too_many_attempts" : "invalid_code",
      });
      return {
        state: blocked ? "too-many-attempts" : "invalid",
        handle: null,
        absoluteExpiresAt: null,
      };
    }

    const [generationRow] = rowsFrom<{ generation: number }>(
      await tx.execute(sql`
        SELECT generation
        FROM public.object_security_object_revisions
        WHERE tenant_id = ${input.tenantId}::uuid
          AND object_id = ${input.objectId}::uuid
        FOR SHARE
      `),
    );
    const generation = Number(generationRow?.generation ?? 0);
    const handle = generateObjectSecurityUnlockHandle();
    const handleHash = hashObjectSecurityUnlockHandle(handle);
    const unlockSessionId = randomUUID();
    const idleExpiresAt = new Date(now.getTime() + OBJECT_SECURITY_UNLOCK_IDLE_MS);
    const absoluteExpiresAt = new Date(now.getTime() + OBJECT_SECURITY_UNLOCK_ABSOLUTE_MS);
    await tx.execute(sql`
      UPDATE public.object_security_challenges
      SET status = 'used', consumed_at = ${now}, code_hmac = NULL
      WHERE id = ${challenge.id}::uuid AND status = 'delivered'
    `);
    await tx.execute(sql`
      INSERT INTO public.object_security_unlock_sessions (
        id, tenant_id, challenge_id, handle_hash, user_id, object_id,
        access_path, auth_session_id, business_email_revision,
        policy_revision, record_generation, idle_expires_at,
        absolute_expires_at, last_used_at, created_at
      ) VALUES (
        ${unlockSessionId}::uuid, ${input.tenantId}::uuid, ${challenge.id}::uuid,
        ${handleHash}, ${input.userId}::uuid, ${input.objectId}::uuid,
        'management', ${input.authSessionId}, ${input.businessEmailRevision},
        ${MANAGEMENT_POLICY_REVISION}, ${generation}, ${idleExpiresAt},
        ${absoluteExpiresAt}, ${now}, ${now}
      )
    `);
    await writeAccessAudit(tx, {
      ...input,
      challengeId: challenge.id,
      unlockSessionId,
      eventType: "unlock_created",
      result: "allowed",
      reasonCode: "otp_verified",
    });
    return { state: "valid", handle, absoluteExpiresAt };
  });
}

type SecurityRecordRow = {
  id: string;
  category: ObjectSecurityCategory;
  title: string;
  encrypted_payload: string;
  encryption_key_version: number;
  version: number;
  generation: number;
  valid_from: Date | string;
  valid_until: Date | string | null;
};

export type UnlockedObjectSecurityRecord = {
  id: string;
  category: ObjectSecurityCategory;
  title: string;
  payload: Readonly<Record<string, unknown>>;
  version: number;
  validFrom: string;
  validUntil: string | null;
};

export type ReadObjectSecurityResult =
  | { state: "valid"; records: UnlockedObjectSecurityRecord[]; expiresAt: Date }
  | { state: "invalid" | "expired" | "revoked" | "context-changed"; records: []; expiresAt: null };

export async function readManagementObjectSecurityRecords(input: {
  tenantId: string;
  userId: string;
  objectId: string;
  handle: string;
  businessEmailRevision: string;
  authSessionId: string;
  requestId?: string | null;
  now?: Date;
}): Promise<ReadObjectSecurityResult> {
  const now = input.now ?? new Date();
  const handleHash = hashObjectSecurityUnlockHandle(input.handle);
  return db.transaction(async (tx) => {
    if (!(await lockManagementContext(tx, input))) {
      return { state: "context-changed", records: [], expiresAt: null };
    }
    const [session] = rowsFrom<{
      id: string;
      challenge_id: string;
      auth_session_id: string;
      business_email_revision: string;
      policy_revision: number;
      record_generation: number;
      idle_expires_at: Date | string;
      absolute_expires_at: Date | string;
      revoked_at: Date | string | null;
    }>(
      await tx.execute(sql`
        SELECT id, challenge_id, auth_session_id, business_email_revision,
               policy_revision, record_generation, idle_expires_at,
               absolute_expires_at, revoked_at
        FROM public.object_security_unlock_sessions
        WHERE handle_hash = ${handleHash}
          AND tenant_id = ${input.tenantId}::uuid
          AND user_id = ${input.userId}::uuid
          AND object_id = ${input.objectId}::uuid
          AND access_path = 'management'
        FOR UPDATE
      `),
    );
    if (!session) {
      await writeAccessAudit(tx, {
        ...input,
        eventType: "secret_read",
        result: "denied",
        reasonCode: "invalid_handle_or_context",
      });
      return { state: "invalid", records: [], expiresAt: null };
    }
    if (session.revoked_at) {
      return { state: "revoked", records: [], expiresAt: null };
    }
    if (
      timestampMs(session.idle_expires_at) <= now.getTime() ||
      timestampMs(session.absolute_expires_at) <= now.getTime()
    ) {
      await tx.execute(sql`
        UPDATE public.object_security_unlock_sessions
        SET revoked_at = ${now}, revocation_reason = 'expired'
        WHERE id = ${session.id}::uuid AND revoked_at IS NULL
      `);
      await writeAccessAudit(tx, {
        ...input,
        challengeId: session.challenge_id,
        unlockSessionId: session.id,
        eventType: "secret_read",
        result: "invalidated",
        reasonCode: "expired",
      });
      return { state: "expired", records: [], expiresAt: null };
    }
    if (
      session.auth_session_id !== input.authSessionId ||
      session.business_email_revision !== input.businessEmailRevision ||
      Number(session.policy_revision) !== MANAGEMENT_POLICY_REVISION ||
      !(await hasActiveAuthSession(tx, {
        authSessionId: input.authSessionId,
        userId: input.userId,
        now,
      }))
    ) {
      await tx.execute(sql`
        UPDATE public.object_security_unlock_sessions
        SET revoked_at = ${now}, revocation_reason = 'context_changed'
        WHERE id = ${session.id}::uuid AND revoked_at IS NULL
      `);
      await writeAccessAudit(tx, {
        ...input,
        challengeId: session.challenge_id,
        unlockSessionId: session.id,
        eventType: "secret_read",
        result: "invalidated",
        reasonCode: "context_changed",
      });
      return { state: "context-changed", records: [], expiresAt: null };
    }

    const [revision] = rowsFrom<{ generation: number }>(
      await tx.execute(sql`
        SELECT generation
        FROM public.object_security_object_revisions
        WHERE tenant_id = ${input.tenantId}::uuid
          AND object_id = ${input.objectId}::uuid
        FOR SHARE
      `),
    );
    const currentGeneration = Number(revision?.generation ?? 0);
    if (currentGeneration !== Number(session.record_generation)) {
      await tx.execute(sql`
        UPDATE public.object_security_unlock_sessions
        SET revoked_at = ${now}, revocation_reason = 'record_generation_changed'
        WHERE id = ${session.id}::uuid AND revoked_at IS NULL
      `);
      await writeAccessAudit(tx, {
        ...input,
        challengeId: session.challenge_id,
        unlockSessionId: session.id,
        eventType: "secret_read",
        result: "invalidated",
        reasonCode: "record_generation_changed",
      });
      return { state: "context-changed", records: [], expiresAt: null };
    }

    const records = rowsFrom<SecurityRecordRow>(
      await tx.execute(sql`
        SELECT id, category, title, encrypted_payload, encryption_key_version,
               version, generation, valid_from, valid_until
        FROM public.object_security_records
        WHERE tenant_id = ${input.tenantId}::uuid
          AND object_id = ${input.objectId}::uuid
          AND status = 'active'
          AND valid_from <= ${now}
          AND (valid_until IS NULL OR valid_until > ${now})
        ORDER BY category, version DESC
        FOR SHARE
      `),
    );
    const unlocked = records.map((record): UnlockedObjectSecurityRecord => {
      const context: ObjectSecurityEncryptionContext = {
        tenantId: input.tenantId,
        objectId: input.objectId,
        recordId: record.id,
        category: record.category,
        version: Number(record.version),
        generation: Number(record.generation),
      };
      return {
        id: record.id,
        category: record.category,
        title: record.title,
        payload: decryptObjectSecurityPayload(record.encrypted_payload, context),
        version: Number(record.version),
        validFrom: new Date(record.valid_from).toISOString(),
        validUntil: record.valid_until ? new Date(record.valid_until).toISOString() : null,
      };
    });

    const nextIdleExpiry = new Date(
      Math.min(
        now.getTime() + OBJECT_SECURITY_UNLOCK_IDLE_MS,
        timestampMs(session.absolute_expires_at),
      ),
    );
    await tx.execute(sql`
      UPDATE public.object_security_unlock_sessions
      SET last_used_at = ${now}, idle_expires_at = ${nextIdleExpiry},
          revoked_at = ${now}, revocation_reason = 'read_completed'
      WHERE id = ${session.id}::uuid AND revoked_at IS NULL
    `);
    if (records.length === 0) {
      await writeAccessAudit(tx, {
        ...input,
        challengeId: session.challenge_id,
        unlockSessionId: session.id,
        eventType: "secret_read",
        result: "completed",
        reasonCode: "no_active_records",
      });
    } else {
      for (const record of records) {
        await writeAccessAudit(tx, {
          ...input,
          challengeId: session.challenge_id,
          unlockSessionId: session.id,
          securityRecordId: record.id,
          category: record.category,
          eventType: "secret_read",
          result: "allowed",
          reasonCode: "management_otp_context_valid",
        });
      }
    }
    return {
      state: "valid",
      records: unlocked,
      expiresAt: nextIdleExpiry,
    };
  });
}

export async function revokeManagementObjectSecurityUnlock(input: {
  tenantId: string;
  userId: string;
  objectId: string;
  handle: string;
  requestId?: string | null;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const handleHash = hashObjectSecurityUnlockHandle(input.handle);
  await db.transaction(async (tx) => {
    const [session] = rowsFrom<{ id: string; challenge_id: string }>(
      await tx.execute(sql`
        UPDATE public.object_security_unlock_sessions
        SET revoked_at = ${now}, revoked_by = ${input.userId}::uuid,
            revocation_reason = 'user_locked'
        WHERE handle_hash = ${handleHash}
          AND tenant_id = ${input.tenantId}::uuid
          AND user_id = ${input.userId}::uuid
          AND object_id = ${input.objectId}::uuid
          AND access_path = 'management'
          AND revoked_at IS NULL
        RETURNING id, challenge_id
      `),
    );
    if (!session) return;
    await writeAccessAudit(tx, {
      ...input,
      challengeId: session.challenge_id,
      unlockSessionId: session.id,
      eventType: "unlock_revoked",
      result: "invalidated",
      reasonCode: "user_locked",
    });
  });
}
