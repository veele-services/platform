import type { CookieOptionsWithName } from "@supabase/ssr";
import { BACKOFFICE_BASE_PATH } from "@/lib/backoffice-paths";

const SUPABASE_AUTH_COOKIE_PREFIX = "fieldgrid-auth";

export function normalizeCookieHost(host: string | null | undefined): string {
  const firstHost = (host ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  if (!firstHost) return "";

  const withoutProtocol = firstHost.replace(/^[a-z][a-z0-9+.-]*:\/\//u, "");
  const withoutPath = withoutProtocol.split(/[/?#]/u)[0] ?? "";
  const withoutCredentials = withoutPath.split("@").pop() ?? "";
  const withoutPort = withoutCredentials.startsWith("[")
    ? withoutCredentials.slice(1, withoutCredentials.indexOf("]"))
    : withoutCredentials.split(":")[0];

  return withoutPort.replace(/\.$/u, "");
}

function cookieSafeHost(host: string): string {
  return host.replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
}

export function supabaseAuthCookieName(host: string | null | undefined): string {
  const normalizedHost = normalizeCookieHost(host);
  return `${SUPABASE_AUTH_COOKIE_PREFIX}-${normalizedHost ? cookieSafeHost(normalizedHost) : "local"}`;
}

export function createSupabaseCookieOptions(host: string | null | undefined): CookieOptionsWithName {
  // No domain attribute: host-only cookies isolate admin.fieldgrid.nl from slug.fieldgrid.nl tenants.
  return {
    name: supabaseAuthCookieName(host),
    path: BACKOFFICE_BASE_PATH,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  };
}

export function withHostOnlyCookieOptions(options: CookieOptionsWithName): CookieOptionsWithName {
  const { domain: _domain, ...hostOnlyOptions } = options;

  return {
    ...hostOnlyOptions,
    path: BACKOFFICE_BASE_PATH,
    sameSite: hostOnlyOptions.sameSite ?? "lax",
    secure: hostOnlyOptions.secure ?? process.env.NODE_ENV === "production",
  };
}
