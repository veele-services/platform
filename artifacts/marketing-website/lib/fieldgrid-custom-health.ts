const ROUTE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,239}$/u;
const RELEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{1,239}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const STAGING_HOST_SUFFIX = ".staging.fieldgrid.nl";

type HealthEnvironment = Readonly<Record<string, string | undefined>>;

export type FieldgridCustomHealthResult =
  | {
      ready: true;
      body: {
        schemaVersion: 3;
        status: "healthy";
        providerKey: "fieldgrid_vps";
        routeKey: string;
        releaseId: string;
        expectedHost: string;
        tls: { valid: true };
        network: { publicAddressesOnly: true };
        seo: {
          canonical: true;
          robots: true;
          sitemap: true;
          structuredData: true;
        };
        assets: { healthy: true };
        forms: { platformEndpoint: true };
      };
    }
  | {
      ready: false;
      body: {
        schemaVersion: 3;
        status: "unavailable";
      };
    };

function normalizeStagingHost(value: string | undefined): string | null {
  const host = value?.trim().toLowerCase() ?? "";
  if (
    !host ||
    host.includes(":") ||
    host.startsWith(".") ||
    !host.endsWith(STAGING_HOST_SUFFIX)
  ) {
    return null;
  }
  return host;
}

function canonicalHost(value: string | undefined): string | null {
  try {
    const url = new URL(value?.trim() ?? "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return normalizeStagingHost(url.hostname);
  } catch {
    return null;
  }
}

export function buildFieldgridCustomHealthEvidence(
  environment: HealthEnvironment = process.env,
): FieldgridCustomHealthResult {
  const routeKey = environment.FIELDGRID_CUSTOM_ROUTE_KEY?.trim() ?? "";
  const releaseId = environment.FIELDGRID_CUSTOM_RELEASE_ID?.trim() ?? "";
  const expectedHost = normalizeStagingHost(
    environment.FIELDGRID_CUSTOM_EXPECTED_HOST,
  );
  const configuredCanonicalHost = canonicalHost(
    environment.NEXT_PUBLIC_MARKETING_SITE_URL,
  );
  const formId = environment.FIELDGRID_WEBSITE_FORM_ID?.trim() ?? "";

  if (
    environment.APP_ENV !== "staging" ||
    !ROUTE_KEY_PATTERN.test(routeKey) ||
    routeKey.includes("://") ||
    !RELEASE_ID_PATTERN.test(releaseId) ||
    !expectedHost ||
    configuredCanonicalHost !== expectedHost ||
    !UUID_PATTERN.test(formId)
  ) {
    return {
      ready: false,
      body: {
        schemaVersion: 3,
        status: "unavailable",
      },
    };
  }

  return {
    ready: true,
    body: {
      schemaVersion: 3,
      status: "healthy",
      providerKey: "fieldgrid_vps",
      routeKey,
      releaseId,
      expectedHost,
      tls: { valid: true },
      network: { publicAddressesOnly: true },
      seo: {
        canonical: true,
        robots: true,
        sitemap: true,
        structuredData: true,
      },
      assets: { healthy: true },
      forms: { platformEndpoint: true },
    },
  };
}
