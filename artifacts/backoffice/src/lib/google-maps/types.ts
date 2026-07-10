export const GOOGLE_MAPS_PROVIDER = "google_maps" as const;

export const GOOGLE_MAPS_DEFAULT_COUNTRY = "NL" as const;
export const GOOGLE_MAPS_DEFAULT_LANGUAGE = "nl" as const;
export const GOOGLE_MAPS_DEFAULT_REGION = "NL" as const;

export const GOOGLE_MAPS_USAGE_EVENTS = [
  "maps_view_opened",
  "autocomplete_request",
  "autocomplete_session_started",
  "autocomplete_selection",
  "place_details_request",
  "route_request",
  "route_request_drive_traffic",
  "route_request_bicycle",
  "route_request_walk",
  "route_request_transit",
  "google_api_error",
  "google_api_rate_limited",
] as const;

export type GoogleMapsUsageEvent = (typeof GOOGLE_MAPS_USAGE_EVENTS)[number];

export type GoogleMapsTravelMode = "DRIVE" | "BICYCLE" | "WALK" | "TRANSIT";

export type GoogleMapsRouteTrafficPreference = "TRAFFIC_AWARE";

export type GoogleMapsEnvironmentDefaults = {
  enabled: boolean;
  country: string;
  language: string;
  region: string;
  placesAutocompleteEnabled: boolean;
  routesEnabled: boolean;
  routesTrafficEnabled: boolean;
};

export type GoogleMapsRuntimeConfig = GoogleMapsEnvironmentDefaults & {
  browserApiKey: string | null;
  serverApiKey: string | null;
  mapId: string | null;
  legacyGoogleRoutesApiKeyConfigured: boolean;
};

export type GoogleMapsClientBootstrapConfig = {
  enabled: boolean;
  browserApiKey: string | null;
  mapId: string | null;
  language: string;
  region: string;
};

export type GoogleMapsSecretGuardResult = {
  ok: boolean;
  errors: string[];
};

export type GoogleMapsCoordinate = {
  lat: number;
  lng: number;
};

export type GoogleMapsDedupeStatus = "miss" | "in_flight" | "deduped";

export type GoogleMapsUsageMetricInput = {
  tenantId: string;
  userId: string | null;
  eventType: GoogleMapsUsageEvent;
  environment: string;
  success: boolean;
  responseTimeMs: number | null;
  cacheOrDedupeStatus:
    | GoogleMapsDedupeStatus
    | "cache_hit"
    | "cache_miss"
    | "bypass"
    | "rate_limited";
  provider: typeof GOOGLE_MAPS_PROVIDER;
  estimatedSku: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};
