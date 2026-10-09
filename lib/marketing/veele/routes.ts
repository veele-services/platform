export const VEELE_WEBSITE_SLUG = "veele-services";

/** Application, token and asset routes always keep their existing handlers. */
export function publicMarketingPath(pathname: string): boolean {
  return !/^\/(?:api|app|staff|klant|platform|auth|login|aanvraag|quote|booking|pay|_next|veele-services|branding)(?:\/|$)/.test(pathname)
    && !/^\/(?:favicon\.svg|manifest\.webmanifest|sw\.js|offline\.html)$/.test(pathname);
}
