import { normalizeHost } from "./tenant-context";

export const FIELDGRID_DEPLOYMENT_ENVIRONMENTS = [
  "staging",
  "production",
] as const;

export type FieldgridDeploymentEnvironment =
  (typeof FIELDGRID_DEPLOYMENT_ENVIRONMENTS)[number];

const TENANT_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/u;
const RESERVED_TENANT_LABELS = new Set([
  "admin",
  "api",
  "app",
  "fieldgrid",
  "mail",
  "managed",
  "platform",
  "platform-staging",
  "staging",
  "support",
  "website-runtime",
  "www",
]);

export function resolveFieldgridDeploymentEnvironment(
  value = process.env.APP_ENV,
): FieldgridDeploymentEnvironment {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "staging" || normalized === "production") {
    return normalized;
  }
  throw new Error(
    "APP_ENV moet expliciet staging of production zijn voor tenantdomeinmutaties.",
  );
}

export function tenantDomainSuffixForEnvironment(
  environment: FieldgridDeploymentEnvironment,
): string {
  return environment === "staging" ? ".staging.fieldgrid.nl" : ".fieldgrid.nl";
}

function assertTenantLabel(label: string): void {
  if (
    !TENANT_LABEL_PATTERN.test(label) ||
    RESERVED_TENANT_LABELS.has(label) ||
    label.endsWith("-origin")
  ) {
    throw new Error(
      "Tenantlabel moet 3-63 geldige DNS-tekens bevatten en mag geen gereserveerde platformhost zijn.",
    );
  }
}

export function defaultTenantDomainForSlug(
  slug: string,
  environment: FieldgridDeploymentEnvironment,
): string {
  const label = slug.trim().toLowerCase();
  assertTenantLabel(label);
  return `${label}${tenantDomainSuffixForEnvironment(environment)}`;
}

export function tenantSlugFromManagedDomain(
  domain: string | null | undefined,
  environment: FieldgridDeploymentEnvironment,
): string | null {
  const normalized = normalizeHost(domain ?? "");
  const suffix = tenantDomainSuffixForEnvironment(environment);
  if (!normalized.endsWith(suffix)) return null;

  const label = normalized.slice(0, -suffix.length);
  if (!label || label.includes(".")) return null;

  try {
    assertTenantLabel(label);
    return label;
  } catch {
    return null;
  }
}

export function assertTenantDomainMatchesEnvironment(
  domain: string,
  environment: FieldgridDeploymentEnvironment,
): string {
  const normalized = normalizeHost(domain);
  const label = tenantSlugFromManagedDomain(normalized, environment);
  if (!label) {
    const expected =
      environment === "staging"
        ? "<tenant>.staging.fieldgrid.nl"
        : "<tenant>.fieldgrid.nl";
    throw new Error(
      `Primair tenantdomein moet in ${environment} exact ${expected} gebruiken.`,
    );
  }
  return normalized;
}

export function isTenantDomainAllowedForEnvironment(
  domain: string,
  environment: FieldgridDeploymentEnvironment,
): boolean {
  const normalized = normalizeHost(domain);
  if (!normalized) return false;
  if (normalized !== "fieldgrid.nl" && !normalized.endsWith(".fieldgrid.nl")) {
    return true;
  }
  return tenantSlugFromManagedDomain(normalized, environment) !== null;
}
