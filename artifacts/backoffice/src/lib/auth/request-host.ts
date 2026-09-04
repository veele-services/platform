import { normalizeHost } from "@workspace/db/tenant-context";

export type BackofficeRequestHost =
  | { kind: "host"; host: string }
  | { kind: "blocked" }
  | { kind: "none" };

type RequestHeaderReader = Pick<Headers, "get">;

const REQUEST_HOST_PATTERN =
  /^(?:\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::[0-9]{1,5})?$/iu;

export function readBackofficeRequestHost(
  requestHeaders: RequestHeaderReader,
  nodeEnvironment = process.env.NODE_ENV,
): BackofficeRequestHost {
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const rawHost = forwardedHost ?? requestHeaders.get("host") ?? "";
  const trimmedHost = rawHost.trim();

  if (!trimmedHost) {
    return nodeEnvironment === "production"
      ? { kind: "blocked" }
      : { kind: "none" };
  }
  if (trimmedHost.includes(",") || !REQUEST_HOST_PATTERN.test(trimmedHost)) {
    return { kind: "blocked" };
  }

  const normalizedHost = normalizeHost(trimmedHost);
  return normalizedHost
    ? { kind: "host", host: normalizedHost }
    : { kind: "blocked" };
}

export function isBackofficeDevelopmentFallbackHost(
  host: string,
  {
    nodeEnvironment = process.env.NODE_ENV,
    replitDomains = process.env.REPLIT_DOMAINS ?? "",
  }: { nodeEnvironment?: string; replitDomains?: string } = {},
): boolean {
  if (nodeEnvironment === "production") return false;
  if (["localhost", "127.0.0.1", "::1"].includes(host)) return true;

  return replitDomains
    .split(",")
    .map((domain) => normalizeHost(domain))
    .filter(Boolean)
    .includes(host);
}
