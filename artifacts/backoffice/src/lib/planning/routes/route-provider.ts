import "server-only";

import { createGoogleRoutesProvider } from "./google-routes-provider";
import { createMockRouteProvider } from "./mock-route-provider";
import type { FetchLike, RouteProvider } from "./types";

export type RouteProviderKind = "google" | "mock";

export type CreateRouteProviderOptions = {
  kind?: RouteProviderKind;
  googleApiKey?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  mockFailure?: boolean;
};

function routeProviderKindFromEnv(googleApiKey?: string): RouteProviderKind {
  if (process.env.FIELDGRID_ROUTE_PROVIDER === "mock") return "mock";
  if (process.env.FIELDGRID_ROUTE_PROVIDER === "google") return "google";
  return googleApiKey || process.env.GOOGLE_MAPS_SERVER_API_KEY
    ? "google"
    : "mock";
}

export function createRouteProvider(
  options: CreateRouteProviderOptions = {},
): RouteProvider {
  const kind = options.kind ?? routeProviderKindFromEnv(options.googleApiKey);

  if (kind === "mock") {
    return createMockRouteProvider({ forceFailure: options.mockFailure });
  }

  return createGoogleRoutesProvider({
    apiKey: options.googleApiKey,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });
}

export function getDefaultRouteProvider(): RouteProvider {
  return createRouteProvider();
}
