import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { createClientFromRequest } from "@/lib/supabase/server";
import { hasAnyPermissionForRequestContext } from "@/lib/auth/permissions";
import { requireCurrentTenantIdFromRequest } from "@/lib/auth/tenant";
import {
  GooglePlacesClientError,
  assertGoogleMapsServerSecretsSafe,
  checkGoogleMapsRateLimit,
  fetchGooglePlaceDetails,
  getGoogleMapsRuntimeConfig,
  recordGoogleMapsUsageEvent,
} from "@/lib/google-maps";
import { createSafeGoogleMapsError } from "@/lib/google-maps/errors";

const detailsSchema = z.object({
  placeId: z.string().min(6).max(255),
  sessionToken: z.string().min(8).max(36),
});

const ADDRESS_SEARCH_PERMISSIONS = [
  { resource: "personnel", action: "read" },
  { resource: "personnel", action: "write" },
  { resource: "objects", action: "read" },
  { resource: "objects", action: "write" },
  { resource: "customers", action: "read" },
  { resource: "customers", action: "write" },
] as const;

async function canUseAddressSearch(input: {
  request: Request;
  userId: string;
  tenantId: string;
}): Promise<boolean> {
  return hasAnyPermissionForRequestContext({
    ...input,
    requirements: ADDRESS_SEARCH_PERMISSIONS,
  });
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
    if (!(await canUseAddressSearch({ request, userId: user.id, tenantId }))) {
      return NextResponse.json(
        { error: createSafeGoogleMapsError("permission_denied") },
        { status: 403 },
      );
    }

    const parsed = detailsSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: createSafeGoogleMapsError("invalid_request") },
        { status: 400 },
      );
    }

    const rateLimit = await checkGoogleMapsRateLimit({
      tenantId,
      userId,
      action: "place_details",
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
        estimatedSku: "places_details_new_essentials",
        metadata: { action: "place_details" },
      });
      return NextResponse.json(
        { error: createSafeGoogleMapsError(rateLimit.reason === "service_unavailable" ? "configuration_error" : "rate_limited", true) },
        { status: rateLimit.reason === "service_unavailable" ? 503 : 429 },
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

    const result = await fetchGooglePlaceDetails({
      placeId: parsed.data.placeId,
      sessionToken: parsed.data.sessionToken,
      apiKey: config.serverApiKey,
      language: config.language,
      region: config.region,
    });

    await recordGoogleMapsUsageEvent({
      tenantId,
      userId,
      eventType: "autocomplete_selection",
      environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
      success: true,
      responseTimeMs: Date.now() - startedAt,
      cacheOrDedupeStatus: result.dedupeStatus,
      provider: "google_maps",
      estimatedSku: "places_autocomplete_new",
      metadata: { selected: true },
    });

    await recordGoogleMapsUsageEvent({
      tenantId,
      userId,
      eventType: "place_details_request",
      environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
      success: true,
      responseTimeMs: Date.now() - startedAt,
      cacheOrDedupeStatus: result.dedupeStatus,
      provider: "google_maps",
      estimatedSku: "places_details_new_essentials",
      metadata: { locationResolved: Boolean(result.place.latitude && result.place.longitude) },
    });

    return NextResponse.json({ place: result.place });
  } catch (error) {
    console.error("[google-maps] place details failed", {
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
        estimatedSku: "places_details_new_essentials",
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
