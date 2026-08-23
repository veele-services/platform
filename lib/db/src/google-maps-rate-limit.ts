import { createHash } from "node:crypto";
import { pool } from "./connection";

export const GOOGLE_MAPS_RATE_LIMIT_ACTIONS = [
  "places_autocomplete",
  "place_details",
  "route_request",
  "usage_event",
] as const;

export type GoogleMapsRateLimitAction =
  (typeof GOOGLE_MAPS_RATE_LIMIT_ACTIONS)[number];

export const GOOGLE_MAPS_RATE_LIMIT_DEFAULTS: Record<
  GoogleMapsRateLimitAction,
  number
> = {
  places_autocomplete: 90,
  place_details: 45,
  route_request: 90,
  usage_event: 240,
};

export type GoogleMapsRateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  reason: "within_limit" | "rate_limited" | "service_unavailable";
};

function normalizeActorKey(actorKey: string | null): string {
  const normalized = actorKey?.trim() || "anonymous";
  return normalized.slice(0, 128);
}

export async function consumeGoogleMapsRateLimit(input: {
  tenantId: string;
  actorKey: string | null;
  action: GoogleMapsRateLimitAction;
  limit?: number;
  windowMs?: number;
  now?: Date;
}): Promise<GoogleMapsRateLimitResult> {
  const limit = Math.min(Math.max(1, input.limit ?? GOOGLE_MAPS_RATE_LIMIT_DEFAULTS[input.action]), 10_000);
  const windowMs = Math.min(Math.max(1_000, input.windowMs ?? 60_000), 3_600_000);
  const fallbackResetAt = (input.now?.getTime() ?? Date.now()) + windowMs;

  try {
    const result = await pool.query<{
      request_count: number;
      reset_at: Date;
    }>(
      `WITH parameters AS (
         SELECT
           COALESCE($6::timestamptz, clock_timestamp()) AS effective_now,
           ($5::bigint * interval '1 millisecond') AS bucket_window
       ), expired AS (
         SELECT bucket.id
         FROM public.google_maps_rate_limit_buckets bucket, parameters
         WHERE bucket.expires_at < parameters.effective_now
         ORDER BY bucket.expires_at
         LIMIT 100
         FOR UPDATE SKIP LOCKED
       ), cleanup AS (
         DELETE FROM public.google_maps_rate_limit_buckets bucket
         USING expired
         WHERE bucket.id = expired.id
       ), bucket_time AS (
         SELECT
           date_bin(
             parameters.bucket_window,
             parameters.effective_now,
             timestamptz '1970-01-01 00:00:00+00'
           ) AS window_started_at,
           parameters.bucket_window
         FROM parameters
       )
       INSERT INTO public.google_maps_rate_limit_buckets (
         tenant_id, actor_key, action, window_started_at, request_count, expires_at
       )
       SELECT $1, $2, $3, bucket_time.window_started_at, 1,
              bucket_time.window_started_at + (bucket_time.bucket_window * 2)
       FROM bucket_time
       ON CONFLICT (tenant_id, actor_key, action, window_started_at)
       DO UPDATE SET
         request_count = LEAST(
           public.google_maps_rate_limit_buckets.request_count + 1,
           $4::integer + 1
         ),
         updated_at = clock_timestamp()
       RETURNING request_count,
         window_started_at + ($5::bigint * interval '1 millisecond') AS reset_at`,
      [
        input.tenantId,
        normalizeActorKey(input.actorKey),
        input.action,
        limit,
        windowMs,
        input.now?.toISOString() ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("google_maps_rate_limit_bucket_missing");
    const count = Number(row.request_count);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt: row.reset_at.getTime(),
      reason: count <= limit ? "within_limit" : "rate_limited",
    };
  } catch {
    // Cost-bearing provider calls fail closed. There is deliberately no memory fallback.
    return {
      allowed: false,
      remaining: 0,
      resetAt: fallbackResetAt,
      reason: "service_unavailable",
    };
  }
}

export async function shouldRecordGoogleMapsAutocompleteSession(input: {
  tenantId: string;
  actorKey: string | null;
  sessionToken: string;
  ttlMs?: number;
  now?: Date;
}): Promise<boolean> {
  const ttlMs = Math.min(Math.max(60_000, input.ttlMs ?? 30 * 60_000), 24 * 60 * 60_000);
  const sessionHash = createHash("sha256").update(input.sessionToken).digest("hex");
  try {
    const result = await pool.query(
      `WITH parameters AS (
         SELECT COALESCE($5::timestamptz, clock_timestamp()) AS effective_now
       ), expired AS (
         SELECT session.id
         FROM public.google_maps_autocomplete_sessions session, parameters
         WHERE session.expires_at < parameters.effective_now
         ORDER BY session.expires_at
         LIMIT 100
         FOR UPDATE SKIP LOCKED
       ), cleanup AS (
         DELETE FROM public.google_maps_autocomplete_sessions session
         USING expired
         WHERE session.id = expired.id
       )
       INSERT INTO public.google_maps_autocomplete_sessions (
         tenant_id, actor_key, session_hash, expires_at
       )
       SELECT $1, $2, $3, parameters.effective_now + ($4::bigint * interval '1 millisecond')
       FROM parameters
       ON CONFLICT (tenant_id, actor_key, session_hash) DO NOTHING
       RETURNING id`,
      [
        input.tenantId,
        normalizeActorKey(input.actorKey),
        sessionHash,
        ttlMs,
        input.now?.toISOString() ?? null,
      ],
    );
    return result.rowCount === 1;
  } catch {
    // Analytics dedupe failure must neither block nor overcount a provider request.
    return false;
  }
}
