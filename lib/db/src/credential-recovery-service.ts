import { sql, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "./connection";
import {
  CREDENTIAL_RECOVERY_CODE_TTL_MS,
  CREDENTIAL_RECOVERY_GRANT_TTL_MS,
  CREDENTIAL_RECOVERY_MAX_ATTEMPTS,
  CREDENTIAL_RECOVERY_RESEND_COOLDOWN_MS,
  classifyCredentialRecoveryChallenge,
  credentialRecoveryCodeHash,
  credentialRecoveryGrantHash,
  credentialRecoveryLookupHmac,
  credentialRecoveryRequestFingerprintHmac,
  generateCredentialRecoveryCode,
  generateResetGrant,
  safeCompareRecoveryDigest,
  type CredentialRecoveryPurpose,
  type CredentialRecoveryState,
  type CredentialRecoverySurface,
} from "./credential-recovery";

const REQUEST_WINDOW_MS = 60 * 60 * 1000;
const FINGERPRINT_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_ACCOUNT_WINDOW = 5;
const MAX_REQUESTS_PER_FINGERPRINT_WINDOW = 20;
const MAX_VERIFY_ATTEMPTS_PER_FINGERPRINT_WINDOW = 30;
const PROVIDER_CLAIM_TTL_MS = 2 * 60 * 1000;

type RecoveryExecutor = {
  execute(query: SQL): Promise<unknown>;
};

type RecoveryContext = {
  surface: CredentialRecoverySurface;
  purpose: CredentialRecoveryPurpose;
  tenantId: string | null;
  accountIdentifier: string;
  redirectOrigin: string;
  networkSignal?: string | null;
  clientSignal?: string | null;
  actorUserId?: string | null;
  now?: Date;
};

type ChallengeRow = {
  id: string;
  subject_user_id: string | null;
  code_hash: Buffer;
  grant_hash: Buffer | null;
  request_fingerprint_hmac: Buffer;
  expires_at: Date | string;
  grant_expires_at: Date | string | null;
  resend_available_at: Date | string;
  attempts_remaining: number;
  verified_at: Date | string | null;
  used_at: Date | string | null;
  invalidated_at: Date | string | null;
  invalidated_reason: string | null;
  delivery_status: string;
  provider_claim_id: string | null;
  provider_claim_expires_at: Date | string | null;
  provider_status: string;
};

export type IssueCredentialRecoveryResult = {
  status: "issued" | "accepted" | "cooldown" | "rate-limited";
  challengeId: string | null;
  code: string | null;
  expiresAt: Date | null;
};

export type VerifyCredentialRecoveryResult = {
  state: CredentialRecoveryState;
  grant: string | null;
  grantExpiresAt: Date | null;
};

export type InspectCredentialRecoveryChallengeResult = {
  state: CredentialRecoveryState;
  subjectUserId: string | null;
};

export type ConsumeCredentialRecoveryResult = {
  state: CredentialRecoveryState;
  challengeId: string | null;
  subjectUserId: string | null;
  claimId: string | null;
};

type SqlResult<T> = { rows?: T[] };

function rowsFrom<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as SqlResult<T>).rows;
    return Array.isArray(rows) ? rows : [];
  }
  return [];
}

function digest(value: string): Buffer {
  return Buffer.from(value, "hex");
}

function digestHex(value: Buffer): string {
  return Buffer.from(value).toString("hex");
}

function timestampMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function tenantSql(tenantId: string | null): SQL {
  return sql`(
    (${tenantId}::uuid IS NULL AND tenant_id IS NULL)
    OR tenant_id = ${tenantId}::uuid
  )`;
}

function contextDigests(context: RecoveryContext): {
  lookupHex: string;
  lookup: Buffer;
  fingerprintHex: string;
  fingerprint: Buffer;
} {
  const lookupHex = credentialRecoveryLookupHmac({
    surface: context.surface,
    tenantId: context.tenantId,
    accountIdentifier: context.accountIdentifier,
  });
  const fingerprintHex = credentialRecoveryRequestFingerprintHmac({
    networkSignal: context.networkSignal,
    clientSignal: context.clientSignal,
  });
  return {
    lookupHex,
    lookup: digest(lookupHex),
    fingerprintHex,
    fingerprint: digest(fingerprintHex),
  };
}

async function writeEvent(
  executor: RecoveryExecutor,
  input: {
    challengeId?: string | null;
    tenantId: string | null;
    surface: CredentialRecoverySurface;
    purpose: CredentialRecoveryPurpose;
    eventType: string;
    accountLookupHmac: Buffer;
    requestFingerprintHmac: Buffer;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await executor.execute(sql`
    INSERT INTO public.credential_recovery_events (
      challenge_id,
      tenant_id,
      surface,
      purpose,
      event_type,
      account_lookup_hmac,
      request_fingerprint_hmac,
      actor_user_id,
      metadata
    )
    VALUES (
      ${input.challengeId ?? null}::uuid,
      ${input.tenantId}::uuid,
      ${input.surface},
      ${input.purpose},
      ${input.eventType},
      ${input.accountLookupHmac},
      ${input.requestFingerprintHmac},
      ${input.actorUserId ?? null}::uuid,
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
  `);
}

function validateContext(context: RecoveryContext): void {
  if (context.surface === "platform-admin" && context.tenantId !== null) {
    throw new Error("Platform recovery may not carry a tenant id.");
  }
  if (context.surface !== "platform-admin" && !context.tenantId) {
    throw new Error("Tenant-bound recovery requires a tenant id.");
  }
  const origin = new URL(context.redirectOrigin);
  if (origin.origin !== context.redirectOrigin) {
    throw new Error("Recovery redirect origin must be a normalized origin.");
  }
}

export async function issueCredentialRecoveryChallenge(
  context: RecoveryContext & { subjectUserId: string | null },
): Promise<IssueCredentialRecoveryResult> {
  validateContext(context);
  const now = context.now ?? new Date();
  const code = generateCredentialRecoveryCode();
  const expiresAt = new Date(now.getTime() + CREDENTIAL_RECOVERY_CODE_TTL_MS);
  const resendAvailableAt = new Date(
    now.getTime() + CREDENTIAL_RECOVERY_RESEND_COOLDOWN_MS,
  );
  const { lookupHex, lookup, fingerprint } = contextDigests(context);
  const codeHash = digest(
    credentialRecoveryCodeHash({ lookupHmac: lookupHex, code }),
  );

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.surface}:${context.tenantId ?? "platform"}:${lookupHex}:${context.purpose}`}, 0))`,
    );

    const accountWindowStart = new Date(now.getTime() - REQUEST_WINDOW_MS);
    const fingerprintWindowStart = new Date(
      now.getTime() - FINGERPRINT_WINDOW_MS,
    );
    const [limits] = rowsFrom<{
      account_count: number;
      fingerprint_count: number;
    }>(
      await tx.execute(sql`
      SELECT
        count(*) FILTER (
          WHERE account_lookup_hmac = ${lookup}
            AND created_at >= ${accountWindowStart}
            AND event_type IN ('request_accepted', 'request_issued', 'request_cooldown', 'request_limited')
        )::int AS account_count,
        count(*) FILTER (
          WHERE request_fingerprint_hmac = ${fingerprint}
            AND created_at >= ${fingerprintWindowStart}
            AND event_type IN ('request_accepted', 'request_issued', 'request_cooldown', 'request_limited')
        )::int AS fingerprint_count
      FROM public.credential_recovery_events
      WHERE surface = ${context.surface}
        AND purpose = ${context.purpose}
        AND ${tenantSql(context.tenantId)}
    `),
    );

    const rateLimited =
      Number(limits?.account_count ?? 0) >= MAX_REQUESTS_PER_ACCOUNT_WINDOW ||
      Number(limits?.fingerprint_count ?? 0) >=
        MAX_REQUESTS_PER_FINGERPRINT_WINDOW;

    if (rateLimited) {
      await writeEvent(tx, {
        ...context,
        eventType: "request_limited",
        accountLookupHmac: lookup,
        requestFingerprintHmac: fingerprint,
        metadata: { reason: "durable_window_limit" },
      });
      return {
        status: "rate-limited",
        challengeId: null,
        code: null,
        expiresAt: null,
      };
    }

    if (!context.subjectUserId) {
      await writeEvent(tx, {
        ...context,
        eventType: "request_accepted",
        accountLookupHmac: lookup,
        requestFingerprintHmac: fingerprint,
        metadata: { matched: false },
      });
      return {
        status: "accepted",
        challengeId: null,
        code: null,
        expiresAt: null,
      };
    }

    const [active] = rowsFrom<ChallengeRow>(
      await tx.execute(sql`
      SELECT *
      FROM public.credential_recovery_challenges
      WHERE surface = ${context.surface}
        AND purpose = ${context.purpose}
        AND account_lookup_hmac = ${lookup}
        AND ${tenantSql(context.tenantId)}
        AND used_at IS NULL
        AND invalidated_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
    `),
    );

    if (active && timestampMs(active.expires_at) <= now.getTime()) {
      await tx.execute(sql`
        UPDATE public.credential_recovery_challenges
        SET invalidated_at = ${now}, invalidated_reason = 'challenge_expired', updated_at = ${now}
        WHERE id = ${active.id}::uuid
      `);
    } else if (
      active &&
      timestampMs(active.resend_available_at) > now.getTime()
    ) {
      await writeEvent(tx, {
        ...context,
        challengeId: active.id,
        eventType: "request_cooldown",
        accountLookupHmac: lookup,
        requestFingerprintHmac: fingerprint,
      });
      return {
        status: "cooldown",
        challengeId: null,
        code: null,
        expiresAt: null,
      };
    } else if (active) {
      await tx.execute(sql`
        UPDATE public.credential_recovery_challenges
        SET
          invalidated_at = ${now},
          invalidated_reason = 'superseded',
          delivery_status = 'revoked',
          updated_at = ${now}
        WHERE id = ${active.id}::uuid
      `);
      await writeEvent(tx, {
        ...context,
        challengeId: active.id,
        eventType: "challenge_superseded",
        accountLookupHmac: lookup,
        requestFingerprintHmac: fingerprint,
      });
    }

    const [created] = rowsFrom<{ id: string }>(
      await tx.execute(sql`
      INSERT INTO public.credential_recovery_challenges (
        tenant_id,
        surface,
        purpose,
        subject_user_id,
        account_lookup_hmac,
        code_hash,
        request_fingerprint_hmac,
        redirect_origin,
        issued_at,
        expires_at,
        resend_available_at,
        attempts_remaining,
        requested_by_user_id,
        delivery_status,
        created_at,
        updated_at
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${context.surface},
        ${context.purpose},
        ${context.subjectUserId}::uuid,
        ${lookup},
        ${codeHash},
        ${fingerprint},
        ${context.redirectOrigin},
        ${now},
        ${expiresAt},
        ${resendAvailableAt},
        ${CREDENTIAL_RECOVERY_MAX_ATTEMPTS},
        ${context.actorUserId ?? null}::uuid,
        'pending',
        ${now},
        ${now}
      )
      RETURNING id
    `),
    );
    if (!created)
      throw new Error("Credential recovery challenge could not be created.");

    await writeEvent(tx, {
      ...context,
      challengeId: created.id,
      eventType: "request_issued",
      accountLookupHmac: lookup,
      requestFingerprintHmac: fingerprint,
    });

    return { status: "issued", challengeId: created.id, code, expiresAt };
  });
}

export async function markCredentialRecoveryDelivery(
  challengeId: string,
  delivered: boolean,
  now = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = rowsFrom<
      ChallengeRow & {
        tenant_id: string | null;
        surface: CredentialRecoverySurface;
        purpose: CredentialRecoveryPurpose;
        account_lookup_hmac: Buffer;
      }
    >(
      await tx.execute(sql`
      SELECT *
      FROM public.credential_recovery_challenges
      WHERE id = ${challengeId}::uuid
      FOR UPDATE
    `),
    );
    if (!row) return;

    await tx.execute(sql`
      UPDATE public.credential_recovery_challenges
      SET
        delivery_status = ${delivered ? "sent" : "failed"},
        delivered_at = ${delivered ? now : null},
        invalidated_at = CASE WHEN ${delivered} THEN invalidated_at ELSE ${now} END,
        invalidated_reason = CASE WHEN ${delivered} THEN invalidated_reason ELSE 'delivery_failed' END,
        updated_at = ${now}
      WHERE id = ${challengeId}::uuid
    `);
    await writeEvent(tx, {
      challengeId,
      tenantId: row.tenant_id,
      surface: row.surface,
      purpose: row.purpose,
      eventType: delivered ? "delivery_succeeded" : "delivery_failed",
      accountLookupHmac: row.account_lookup_hmac,
      requestFingerprintHmac: row.request_fingerprint_hmac,
    });
  });
}

export async function inspectCredentialRecoveryChallenge(input: {
  challengeId: string;
  surface: CredentialRecoverySurface;
  purpose: CredentialRecoveryPurpose;
  tenantId: string | null;
  redirectOrigin: string;
  now?: Date;
}): Promise<InspectCredentialRecoveryChallengeResult> {
  validateContext({
    ...input,
    accountIdentifier: "signed-handoff",
  });
  const [challenge] = rowsFrom<ChallengeRow>(
    await db.execute(sql`
      SELECT *
      FROM public.credential_recovery_challenges
      WHERE id = ${input.challengeId}::uuid
        AND surface = ${input.surface}
        AND purpose = ${input.purpose}
        AND redirect_origin = ${input.redirectOrigin}
        AND ${tenantSql(input.tenantId)}
      LIMIT 1
    `),
  );
  if (!challenge?.subject_user_id) {
    return { state: "invalid", subjectUserId: null };
  }

  const state = classifyCredentialRecoveryChallenge({
    now: input.now,
    expiresAt: challenge.expires_at,
    attemptsRemaining: challenge.attempts_remaining,
    usedAt: challenge.used_at,
    invalidatedAt: challenge.invalidated_at,
  });
  return {
    state,
    subjectUserId: state === "valid" ? challenge.subject_user_id : null,
  };
}

export async function verifyCredentialRecoveryChallenge(
  context: RecoveryContext & { code: string; challengeId?: string },
): Promise<VerifyCredentialRecoveryResult> {
  validateContext(context);
  const now = context.now ?? new Date();
  const { lookupHex, lookup, fingerprint } = contextDigests(context);
  const submittedCodeHash = credentialRecoveryCodeHash({
    lookupHmac: lookupHex,
    code: context.code,
  });

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`verify:${context.surface}:${context.tenantId ?? "platform"}:${lookupHex}`}, 0))`,
    );

    const verifyWindowStart = new Date(now.getTime() - FINGERPRINT_WINDOW_MS);
    const [limit] = rowsFrom<{ total: number }>(
      await tx.execute(sql`
      SELECT count(*)::int AS total
      FROM public.credential_recovery_events
      WHERE request_fingerprint_hmac = ${fingerprint}
        AND created_at >= ${verifyWindowStart}
        AND event_type LIKE 'verify_%'
    `),
    );
    if (
      Number(limit?.total ?? 0) >= MAX_VERIFY_ATTEMPTS_PER_FINGERPRINT_WINDOW
    ) {
      await writeEvent(tx, {
        ...context,
        eventType: "verify_limited",
        accountLookupHmac: lookup,
        requestFingerprintHmac: fingerprint,
      });
      return { state: "too-many-attempts", grant: null, grantExpiresAt: null };
    }

    const [challenge] = rowsFrom<ChallengeRow>(
      await tx.execute(sql`
      SELECT *
      FROM public.credential_recovery_challenges
      WHERE surface = ${context.surface}
        AND purpose = ${context.purpose}
        AND account_lookup_hmac = ${lookup}
        AND redirect_origin = ${context.redirectOrigin}
        AND ${tenantSql(context.tenantId)}
        ${
          context.challengeId
            ? sql`AND id = ${context.challengeId}::uuid`
            : sql``
        }
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
    `),
    );

    if (!challenge) {
      await writeEvent(tx, {
        ...context,
        eventType: "verify_invalid",
        accountLookupHmac: lookup,
        requestFingerprintHmac: fingerprint,
        metadata: { reason: "not_found" },
      });
      return { state: "invalid", grant: null, grantExpiresAt: null };
    }

    const codeMatches = safeCompareRecoveryDigest(
      digestHex(challenge.code_hash),
      submittedCodeHash,
    );
    if (!codeMatches) {
      if (
        !challenge.used_at &&
        !challenge.invalidated_at &&
        timestampMs(challenge.expires_at) > now.getTime()
      ) {
        const attemptsRemaining = Math.max(0, challenge.attempts_remaining - 1);
        await tx.execute(sql`
          UPDATE public.credential_recovery_challenges
          SET
            attempts_remaining = ${attemptsRemaining},
            invalidated_at = CASE WHEN ${attemptsRemaining} = 0 THEN ${now} ELSE invalidated_at END,
            invalidated_reason = CASE WHEN ${attemptsRemaining} = 0 THEN 'attempts_exhausted' ELSE invalidated_reason END,
            updated_at = ${now}
          WHERE id = ${challenge.id}::uuid
        `);
      }
      await writeEvent(tx, {
        ...context,
        challengeId: challenge.id,
        eventType: "verify_invalid",
        accountLookupHmac: lookup,
        requestFingerprintHmac: fingerprint,
        metadata: { reason: "code_mismatch" },
      });
      return { state: "invalid", grant: null, grantExpiresAt: null };
    }

    if (challenge.verified_at || challenge.used_at) {
      await writeEvent(tx, {
        ...context,
        challengeId: challenge.id,
        eventType: "verify_replayed",
        accountLookupHmac: lookup,
        requestFingerprintHmac: fingerprint,
      });
      return { state: "used", grant: null, grantExpiresAt: null };
    }

    const state = classifyCredentialRecoveryChallenge({
      now,
      expiresAt: challenge.expires_at,
      attemptsRemaining: challenge.attempts_remaining,
      usedAt: challenge.used_at,
      invalidatedAt: challenge.invalidated_at,
      codeMatches,
    });
    if (state !== "valid") {
      if (state === "expired" && !challenge.invalidated_at) {
        await tx.execute(sql`
          UPDATE public.credential_recovery_challenges
          SET invalidated_at = ${now}, invalidated_reason = 'challenge_expired', updated_at = ${now}
          WHERE id = ${challenge.id}::uuid
        `);
      }
      await writeEvent(tx, {
        ...context,
        challengeId: challenge.id,
        eventType: `verify_${state}`,
        accountLookupHmac: lookup,
        requestFingerprintHmac: fingerprint,
      });
      return { state, grant: null, grantExpiresAt: null };
    }

    const grant = generateResetGrant();
    const grantHash = digest(credentialRecoveryGrantHash(grant));
    const grantExpiresAt = new Date(
      now.getTime() + CREDENTIAL_RECOVERY_GRANT_TTL_MS,
    );
    await tx.execute(sql`
      UPDATE public.credential_recovery_challenges
      SET
        grant_hash = ${grantHash},
        grant_expires_at = ${grantExpiresAt},
        verified_at = ${now},
        request_fingerprint_hmac = ${fingerprint},
        updated_at = ${now}
      WHERE id = ${challenge.id}::uuid
        AND verified_at IS NULL
        AND used_at IS NULL
        AND invalidated_at IS NULL
    `);
    await writeEvent(tx, {
      ...context,
      challengeId: challenge.id,
      eventType: "grant_issued",
      accountLookupHmac: lookup,
      requestFingerprintHmac: fingerprint,
    });
    return { state: "valid", grant, grantExpiresAt };
  });
}

export async function consumeCredentialRecoveryGrant(
  context: Omit<RecoveryContext, "accountIdentifier"> & {
    grant: string;
    assertSubjectEligible?: (subjectUserId: string) => Promise<boolean>;
  },
): Promise<ConsumeCredentialRecoveryResult> {
  validateContext({ ...context, accountIdentifier: "grant-consumption" });
  const now = context.now ?? new Date();
  const grantHash = digest(credentialRecoveryGrantHash(context.grant));
  const fingerprintHex = credentialRecoveryRequestFingerprintHmac({
    networkSignal: context.networkSignal,
    clientSignal: context.clientSignal,
  });
  const fingerprint = digest(fingerprintHex);

  return db.transaction(async (tx) => {
    const [challenge] = rowsFrom<
      ChallengeRow & { account_lookup_hmac: Buffer }
    >(
      await tx.execute(sql`
      SELECT *
      FROM public.credential_recovery_challenges
      WHERE grant_hash = ${grantHash}
        AND surface = ${context.surface}
        AND purpose = ${context.purpose}
        AND redirect_origin = ${context.redirectOrigin}
        AND ${tenantSql(context.tenantId)}
      LIMIT 1
      FOR UPDATE
    `),
    );
    if (!challenge)
      return {
        state: "invalid",
        challengeId: null,
        subjectUserId: null,
        claimId: null,
      };

    if (
      !safeCompareRecoveryDigest(
        digestHex(challenge.request_fingerprint_hmac),
        fingerprintHex,
      )
    ) {
      await writeEvent(tx, {
        ...context,
        challengeId: challenge.id,
        eventType: "grant_context_mismatch",
        accountLookupHmac: challenge.account_lookup_hmac,
        requestFingerprintHmac: fingerprint,
      });
      return {
        state: "invalid",
        challengeId: challenge.id,
        subjectUserId: null,
        claimId: null,
      };
    }
    if (challenge.used_at)
      return {
        state: "used",
        challengeId: challenge.id,
        subjectUserId: null,
        claimId: null,
      };
    if (challenge.invalidated_at)
      return {
        state: "invalid",
        challengeId: challenge.id,
        subjectUserId: null,
        claimId: null,
      };
    if (
      !challenge.grant_expires_at ||
      timestampMs(challenge.grant_expires_at) <= now.getTime()
    ) {
      await tx.execute(sql`
        UPDATE public.credential_recovery_challenges
        SET invalidated_at = ${now}, invalidated_reason = 'grant_expired', updated_at = ${now}
        WHERE id = ${challenge.id}::uuid
      `);
      return {
        state: "expired",
        challengeId: challenge.id,
        subjectUserId: null,
        claimId: null,
      };
    }
    if (!challenge.subject_user_id)
      return {
        state: "invalid",
        challengeId: challenge.id,
        subjectUserId: null,
        claimId: null,
      };
    if (
      context.assertSubjectEligible &&
      !(await context.assertSubjectEligible(challenge.subject_user_id))
    ) {
      await tx.execute(sql`
        UPDATE public.credential_recovery_challenges
        SET invalidated_at = ${now}, invalidated_reason = 'subject_ineligible', updated_at = ${now}
        WHERE id = ${challenge.id}::uuid
      `);
      await writeEvent(tx, {
        ...context,
        challengeId: challenge.id,
        eventType: "grant_subject_ineligible",
        accountLookupHmac: challenge.account_lookup_hmac,
        requestFingerprintHmac: fingerprint,
      });
      return {
        state: "invalid",
        challengeId: challenge.id,
        subjectUserId: null,
        claimId: null,
      };
    }

    if (
      challenge.provider_claim_id &&
      challenge.provider_claim_expires_at &&
      timestampMs(challenge.provider_claim_expires_at) > now.getTime()
    ) {
      await writeEvent(tx, {
        ...context,
        challengeId: challenge.id,
        eventType: "provider_claim_duplicate",
        accountLookupHmac: challenge.account_lookup_hmac,
        requestFingerprintHmac: fingerprint,
      });
      return {
        state: "processing",
        challengeId: challenge.id,
        subjectUserId: null,
        claimId: null,
      };
    }

    const claimId = randomUUID();
    const claimExpiresAt = new Date(now.getTime() + PROVIDER_CLAIM_TTL_MS);
    const [claimed] = rowsFrom<{ id: string }>(
      await tx.execute(sql`
      UPDATE public.credential_recovery_challenges
      SET provider_claim_id = ${claimId}::uuid,
          provider_claimed_at = ${now},
          provider_claim_expires_at = ${claimExpiresAt},
          provider_attempt_count = provider_attempt_count + 1,
          provider_status = 'claimed',
          updated_at = ${now}
      WHERE id = ${challenge.id}::uuid
        AND used_at IS NULL
        AND invalidated_at IS NULL
      RETURNING id
    `),
    );
    if (!claimed)
      return {
        state: "used",
        challengeId: challenge.id,
        subjectUserId: null,
        claimId: null,
      };

    await writeEvent(tx, {
      ...context,
      challengeId: challenge.id,
      eventType: "provider_claimed",
      accountLookupHmac: challenge.account_lookup_hmac,
      requestFingerprintHmac: fingerprint,
      metadata: { claimExpiresAt: claimExpiresAt.toISOString() },
    });
    return {
      state: "valid",
      challengeId: challenge.id,
      subjectUserId: challenge.subject_user_id,
      claimId,
    };
  });
}

export async function revokeCredentialRecoveryChallenges(input: {
  tenantId: string | null;
  surface: CredentialRecoverySurface;
  purpose?: CredentialRecoveryPurpose | null;
  subjectUserId: string;
  actorUserId?: string | null;
  reason: string;
  now?: Date;
}): Promise<number> {
  const now = input.now ?? new Date();
  const result = await db.execute<{ id: string }>(sql`
    UPDATE public.credential_recovery_challenges
    SET
      invalidated_at = ${now},
      invalidated_reason = ${input.reason},
      delivery_status = 'revoked',
      updated_at = ${now}
    WHERE subject_user_id = ${input.subjectUserId}::uuid
      AND surface = ${input.surface}
      AND ${tenantSql(input.tenantId)}
      AND (${input.purpose ?? null}::text IS NULL OR purpose = ${input.purpose ?? null})
      AND used_at IS NULL
      AND invalidated_at IS NULL
    RETURNING id
  `);
  return rowsFrom(result).length;
}

export async function recordCredentialRecoveryProviderOutcome(input: {
  challengeId: string;
  claimId: string;
  success: boolean;
  sessionRevoked: boolean;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  await db.transaction(async (tx) => {
    const [challenge] = rowsFrom<
      ChallengeRow & {
        tenant_id: string | null;
        surface: CredentialRecoverySurface;
        purpose: CredentialRecoveryPurpose;
        account_lookup_hmac: Buffer;
      }
    >(
      await tx.execute(sql`
      SELECT *
      FROM public.credential_recovery_challenges
      WHERE id = ${input.challengeId}::uuid
      LIMIT 1
      FOR UPDATE
    `),
    );
    if (!challenge)
      throw new Error("Credential recovery provider claim not found.");
    if (
      challenge.used_at &&
      input.success &&
      challenge.provider_claim_id === input.claimId
    )
      return;
    if (
      challenge.invalidated_at ||
      challenge.provider_claim_id !== input.claimId
    ) {
      throw new Error(
        "Credential recovery provider claim is no longer current.",
      );
    }

    const [finalized] = rowsFrom<{ id: string }>(
      await tx.execute(sql`
      UPDATE public.credential_recovery_challenges
      SET used_at = CASE WHEN ${input.success} THEN ${now} ELSE used_at END,
          provider_status = CASE WHEN ${input.success} THEN 'succeeded' ELSE 'failed' END,
          provider_finalized_at = ${now},
          provider_claim_expires_at = CASE WHEN ${input.success} THEN provider_claim_expires_at ELSE ${now} END,
          updated_at = ${now}
      WHERE id = ${input.challengeId}::uuid
        AND provider_claim_id = ${input.claimId}::uuid
        AND used_at IS NULL
        AND invalidated_at IS NULL
      RETURNING id
    `),
    );
    if (!finalized)
      throw new Error(
        "Credential recovery provider claim could not be finalized.",
      );

    await writeEvent(tx, {
      challengeId: challenge.id,
      tenantId: challenge.tenant_id,
      surface: challenge.surface,
      purpose: challenge.purpose,
      eventType: input.success
        ? "provider_password_updated"
        : "provider_password_update_failed",
      accountLookupHmac: challenge.account_lookup_hmac,
      requestFingerprintHmac: challenge.request_fingerprint_hmac,
      metadata: {
        sessionRevoked: input.sessionRevoked,
        occurredAt: now.toISOString(),
        retryable: !input.success,
      },
    });
  });
}
