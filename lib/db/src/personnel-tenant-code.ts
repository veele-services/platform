export const PERSONNEL_TENANT_CODE_LENGTH = 6;
export const PERSONNEL_TENANT_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/u;

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
