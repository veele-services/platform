type PortalRouteBuilder = {
  home: string;
  notifications: string;
  assignment: (id: string) => string;
  ticket: (id: string) => string;
};

const CUSTOMER_ALLOWED_PREFIXES = [
  "/",
  "/objecten",
  "/opdrachten",
  "/facturen",
  "/betalingen",
  "/offertes",
  "/rapporten",
  "/documenten",
  "/meldingen",
  "/profiel",
  "/beveiliging",
  "/instellingen",
  "/meer",
  "/api/factuur",
  "/api/verzamelfactuur",
] as const;

const PERSONNEL_ALLOWED_PREFIXES = [
  "/",
  "/opdrachten",
  "/openstaand",
  "/uren",
  "/beschikbaarheid",
  "/verlof",
  "/berichten",
  "/meldingen",
  "/instellingen",
  "/beveiliging",
  "/documenten",
  "/profiel",
  "/nieuws",
  "/meer",
  "/scan/inventory",
  "/i",
] as const;

const BACKOFFICE_ALLOWED_PREFIXES = [
  "/",
  "/assignments",
  "/customers",
  "/objects",
  "/tickets",
  "/inventory",
  "/materials",
  "/personnel",
  "/planning",
  "/quotes",
  "/reports",
  "/invoices",
  "/documents",
  "/meldingen",
  "/settings",
  "/instellingen",
  "/platform",
] as const;

function segment(value: string): string {
  return encodeURIComponent(value.trim());
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function toLocalPath(rawHref: string | null | undefined): string | null {
  if (typeof rawHref !== "string") return null;
  const trimmed = rawHref.trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:/iu.test(trimmed) || trimmed.startsWith("//")) return null;

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/{2,}/gu, "/");
}

function stripBasePath(path: string, basePath: "/klant" | "/personeel"): string {
  if (path === basePath) return "/";
  if (path.startsWith(`${basePath}/`)) return path.slice(basePath.length) || "/";
  return path;
}

function mapLegacyCustomerHref(path: string): string {
  const customerTicket = path.match(/^\/tickets\/customer\/([^/?#]+)(.*)?$/u);
  if (customerTicket?.[1]) return customerPortalRoutes.ticket(decodeSegment(customerTicket[1]));

  const assignment = path.match(/^\/assignments\/([^/?#]+)(.*)?$/u);
  if (assignment?.[1]) return customerPortalRoutes.assignment(decodeSegment(assignment[1]));

  if (path === "/tickets/customer" || path === "/tickets") return customerPortalRoutes.notifications;
  if (path === "/assignments") return "/opdrachten";
  if (path === "/rapportages" || path.startsWith("/rapportages/")) return "/rapporten";
  return path;
}

function mapLegacyPersonnelHref(path: string): string {
  const personnelTicket = path.match(/^\/tickets\/personnel\/([^/?#]+)(.*)?$/u);
  if (personnelTicket?.[1]) return personnelPortalRoutes.ticket(decodeSegment(personnelTicket[1]));

  const assignment = path.match(/^\/assignments\/([^/?#]+)(.*)?$/u);
  if (assignment?.[1]) return personnelPortalRoutes.assignment(decodeSegment(assignment[1]));

  if (path === "/tickets/personnel" || path === "/tickets") return personnelPortalRoutes.notifications;
  if (path === "/assignments") return "/opdrachten";
  return path;
}

function isAllowed(path: string, prefixes: readonly string[]): boolean {
  const pathname = path.split(/[?#]/u, 1)[0] || "/";
  return prefixes.some((prefix) => (
    prefix === "/"
      ? pathname === "/"
      : pathname === prefix || pathname.startsWith(`${prefix}/`)
  ));
}

function sanitizePortalHref(
  rawHref: string | null | undefined,
  options: {
    basePath: "/klant" | "/personeel";
    fallback: string;
    allowedPrefixes: readonly string[];
    mapLegacyHref: (path: string) => string;
  },
): string {
  const localPath = toLocalPath(rawHref);
  if (!localPath) return options.fallback;

  const withoutBasePath = stripBasePath(localPath, options.basePath);
  const mapped = options.mapLegacyHref(withoutBasePath);
  return isAllowed(mapped, options.allowedPrefixes) ? mapped : options.fallback;
}

export const backofficeRoutes = {
  home: "/",
  assignment: (id: string) => `/assignments/${segment(id)}`,
  customerTicket: (id: string) => `/tickets/customer/${segment(id)}`,
  personnelTicket: (id: string) => `/tickets/personnel/${segment(id)}`,
  inventoryIssue: (id: string) => `/inventory/issues/${segment(id)}`,
};

export const customerPortalRoutes = {
  home: "/",
  notifications: "/meldingen",
  assignment: (id: string) => `/opdrachten/${segment(id)}`,
  ticket: (id: string) => `/meldingen/tickets/${segment(id)}`,
  invoice: (id: string) => `/facturen/${segment(id)}`,
} satisfies PortalRouteBuilder & {
  invoice: (id: string) => string;
};

export const personnelPortalRoutes = {
  home: "/",
  notifications: "/meldingen",
  assignment: (id: string) => `/opdrachten/${segment(id)}`,
  ticket: (id: string) => `/berichten/${segment(id)}`,
} satisfies PortalRouteBuilder;

export function sanitizeCustomerPortalHref(rawHref: string | null | undefined): string {
  return sanitizePortalHref(rawHref, {
    basePath: "/klant",
    fallback: customerPortalRoutes.notifications,
    allowedPrefixes: CUSTOMER_ALLOWED_PREFIXES,
    mapLegacyHref: mapLegacyCustomerHref,
  });
}

export function sanitizePersonnelPortalHref(rawHref: string | null | undefined): string {
  return sanitizePortalHref(rawHref, {
    basePath: "/personeel",
    fallback: personnelPortalRoutes.notifications,
    allowedPrefixes: PERSONNEL_ALLOWED_PREFIXES,
    mapLegacyHref: mapLegacyPersonnelHref,
  });
}

export function sanitizeBackofficeHref(rawHref: string | null | undefined): string {
  const localPath = toLocalPath(rawHref);
  if (!localPath) return "/meldingen";
  return isAllowed(localPath, BACKOFFICE_ALLOWED_PREFIXES) ? localPath : "/meldingen";
}
