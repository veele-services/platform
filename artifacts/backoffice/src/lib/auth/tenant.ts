import { db, DEFAULT_TENANT_ID, tenantUsersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentBackofficeUser() {
  const supabase = await createClient();
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

export async function getCurrentTenantId(): Promise<string | null> {
  const user = await getCurrentBackofficeUser();
  if (!user) {
    if (isDefaultTenantFallbackAllowed()) {
      logDefaultTenantFallback("missing_authenticated_user", null);
      return DEFAULT_TENANT_ID;
    }
    return null;
  }

  const [tenantUser] = await db
    .select({ tenantId: tenantUsersTable.tenantId })
    .from(tenantUsersTable)
    .where(
      and(
        eq(tenantUsersTable.userId, user.id),
        eq(tenantUsersTable.status, "active"),
      ),
    )
    .limit(1);

  if (tenantUser?.tenantId) return tenantUser.tenantId;

  if (isDefaultTenantFallbackAllowed()) {
    logDefaultTenantFallback("missing_active_tenant_link", user.id);
    return DEFAULT_TENANT_ID;
  }

  return null;
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
