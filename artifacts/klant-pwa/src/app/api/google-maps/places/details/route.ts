import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getMyCustomerIdentity } from "@/actions/customer";
import { checkCustomerGoogleMapsRateLimit } from "@/lib/google-maps/rate-limit";
import { db, googleMapsUsageEventsTable } from "@workspace/db";
import { fetchGooglePlaceDetails, GooglePlacesClientError } from "@workspace/db/google-places";

const schema = z.object({
  placeId: z.string().min(6).max(255),
  sessionToken: z.string().min(8).max(128),
});

async function recordUsage(input: {
  tenantId: string;
  userId: string | null;
  eventType: "autocomplete_selection" | "place_details_request" | "google_api_error" | "google_api_rate_limited";
  success: boolean;
  responseTimeMs: number | null;
  cacheOrDedupeStatus: "miss" | "in_flight" | "deduped" | "bypass" | "rate_limited";
  estimatedSku: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  await db.insert(googleMapsUsageEventsTable).values({
    tenantId: input.tenantId,
    userId: input.userId,
    eventType: input.eventType,
    environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
    success: input.success,
    responseTimeMs: input.responseTimeMs,
    cacheOrDedupeStatus: input.cacheOrDedupeStatus,
    provider: "google_maps",
    estimatedSku: input.estimatedSku,
    metadata: {
      ...(input.metadata ?? {}),
      portal: "customer",
    },
  }).catch(() => {});
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let tenantId: string | null = null;
  let userId: string | null = null;
  try {
    const identity = await getMyCustomerIdentity();
    if (!identity) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    tenantId = identity.tenantId;
    userId = identity.userId;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Ongeldige aanvraag" }, { status: 400 });
    const rateLimit = checkCustomerGoogleMapsRateLimit({
      userId: identity.userId,
      action: "place_details",
    });
    if (!rateLimit.allowed) {
      await recordUsage({
        tenantId,
        userId,
        eventType: "google_api_rate_limited",
        success: false,
        responseTimeMs: Date.now() - startedAt,
        cacheOrDedupeStatus: "rate_limited",
        estimatedSku: "places_details_new_essentials",
        metadata: { action: "place_details" },
      });
      return NextResponse.json({ error: "Te veel adresverzoeken" }, { status: 429 });
    }
    const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Google Places is niet geconfigureerd" }, { status: 503 });
    const result = await fetchGooglePlaceDetails({
      placeId: parsed.data.placeId,
      sessionToken: parsed.data.sessionToken,
      apiKey,
      language: process.env.GOOGLE_MAPS_DEFAULT_LANGUAGE ?? "nl",
      region: process.env.GOOGLE_MAPS_DEFAULT_REGION ?? "NL",
    });
    await recordUsage({
      tenantId,
      userId,
      eventType: "autocomplete_selection",
      success: true,
      responseTimeMs: Date.now() - startedAt,
      cacheOrDedupeStatus: result.dedupeStatus,
      estimatedSku: "places_autocomplete_new",
      metadata: { selected: true },
    });
    await recordUsage({
      tenantId,
      userId,
      eventType: "place_details_request",
      success: true,
      responseTimeMs: Date.now() - startedAt,
      cacheOrDedupeStatus: result.dedupeStatus,
      estimatedSku: "places_details_new_essentials",
      metadata: { locationResolved: Boolean(result.place.latitude && result.place.longitude) },
    });
    return NextResponse.json({ place: result.place });
  } catch (error) {
    if (tenantId) {
      await recordUsage({
        tenantId,
        userId,
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
