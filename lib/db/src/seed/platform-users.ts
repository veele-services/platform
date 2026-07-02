import { sql } from "drizzle-orm";
import { db, pool } from "../index";
import { platformUsersTable } from "../schema/platform-users";

type PlatformRole = "owner" | "admin" | "support";

function parseIds(value: string | undefined): string[] {
  return [...new Set((value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean))];
}

async function seedPlatformUsers() {
  const ownerIds = parseIds(process.env.PLATFORM_OWNER_USER_IDS);
  const adminIds = parseIds(process.env.PLATFORM_ADMIN_USER_IDS);
  const supportIds = parseIds(process.env.PLATFORM_SUPPORT_USER_IDS);

  const rows = [
    ...ownerIds.map((userId) => ({ userId, role: "owner" as PlatformRole })),
    ...adminIds.map((userId) => ({ userId, role: "admin" as PlatformRole })),
    ...supportIds.map((userId) => ({ userId, role: "support" as PlatformRole })),
  ];

  const byUserId = new Map<string, { userId: string; role: PlatformRole }>();
  for (const row of rows) {
    const existing = byUserId.get(row.userId);
    if (!existing || row.role === "owner" || (row.role === "admin" && existing.role === "support")) {
      byUserId.set(row.userId, row);
    }
  }

  const platformUsers = [...byUserId.values()];
  if (platformUsers.length === 0) {
    throw new Error(
      "Set PLATFORM_OWNER_USER_IDS, PLATFORM_ADMIN_USER_IDS, or PLATFORM_SUPPORT_USER_IDS to bootstrap platform users.",
    );
  }

  const inserted = await db
    .insert(platformUsersTable)
    .values(
      platformUsers.map((user) => ({
        userId: user.userId,
        role: user.role,
        status: "active",
      })),
    )
    .onConflictDoUpdate({
      target: platformUsersTable.userId,
      set: {
        role: sql`excluded.role`,
        status: "active",
        updatedAt: new Date(),
      },
    })
    .returning({ id: platformUsersTable.id, userId: platformUsersTable.userId, role: platformUsersTable.role });

  console.log(`Bootstrapped ${inserted.length} platform user(s).`);
  for (const user of inserted) {
    console.log(`  - ${user.userId}: ${user.role} (${user.id})`);
  }
}

seedPlatformUsers()
  .catch((error) => {
    console.error("Platform user seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
