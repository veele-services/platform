import "server-only";

import {
  GOOGLE_MAPS_DEFAULT_COUNTRY,
  GOOGLE_MAPS_DEFAULT_LANGUAGE,
  GOOGLE_MAPS_DEFAULT_REGION,
  type GoogleMapsClientBootstrapConfig,
  type GoogleMapsRuntimeConfig,
  type GoogleMapsSecretGuardResult,
} from "./types";

const TRUE_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off", "disabled"]);

const PUBLIC_SECRET_ENV_NAMES = [
  "NEXT_PUBLIC_GOOGLE_MAPS_SERVER_API_KEY",
  "NEXT_PUBLIC_GOOGLE_ROUTES_API_KEY",
  "NEXT_PUBLIC_GOOGLE_PLACES_API_KEY",
] as const;

function readOptionalEnv(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

function readBooleanEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: boolean,
): boolean {
  const value = env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (TRUE_VALUES.has(value)) return true;
  if (FALSE_VALUES.has(value)) return false;
  return fallback;
}

export function getGoogleMapsRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): GoogleMapsRuntimeConfig {
  return {
    enabled: readBooleanEnv(env, "GOOGLE_MAPS_ENABLED", true),
    country:
      readOptionalEnv(env, "GOOGLE_MAPS_DEFAULT_COUNTRY") ??
      GOOGLE_MAPS_DEFAULT_COUNTRY,
    language:
      readOptionalEnv(env, "GOOGLE_MAPS_DEFAULT_LANGUAGE") ??
      GOOGLE_MAPS_DEFAULT_LANGUAGE,
    region:
      readOptionalEnv(env, "GOOGLE_MAPS_DEFAULT_REGION") ??
      GOOGLE_MAPS_DEFAULT_REGION,
    placesAutocompleteEnabled: readBooleanEnv(
      env,
      "GOOGLE_PLACES_AUTOCOMPLETE_ENABLED",
      true,
    ),
    routesEnabled: readBooleanEnv(env, "GOOGLE_ROUTES_ENABLED", true),
    routesTrafficEnabled: readBooleanEnv(
      env,
      "GOOGLE_ROUTES_TRAFFIC_ENABLED",
      true,
    ),
    browserApiKey: readOptionalEnv(env, "NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY"),
    serverApiKey: readOptionalEnv(env, "GOOGLE_MAPS_SERVER_API_KEY"),
    mapId: readOptionalEnv(env, "GOOGLE_MAPS_MAP_ID"),
    legacyGoogleRoutesApiKeyConfigured: Boolean(
      readOptionalEnv(env, "GOOGLE_ROUTES_API_KEY"),
    ),
  };
}

export function getGoogleMapsClientBootstrapConfig(
  env: NodeJS.ProcessEnv = process.env,
): GoogleMapsClientBootstrapConfig {
  const config = getGoogleMapsRuntimeConfig(env);
  return {
    enabled: config.enabled,
    browserApiKey: config.browserApiKey,
    mapId: config.mapId,
    language: config.language,
    region: config.region,
  };
}

export function assertGoogleMapsServerSecretsSafe(
  env: NodeJS.ProcessEnv = process.env,
): GoogleMapsSecretGuardResult {
  const errors: string[] = [];

  for (const publicSecretName of PUBLIC_SECRET_ENV_NAMES) {
    if (readOptionalEnv(env, publicSecretName)) {
      errors.push(
        `${publicSecretName} mag niet bestaan. Google serverkeys mogen nooit NEXT_PUBLIC_* zijn.`,
      );
    }
  }

  const serverKey = readOptionalEnv(env, "GOOGLE_MAPS_SERVER_API_KEY");
  const browserKey = readOptionalEnv(env, "NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY");
  if (serverKey && browserKey && serverKey === browserKey) {
    errors.push(
      "GOOGLE_MAPS_SERVER_API_KEY en NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY moeten gescheiden keys zijn.",
    );
  }

  return { ok: errors.length === 0, errors };
}

export function assertNoGoogleMapsServerSecretLeak(
  value: unknown,
  env: NodeJS.ProcessEnv = process.env,
): GoogleMapsSecretGuardResult {
  const errors: string[] = [];
  const serverKey = readOptionalEnv(env, "GOOGLE_MAPS_SERVER_API_KEY");
  if (!serverKey) return { ok: true, errors };

  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  if (serialized.includes(serverKey)) {
    errors.push("Google Maps serverkey lekt naar een client/public payload.");
  }

  return { ok: errors.length === 0, errors };
}

export function validateGoogleMapsRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): GoogleMapsSecretGuardResult {
  const errors = [...assertGoogleMapsServerSecretsSafe(env).errors];
  const config = getGoogleMapsRuntimeConfig(env);

  if (config.enabled && !config.browserApiKey) {
    errors.push(
      "NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY ontbreekt terwijl Google Maps aan staat.",
    );
  }

  if (config.enabled && !config.mapId) {
    errors.push("GOOGLE_MAPS_MAP_ID ontbreekt terwijl Google Maps aan staat.");
  }

  if (
    config.enabled &&
    (config.placesAutocompleteEnabled || config.routesEnabled) &&
    !config.serverApiKey
  ) {
    errors.push(
      "GOOGLE_MAPS_SERVER_API_KEY ontbreekt terwijl Places of Routes aan staat.",
    );
  }

  return { ok: errors.length === 0, errors };
}
