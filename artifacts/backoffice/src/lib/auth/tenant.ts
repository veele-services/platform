import {
  db,
  DEFAULT_TENANT_ID,
  FIELDGRID_SUPPORT_TENANT_COOKIE,
  getActiveSupportAccessForUser,
  isFieldgridHostAllowedForRuntimeEnvironment,
  TENANT_RUNTIME_ACTIVE_STATUSES,
  tenantUsersTable,
  tenantsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { createClient, createClientFromRequest } from "@/lib/supabase/server";
import {
  isPlatformHost,
  normalizeHost,
  resolveTenantByHost,
} from "@/lib/auth/tenant-resolver";

export const BACKOFFICE_TENANT_COOKIE = "backoffice_tenant_id";

export type BackofficeTenantOption = {
  id: string;
  name: string;
  slug: string;
};

type HostTenantResolution =
  | { kind: "tenant"; tenantId: string }
  | { kind: "platform" }
  | { kind: "blocked" }
  | { kind: "none" };

export async function getCurrentBackofficeUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function getCurrentBackofficeUserFromRequest(request: Request) {
  const supabase = createClientFromRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
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

async function getHostTenantResolutionForHost(
  host: string,
): Promise<HostTenantResolution> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return { kind: "none" };
  if (!isFieldgridHostAllowedForRuntimeEnvironment(normalizedHost)) {
    return { kind: "blocked" };
  }
  if (isPlatformHost(normalizedHost)) return { kind: "platform" };

  const tenant = await resolveTenantByHost(normalizedHost);
  if (tenant) return { kind: "tenant", tenantId: tenant.id };

  const isLocalDevelopmentHost =
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "::1"].includes(normalizedHost);
  if (isLocalDevelopmentHost) return { kind: "none" };

  // Every non-local host must resolve to an active tenant or platform context.
  // Falling back to the user's first tenant here would let an unknown custom
  // host bypass host-to-tenant binding.
  return { kind: "blocked" };
}

async function getHostTenantResolution(): Promise<HostTenantResolution> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  return getHostTenantResolutionForHost(host);
}

async function getHostTenantResolutionFromRequest(
  request: Request,
): Promise<HostTenantResolution> {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "";
  return getHostTenantResolutionForHost(host);
}

function getCookieValueFromRequest(
  request: Request,
  name: string,
): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const rawCookie of cookieHeader.split(";")) {
    const cookie = rawCookie.trim();
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex === -1) continue;
    const cookieName = cookie.slice(0, separatorIndex).trim();
    if (cookieName !== name) continue;

    try {
      return decodeURIComponent(cookie.slice(separatorIndex + 1));
    } catch {
      return cookie.slice(separatorIndex + 1);
    }
  }

  return null;
}

export async function getActiveBackofficeTenantsForUser(
  userId: string,
): Promise<BackofficeTenantOption[]> {
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
        inArray(tenantsTable.status, [...TENANT_RUNTIME_ACTIVE_STATUSES]),
      ),
    )
    .orderBy(tenantsTable.name);
}

export async function userHasActiveTenant(
  userId: string,
  tenantId: string,
): Promise<boolean> {
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
        inArray(tenantsTable.status, [...TENANT_RUNTIME_ACTIVE_STATUSES]),
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

  const hostResolution = await getHostTenantResolution();
  if (hostResolution.kind === "tenant") {
    if (await userHasActiveTenant(user.id, hostResolution.tenantId)) {
      return hostResolution.tenantId;
    }

    return null;
  }

  if (hostResolution.kind === "blocked") {
    return null;
  }

  if (hostResolution.kind === "platform") {
    const cookieStore = await cookies();
    const supportTenantId = cookieStore.get(
      FIELDGRID_SUPPORT_TENANT_COOKIE,
    )?.value;
    if (
      supportTenantId &&
      (await getActiveSupportAccessForUser(user.id, supportTenantId))
    ) {
      return supportTenantId;
    }
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
  if (
    selectedTenantId &&
    tenantOptions.some((tenant) => tenant.id === selectedTenantId)
  ) {
    return selectedTenantId;
  }

  return tenantOptions[0]?.id ?? null;
}

export async function getCurrentTenantIdFromRequest(
  request: Request,
): Promise<string | null> {
  const user = await getCurrentBackofficeUserFromRequest(request);
  if (!user) {
    if (isDefaultTenantFallbackAllowed()) {
      logDefaultTenantFallback("missing_authenticated_user", null);
      return DEFAULT_TENANT_ID;
    }

    return null;
  }

  const hostResolution = await getHostTenantResolutionFromRequest(request);
  if (hostResolution.kind === "tenant") {
    if (await userHasActiveTenant(user.id, hostResolution.tenantId)) {
      return hostResolution.tenantId;
    }

    return null;
  }

  if (hostResolution.kind === "blocked") {
    return null;
  }

  if (hostResolution.kind === "platform") {
    const supportTenantId = getCookieValueFromRequest(
      request,
      FIELDGRID_SUPPORT_TENANT_COOKIE,
    );
    if (
      supportTenantId &&
      (await getActiveSupportAccessForUser(user.id, supportTenantId))
    ) {
      return supportTenantId;
    }
  }

  const tenantOptions = await getActiveBackofficeTenantsForUser(user.id);
  if (tenantOptions.length === 0) {
    if (isDefaultTenantFallbackAllowed()) {
      logDefaultTenantFallback("missing_active_tenant_link", user.id);
      return DEFAULT_TENANT_ID;
    }

    return null;
  }

  const selectedTenantId = getCookieValueFromRequest(
    request,
    BACKOFFICE_TENANT_COOKIE,
  );
  if (
    selectedTenantId &&
    tenantOptions.some((tenant) => tenant.id === selectedTenantId)
  ) {
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

export async function requireCurrentTenantIdFromRequest(
  request: Request,
): Promise<string> {
  const tenantId = await getCurrentTenantIdFromRequest(request);
  if (!tenantId) {
    throw new Error(
      "Geen actieve tenant-koppeling gevonden voor deze gebruiker. Neem contact op met een beheerder om toegang tot een tenant te krijgen.",
    );
  }

  return tenantId;
}
