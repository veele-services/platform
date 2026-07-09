export type GeocodeAddressInput = {
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
};

export type AddressSuggestion = {
  id: string;
  label: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: "Nederland";
  latitude: number;
  longitude: number;
  confidence: number;
  provider: "pdok";
};

export type GeocodeResult =
  | {
      success: true;
      provider: "pdok";
      latitude: number;
      longitude: number;
      confidence: number;
      label: string;
    }
  | {
      success: false;
      provider: "pdok";
      error: string;
      retryable: boolean;
    };

type PdokDoc = {
  id?: string;
  type?: string;
  weergavenaam?: string;
  centroide_ll?: string;
  straatnaam?: string;
  huisnummer?: string | number;
  huisletter?: string;
  huisnummertoevoeging?: string;
  postcode?: string;
  woonplaatsnaam?: string;
};

type PdokResponse = {
  response?: {
    docs?: PdokDoc[];
  };
};

type FetchLike = typeof fetch;

const PDOK_FREE_SEARCH_URL =
  "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function isDutchAddress(country: string | null | undefined): boolean {
  const normalized = normalize(country).toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "nl" ||
    normalized === "nld" ||
    normalized === "nederland" ||
    normalized === "netherlands"
  );
}

export function hasGeocodableAddress(input: GeocodeAddressInput): boolean {
  return [input.address, input.postalCode, input.city].some(
    (value) => normalize(value).length > 0,
  );
}

export function buildGeocodeQuery(input: GeocodeAddressInput): string {
  return [input.address, input.postalCode, input.city]
    .map(normalize)
    .filter(Boolean)
    .join(" ");
}

export function parsePdokPoint(value: string | null | undefined): {
  latitude: number;
  longitude: number;
} | null {
  const match = /^POINT\(([-\d.]+)\s+([-\d.]+)\)$/.exec(normalize(value));
  if (!match) return null;

  const longitude = Number.parseFloat(match[1] ?? "");
  const latitude = Number.parseFloat(match[2] ?? "");
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
}

function confidenceForPdokType(type: string | null | undefined): number {
  switch (normalize(type).toLowerCase()) {
    case "adres":
      return 95;
    case "postcode":
      return 85;
    case "woonplaats":
      return 60;
    default:
      return 75;
  }
}

function buildStreet(doc: PdokDoc): string | null {
  const street = normalize(doc.straatnaam);
  if (!street) return null;

  const houseNumber = normalize(String(doc.huisnummer ?? ""));
  const suffix = [doc.huisletter, doc.huisnummertoevoeging]
    .map(normalize)
    .filter(Boolean)
    .join("");
  return [street, `${houseNumber}${suffix}`.trim()].filter(Boolean).join(" ");
}

function suggestionFromPdokDoc(doc: PdokDoc, fallbackId: string): AddressSuggestion | null {
  const point = parsePdokPoint(doc.centroide_ll);
  if (!point) return null;

  return {
    id: doc.id ?? fallbackId,
    label: doc.weergavenaam ?? [buildStreet(doc), doc.postcode, doc.woonplaatsnaam]
      .map(normalize)
      .filter(Boolean)
      .join(", "),
    street: buildStreet(doc),
    postalCode: normalize(doc.postcode) || null,
    city: normalize(doc.woonplaatsnaam) || null,
    country: "Nederland",
    latitude: point.latitude,
    longitude: point.longitude,
    confidence: confidenceForPdokType(doc.type),
    provider: "pdok",
  };
}

export async function suggestDutchAddresses(
  query: string,
  options: {
    fetchImpl?: FetchLike;
    timeoutMs?: number;
    limit?: number;
  } = {},
): Promise<AddressSuggestion[]> {
  const q = normalize(query);
  if (q.length < 4) return [];

  const limit = Math.max(1, Math.min(options.limit ?? 6, 10));
  const params = new URLSearchParams({
    q,
    rows: String(limit),
    fq: "type:adres",
  });
  const url = `${PDOK_FREE_SEARCH_URL}?${params.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 3500);

  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as PdokResponse;
    return (payload.response?.docs ?? [])
      .map((doc, index) => suggestionFromPdokDoc(doc, `pdok-${index}`))
      .filter((suggestion): suggestion is AddressSuggestion => Boolean(suggestion));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function geocodeAddress(
  input: GeocodeAddressInput,
  options: {
    fetchImpl?: FetchLike;
    timeoutMs?: number;
  } = {},
): Promise<GeocodeResult> {
  if (!hasGeocodableAddress(input)) {
    return {
      success: false,
      provider: "pdok",
      error: "Adresgegevens ontbreken. Vul straat, postcode of plaats in.",
      retryable: false,
    };
  }

  if (!isDutchAddress(input.country)) {
    return {
      success: false,
      provider: "pdok",
      error: "Automatisch geocoden ondersteunt in deze fase alleen Nederlandse adressen.",
      retryable: false,
    };
  }

  const suggestions = await suggestDutchAddresses(buildGeocodeQuery(input), {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs ?? 4500,
    limit: 1,
  });
  const suggestion = suggestions[0];
  if (!suggestion) {
    return {
      success: false,
      provider: "pdok",
      error: "Geen betrouwbare locatie gevonden voor dit adres.",
      retryable: false,
    };
  }

  return {
    success: true,
    provider: "pdok",
    latitude: suggestion.latitude,
    longitude: suggestion.longitude,
    confidence: suggestion.confidence,
    label: suggestion.label,
  };
}
