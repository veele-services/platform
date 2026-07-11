import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import {
  fetchGooglePlacesAutocomplete,
  getGoogleMapsRuntimeConfig,
} from "@/lib/google-maps";

export async function GET(request: Request) {
  await requireCurrentTenantId();
  const [canReadPersonnel, canWritePersonnel, canReadObjects, canWriteObjects, canReadCustomers, canWriteCustomers] =
    await Promise.all([
      hasPermission("personnel", "read"),
      hasPermission("personnel", "write"),
      hasPermission("objects", "read"),
      hasPermission("objects", "write"),
      hasPermission("customers", "read"),
      hasPermission("customers", "write"),
    ]);
  if (!canReadPersonnel && !canWritePersonnel && !canReadObjects && !canWriteObjects && !canReadCustomers && !canWriteCustomers) {
    return NextResponse.json({ suggestions: [] }, { status: 403 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  if (query.trim().length < 3) {
    return NextResponse.json({ suggestions: [] });
  }

  const config = getGoogleMapsRuntimeConfig();
  if (!config.serverApiKey || !config.enabled || !config.placesAutocompleteEnabled) {
    return NextResponse.json({ suggestions: [] });
  }
  const result = await fetchGooglePlacesAutocomplete({
    input: query,
    sessionToken: url.searchParams.get("sessionToken") ?? crypto.randomUUID(),
    apiKey: config.serverApiKey,
    country: config.country,
    language: config.language,
    region: config.region,
    limit: 6,
  });
  const suggestions = result.suggestions.map((suggestion) => ({
    ...suggestion,
    street: null,
    postalCode: null,
    city: null,
    country: config.country,
    confidence: 100,
  }));

  return NextResponse.json({ suggestions });
}
