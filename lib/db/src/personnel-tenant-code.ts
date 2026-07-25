export const PERSONNEL_TENANT_CODE_LENGTH = 6;
export const PERSONNEL_TENANT_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/u;
const PERSONNEL_PORTAL_BASE_PATH = "/personeel";

export function normalizePersonnelTenantCode(value: unknown): string {
  if (typeof value !== "string") return "";

  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/gu, "")
    .replace(/[01IO]/gu, "");
}

export function isValidPersonnelTenantCode(value: unknown): value is string {
  return PERSONNEL_TENANT_CODE_PATTERN.test(
    normalizePersonnelTenantCode(value),
  );
}

export function normalizePersonnelPortalNextPath(value: unknown): string {
  if (typeof value !== "string") return "/login";

  const candidate = value.trim();
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    candidate.includes("#")
  ) {
    return "/login";
  }

  const parsed = new URL(candidate, "https://fieldgrid.invalid");
  let pathname = parsed.pathname;
  if (pathname === PERSONNEL_PORTAL_BASE_PATH) {
    pathname = "/";
  } else if (pathname.startsWith(`${PERSONNEL_PORTAL_BASE_PATH}/`)) {
    pathname = pathname.slice(PERSONNEL_PORTAL_BASE_PATH.length) || "/";
  }

  if (
    pathname.startsWith("//") ||
    pathname === "/organisatie" ||
    pathname.startsWith("/organisatie/")
  ) {
    return "/login";
  }

  return `${pathname}${parsed.search}`;
}

export function buildPersonnelTenantEntryUrl(
  baseUrl: string,
  tenantCode: unknown,
  nextPath: unknown = "/login",
): string {
  const code = normalizePersonnelTenantCode(tenantCode);
  if (!isValidPersonnelTenantCode(code)) {
    throw new Error("Ongeldige personeelsorganisatiecode.");
  }

  const target = new URL(baseUrl);
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new Error("Ongeldige personeelsportaal-URL.");
  }

  target.username = "";
  target.password = "";
  target.pathname = `${PERSONNEL_PORTAL_BASE_PATH}/organisatie/${code}`;
  target.search = "";
  target.hash = "";
  target.searchParams.set("next", normalizePersonnelPortalNextPath(nextPath));
  return target.toString();
}
