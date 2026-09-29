import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext, hasAnyRole } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env/server";

const inputSchema = z.object({
  assignmentId: z.string().uuid(), direction: z.enum(["before", "after"]),
  origin: z.string().trim().min(3).max(500), destination: z.string().trim().min(3).max(500),
  mode: z.enum(["driving", "walking", "bicycling", "transit"]).default("driving"),
});

const googleMode = { driving: "DRIVE", walking: "WALK", bicycling: "BICYCLE", transit: "TRANSIT" } as const;

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context.tenant || !hasAnyRole(context, ["tenant_admin", "management", "planner"])) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Ongeldige routeaanvraag" }, { status: 400 });
  const supabase = await createClient();
  const base = { tenant_id: context.tenant.id, assignment_id: input.data.assignmentId, direction: input.data.direction, origin_address: { formatted: input.data.origin }, destination_address: { formatted: input.data.destination }, travel_mode: input.data.mode, provider: "google_routes", calculated_at: new Date().toISOString() };
  const env = getServerEnv();
  if (env.GOOGLE_ROUTES_ENABLED !== "true" || !env.GOOGLE_MAPS_SERVER_API_KEY) {
    await supabase.from("travel_legs").upsert({ ...base, estimated_minutes: null, estimated_distance_metres: null, provider_reference: null, error_code: "provider_not_configured" }, { onConflict: "tenant_id,assignment_id,direction" });
    return NextResponse.json({ known: false, reason: "Reistijdprovider is niet geconfigureerd" }, { status: 503 });
  }
  try {
    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST", headers: { "content-type": "application/json", "X-Goog-Api-Key": env.GOOGLE_MAPS_SERVER_API_KEY, "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.routeLabels" },
      body: JSON.stringify({ origin: { address: input.data.origin }, destination: { address: input.data.destination }, travelMode: googleMode[input.data.mode], routingPreference: input.data.mode === "driving" ? "TRAFFIC_AWARE" : undefined, departureTime: new Date(Date.now() + 60_000).toISOString(), languageCode: "nl-NL", units: "METRIC" }),
      signal: AbortSignal.timeout(10_000), cache: "no-store",
    });
    if (!response.ok) throw new Error(`provider_${response.status}`);
    const payload = await response.json() as { routes?: Array<{ duration?: string; distanceMeters?: number; routeLabels?: string[] }> };
    const route = payload.routes?.[0];
    const seconds = Number(route?.duration?.replace(/s$/, ""));
    if (!route || !Number.isFinite(seconds) || seconds <= 0) throw new Error("route_not_found");
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    const reference = createHash("sha256").update(JSON.stringify({ labels: route.routeLabels, distance: route.distanceMeters, duration: route.duration })).digest("hex").slice(0, 32);
    const { error } = await supabase.from("travel_legs").upsert({ ...base, estimated_minutes: minutes, estimated_distance_metres: route.distanceMeters ?? null, provider_reference: reference, error_code: null }, { onConflict: "tenant_id,assignment_id,direction" });
    if (error) throw error;
    return NextResponse.json({ known: true, minutes, distanceMetres: route.distanceMeters ?? null });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) : "provider_error";
    await supabase.from("travel_legs").upsert({ ...base, estimated_minutes: null, estimated_distance_metres: null, provider_reference: null, error_code: code }, { onConflict: "tenant_id,assignment_id,direction" });
    return NextResponse.json({ known: false, reason: "Reistijd onbekend; controleer adressen of probeer opnieuw" }, { status: 502 });
  }
}
