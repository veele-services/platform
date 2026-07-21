import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getMyCustomerIdentity } from "@/actions/customer";
import { checkCustomerGoogleMapsRateLimit } from "@/lib/google-maps/rate-limit";
import { db, googleMapsUsageEventsTable, sanitizeGoogleMapsMetricMetadata } from "@workspace/db";
import { fetchGooglePlacesAutocomplete, GooglePlacesClientError } from "@workspace/db/google-places";

const schema = z.object({
  input: z.string().max(160),
  sessionToken: z.string().min(8).max(36),
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

async function recordUsage(input: {
  tenantId: string;
  userId: string | null;
  eventType: "autocomplete_request" | "autocomplete_session_started" | "google_api_error" | "google_api_rate_limited";
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
    metadata: sanitizeGoogleMapsMetricMetadata({
      ...(input.metadata ?? {}),
      portal: "customer",
    }),
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
    if (parsed.data.input.trim().length < 3) return NextResponse.json({ suggestions: [] });
    const rateLimit = checkCustomerGoogleMapsRateLimit({
      userId: identity.userId,
      action: "places_autocomplete",
    });
    if (!rateLimit.allowed) {
      await recordUsage({
        tenantId,
        userId,
        eventType: "google_api_rate_limited",
        success: false,
        responseTimeMs: Date.now() - startedAt,
        cacheOrDedupeStatus: "rate_limited",
        estimatedSku: "places_autocomplete_new",
        metadata: { action: "places_autocomplete" },
      });
      return NextResponse.json({ error: "Te veel adresverzoeken" }, { status: 429 });
    }
    if (process.env.GOOGLE_PLACES_AUTOCOMPLETE_ENABLED === "false") return NextResponse.json({ suggestions: [] });
    const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    if (!apiKey) return NextResponse.json({ suggestions: [] }, { status: 503 });
    if (shouldRecordAutocompleteSession({
      tenantId,
      userId,
      sessionToken: parsed.data.sessionToken,
    })) {
      await recordUsage({
        tenantId,
        userId,
        eventType: "autocomplete_session_started",
        success: true,
        responseTimeMs: Date.now() - startedAt,
        cacheOrDedupeStatus: "bypass",
        estimatedSku: "places_autocomplete_session",
        metadata: { limit: parsed.data.limit ?? 6 },
      });
    }
    const result = await fetchGooglePlacesAutocomplete({
      input: parsed.data.input,
      sessionToken: parsed.data.sessionToken,
      apiKey,
      country: process.env.GOOGLE_MAPS_DEFAULT_COUNTRY ?? "NL",
      language: process.env.GOOGLE_MAPS_DEFAULT_LANGUAGE ?? "nl",
      region: process.env.GOOGLE_MAPS_DEFAULT_REGION ?? "NL",
      limit: parsed.data.limit ?? 6,
    });
    await recordUsage({
      tenantId,
      userId,
      eventType: "autocomplete_request",
      success: true,
      responseTimeMs: Date.now() - startedAt,
      cacheOrDedupeStatus: result.dedupeStatus,
      estimatedSku: "places_autocomplete_new",
      metadata: { suggestionCount: result.suggestions.length },
    });
    return NextResponse.json({ suggestions: result.suggestions });
  } catch (error) {
    console.error("[google-maps] places autocomplete failed", {
      surface: "customer",
      tenantId,
      userId,
      code: error instanceof GooglePlacesClientError ? error.code : "unknown",
      status: error instanceof GooglePlacesClientError ? error.status ?? null : null,
    });
    if (tenantId) {
      await recordUsage({
        tenantId,
        userId,
        eventType: "google_api_error",
        success: false,
        responseTimeMs: Date.now() - startedAt,
        cacheOrDedupeStatus: "bypass",
        estimatedSku: "places_autocomplete_new",
        metadata: { code: error instanceof GooglePlacesClientError ? error.code : "unknown" },
      });
    }
    const status = error instanceof GooglePlacesClientError && error.code === "rate_limited" ? 429 : 502;
    return NextResponse.json({ error: "Adresgegevens konden niet worden opgehaald" }, { status });
  }
}
