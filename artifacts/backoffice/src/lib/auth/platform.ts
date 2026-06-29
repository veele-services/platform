import { db, platformUsersTable, type PlatformRole, type PlatformUser } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentPlatformUser = PlatformUser & {
  email: string | null;
};

export async function getCurrentPlatformUser(): Promise<CurrentPlatformUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [platformUser] = await db
    .select()
    .from(platformUsersTable)
    .where(eq(platformUsersTable.userId, user.id))
    .limit(1);

  if (!platformUser || platformUser.status !== "active") return null;

  return {
    ...platformUser,
    email: user.email ?? null,
  };
}

export async function requirePlatformRole(role: PlatformRole): Promise<CurrentPlatformUser> {
  return requireAnyPlatformRole([role]);
}

export async function requireAnyPlatformRole(roles: readonly PlatformRole[]): Promise<CurrentPlatformUser> {
  const platformUser = await getCurrentPlatformUser();

  if (!platformUser || !roles.includes(platformUser.role)) {
    redirect("/");
  }

  return platformUser;
}

export async function hasAnyPlatformRole(userId: string, roles: readonly PlatformRole[]): Promise<boolean> {
  if (roles.length === 0) return false;

  const [platformUser] = await db
    .select({ userId: platformUsersTable.userId })
    .from(platformUsersTable)
    .where(
      and(
        eq(platformUsersTable.userId, userId),
        eq(platformUsersTable.status, "active"),
        inArray(platformUsersTable.role, [...roles]),
      ),
    )
    .limit(1);

  return platformUser?.userId === userId;
}
