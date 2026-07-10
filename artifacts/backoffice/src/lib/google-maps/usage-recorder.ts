import "server-only";

import { db, googleMapsUsageEventsTable } from "@workspace/db";
import { sanitizeGoogleMapsMetricMetadata } from "./metrics";
import type { GoogleMapsUsageMetricInput } from "./types";

export async function recordGoogleMapsUsageEvent(
  input: GoogleMapsUsageMetricInput,
): Promise<void> {
  try {
    await db.insert(googleMapsUsageEventsTable).values({
      tenantId: input.tenantId,
      userId: input.userId,
      eventType: input.eventType,
      environment: input.environment,
      success: input.success,
      responseTimeMs: input.responseTimeMs,
      cacheOrDedupeStatus: input.cacheOrDedupeStatus,
      provider: input.provider,
      estimatedSku: input.estimatedSku,
      metadata: sanitizeGoogleMapsMetricMetadata(input.metadata),
    });
  } catch (error) {
    console.error("[google-maps] usage event failed", {
      eventType: input.eventType,
      tenantId: input.tenantId,
      error,
    });
  }
}

