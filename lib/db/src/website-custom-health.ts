import { lookup as nodeLookup } from "node:dns/promises";
import { request as nodeHttpsRequest } from "node:https";
import {
  customWebsiteHealthEvidenceMatches,
  customWebsiteOriginAddressesArePublic,
  type CustomWebsiteHealthEvidence,
  type CustomWebsiteRouteIdentity,
  type RoutableCustomWebsiteRouteRegistration,
} from "@workspace/website-core";

export const CUSTOM_WEBSITE_HEALTH_REQUEST_TIMEOUT_MS = 8_000;
export const CUSTOM_WEBSITE_HEALTH_RESPONSE_MAX_BYTES = 32_768;

export type CustomWebsiteHealthFailureCode =
  | "aborted"
  | "dns_failed"
  | "dns_non_public"
  | "evidence_mismatch"
  | "http_status"
  | "invalid_content_type"
  | "invalid_json"
  | "request_failed"
  | "response_too_large"
  | "route_identity_mismatch"
  | "timeout";

export class CustomWebsiteHealthCheckError extends Error {
  readonly code: CustomWebsiteHealthFailureCode;

  constructor(code: CustomWebsiteHealthFailureCode, message: string) {
    super(message);
    this.name = "CustomWebsiteHealthCheckError";
    this.code = code;
  }
}

type LookupAddress = {
  address: string;
  family: number;
};

export type CustomWebsiteHealthCheckOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxResponseBytes?: number;
  lookup?: (hostname: string) => Promise<readonly LookupAddress[]>;
  httpsRequest?: typeof nodeHttpsRequest;
};

function healthError(
  code: CustomWebsiteHealthFailureCode,
  message: string,
): CustomWebsiteHealthCheckError {
  return new CustomWebsiteHealthCheckError(code, message);
}

function abortReason(signal: AbortSignal): Error {
  if (signal.reason instanceof CustomWebsiteHealthCheckError) {
    return signal.reason;
  }
  return healthError("aborted", "Custom website health check was aborted");
}

async function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw abortReason(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function routeMatchesIdentity(
  registration: RoutableCustomWebsiteRouteRegistration,
  identity: CustomWebsiteRouteIdentity,
): boolean {
  return (
    registration.providerKey === identity.providerKey &&
    registration.routeKey === identity.routeKey &&
    registration.releaseId === identity.releaseId &&
    registration.healthPath === identity.healthPath &&
    registration.expectedHosts.includes(identity.expectedHost)
  );
}

function failureFromRequest(error: unknown): CustomWebsiteHealthCheckError {
  if (error instanceof CustomWebsiteHealthCheckError) return error;
  return healthError("request_failed", "Custom website health request failed");
}

/**
 * Requests one operator-owned custom origin. The database identity is used
 * only as evidence to match; it can never select or alter the upstream URL.
 */
export async function requestCustomWebsiteHealthEvidence(
  registration: RoutableCustomWebsiteRouteRegistration,
  identity: CustomWebsiteRouteIdentity,
  options: CustomWebsiteHealthCheckOptions = {},
): Promise<CustomWebsiteHealthEvidence> {
  if (!routeMatchesIdentity(registration, identity)) {
    throw healthError(
      "route_identity_mismatch",
      "Custom website route does not match the deployment identity",
    );
  }

  const timeoutMs =
    options.timeoutMs ?? CUSTOM_WEBSITE_HEALTH_REQUEST_TIMEOUT_MS;
  const maxResponseBytes =
    options.maxResponseBytes ?? CUSTOM_WEBSITE_HEALTH_RESPONSE_MAX_BYTES;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 30_000) {
    throw new Error("Custom website health timeout is outside safe bounds");
  }
  if (
    !Number.isInteger(maxResponseBytes) ||
    maxResponseBytes < 1_024 ||
    maxResponseBytes > 64 * 1_024
  ) {
    throw new Error("Custom website health response bound is invalid");
  }

  const deadline = new AbortController();
  const timeout = setTimeout(
    () =>
      deadline.abort(
        healthError("timeout", "Custom website health request timed out"),
      ),
    timeoutMs,
  );
  timeout.unref?.();
  const onExternalAbort = () =>
    deadline.abort(
      options.signal?.reason instanceof Error
        ? options.signal.reason
        : healthError("aborted", "Custom website health check was aborted"),
    );
  options.signal?.addEventListener("abort", onExternalAbort, { once: true });
  if (options.signal?.aborted) onExternalAbort();

  try {
    const origin = new URL(registration.upstreamOrigin);
    const lookup =
      options.lookup ??
      ((hostname: string) =>
        nodeLookup(hostname, {
          all: true,
          verbatim: true,
        }));

    let addresses: readonly LookupAddress[];
    try {
      addresses = await abortable(lookup(origin.hostname), deadline.signal);
    } catch (error) {
      if (deadline.signal.aborted) throw abortReason(deadline.signal);
      throw healthError("dns_failed", "Custom website origin lookup failed");
    }
    const addressValues = addresses.map((address) => address.address);
    if (
      addresses.some((address) => ![4, 6].includes(address.family)) ||
      !customWebsiteOriginAddressesArePublic(addressValues)
    ) {
      throw healthError(
        "dns_non_public",
        "Custom website route resolved to a non-public address",
      );
    }

    const selected = addresses[0]!;
    const path = new URL(identity.healthPath, `${origin.origin}/`);
    const httpsRequest = options.httpsRequest ?? nodeHttpsRequest;
    const raw = await new Promise<string>((resolve, reject) => {
      const request = httpsRequest(
        {
          protocol: "https:",
          hostname: origin.hostname,
          port: 443,
          method: "GET",
          path: `${path.pathname}${path.search}`,
          servername: origin.hostname,
          rejectUnauthorized: true,
          signal: deadline.signal,
          headers: {
            Accept: "application/json",
            Host: origin.hostname,
            "User-Agent": "Fieldgrid-Website-Health/1",
          },
          lookup(_hostname, _lookupOptions, callback) {
            callback(null, selected.address, selected.family);
          },
        },
        (response) => {
          if (response.statusCode !== 200) {
            response.resume();
            reject(
              healthError(
                "http_status",
                "Custom website health endpoint did not return HTTP 200",
              ),
            );
            return;
          }
          const contentType = String(response.headers["content-type"] ?? "")
            .split(";", 1)[0]
            ?.trim()
            .toLowerCase();
          if (contentType !== "application/json") {
            response.resume();
            reject(
              healthError(
                "invalid_content_type",
                "Custom website health endpoint did not return JSON",
              ),
            );
            return;
          }

          const contentLength = Number(response.headers["content-length"]);
          if (
            Number.isFinite(contentLength) &&
            contentLength > maxResponseBytes
          ) {
            response.resume();
            reject(
              healthError(
                "response_too_large",
                "Custom website health response is too large",
              ),
            );
            return;
          }

          let body = "";
          let bytes = 0;
          response.setEncoding("utf8");
          response.on("data", (chunk: string) => {
            bytes += Buffer.byteLength(chunk, "utf8");
            if (bytes > maxResponseBytes) {
              request.destroy(
                healthError(
                  "response_too_large",
                  "Custom website health response is too large",
                ),
              );
              return;
            }
            body += chunk;
          });
          response.on("end", () => resolve(body));
          response.on("error", () =>
            reject(
              healthError(
                "request_failed",
                "Custom website health response failed",
              ),
            ),
          );
          response.on("aborted", () =>
            reject(
              healthError(
                "request_failed",
                "Custom website health response was aborted",
              ),
            ),
          );
        },
      );
      request.on("error", (error) => {
        if (deadline.signal.aborted) {
          reject(abortReason(deadline.signal));
          return;
        }
        reject(failureFromRequest(error));
      });
      request.end();
    });

    let evidence: unknown;
    try {
      evidence = JSON.parse(raw);
    } catch {
      throw healthError(
        "invalid_json",
        "Custom website health endpoint returned invalid JSON",
      );
    }
    if (!customWebsiteHealthEvidenceMatches(evidence, identity)) {
      throw healthError(
        "evidence_mismatch",
        "Custom website health evidence does not match deployment",
      );
    }
    return evidence;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onExternalAbort);
  }
}

export function customWebsiteHealthFailureCode(
  error: unknown,
): CustomWebsiteHealthFailureCode | "unexpected" {
  return error instanceof CustomWebsiteHealthCheckError
    ? error.code
    : "unexpected";
}
