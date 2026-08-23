export const OBJECT_SECURITY_ACCESS_PATH_STATUS = {
  management: "implemented_disabled_by_default",
  personnel: "placeholder_fail_closed",
  customer: "placeholder_fail_closed",
  breakGlass: "placeholder_fail_closed",
} as const;

export function isObjectSecurityManagementAccessEnabled(
  environment:
    | NodeJS.ProcessEnv
    | Record<string, string | undefined> = process.env,
): boolean {
  return (
    environment.FIELDGRID_OBJECT_SECURITY_MANAGEMENT_ACCESS_ENABLED === "true"
  );
}

export function isObjectSecurityLegacyBackfillEnabled(
  environment:
    | NodeJS.ProcessEnv
    | Record<string, string | undefined> = process.env,
): boolean {
  return (
    environment.FIELDGRID_OBJECT_SECURITY_LEGACY_BACKFILL_ENABLED === "true"
  );
}

export function assertObjectSecurityManagementAccessEnabled(): void {
  if (!isObjectSecurityManagementAccessEnabled()) {
    throw new Error(
      "Object Security is nog niet geactiveerd voor deze omgeving.",
    );
  }
}
