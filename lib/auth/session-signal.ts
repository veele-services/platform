// Presentation signal only. Authorization always remains in the live data layer.
export const PROTECTED_PAGE_HEADER = "x-fieldgrid-protected-page";
// Internal presentation signal, always overwritten by the hostname proxy.
// It is not an authorization credential and never permits a data operation.
export const BROWSER_SESSION_HEADER = "x-fieldgrid-browser-session";
export const isProtectedPage = (path: string) => /^\/(app|staff|klant|platform)(\/|$)/.test(path);
