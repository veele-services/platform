import { db, tenantDomainsTable, tenantsTable, type Tenant } from "@workspace/db";
import { and, eq, ne } from "drizzle-orm";

const FIELDGRID_ROOT_DOMAIN = "fieldgrid.nl";
const FIELDGRID_DOMAIN_SUFFIX = `.${FIELDGRID_ROOT_DOMAIN}`;
const DEFAULT_PLATFORM_HOSTS = ["platform.fieldgrid.nl", "staging.fieldgrid.nl"];

function platformHosts(): Set<string> {
  const configuredHosts = (process.env.PLATFORM_HOSTS ?? "")
    .split(",")
    .map((host) => normalizeHost(host))
    .filter(Boolean);

  return new Set(configuredHosts.length > 0 ? configuredHosts : DEFAULT_PLATFORM_HOSTS);
}

export type ResolvedTenant = Pick<Tenant, "id" | "slug" | "name" | "isActive">;

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

export function isPlatformHost(host: string): boolean {
  return platformHosts().has(normalizeHost(host));
}

export function isFieldgridSubdomain(host: string): boolean {
  const normalizedHost = normalizeHost(host);
  return (
    normalizedHost.endsWith(FIELDGRID_DOMAIN_SUFFIX) &&
    normalizedHost !== FIELDGRID_ROOT_DOMAIN &&
    !isPlatformHost(normalizedHost)
  );
}

export async function resolveTenantByHost(host: string): Promise<ResolvedTenant | null> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost || isPlatformHost(normalizedHost)) return null;

  const [tenant] = await db
    .select({
      id: tenantsTable.id,
      slug: tenantsTable.slug,
      name: tenantsTable.name,
      isActive: tenantsTable.isActive,
    })
    .from(tenantDomainsTable)
    .innerJoin(tenantsTable, eq(tenantDomainsTable.tenantId, tenantsTable.id))
    .where(
      and(
        eq(tenantDomainsTable.domain, normalizedHost),
        eq(tenantDomainsTable.verificationStatus, "verified"),
        ne(tenantDomainsTable.type, "platform_reserved"),
        eq(tenantsTable.isActive, true),
      ),
    )
    .limit(1);

  return tenant ?? null;
}

export async function requireTenantByHost(host: string): Promise<ResolvedTenant> {
  const tenant = await resolveTenantByHost(host);
  if (!tenant) {
    throw new Error("Geen actieve tenant gevonden voor deze host.");
  }
  return tenant;
}
