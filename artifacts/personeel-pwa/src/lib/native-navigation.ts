export const PERSONNEL_NATIVE_APP_TARGETS = {
  "nl.veeleservices.personeel": "https://veeleservices.fieldgrid.nl",
  "nl.fieldgrid.personeel": "https://fieldgrid.nl",
} as const;

export type PersonnelNativeAppId = keyof typeof PERSONNEL_NATIVE_APP_TARGETS;

export function isPersonnelNativeAppId(
  value: string,
): value is PersonnelNativeAppId {
  return Object.hasOwn(PERSONNEL_NATIVE_APP_TARGETS, value);
}

export function resolvePersonnelNativeUrl(
  rawUrl: string,
  appId: string,
): string | null {
  if (!isPersonnelNativeAppId(appId)) return null;
  const expectedOrigin = PERSONNEL_NATIVE_APP_TARGETS[appId];

  let url: URL;
  try {
    url = new URL(rawUrl, expectedOrigin);
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    url.origin !== expectedOrigin ||
    url.username ||
    url.password
  ) {
    return null;
  }

  if (
    url.pathname !== "/personeel" &&
    !url.pathname.startsWith("/personeel/")
  ) {
    return null;
  }

  return url.toString();
}
