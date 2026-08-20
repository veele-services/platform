import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { createClientFromRequest } from "@/lib/supabase/server";
import { hasPermissionFromRequest } from "@/lib/auth/permissions";
import { requireCurrentTenantIdFromRequest } from "@/lib/auth/tenant";
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

async function canRecordGoogleMapsUsage(request: Request): Promise<boolean> {
  const checks = await Promise.all([
    hasPermissionFromRequest(request, "planning", "read"),
    hasPermissionFromRequest(request, "personnel", "read"),
    hasPermissionFromRequest(request, "objects", "read"),
    hasPermissionFromRequest(request, "customers", "read"),
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
    if (!(await canRecordGoogleMapsUsage(request))) {
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

    const rateLimit = await checkGoogleMapsRateLimit({
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
        { error: createSafeGoogleMapsError(rateLimit.reason === "service_unavailable" ? "configuration_error" : "rate_limited", true) },
        { status: rateLimit.reason === "service_unavailable" ? 503 : 429 },
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
