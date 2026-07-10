export const GOOGLE_PLACES_AUTOCOMPLETE_URL =
  "https://places.googleapis.com/v1/places:autocomplete";

export const GOOGLE_PLACE_DETAILS_URL_PREFIX =
  "https://places.googleapis.com/v1/places/";

export const GOOGLE_PLACES_AUTOCOMPLETE_FIELD_MASK = [
  "suggestions.placePrediction.placeId",
  "suggestions.placePrediction.text",
  "suggestions.placePrediction.structuredFormat",
  "suggestions.placePrediction.types",
].join(",");

export const GOOGLE_PLACE_DETAILS_FIELD_MASK = [
  "id",
  "formattedAddress",
  "addressComponents",
  "location",
  "displayName",
  "types",
].join(",");

export const GOOGLE_PLACES_FORBIDDEN_EXPENSIVE_FIELDS = [
  "reviews",
  "rating",
  "photos",
  "regularOpeningHours",
  "internationalPhoneNumber",
  "nationalPhoneNumber",
  "websiteUri",
  "editorialSummary",
  "generativeSummary",
  "priceLevel",
] as const;

export type GooglePlacesFetch = typeof fetch;

export type GooglePlacesSuggestion = {
  id: string;
  placeId: string;
  label: string;
  mainText: string;
  secondaryText: string | null;
  types: string[];
  source: "google_places";
};

export type GooglePlaceAddress = {
  googlePlaceId: string;
  label: string;
  formattedAddress: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  stateOrRegion: string | null;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
  locationSource: "google_places";
  types: string[];
};

export type GooglePlacesAutocompleteInput = {
  input: string;
  sessionToken: string;
  apiKey: string;
  country?: string;
  language?: string;
  region?: string;
  limit?: number;
  fetchImpl?: GooglePlacesFetch;
};

export type GooglePlaceDetailsInput = {
  placeId: string;
  sessionToken: string;
  apiKey: string;
  language?: string;
  region?: string;
  fetchImpl?: GooglePlacesFetch;
};

export class GooglePlacesClientError extends Error {
  readonly code:
    | "configuration_error"
    | "invalid_request"
    | "rate_limited"
    | "provider_unavailable"
    | "no_results";
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    code: GooglePlacesClientError["code"],
    message: string,
    options: { retryable?: boolean; status?: number } = {},
  ) {
    super(message);
    this.name = "GooglePlacesClientError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }
}

type InFlightEntry<T> = {
  promise: Promise<T>;
  createdAt: number;
};

const inFlightRequests = new Map<string, InFlightEntry<unknown>>();

function dedupeKey(parts: Array<string | number | null | undefined>): string {
  return parts.map((part) => String(part ?? "")).join("\u001f");
}

async function withInFlightDedupe<T>(
  key: string,
  factory: () => Promise<T>,
): Promise<{ dedupeStatus: "miss" | "deduped"; value: T }> {
  const now = Date.now();
  const existing = inFlightRequests.get(key) as InFlightEntry<T> | undefined;
  if (existing && now - existing.createdAt < 10_000) {
    return { dedupeStatus: "deduped", value: await existing.promise };
  }

  const promise = factory().finally(() => {
    const current = inFlightRequests.get(key);
    if (current?.promise === promise) inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, { promise, createdAt: now });
  return { dedupeStatus: "miss", value: await promise };
}

function normalizeQuery(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function normalizeGooglePlacesSessionToken(value: string): string {
  return value.trim().slice(0, 128);
}

function assertGooglePlacesConfig(apiKey: string): void {
  if (!apiKey.trim()) {
    throw new GooglePlacesClientError(
      "configuration_error",
      "GOOGLE_MAPS_SERVER_API_KEY ontbreekt.",
    );
  }
}

function mapProviderStatus(status: number): GooglePlacesClientError {
  if (status === 429) {
    return new GooglePlacesClientError(
      "rate_limited",
      "Google Places rate limit bereikt.",
      { retryable: true, status },
    );
  }
  if (status === 404) {
    return new GooglePlacesClientError("no_results", "Plaats niet gevonden.", {
      status,
    });
  }
  if (status >= 500) {
    return new GooglePlacesClientError(
      "provider_unavailable",
      "Google Places is tijdelijk niet bereikbaar.",
      { retryable: true, status },
    );
  }
  return new GooglePlacesClientError(
    "invalid_request",
    "Google Places verzoek is geweigerd.",
    { status },
  );
}

function textValue(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const text = (value as { text?: unknown }).text;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

function parseAutocompleteSuggestion(
  raw: unknown,
): GooglePlacesSuggestion | null {
  if (!raw || typeof raw !== "object") return null;
  const prediction = (raw as { placePrediction?: unknown }).placePrediction;
  if (!prediction || typeof prediction !== "object") return null;

  const placeId = (prediction as { placeId?: unknown }).placeId;
  if (typeof placeId !== "string" || !placeId.trim()) return null;

  const text = textValue((prediction as { text?: unknown }).text);
  const structured = (prediction as { structuredFormat?: unknown }).structuredFormat as
    | { mainText?: unknown; secondaryText?: unknown }
    | undefined;
  const mainText =
    textValue(structured?.mainText) ??
    text ??
    placeId;
  const secondaryText = textValue(structured?.secondaryText);
  const types = Array.isArray((prediction as { types?: unknown }).types)
    ? ((prediction as { types: unknown[] }).types.filter(
        (type): type is string => typeof type === "string",
      ))
    : [];

  return {
    id: placeId,
    placeId,
    label: text ?? [mainText, secondaryText].filter(Boolean).join(", "),
    mainText,
    secondaryText,
    types,
    source: "google_places",
  };
}

type AddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

function componentByType(
  components: AddressComponent[],
  type: string,
): AddressComponent | null {
  return components.find((component) => component.types?.includes(type)) ?? null;
}

function componentText(
  components: AddressComponent[],
  type: string,
  preferred: "long" | "short" = "long",
): string | null {
  const component = componentByType(components, type);
  const value = preferred === "short" ? component?.shortText : component?.longText;
  return value?.trim() || null;
}

function parseAddressComponents(raw: unknown): AddressComponent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      longText: typeof entry.longText === "string" ? entry.longText : undefined,
      shortText: typeof entry.shortText === "string" ? entry.shortText : undefined,
      types: Array.isArray(entry.types)
        ? entry.types.filter((type): type is string => typeof type === "string")
        : [],
    }));
}

function parsePlaceAddress(raw: unknown): GooglePlaceAddress {
  if (!raw || typeof raw !== "object") {
    throw new GooglePlacesClientError("no_results", "Geen plaatsdetails gevonden.");
  }
  const place = raw as Record<string, unknown>;
  const googlePlaceId =
    typeof place.id === "string" && place.id.trim() ? place.id.trim() : null;
  if (!googlePlaceId) {
    throw new GooglePlacesClientError("no_results", "Plaatsdetails missen een id.");
  }

  const components = parseAddressComponents(place.addressComponents);
  const streetNumber = componentText(components, "street_number");
  const route = componentText(components, "route");
  const addressLine1 = [route, streetNumber].filter(Boolean).join(" ") || null;
  const city =
    componentText(components, "locality") ??
    componentText(components, "postal_town") ??
    componentText(components, "administrative_area_level_2");
  const countryCode =
    componentText(components, "country", "short")?.toUpperCase() ?? "NL";
  const formattedAddress =
    typeof place.formattedAddress === "string" && place.formattedAddress.trim()
      ? place.formattedAddress.trim()
      : null;
  const location = place.location as { latitude?: unknown; longitude?: unknown } | undefined;
  const latitude = typeof location?.latitude === "number" ? location.latitude : null;
  const longitude = typeof location?.longitude === "number" ? location.longitude : null;
  const displayName = textValue(place.displayName);
  const types = Array.isArray(place.types)
    ? place.types.filter((type): type is string => typeof type === "string")
    : [];

  return {
    googlePlaceId,
    label: displayName ?? formattedAddress ?? googlePlaceId,
    formattedAddress,
    addressLine1,
    addressLine2: null,
    postalCode: componentText(components, "postal_code"),
    city,
    stateOrRegion: componentText(components, "administrative_area_level_1"),
    countryCode,
    latitude,
    longitude,
    locationSource: "google_places",
    types,
  };
}

export async function fetchGooglePlacesAutocomplete(
  input: GooglePlacesAutocompleteInput,
): Promise<{
  suggestions: GooglePlacesSuggestion[];
  dedupeStatus: "miss" | "deduped";
  fieldMask: string;
}> {
  assertGooglePlacesConfig(input.apiKey);
  const normalizedInput = normalizeQuery(input.input);
  if (normalizedInput.length < 3) {
    return {
      suggestions: [],
      dedupeStatus: "miss",
      fieldMask: GOOGLE_PLACES_AUTOCOMPLETE_FIELD_MASK,
    };
  }
  const sessionToken = normalizeGooglePlacesSessionToken(input.sessionToken);
  if (!sessionToken) {
    throw new GooglePlacesClientError(
      "invalid_request",
      "Places session token ontbreekt.",
    );
  }

  const country = (input.country ?? "NL").toUpperCase();
  const language = input.language ?? "nl";
  const region = (input.region ?? country).toUpperCase();
  const key = dedupeKey([
    "autocomplete",
    country,
    language,
    region,
    normalizedInput.toLowerCase(),
    sessionToken,
  ]);

  const { dedupeStatus, value } = await withInFlightDedupe(key, async () => {
    const response = await (input.fetchImpl ?? fetch)(GOOGLE_PLACES_AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": input.apiKey,
        "X-Goog-FieldMask": GOOGLE_PLACES_AUTOCOMPLETE_FIELD_MASK,
      },
      body: JSON.stringify({
        input: normalizedInput,
        sessionToken,
        languageCode: language,
        regionCode: region,
        includedRegionCodes: [country],
        includeQueryPredictions: false,
      }),
    });

    if (!response.ok) throw mapProviderStatus(response.status);
    const payload = (await response.json()) as { suggestions?: unknown[] };
    return (payload.suggestions ?? [])
      .map(parseAutocompleteSuggestion)
      .filter((suggestion): suggestion is GooglePlacesSuggestion => Boolean(suggestion))
      .slice(0, input.limit ?? 6);
  });

  return {
    suggestions: value,
    dedupeStatus,
    fieldMask: GOOGLE_PLACES_AUTOCOMPLETE_FIELD_MASK,
  };
}

export async function fetchGooglePlaceDetails(
  input: GooglePlaceDetailsInput,
): Promise<{
  place: GooglePlaceAddress;
  dedupeStatus: "miss" | "deduped";
  fieldMask: string;
}> {
  assertGooglePlacesConfig(input.apiKey);
  const normalizedPlaceId = input.placeId.trim();
  const placeName = normalizedPlaceId.startsWith("places/")
    ? normalizedPlaceId
    : `places/${normalizedPlaceId}`;
  if (!/^places\/[A-Za-z0-9_-]+$/u.test(placeName)) {
    throw new GooglePlacesClientError("invalid_request", "Ongeldige Place ID.");
  }
  const sessionToken = normalizeGooglePlacesSessionToken(input.sessionToken);
  if (!sessionToken) {
    throw new GooglePlacesClientError(
      "invalid_request",
      "Places session token ontbreekt.",
    );
  }

  const language = input.language ?? "nl";
  const region = (input.region ?? "NL").toUpperCase();
  const key = dedupeKey(["details", language, region, placeName, sessionToken]);

  const { dedupeStatus, value } = await withInFlightDedupe(key, async () => {
    const url = new URL(`${GOOGLE_PLACE_DETAILS_URL_PREFIX}${encodeURIComponent(placeName.replace(/^places\//u, ""))}`);
    url.searchParams.set("languageCode", language);
    url.searchParams.set("regionCode", region);
    url.searchParams.set("sessionToken", sessionToken);

    const response = await (input.fetchImpl ?? fetch)(url, {
      headers: {
        "X-Goog-Api-Key": input.apiKey,
        "X-Goog-FieldMask": GOOGLE_PLACE_DETAILS_FIELD_MASK,
      },
    });

    if (!response.ok) throw mapProviderStatus(response.status);
    return parsePlaceAddress(await response.json());
  });

  return {
    place: value,
    dedupeStatus,
    fieldMask: GOOGLE_PLACE_DETAILS_FIELD_MASK,
  };
}

