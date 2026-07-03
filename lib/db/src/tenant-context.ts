import {
  TENANT_RUNTIME_ACTIVE_STATUSES,
  type TenantPlanKey,
  type TenantStatus,
} from "./schema/tenants";

export const FIELDGRID_ROOT_DOMAIN = "fieldgrid.nl";
export const FIELDGRID_DOMAIN_SUFFIX = `.${FIELDGRID_ROOT_DOMAIN}`;
export const DEFAULT_PLATFORM_HOSTS = [
  "platform.fieldgrid.nl",
  "staging.fieldgrid.nl",
  "staging.veele.dgwebservices.nl",
] as const;

const TENANT_RUNTIME_ACTIVE_STATUS_SET = new Set<string>(TENANT_RUNTIME_ACTIVE_STATUSES);

export type ResolvedTenantContext = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  status: TenantStatus;
  planKey: TenantPlanKey;
};

export type HostTenantContext =
  | { kind: "tenant"; tenant: ResolvedTenantContext }
  | { kind: "platform" }
  | { kind: "blocked" }
  | { kind: "none" };

export function normalizeHost(host: string): string {
  const trimmedHost = host.trim().toLowerCase();
  if (!trimmedHost) return "";

  const withoutProtocol = trimmedHost.replace(/^[a-z][a-z0-9+.-]*:\/\//u, "");
  const withoutPath = withoutProtocol.split(/[/?#]/u)[0] ?? "";
  const withoutCredentials = withoutPath.split("@").pop() ?? "";
  const withoutPort = withoutCredentials.startsWith("[")
    ? withoutCredentials.slice(1, withoutCredentials.indexOf("]"))
    : withoutCredentials.split(":")[0];

  return withoutPort.replace(/\.$/u, "");
}

export function platformHosts(rawHosts = process.env.PLATFORM_HOSTS ?? ""): Set<string> {
  const configuredHosts = rawHosts
    .split(",")
    .map((host) => normalizeHost(host))
    .filter(Boolean);

  return new Set(configuredHosts.length > 0 ? configuredHosts : DEFAULT_PLATFORM_HOSTS);
}

export function isPlatformHost(host: string, rawHosts?: string): boolean {
  return platformHosts(rawHosts).has(normalizeHost(host));
}

export function isFieldgridSubdomain(host: string): boolean {
  const normalizedHost = normalizeHost(host);
  return (
    normalizedHost.endsWith(FIELDGRID_DOMAIN_SUFFIX) &&
    normalizedHost !== FIELDGRID_ROOT_DOMAIN &&
    !isPlatformHost(normalizedHost)
  );
}

export function isTenantRuntimeActive(tenant: Pick<ResolvedTenantContext, "isActive" | "status">): boolean {
  return tenant.isActive && TENANT_RUNTIME_ACTIVE_STATUS_SET.has(tenant.status);
}

export function isTenantRuntimeActiveStatus(status: string): boolean {
  return TENANT_RUNTIME_ACTIVE_STATUS_SET.has(status);
}
