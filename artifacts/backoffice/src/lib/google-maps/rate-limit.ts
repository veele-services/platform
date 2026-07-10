import "server-only";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function checkGoogleMapsRateLimit(input: {
  tenantId: string;
  userId: string | null;
  action: "places_autocomplete" | "place_details";
  limit?: number;
  windowMs?: number;
  now?: number;
}): { allowed: boolean; remaining: number; resetAt: number } {
  const now = input.now ?? Date.now();
  const windowMs = input.windowMs ?? 60_000;
  const limit =
    input.limit ?? (input.action === "places_autocomplete" ? 120 : 60);
  const userScope = input.userId ?? "anonymous";
  const key = [
    input.tenantId,
    userScope,
    input.action,
    Math.floor(now / windowMs),
  ].join(":");
  const existing = buckets.get(key);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + windowMs };

  bucket.count += 1;
  buckets.set(key, bucket);
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export function clearGoogleMapsRateLimitState(): void {
  buckets.clear();
}

