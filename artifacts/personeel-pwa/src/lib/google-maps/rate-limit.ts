type PersonnelGoogleMapsAction = "places_autocomplete" | "place_details";

type RateLimitOptions = {
  userId: string;
  action: PersonnelGoogleMapsAction;
  limit?: number;
  windowMs?: number;
  now?: number;
};

const DEFAULT_LIMITS: Record<PersonnelGoogleMapsAction, number> = {
  places_autocomplete: 90,
  place_details: 45,
};

const DEFAULT_WINDOW_MS = 60_000;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkPersonnelGoogleMapsRateLimit(options: RateLimitOptions) {
  const now = options.now ?? Date.now();
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const limit = options.limit ?? DEFAULT_LIMITS[options.action];
  const key = `${options.userId}:${options.action}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt: now + windowMs };
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}
