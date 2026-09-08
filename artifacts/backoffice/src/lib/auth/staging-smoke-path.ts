export const STAGING_SMOKE_AUTOMATION_PATH = "/api/platform/staging-smoke";

export function isStagingSmokeAutomationRequest(
  method: string,
  normalizedPathname: string,
  authorization: string | null,
): boolean {
  return (
    (method === "GET" || method === "HEAD") &&
    normalizedPathname === STAGING_SMOKE_AUTOMATION_PATH &&
    authorization !== null
  );
}
