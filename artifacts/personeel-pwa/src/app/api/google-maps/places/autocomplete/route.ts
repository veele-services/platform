import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getMyPersonnel } from "@/actions/personnel";
import { checkPersonnelGoogleMapsRateLimit } from "@/lib/google-maps/rate-limit";
import { fetchGooglePlacesAutocomplete, GooglePlacesClientError } from "@workspace/db/google-places";

const schema = z.object({
  input: z.string().max(160),
  sessionToken: z.string().min(8).max(128),
  limit: z.number().int().min(1).max(10).optional(),
});

export async function POST(request: Request) {
  try {
    const personnel = await getMyPersonnel();
    if (!personnel) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Ongeldige aanvraag" }, { status: 400 });
    if (parsed.data.input.trim().length < 3) return NextResponse.json({ suggestions: [] });
    const rateLimit = checkPersonnelGoogleMapsRateLimit({
      userId: personnel.id,
      action: "places_autocomplete",
    });
    if (!rateLimit.allowed) return NextResponse.json({ error: "Te veel adresverzoeken" }, { status: 429 });
    if (process.env.GOOGLE_PLACES_AUTOCOMPLETE_ENABLED === "false") return NextResponse.json({ suggestions: [] });
    const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    if (!apiKey) return NextResponse.json({ suggestions: [] }, { status: 503 });
    const result = await fetchGooglePlacesAutocomplete({
      input: parsed.data.input,
      sessionToken: parsed.data.sessionToken,
      apiKey,
      country: process.env.GOOGLE_MAPS_DEFAULT_COUNTRY ?? "NL",
      language: process.env.GOOGLE_MAPS_DEFAULT_LANGUAGE ?? "nl",
      region: process.env.GOOGLE_MAPS_DEFAULT_REGION ?? "NL",
      limit: parsed.data.limit ?? 6,
    });
    return NextResponse.json({ suggestions: result.suggestions });
  } catch (error) {
    const status = error instanceof GooglePlacesClientError && error.code === "rate_limited" ? 429 : 502;
    return NextResponse.json({ error: "Adresgegevens konden niet worden opgehaald" }, { status });
  }
}
