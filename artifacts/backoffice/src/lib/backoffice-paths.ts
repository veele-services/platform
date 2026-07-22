export const BACKOFFICE_BASE_PATH = "/admin" as const;

function isAbsoluteUrl(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//iu.test(value);
}

/**
 * Prefix a browser-visible or server redirect path with the real backoffice
 * base path. Next Link/useRouter already apply basePath and must keep using
 * unprefixed application paths; raw fetch, anchor, e-mail and redirect URLs
 * use this helper.
 */
export function backofficePath(path = "/"): string {
  if (isAbsoluteUrl(path)) {
    throw new Error("backofficePath only accepts same-origin paths.");
  }

  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (
    normalized === BACKOFFICE_BASE_PATH ||
    normalized.startsWith(`${BACKOFFICE_BASE_PATH}/`) ||
    normalized.startsWith(`${BACKOFFICE_BASE_PATH}?`) ||
    normalized.startsWith(`${BACKOFFICE_BASE_PATH}#`)
  ) {
    return normalized;
  }
  if (normalized === "/") return BACKOFFICE_BASE_PATH;
  return `${BACKOFFICE_BASE_PATH}${normalized}`;
}

export function stripBackofficeBasePath(pathname: string): string {
  if (pathname === BACKOFFICE_BASE_PATH) return "/";
  if (pathname.startsWith(`${BACKOFFICE_BASE_PATH}/`)) {
    return pathname.slice(BACKOFFICE_BASE_PATH.length) || "/";
  }
  return pathname;
}
