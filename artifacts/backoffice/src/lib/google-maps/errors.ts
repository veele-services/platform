export type GoogleMapsErrorCode =
  | "configuration_error"
  | "authentication_required"
  | "permission_denied"
  | "invalid_request"
  | "rate_limited"
  | "provider_unavailable"
  | "no_results"
  | "unknown_error";

export type SafeGoogleMapsError = {
  code: GoogleMapsErrorCode;
  message: string;
  retryable: boolean;
};

const SAFE_ERROR_MESSAGES: Record<GoogleMapsErrorCode, string> = {
  configuration_error:
    "Kaart- of routeconfiguratie ontbreekt. Controleer de platforminstellingen.",
  authentication_required: "Log in om kaart- of routegegevens te gebruiken.",
  permission_denied: "U heeft geen toegang tot deze kaart- of routegegevens.",
  invalid_request: "De opgegeven locatiegegevens zijn niet volledig.",
  rate_limited:
    "Er zijn tijdelijk te veel kaart- of routeverzoeken gedaan. Probeer later opnieuw.",
  provider_unavailable:
    "Google Maps is tijdelijk niet bereikbaar. De kerngegevens blijven beschikbaar.",
  no_results: "Er is geen geschikte locatie of route gevonden.",
  unknown_error:
    "Kaart- of routegegevens konden niet worden opgehaald. Probeer opnieuw.",
};

export function createSafeGoogleMapsError(
  code: GoogleMapsErrorCode,
  retryable = false,
): SafeGoogleMapsError {
  return {
    code,
    message: SAFE_ERROR_MESSAGES[code],
    retryable,
  };
}

export function mapGoogleHttpStatusToError(status: number): SafeGoogleMapsError {
  if (status === 401 || status === 403) {
    return createSafeGoogleMapsError("configuration_error", false);
  }
  if (status === 404) {
    return createSafeGoogleMapsError("no_results", false);
  }
  if (status === 429) {
    return createSafeGoogleMapsError("rate_limited", true);
  }
  if (status >= 500) {
    return createSafeGoogleMapsError("provider_unavailable", true);
  }
  return createSafeGoogleMapsError("unknown_error", false);
}
