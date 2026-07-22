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

  { resource: "checklists", action: "read", description: "View checklist templates, bindings and assignment snapshots" },
  { resource: "checklists", action: "respond", description: "Complete assigned checklist answers and evidence" },
  { resource: "checklists", action: "write", description: "Create and edit checklist drafts and bindings" },
  { resource: "checklists", action: "publish", description: "Publish immutable checklist versions" },
  { resource: "checklists", action: "review", description: "Review reconciliation changes and waivers" },

  { resource: "planning",    action: "read",    description: "View planning board" },
  { resource: "planning",    action: "write",   description: "Schedule and re-schedule assignments" },

  { resource: "personnel",   action: "read",    description: "View personnel" },
  { resource: "personnel",   action: "write",   description: "Create and edit personnel records" },
  { resource: "personnel",   action: "delete",  description: "Archive / delete personnel" },

  { resource: "reports",     action: "read",    description: "View reports" },
  { resource: "reports",     action: "submit",  description: "Submit a report for a completed assignment" },
  { resource: "reports",     action: "write",   description: "Approve or reject submitted reports" },
  { resource: "reports",     action: "export",  description: "Export reports" },

  { resource: "invoices",    action: "read",    description: "View invoices" },
  { resource: "invoices",    action: "write",   description: "Create and edit invoices" },
  { resource: "invoices",    action: "send",    description: "Send invoices to customers" },

  { resource: "documents",   action: "read",    description: "View documents" },
  { resource: "documents",   action: "write",   description: "Upload and edit documents" },
  { resource: "documents",   action: "delete",  description: "Delete documents" },

  { resource: "news",        action: "read",    description: "View news posts" },
  { resource: "news",        action: "write",   description: "Create and edit news posts" },
  { resource: "news",        action: "send",    description: "Publish news posts to target audiences" },
  { resource: "news",        action: "delete",  description: "Archive or delete news posts" },

  { resource: "task_codes",  action: "read",    description: "View task codes" },
  { resource: "task_codes",  action: "write",   description: "Create and edit task codes" },

  { resource: "settings",    action: "read",    description: "View settings" },
  { resource: "settings",    action: "write",   description: "Change platform settings" },

  { resource: "website", action: "read", description: "View website status and publication health" },
  { resource: "website_settings", action: "read", description: "View website settings" },
  { resource: "website_settings", action: "write", description: "Manage website settings" },
  { resource: "website_pages", action: "read", description: "View website pages" },
  { resource: "website_pages", action: "write", description: "Manage website page drafts" },
  { resource: "website_pages", action: "publish", description: "Publish immutable website releases" },
  { resource: "website_navigation", action: "read", description: "View website navigation" },
  { resource: "website_navigation", action: "write", description: "Manage website navigation" },
  { resource: "website_blog", action: "read", description: "View website blog content" },
  { resource: "website_blog", action: "write", description: "Manage website blog drafts" },
  { resource: "website_blog", action: "publish", description: "Publish website blog content" },
  { resource: "website_forms", action: "read", description: "View website form definitions" },
  { resource: "website_forms", action: "write", description: "Manage website form definitions" },
  { resource: "website_submissions", action: "read", description: "View website form submissions" },
  { resource: "website_submissions", action: "write", description: "Process website form submissions" },
  { resource: "website_media", action: "read", description: "View website media" },
  { resource: "website_media", action: "write", description: "Manage website media" },

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
    "checklists:read", "checklists:write", "checklists:publish", "checklists:review",
    "planning:read", "planning:write",
    "personnel:read", "personnel:write",
    "task_codes:read", "task_codes:write",
    "reports:read", "reports:submit", "reports:write", "reports:export",
    "invoices:read", "invoices:write", "invoices:send",
    "documents:read", "documents:write", "documents:delete",
    "news:read", "news:write", "news:send",
    "settings:read",
    "users:read", "users:write",
    "website:read",
    "website_settings:read", "website_settings:write",
    "website_pages:read", "website_pages:write", "website_pages:publish",
    "website_navigation:read", "website_navigation:write",
    "website_blog:read", "website_blog:write", "website_blog:publish",
    "website_forms:read", "website_forms:write",
    "website_submissions:read", "website_submissions:write",
    "website_media:read", "website_media:write",
  ],

  "Planning": [
    "dashboard:read",
    "customers:read",
    "objects:read",
    "assignments:read", "assignments:write",
    "checklists:read", "checklists:review",
    "planning:read", "planning:write",
    "personnel:read",
    "task_codes:read",
    "news:read", "news:write", "news:send",
    "reports:read", "reports:submit",
  ],

  "Teamlead": [
    "dashboard:read",
    "assignments:read", "assignments:write",
    "checklists:read", "checklists:review", "checklists:respond",
    "planning:read",
    "personnel:read",
    "reports:read", "reports:submit",
    "documents:read",
  ],

  "Employee": [
    "dashboard:read",
    "assignments:read",
    "checklists:read", "checklists:respond",
    "reports:read", "reports:submit",
    "documents:read",
  ],

  "Flex Employee": [
    "assignments:read",
    "checklists:read", "checklists:respond",
    "reports:read", "reports:submit",
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
    "news:read",
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
