import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getMyCustomerIdentity } from "@/actions/customer";
import { checkCustomerGoogleMapsRateLimit } from "@/lib/google-maps/rate-limit";
import { fetchGooglePlaceDetails, GooglePlacesClientError } from "@workspace/db/google-places";

const schema = z.object({
  placeId: z.string().min(6).max(255),
  sessionToken: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  try {
    const identity = await getMyCustomerIdentity();
    if (!identity) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Ongeldige aanvraag" }, { status: 400 });
    const rateLimit = checkCustomerGoogleMapsRateLimit({
      userId: identity.userId,
      action: "place_details",
    });
    if (!rateLimit.allowed) return NextResponse.json({ error: "Te veel adresverzoeken" }, { status: 429 });
    const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Google Places is niet geconfigureerd" }, { status: 503 });
    const result = await fetchGooglePlaceDetails({
      placeId: parsed.data.placeId,
      sessionToken: parsed.data.sessionToken,
      apiKey,
      language: process.env.GOOGLE_MAPS_DEFAULT_LANGUAGE ?? "nl",
      region: process.env.GOOGLE_MAPS_DEFAULT_REGION ?? "NL",
    });
    return NextResponse.json({ place: result.place });
  } catch (error) {
    const status = error instanceof GooglePlacesClientError && error.code === "rate_limited" ? 429 : 502;
    return NextResponse.json({ error: "Adresdetails konden niet worden opgehaald" }, { status });
  }
}
