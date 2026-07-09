import "server-only";

export type GeocodeAddressInput = {
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
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

type PdokResponse = {
  response?: {
    docs?: Array<{
      type?: string;
      weergavenaam?: string;
      centroide_ll?: string;
    }>;
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

  const query = buildGeocodeQuery(input);
  const params = new URLSearchParams({
    q: query,
    rows: "1",
    fq: "type:adres",
  });
  const url = `${PDOK_FREE_SEARCH_URL}?${params.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 4500);

  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        success: false,
        provider: "pdok",
        error: `Geocodingprovider gaf HTTP ${response.status}. Probeer later opnieuw.`,
        retryable: true,
      };
    }

    const payload = (await response.json()) as PdokResponse;
    const doc = payload.response?.docs?.[0];
    const point = parsePdokPoint(doc?.centroide_ll);
    if (!doc || !point) {
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
      latitude: point.latitude,
      longitude: point.longitude,
      confidence: confidenceForPdokType(doc.type),
      label: doc.weergavenaam ?? query,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      success: false,
      provider: "pdok",
      error: aborted
        ? "Geocodingprovider reageerde niet op tijd. Probeer later opnieuw."
        : "Geocodingprovider kon niet worden bereikt. Probeer later opnieuw.",
      retryable: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}
