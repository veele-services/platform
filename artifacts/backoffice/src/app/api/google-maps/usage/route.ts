import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import {
  GOOGLE_MAPS_PROVIDER,
  checkGoogleMapsRateLimit,
  recordGoogleMapsUsageEvent,
} from "@/lib/google-maps";
import { createSafeGoogleMapsError } from "@/lib/google-maps/errors";

const usageSchema = z.object({
  eventType: z.enum([
    "maps_view_opened",
    "autocomplete_session_started",
    "autocomplete_selection",
  ]),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

async function canRecordGoogleMapsUsage(): Promise<boolean> {
  const checks = await Promise.all([
    hasPermission("planning", "read"),
    hasPermission("personnel", "read"),
    hasPermission("objects", "read"),
    hasPermission("customers", "read"),
  ]);
  return checks.some(Boolean);
}

function estimatedSkuForEvent(eventType: string): string | null {
  if (eventType === "maps_view_opened") return "maps_javascript_api_dynamic_map";
  if (eventType === "autocomplete_session_started") return "places_autocomplete_session";
  if (eventType === "autocomplete_selection") return "places_autocomplete_new";
  return null;
}

function logUsageEndpointError(input: {
  error: unknown;
  tenantId: string | null;
  userId: string | null;
}): void {
  console.error("[google-maps] usage endpoint failed", {
    tenantId: input.tenantId,
    userId: input.userId,
    errorName: input.error instanceof Error ? input.error.name : "unknown",
    errorMessage:
      input.error instanceof Error
        ? input.error.message.slice(0, 180)
        : "unknown",
  });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let tenantId: string | null = null;
  let userId: string | null = null;

  try {
    tenantId = await requireCurrentTenantId();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;

    if (!user) {
      return NextResponse.json(
        { error: createSafeGoogleMapsError("authentication_required") },
        { status: 401 },
      );
    }
    if (!(await canRecordGoogleMapsUsage())) {
      return NextResponse.json(
        { error: createSafeGoogleMapsError("permission_denied") },
        { status: 403 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: createSafeGoogleMapsError("invalid_request") },
        { status: 400 },
      );
    }

    const parsed = usageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: createSafeGoogleMapsError("invalid_request") },
        { status: 400 },
      );
    }

    const rateLimit = checkGoogleMapsRateLimit({
      tenantId,
      userId,
      action: "usage_event",
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
        provider: GOOGLE_MAPS_PROVIDER,
        estimatedSku: "maps_javascript_api_dynamic_map",
        metadata: { action: "usage_event" },
      });
      return NextResponse.json(
        { error: createSafeGoogleMapsError("rate_limited", true) },
        { status: 429 },
      );
    }

    await recordGoogleMapsUsageEvent({
      tenantId,
      userId,
      eventType: parsed.data.eventType,
      environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
      success: true,
      responseTimeMs: Date.now() - startedAt,
      cacheOrDedupeStatus: "bypass",
      provider: GOOGLE_MAPS_PROVIDER,
      estimatedSku: estimatedSkuForEvent(parsed.data.eventType),
      metadata: parsed.data.metadata ?? {},
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logUsageEndpointError({ error, tenantId, userId });
    return NextResponse.json(
      { error: createSafeGoogleMapsError("unknown_error") },
      { status: 500 },
    );
  }
}
