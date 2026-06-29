import { db, DEFAULT_TENANT_ID, tenantUsersTable, tenantsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const BACKOFFICE_TENANT_COOKIE = "backoffice_tenant_id";

export type BackofficeTenantOption = {
  id: string;
  name: string;
  slug: string;
};

export async function getCurrentBackofficeUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

function normalizeHost(host: string | null): string | null {
  if (!host) return null;
  return host.split(":")[0]?.trim().toLowerCase() || null;
}

function tenantSlugFromHost(host: string | null): string | null {
  const normalized = normalizeHost(host);
  if (!normalized) return null;

  const explicitHosts = (process.env.BACKOFFICE_TENANT_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (explicitHosts.includes(normalized)) return normalized.split(".")[0] ?? null;

  const parts = normalized.split(".").filter(Boolean);
  if (parts.length < 3) return null;

  const [subdomain] = parts;
  if (!subdomain || ["www", "app", "admin", "backoffice"].includes(subdomain)) return null;
  return subdomain;
}

function isDefaultTenantFallbackAllowed(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_DEFAULT_TENANT_FALLBACK === "true"
  );
}

function logDefaultTenantFallback(reason: string, userId: string | null): void {
  console.warn("[tenant] DEFAULT_TENANT_ID fallback gebruikt", {
    reason,
    userId,
    tenantId: DEFAULT_TENANT_ID,
  });
}

async function getHostTenantId(): Promise<string | null> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const slug = tenantSlugFromHost(host);
  if (!slug) return null;

  const [tenant] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(and(eq(tenantsTable.slug, slug), eq(tenantsTable.isActive, true)))
    .limit(1);

  return tenant?.id ?? null;
}

export async function getActiveBackofficeTenantsForUser(userId: string): Promise<BackofficeTenantOption[]> {
  return db
    .select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      slug: tenantsTable.slug,
    })
    .from(tenantUsersTable)
    .innerJoin(tenantsTable, eq(tenantUsersTable.tenantId, tenantsTable.id))
    .where(
      and(
        eq(tenantUsersTable.userId, userId),
        eq(tenantUsersTable.status, "active"),
        eq(tenantsTable.isActive, true),
      ),
    )
    .orderBy(tenantsTable.name);
}

export async function userHasActiveTenant(userId: string, tenantId: string): Promise<boolean> {
  const [tenantUser] = await db
    .select({ tenantId: tenantUsersTable.tenantId })
    .from(tenantUsersTable)
    .innerJoin(tenantsTable, eq(tenantUsersTable.tenantId, tenantsTable.id))
    .where(
      and(
        eq(tenantUsersTable.userId, userId),
        eq(tenantUsersTable.tenantId, tenantId),
        eq(tenantUsersTable.status, "active"),
        eq(tenantsTable.isActive, true),
      ),
    )
    .limit(1);

  return Boolean(tenantUser);
}

export async function getCurrentTenantId(): Promise<string | null> {
  const user = await getCurrentBackofficeUser();
  if (!user) {
    if (isDefaultTenantFallbackAllowed()) {
      logDefaultTenantFallback("missing_authenticated_user", null);
      return DEFAULT_TENANT_ID;
    }

    return null;
  }

  const hostTenantId = await getHostTenantId();
  if (hostTenantId) {
    if (await userHasActiveTenant(user.id, hostTenantId)) {
      return hostTenantId;
    }

    return null;
  }

  const tenantOptions = await getActiveBackofficeTenantsForUser(user.id);
  if (tenantOptions.length === 0) {
    if (isDefaultTenantFallbackAllowed()) {
      logDefaultTenantFallback("missing_active_tenant_link", user.id);
      return DEFAULT_TENANT_ID;
    }

    return null;
  }

  const cookieStore = await cookies();
  const selectedTenantId = cookieStore.get(BACKOFFICE_TENANT_COOKIE)?.value;
  if (selectedTenantId && tenantOptions.some((tenant) => tenant.id === selectedTenantId)) {
    return selectedTenantId;
  }

  return tenantOptions[0]?.id ?? null;
}

export async function requireCurrentTenantId(): Promise<string> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) {
    throw new Error(
      "Geen actieve tenant-koppeling gevonden voor deze gebruiker. Neem contact op met een beheerder om toegang tot een tenant te krijgen.",
    );
  }

  return tenantId;
}