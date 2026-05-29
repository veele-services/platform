/**
 * RBAC seed — inserts 8 base roles and their default permissions.
 *
 * Run:  pnpm --filter @workspace/db run seed
 *
 * Safe to run multiple times (uses ON CONFLICT DO NOTHING / upsert semantics).
 */
import { db } from "../index";
import {
  rolesTable,
  permissionsTable,
  rolePermissionsTable,
} from "../schema";
import { eq, and } from "drizzle-orm";

const BASE_ROLES = [
  { name: "Management",    description: "Full platform access — owns all modules and settings",       isSystem: true },
  { name: "Administration",description: "Day-to-day admin: customers, invoices, documents, users",    isSystem: true },
  { name: "Planning",      description: "Manages planning and assignment scheduling",                 isSystem: true },
  { name: "Teamlead",      description: "Oversees team assignments and reports",                     isSystem: true },
  { name: "Employee",      description: "Field worker — views own assignments and submits reports",   isSystem: true },
  { name: "Flex Employee", description: "External/flex worker — views open assignments only",         isSystem: true },
  { name: "Customer",      description: "Customer portal access — own objects, assignments, invoices",isSystem: true },
  { name: "Support",       description: "Read-only support access across customer-facing modules",    isSystem: true },
] as const;

/** All permission definitions in the system: resource × action */
const ALL_PERMISSIONS: { resource: string; action: string; description: string }[] = [
  { resource: "dashboard",   action: "read",    description: "View the management dashboard" },

  { resource: "customers",   action: "read",    description: "View customers" },
  { resource: "customers",   action: "write",   description: "Create and edit customers" },
  { resource: "customers",   action: "delete",  description: "Delete customers" },

  { resource: "objects",     action: "read",    description: "View objects" },
  { resource: "objects",     action: "write",   description: "Create and edit objects" },
  { resource: "objects",     action: "delete",  description: "Delete objects" },

  { resource: "assignments", action: "read",    description: "View assignments" },
  { resource: "assignments", action: "write",   description: "Create and edit assignments" },
  { resource: "assignments", action: "delete",  description: "Delete assignments" },
  { resource: "assignments", action: "approve", description: "Approve assignment quotes" },

  { resource: "planning",    action: "read",    description: "View planning board" },
  { resource: "planning",    action: "write",   description: "Schedule and re-schedule assignments" },

  { resource: "personnel",   action: "read",    description: "View personnel" },
  { resource: "personnel",   action: "write",   description: "Create and edit personnel records" },
  { resource: "personnel",   action: "delete",  description: "Archive / delete personnel" },

  { resource: "reports",     action: "read",    description: "View reports" },
  { resource: "reports",     action: "export",  description: "Export reports" },

  { resource: "invoices",    action: "read",    description: "View invoices" },
  { resource: "invoices",    action: "write",   description: "Create and edit invoices" },
  { resource: "invoices",    action: "send",    description: "Send invoices to customers" },

  { resource: "documents",   action: "read",    description: "View documents" },
  { resource: "documents",   action: "write",   description: "Upload and edit documents" },
  { resource: "documents",   action: "delete",  description: "Delete documents" },

  { resource: "settings",    action: "read",    description: "View settings" },
  { resource: "settings",    action: "write",   description: "Change platform settings" },

  { resource: "roles",       action: "read",    description: "View roles and permissions" },
  { resource: "roles",       action: "write",   description: "Create and edit roles" },
  { resource: "roles",       action: "delete",  description: "Delete roles" },

  { resource: "users",       action: "read",    description: "View user accounts" },
  { resource: "users",       action: "write",   description: "Invite, edit and deactivate users" },
];

/** Permissions granted to each base role (resource:action pairs) */
const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  "Management": ALL_PERMISSIONS.map((p) => `${p.resource}:${p.action}`),

  "Administration": [
    "dashboard:read",
    "customers:read", "customers:write", "customers:delete",
    "objects:read", "objects:write", "objects:delete",
    "assignments:read", "assignments:write", "assignments:approve",
    "planning:read", "planning:write",
    "personnel:read", "personnel:write",
    "reports:read", "reports:export",
    "invoices:read", "invoices:write", "invoices:send",
    "documents:read", "documents:write", "documents:delete",
    "settings:read",
    "users:read", "users:write",
  ],

  "Planning": [
    "dashboard:read",
    "customers:read",
    "objects:read",
    "assignments:read", "assignments:write",
    "planning:read", "planning:write",
    "personnel:read",
    "reports:read",
  ],

  "Teamlead": [
    "dashboard:read",
    "assignments:read", "assignments:write",
    "planning:read",
    "personnel:read",
    "reports:read",
    "documents:read",
  ],

  "Employee": [
    "dashboard:read",
    "assignments:read",
    "reports:read",
    "documents:read",
  ],

  "Flex Employee": [
    "assignments:read",
    "documents:read",
  ],

  "Customer": [
    "assignments:read",
    "objects:read",
    "invoices:read",
    "documents:read",
  ],

  "Support": [
    "dashboard:read",
    "customers:read",
    "objects:read",
    "assignments:read",
    "personnel:read",
    "reports:read",
    "documents:read",
  ],
};

export async function seedRbac() {
  console.log("Seeding RBAC roles, permissions and role-permission mappings…");

  // 1. Upsert roles
  const insertedRoles = await db
    .insert(rolesTable)
    .values(BASE_ROLES.map((r) => ({ name: r.name, description: r.description, isSystem: r.isSystem })))
    .onConflictDoNothing({ target: rolesTable.name })
    .returning();

  // Fetch all roles (including pre-existing ones)
  const allRoles = await db.select().from(rolesTable);
  const roleByName = Object.fromEntries(allRoles.map((r) => [r.name, r]));

  console.log(`  Roles: ${insertedRoles.length} inserted, ${allRoles.length} total`);

  // 2. Upsert permissions
  const insertedPerms = await db
    .insert(permissionsTable)
    .values(ALL_PERMISSIONS)
    .onConflictDoNothing()
    .returning();

  const allPerms = await db.select().from(permissionsTable);
  const permByKey = Object.fromEntries(allPerms.map((p) => [`${p.resource}:${p.action}`, p]));

  console.log(`  Permissions: ${insertedPerms.length} inserted, ${allPerms.length} total`);

  // 3. Upsert role-permission links
  let linked = 0;
  for (const [roleName, permKeys] of Object.entries(ROLE_PERMISSION_MAP)) {
    const role = roleByName[roleName];
    if (!role) { console.warn(`  Role not found: ${roleName}`); continue; }

    for (const key of permKeys) {
      const perm = permByKey[key];
      if (!perm) { console.warn(`  Permission not found: ${key}`); continue; }

      await db
        .insert(rolePermissionsTable)
        .values({ roleId: role.id, permissionId: perm.id })
        .onConflictDoNothing();
      linked++;
    }
  }

  console.log(`  Role-permissions: ${linked} links processed`);
  console.log("RBAC seed complete.");
}

// Allow direct execution: npx tsx lib/db/src/seed/rbac.ts
if (process.argv[1]?.endsWith("rbac.ts")) {
  seedRbac()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
