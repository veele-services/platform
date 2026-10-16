export const FIELDGRID_MARKETING_ORIGIN = "https://www.fieldgrid.nl";
export const FIELDGRID_MARKETING_INTERNAL = "/fieldgrid-site";
export const FIELDGRID_MARKETING_ASSETS = "/fieldgrid-site-assets/";
export const FIELDGRID_PUBLIC_CRM_PATHS = ["/api/crm/intake", "/api/crm/availability"] as const;
export const FIELDGRID_LEGACY_PREFIXES = ["signature", "horizon", "atlas", "flow", "people"];

export function isInternalMarketingPath(path: string) {
  return path === FIELDGRID_MARKETING_INTERNAL || path.startsWith(`${FIELDGRID_MARKETING_INTERNAL}/`);
}

export function isMarketingPrivatePath(path: string) {
  return /^\/(?:api|app|staff|klant|login|auth|quote|booking|pay)(?:\/|$)/.test(path);
}
