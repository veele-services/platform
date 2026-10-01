// Presentation signal only. Authorization always remains in the live data layer.
export const PROTECTED_PAGE_HEADER = "x-fieldgrid-protected-page";
export const isProtectedPage = (path: string) => /^\/(app|staff|klant|platform)(\/|$)/.test(path);
