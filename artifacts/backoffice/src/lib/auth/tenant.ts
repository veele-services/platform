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

export async function getCurrentTenantId(): Promise<string | null> {
  const user = await getCurrentBackofficeUser();
  if (!user) return null;

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

  return tenantUser?.tenantId ?? DEFAULT_TENANT_ID;
}

export async function requireCurrentTenantId(): Promise<string> {
  const tenantId = await getCurrentTenantId();
  if (!tenantId) {
    throw new Error("Niet geauthenticeerd of geen actieve tenant-koppeling.");
  }
  return tenantId;
}
