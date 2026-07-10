import { NextResponse } from "next/server";
import { getMyPersonnel } from "@/actions/personnel";
import { fetchGooglePlacesAutocomplete } from "@workspace/db/google-places";

export async function GET(request: Request) {
  const personnel = await getMyPersonnel();
  if (!personnel) {
    return NextResponse.json({ suggestions: [] }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  if (query.trim().length < 3 || process.env.GOOGLE_PLACES_AUTOCOMPLETE_ENABLED === "false") {
    return NextResponse.json({ suggestions: [] });
  }
  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!apiKey) return NextResponse.json({ suggestions: [] });
  const result = await fetchGooglePlacesAutocomplete({
    input: query,
    sessionToken: url.searchParams.get("sessionToken") ?? crypto.randomUUID(),
    apiKey,
    country: process.env.GOOGLE_MAPS_DEFAULT_COUNTRY ?? "NL",
    language: process.env.GOOGLE_MAPS_DEFAULT_LANGUAGE ?? "nl",
    region: process.env.GOOGLE_MAPS_DEFAULT_REGION ?? "NL",
    limit: 6,
  });
  const suggestions = result.suggestions.map((suggestion) => ({
    ...suggestion,
    street: null,
    postalCode: null,
    city: null,
    country: process.env.GOOGLE_MAPS_DEFAULT_COUNTRY ?? "NL",
    confidence: 100,
  }));

  return NextResponse.json({ suggestions });
}
