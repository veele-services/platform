export const FIELDGRID_SHARED_HOST_PATHS = {
  backoffice: "/admin",
  personnel: "/personeel",
  customer: "/klant",
} as const;

export type FieldgridSharedHostKind =
  | "production_tenant"
  | "staging_tenant"
  | "verified_custom_domain"
  | "unsupported";

export type FieldgridSharedHostRouteOwner =
  | "backoffice"
  | "personnel"
  | "customer"
  | "platform_api"
  | "website"
  | "reject";

export type FieldgridSharedHostRoute = {
  hostKind: FieldgridSharedHostKind;
  owner: FieldgridSharedHostRouteOwner;
  upstreamPath: string;
  preservePrefix: true;
};

const RESERVED_PRODUCTION_LABELS = new Set([
  "admin",
  "api",
  "app",
  "fieldgrid",
  "mail",
  "platform",
  "platform-staging",
  "staging",
  "support",
  "www",
]);

const APPLICATION_COOKIE_NAMES = new Set([
  "backoffice_tenant_id",
  "fg_backoffice_recovery_grant",
  "fg_customer_recovery_grant",
  "fg_personnel_recovery_grant",
  "fieldgrid_support_tenant_id",
  "veele_perms",
]);

const APPLICATION_COOKIE_PREFIXES = ["fieldgrid-auth-"] as const;

export function normalizeSharedHost(host: string): string {
  const first = host.split(",")[0]?.trim().toLowerCase() ?? "";
  if (!first) return "";
  const withoutProtocol = first.replace(/^[a-z][a-z0-9+.-]*:\/\//u, "");
  const authority = withoutProtocol.split(/[/?#]/u)[0] ?? "";
  const hostname = authority.startsWith("[")
    ? authority.slice(1, authority.indexOf("]"))
    : (authority.split("@").pop() ?? "").split(":")[0] ?? "";
  return hostname.replace(/\.$/u, "");
}

/**
 * Strict Host-header normalization for the public website runtime. Unlike the
 * general proxy helper this rejects forwarded lists, protocols, credentials,
 * paths and malformed ports before consulting the trusted database binding.
 */
export function normalizeWebsiteRequestHost(host: string): string {
  const value = host.trim();
  if (
    !value ||
    value.includes(",") ||
    value.includes("//") ||
    /[\s/@\\?#]/u.test(value)
  ) {
    return "";
  }

  const match = /^([a-z0-9.-]+)(?::([0-9]{1,5}))?$/iu.exec(value);
  if (!match?.[1]) return "";
  if (match[2] && Number(match[2]) > 65_535) return "";

  const normalized = normalizeSharedHost(match[1]);
  if (!normalized || normalized.length > 253) return "";
  return classifySharedHost(normalized, [normalized]) === "unsupported"
    ? ""
    : normalized;
}

function isTenantLabel(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(value);
}

function isVerifiedCustomHostname(value: string): boolean {
  if (
    value.length > 253 ||
    !value.includes(".") ||
    value === "fieldgrid.nl" ||
    value.endsWith(".fieldgrid.nl") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(value)
  ) {
    return false;
  }
  return value.split(".").every(isTenantLabel);
}

export function classifySharedHost(
  host: string,
  verifiedCustomDomains: readonly string[] = [],
): FieldgridSharedHostKind {
  const normalized = normalizeSharedHost(host);
  if (!normalized) return "unsupported";

  const stagingMatch = /^([^.]+)\.staging\.fieldgrid\.nl$/u.exec(normalized);
  if (stagingMatch?.[1] && isTenantLabel(stagingMatch[1])) return "staging_tenant";

  const productionMatch = /^([^.]+)\.fieldgrid\.nl$/u.exec(normalized);
  if (
    productionMatch?.[1] &&
    isTenantLabel(productionMatch[1]) &&
    !RESERVED_PRODUCTION_LABELS.has(productionMatch[1])
  ) {
    return "production_tenant";
  }

  const trustedCustomDomains = new Set(
    verifiedCustomDomains
      .map(normalizeSharedHost)
      .filter((value) => isVerifiedCustomHostname(value)),
  );
  return trustedCustomDomains.has(normalized) ? "verified_custom_domain" : "unsupported";
}

function ownsPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isPlatformApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isUnsafeSharedPath(pathname: string): boolean {
  return (
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    pathname.includes("\\") ||
    pathname.includes("?") ||
    pathname.includes("#") ||
    /[\u0000-\u001f\u007f]/u.test(pathname) ||
    /%(?:00|2f|5c)/iu.test(pathname)
  );
}

export function resolveSharedHostRoute(input: {
  host: string;
  pathname: string;
  verifiedCustomDomains?: readonly string[];
}): FieldgridSharedHostRoute {
  const hostKind = classifySharedHost(input.host, input.verifiedCustomDomains);
  const pathname = input.pathname || "/";
  if (hostKind === "unsupported" || isUnsafeSharedPath(pathname)) {
    return { hostKind, owner: "reject", upstreamPath: pathname, preservePrefix: true };
  }

  let owner: FieldgridSharedHostRouteOwner = "website";
  if (ownsPrefix(pathname, FIELDGRID_SHARED_HOST_PATHS.backoffice)) owner = "backoffice";
  else if (ownsPrefix(pathname, FIELDGRID_SHARED_HOST_PATHS.personnel)) owner = "personnel";
  else if (ownsPrefix(pathname, FIELDGRID_SHARED_HOST_PATHS.customer)) owner = "customer";
  else if (isPlatformApiPath(pathname)) owner = "platform_api";

  return { hostKind, owner, upstreamPath: pathname, preservePrefix: true };
}

export function isApplicationCookieName(name: string): boolean {
  return APPLICATION_COOKIE_NAMES.has(name) ||
    APPLICATION_COOKIE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * Defense in depth for the future website upstream. Browser path scoping is
 * authoritative for new application cookies; the edge additionally removes
 * legacy application cookies before a request is forwarded to public website
 * code.
 */
export function filterWebsiteCookieHeader(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader?.trim()) return null;
  const retained = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const separator = part.indexOf("=");
      const name = (separator === -1 ? part : part.slice(0, separator)).trim();
      return name && !isApplicationCookieName(name);
    });
  return retained.length > 0 ? retained.join("; ") : null;
}
