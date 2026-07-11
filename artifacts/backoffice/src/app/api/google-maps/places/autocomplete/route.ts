import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { createClientFromRequest } from "@/lib/supabase/server";
import { hasPermissionFromRequest } from "@/lib/auth/permissions";
import { requireCurrentTenantIdFromRequest } from "@/lib/auth/tenant";
import {
  GooglePlacesClientError,
  assertGoogleMapsServerSecretsSafe,
  checkGoogleMapsRateLimit,
  fetchGooglePlacesAutocomplete,
  getGoogleMapsRuntimeConfig,
  recordGoogleMapsUsageEvent,
} from "@/lib/google-maps";
import { createSafeGoogleMapsError } from "@/lib/google-maps/errors";

const autocompleteSchema = z.object({
  input: z.string().max(160),
  sessionToken: z.string().min(8).max(128),
  limit: z.number().int().min(1).max(10).optional(),
});

const seenAutocompleteSessions = new Map<string, number>();

function shouldRecordAutocompleteSession(input: {
  tenantId: string;
  userId: string | null;
  sessionToken: string;
}): boolean {
  const now = Date.now();
  for (const [key, expiresAt] of seenAutocompleteSessions) {
    if (expiresAt <= now) seenAutocompleteSessions.delete(key);
  }
  const key = `${input.tenantId}:${input.userId ?? "anonymous"}:${input.sessionToken}`;
  if (seenAutocompleteSessions.has(key)) return false;
  seenAutocompleteSessions.set(key, now + 30 * 60 * 1000);
  return true;
}

async function canUseAddressSearch(request: Request): Promise<boolean> {
  const checks = await Promise.all([
    hasPermissionFromRequest(request, "personnel", "read"),
    hasPermissionFromRequest(request, "personnel", "write"),
    hasPermissionFromRequest(request, "objects", "read"),
    hasPermissionFromRequest(request, "objects", "write"),
    hasPermissionFromRequest(request, "customers", "read"),
    hasPermissionFromRequest(request, "customers", "write"),
  ]);
  return checks.some(Boolean);
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let tenantId: string | null = null;
  let userId: string | null = null;

  try {
    tenantId = await requireCurrentTenantIdFromRequest(request);
    const supabase = createClientFromRequest(request);
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    if (!user) {
      return NextResponse.json(
        { error: createSafeGoogleMapsError("authentication_required") },
        { status: 401 },
      );
    }
    if (!(await canUseAddressSearch(request))) {
      return NextResponse.json(
        { error: createSafeGoogleMapsError("permission_denied") },
        { status: 403 },
      );
    }

    const parsed = autocompleteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: createSafeGoogleMapsError("invalid_request") },
        { status: 400 },
      );
    }
    if (parsed.data.input.trim().length < 3) {
      return NextResponse.json({ suggestions: [] });
    }

    const rateLimit = checkGoogleMapsRateLimit({
      tenantId,
      userId,
      action: "places_autocomplete",
    });
    if (!rateLimit.allowed) {
      await recordGoogleMapsUsageEvent({
        tenantId,
        userId,
        eventType: "google_api_rate_limited",
        environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
        success: false,
        responseTimeMs: Date.now() - startedAt,
        cacheOrDedupeStatus: "rate_limited",
        provider: "google_maps",
        estimatedSku: "places_autocomplete_new",
        metadata: { action: "places_autocomplete" },
      });
      return NextResponse.json(
        { error: createSafeGoogleMapsError("rate_limited", true) },
        { status: 429 },
      );
    }

    const secretGuard = assertGoogleMapsServerSecretsSafe();
    const config = getGoogleMapsRuntimeConfig();
    if (
      !secretGuard.ok ||
      !config.enabled ||
      !config.placesAutocompleteEnabled ||
      !config.serverApiKey
    ) {
      return NextResponse.json(
        { error: createSafeGoogleMapsError("configuration_error") },
        { status: 503 },
      );
    }

    if (shouldRecordAutocompleteSession({
      tenantId,
      userId,
      sessionToken: parsed.data.sessionToken,
    })) {
      await recordGoogleMapsUsageEvent({
        tenantId,
        userId,
        eventType: "autocomplete_session_started",
        environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
        success: true,
        responseTimeMs: Date.now() - startedAt,
        cacheOrDedupeStatus: "bypass",
        provider: "google_maps",
        estimatedSku: "places_autocomplete_session",
        metadata: { limit: parsed.data.limit ?? 6 },
      });
    }

    const result = await fetchGooglePlacesAutocomplete({
      input: parsed.data.input,
      sessionToken: parsed.data.sessionToken,
      limit: parsed.data.limit ?? 6,
      apiKey: config.serverApiKey,
      country: config.country,
      language: config.language,
      region: config.region,
    });

    await recordGoogleMapsUsageEvent({
      tenantId,
      userId,
      eventType: "autocomplete_request",
      environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
      success: true,
      responseTimeMs: Date.now() - startedAt,
      cacheOrDedupeStatus: result.dedupeStatus,
      provider: "google_maps",
      estimatedSku: "places_autocomplete_new",
      metadata: { suggestionCount: result.suggestions.length },
    });

    return NextResponse.json({ suggestions: result.suggestions });
  } catch (error) {
    console.error("[google-maps] places autocomplete failed", {
      surface: "backoffice",
      tenantId,
      userId,
      code: error instanceof GooglePlacesClientError ? error.code : "unknown",
      status: error instanceof GooglePlacesClientError ? error.status ?? null : null,
    });
    if (tenantId) {
      await recordGoogleMapsUsageEvent({
        tenantId,
        userId,
        eventType: "google_api_error",
        environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
        success: false,
        responseTimeMs: Date.now() - startedAt,
        cacheOrDedupeStatus: "bypass",
        provider: "google_maps",
        estimatedSku: "places_autocomplete_new",
        metadata: {
          code: error instanceof GooglePlacesClientError ? error.code : "unknown",
        },
      });
    }
    const safeError = error instanceof GooglePlacesClientError
      ? createSafeGoogleMapsError(error.code, error.retryable)
      : createSafeGoogleMapsError("unknown_error");
    const status = error instanceof GooglePlacesClientError && error.code === "rate_limited"
      ? 429
      : error instanceof GooglePlacesClientError && error.code === "configuration_error"
        ? 503
        : 502;
    return NextResponse.json({ error: safeError }, { status });
  }
}

