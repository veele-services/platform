import type { ReadyCustomWebsiteResolution } from "@workspace/db/website-public-runtime";

const FORWARDED_REQUEST_HEADERS = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "cache-control",
  "content-length",
  "content-type",
  "if-match",
  "if-modified-since",
  "if-none-match",
  "if-range",
  "if-unmodified-since",
  "range",
  "user-agent",
]);

export type CustomWebsiteRewrite = {
  destination: URL;
  requestHeaders: Headers;
};

/**
 * Builds a route-registry-owned external rewrite without forwarding tenant
 * application credentials, cookies or caller-controlled proxy headers.
 */
export function buildCustomWebsiteRewrite(
  requestUrl: URL,
  requestHeaders: Headers,
  resolution: ReadyCustomWebsiteResolution,
): CustomWebsiteRewrite {
  const destination = new URL(resolution.route.upstreamOrigin);
  destination.pathname = requestUrl.pathname;
  destination.search = requestUrl.search;
  const forwarded = new Headers();
  for (const [name, value] of requestHeaders) {
    if (FORWARDED_REQUEST_HEADERS.has(name.toLowerCase())) {
      forwarded.set(name, value);
    }
  }
  forwarded.set("x-forwarded-host", resolution.requestHostname);
  forwarded.set("x-forwarded-proto", "https");
  return { destination, requestHeaders: forwarded };
}
