import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import {
  GOOGLE_MAPS_PROVIDER,
  recordGoogleMapsUsageEvent,
} from "@/lib/google-maps";

const usageSchema = z.object({
  eventType: z.enum([
    "maps_view_opened",
    "autocomplete_session_started",
    "autocomplete_selection",
  ]),
  estimatedSku: z.string().max(120).nullable().optional(),
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

function estimatedSkuForEvent(eventType: string, estimatedSku?: string | null): string | null {
  if (estimatedSku) return estimatedSku;
  if (eventType === "maps_view_opened") return "maps_javascript_api_dynamic_map";
  if (eventType === "autocomplete_session_started") return "places_autocomplete_session";
  if (eventType === "autocomplete_selection") return "places_autocomplete_new";
  return null;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const tenantId = await requireCurrentTenantId();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  if (!(await canRecordGoogleMapsUsage())) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const parsed = usageSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige aanvraag" }, { status: 400 });
  }

  await recordGoogleMapsUsageEvent({
    tenantId,
    userId: user.id,
    eventType: parsed.data.eventType,
    environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
    success: true,
    responseTimeMs: Date.now() - startedAt,
    cacheOrDedupeStatus: "bypass",
    provider: GOOGLE_MAPS_PROVIDER,
    estimatedSku: estimatedSkuForEvent(parsed.data.eventType, parsed.data.estimatedSku),
    metadata: parsed.data.metadata ?? {},
  });

  return NextResponse.json({ ok: true });
}
