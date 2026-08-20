import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getMyPersonnel } from "@/actions/personnel";
import { requireCurrentPersonnelPortalTenantId } from "@/lib/auth/tenant";
import { checkPersonnelGoogleMapsRateLimit } from "@/lib/google-maps/rate-limit";
import { db, googleMapsUsageEventsTable, sanitizeGoogleMapsMetricMetadata } from "@workspace/db";
import { fetchGooglePlaceDetails, GooglePlacesClientError } from "@workspace/db/google-places";

const schema = z.object({
  placeId: z.string().min(6).max(255),
  sessionToken: z.string().min(8).max(36),
});

async function recordUsage(input: {
  tenantId: string;
  personnelId: string | null;
  eventType: "autocomplete_selection" | "place_details_request" | "google_api_error" | "google_api_rate_limited";
  success: boolean;
  responseTimeMs: number | null;
  cacheOrDedupeStatus: "miss" | "in_flight" | "deduped" | "bypass" | "rate_limited";
  estimatedSku: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  await db.insert(googleMapsUsageEventsTable).values({
    tenantId: input.tenantId,
    userId: null,
    eventType: input.eventType,
    environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
    success: input.success,
    responseTimeMs: input.responseTimeMs,
    cacheOrDedupeStatus: input.cacheOrDedupeStatus,
    provider: "google_maps",
    estimatedSku: input.estimatedSku,
    metadata: sanitizeGoogleMapsMetricMetadata({
      ...(input.metadata ?? {}),
      portal: "personnel",
      actorPresent: Boolean(input.personnelId),
    }),
  }).catch(() => {});
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let tenantId: string | null = null;
  let personnelId: string | null = null;
  try {
    const personnel = await getMyPersonnel();
    if (!personnel) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    personnelId = personnel.id;
    tenantId = await requireCurrentPersonnelPortalTenantId();
    if (!tenantId) return NextResponse.json({ error: "Geen tenantcontext" }, { status: 401 });
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Ongeldige aanvraag" }, { status: 400 });
    const rateLimit = await checkPersonnelGoogleMapsRateLimit({
      tenantId,
      userId: personnel.id,
      action: "place_details",
    });
    if (!rateLimit.allowed) {
      await recordUsage({
        tenantId,
        personnelId,
        eventType: "google_api_rate_limited",
        success: false,
        responseTimeMs: Date.now() - startedAt,
        cacheOrDedupeStatus: "rate_limited",
        estimatedSku: "places_details_new_essentials",
        metadata: { action: "place_details" },
      });
      return NextResponse.json(
        { error: rateLimit.reason === "service_unavailable" ? "Adresservice tijdelijk niet beschikbaar" : "Te veel adresverzoeken" },
        { status: rateLimit.reason === "service_unavailable" ? 503 : 429 },
      );
    }
    const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Adresdetails konden niet worden opgehaald" }, { status: 503 });
    const result = await fetchGooglePlaceDetails({
      placeId: parsed.data.placeId,
      sessionToken: parsed.data.sessionToken,
      apiKey,
      language: process.env.GOOGLE_MAPS_DEFAULT_LANGUAGE ?? "nl",
      region: process.env.GOOGLE_MAPS_DEFAULT_REGION ?? "NL",
    });
    await recordUsage({
      tenantId,
      personnelId,
      eventType: "autocomplete_selection",
      success: true,
      responseTimeMs: Date.now() - startedAt,
      cacheOrDedupeStatus: result.dedupeStatus,
      estimatedSku: "places_autocomplete_new",
      metadata: { selected: true },
    });
    await recordUsage({
      tenantId,
      personnelId,
      eventType: "place_details_request",
      success: true,
      responseTimeMs: Date.now() - startedAt,
      cacheOrDedupeStatus: result.dedupeStatus,
      estimatedSku: "places_details_new_essentials",
      metadata: { locationResolved: Boolean(result.place.latitude && result.place.longitude) },
    });
    return NextResponse.json({ place: result.place });
  } catch (error) {
    console.error("[google-maps] place details failed", {
      surface: "personnel",
      tenantId,
      personnelId,
      code: error instanceof GooglePlacesClientError ? error.code : "unknown",
      status: error instanceof GooglePlacesClientError ? error.status ?? null : null,
    });
    if (tenantId) {
      await recordUsage({
        tenantId,
        personnelId,
        eventType: "google_api_error",
        success: false,
        responseTimeMs: Date.now() - startedAt,
        cacheOrDedupeStatus: "bypass",
        estimatedSku: "places_details_new_essentials",
        metadata: { code: error instanceof GooglePlacesClientError ? error.code : "unknown" },
      });
    }
    const status = error instanceof GooglePlacesClientError && error.code === "rate_limited" ? 429 : 502;
    return NextResponse.json({ error: "Adresdetails konden niet worden opgehaald" }, { status });
  }
}
