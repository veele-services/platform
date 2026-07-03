import type { FieldgridModuleKey } from "./schema";

/**
 * Canonical resource -> module map used by API, backoffice, portals and jobs.
 * RBAC grants are necessary but not sufficient: when a resource maps to a module,
 * that module must also be enabled for the tenant at runtime.
 */
export const FIELDGRID_PERMISSION_MODULES = {
  customers: "customers",
  customer_contacts: "customers",
  customer_notes: "customers",
  customer_portal: "customer_portal",
  customer_users: "customer_portal",

  objects: "objects",
  object_contacts: "objects",
  object_personnel: "objects",

  personnel: "personnel",
  personnel_portal: "personnel_portal",
  qualifications: "personnel",
  availability: "personnel",
  leave_periods: "personnel",

  assignments: "assignments",
  assignment_personnel: "assignments",
  assignment_tasks: "assignments",
  assignment_extra_work: "assignments",
  assignment_photos: "assignments",
  assignment_report_notes: "assignments",
  assignment_report_note_attachments: "assignments",

  planning: "planning",
  smart_planning: "smart_planning",

  reports: "reporting",
  documents: "documents",

  invoices: "finance",
  quotes: "finance",
  payments: "finance",
  customer_payment_batches: "finance",
  customer_payment_batch_items: "finance",

  notifications: "notifications",
  news: "notifications",

  task_codes: "assignments",
} as const satisfies Partial<Record<string, FieldgridModuleKey>>;

export type FieldgridPermissionResource = keyof typeof FIELDGRID_PERMISSION_MODULES;

export function moduleForPermissionResource(resource: string): FieldgridModuleKey | null {
  return FIELDGRID_PERMISSION_MODULES[resource as FieldgridPermissionResource] ?? null;
}

export function resourceFromPermissionKey(permission: string): string {
  const separatorIndex = permission.indexOf(":");
  return separatorIndex === -1 ? permission : permission.slice(0, separatorIndex);
}

export function moduleForPermissionKey(permission: string): FieldgridModuleKey | null {
  return moduleForPermissionResource(resourceFromPermissionKey(permission));
}
