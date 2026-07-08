import { FIELDGRID_SCOPE_CLASSIFICATION, type FieldgridDataScope, requiresSensitiveAccess } from "./security-data-classification";

export type FieldgridPlatformRole = "platform_owner" | "platform_admin" | "platform_finance" | "platform_support" | "platform_developer" | "external_developer" | "security_auditor";
export type FieldgridTenantRole = "tenant_owner" | "tenant_admin" | "tenant_finance" | "tenant_manager" | "tenant_staff" | "tenant_readonly" | "tenant_bookkeeper" | "tenant_support_contact";
export type FieldgridRole = FieldgridPlatformRole | FieldgridTenantRole;
export type FieldgridAccessLevel = "none" | "aggregate_only" | "metadata_only" | "masked_read" | "full_read" | "create" | "update" | "delete" | "export" | "approve_access" | "break_glass";

const PLATFORM_ROLE_ALIASES: Record<string, FieldgridPlatformRole> = {
  owner: "platform_owner",
  admin: "platform_admin",
  finance: "platform_finance",
  support: "platform_support",
  developer: "platform_developer",
  external_developer: "external_developer",
  security_auditor: "security_auditor",
};

const TENANT_ROLE_ALIASES: Record<string, FieldgridTenantRole> = {
  owner: "tenant_owner",
  admin: "tenant_admin",
  management: "tenant_admin",
  administration: "tenant_finance",
  finance: "tenant_finance",
  planning: "tenant_manager",
  teamlead: "tenant_manager",
  employee: "tenant_staff",
  readonly: "tenant_readonly",
  bookkeeper: "tenant_bookkeeper",
  support_contact: "tenant_support_contact",
};

export const FIELDGRID_PERMISSION_MATRIX: Record<FieldgridRole, Partial<Record<FieldgridDataScope, FieldgridAccessLevel[]>>> = {
  platform_owner: {
    tenant_profile: ["full_read", "update", "approve_access"], tenant_subscription: ["full_read", "update"], platform_billing: ["full_read"], tenant_financial_dashboard: ["aggregate_only", "approve_access"], tenant_payments: ["metadata_only", "approve_access"], tenant_invoices: ["metadata_only", "approve_access"], tenant_refunds: ["metadata_only", "approve_access"], tenant_payouts_bank_details: ["approve_access", "break_glass"], tenant_customers_contacts: ["masked_read", "approve_access"], tenant_staff_employees: ["masked_read", "approve_access"], operational_planning: ["metadata_only"], reports: ["metadata_only"], attachments: ["approve_access"], exports: ["approve_access"], audit_logs: ["full_read"], security_logs: ["full_read", "break_glass"], support_diagnostics: ["full_read"], webhook_payment_diagnostics: ["masked_read"], api_keys_secrets: ["break_glass"], production_debug_tools: ["break_glass"],
  },
  platform_admin: { tenant_profile: ["full_read", "update"], tenant_subscription: ["full_read"], platform_billing: ["metadata_only"], tenant_financial_dashboard: ["aggregate_only"], tenant_payments: ["metadata_only"], tenant_invoices: ["metadata_only"], tenant_customers_contacts: ["masked_read"], tenant_staff_employees: ["masked_read"], operational_planning: ["metadata_only"], reports: ["metadata_only"], audit_logs: ["metadata_only"], support_diagnostics: ["full_read"], webhook_payment_diagnostics: ["masked_read"] },
  platform_finance: { tenant_profile: ["metadata_only"], tenant_subscription: ["full_read"], platform_billing: ["full_read"], tenant_financial_dashboard: ["aggregate_only"], tenant_payments: ["metadata_only"], tenant_invoices: ["metadata_only"], tenant_refunds: ["metadata_only"], webhook_payment_diagnostics: ["masked_read"] },
  platform_support: { tenant_profile: ["metadata_only"], tenant_subscription: ["metadata_only"], tenant_payments: ["masked_read"], tenant_invoices: ["masked_read"], tenant_customers_contacts: ["masked_read"], tenant_staff_employees: ["masked_read"], operational_planning: ["metadata_only"], reports: ["metadata_only"], support_diagnostics: ["full_read"], webhook_payment_diagnostics: ["masked_read"] },
  platform_developer: { tenant_profile: ["metadata_only"], support_diagnostics: ["metadata_only"], production_debug_tools: ["none"] },
  external_developer: { tenant_profile: ["none"], production_debug_tools: ["none"] },
  security_auditor: { tenant_profile: ["metadata_only"], audit_logs: ["full_read"], security_logs: ["full_read"], support_diagnostics: ["metadata_only"] },
  tenant_owner: Object.fromEntries(Object.keys(FIELDGRID_SCOPE_CLASSIFICATION).map((scope) => [scope, ["full_read", "create", "update", "delete", "export", "approve_access"]])) as Partial<Record<FieldgridDataScope, FieldgridAccessLevel[]>>,
  tenant_admin: { tenant_profile: ["full_read", "update"], tenant_customers_contacts: ["full_read", "create", "update", "export"], tenant_staff_employees: ["full_read", "create", "update"], operational_planning: ["full_read", "create", "update", "delete"], reports: ["full_read", "export"], attachments: ["full_read", "create", "update"], audit_logs: ["metadata_only"] },
  tenant_finance: { tenant_financial_dashboard: ["full_read"], tenant_payments: ["full_read"], tenant_invoices: ["full_read", "create", "update", "export"], tenant_refunds: ["full_read", "create"], reports: ["full_read", "export"], exports: ["export"] },
  tenant_manager: { tenant_customers_contacts: ["masked_read"], tenant_staff_employees: ["masked_read"], operational_planning: ["full_read", "create", "update"], reports: ["full_read"], attachments: ["full_read", "create"] },
  tenant_staff: { operational_planning: ["full_read", "update"], reports: ["create", "full_read"], attachments: ["create", "masked_read"] },
  tenant_readonly: { tenant_profile: ["metadata_only"], tenant_customers_contacts: ["masked_read"], operational_planning: ["full_read"], reports: ["masked_read"] },
  tenant_bookkeeper: { tenant_financial_dashboard: ["full_read"], tenant_payments: ["full_read"], tenant_invoices: ["full_read", "export"], reports: ["full_read", "export"], exports: ["export"] },
  tenant_support_contact: { support_diagnostics: ["full_read"], audit_logs: ["metadata_only"] },
};

export function normalizePlatformRole(role: string): FieldgridPlatformRole | null { return PLATFORM_ROLE_ALIASES[role] ?? (role in FIELDGRID_PERMISSION_MATRIX && role.startsWith("platform_") ? role as FieldgridPlatformRole : null); }
export function normalizeTenantRole(role: string): FieldgridTenantRole | null { return TENANT_ROLE_ALIASES[role] ?? (role in FIELDGRID_PERMISSION_MATRIX && role.startsWith("tenant_") ? role as FieldgridTenantRole : null); }
export function hasAccessLevel(role: FieldgridRole, scope: FieldgridDataScope, level: FieldgridAccessLevel): boolean { return FIELDGRID_PERMISSION_MATRIX[role]?.[scope]?.includes(level) ?? false; }

export function authorizeFieldgridAccess(input: { role: FieldgridRole; scope: FieldgridDataScope; accessLevel: FieldgridAccessLevel; actorTenantId?: string | null; resourceTenantId?: string | null; hasActiveSensitiveGrant?: boolean; breakGlassReason?: string | null; }): { allowed: boolean; reason: string; masked: boolean; auditRequired: boolean } {
  if (input.actorTenantId && input.resourceTenantId && input.actorTenantId !== input.resourceTenantId) return { allowed: false, reason: "cross_tenant_denied", masked: false, auditRequired: true };
  const level = FIELDGRID_SCOPE_CLASSIFICATION[input.scope];
  const direct = hasAccessLevel(input.role, input.scope, input.accessLevel);
  const sensitive = requiresSensitiveAccess(level);
  if (input.accessLevel === "break_glass") return { allowed: direct && Boolean(input.breakGlassReason?.trim()), reason: direct ? "break_glass" : "break_glass_denied", masked: false, auditRequired: true };
  if (sensitive && input.role.startsWith("platform_") && input.accessLevel === "full_read" && !input.hasActiveSensitiveGrant) return { allowed: false, reason: "sensitive_grant_required", masked: true, auditRequired: true };
  if (!direct) return { allowed: false, reason: "permission_denied", masked: false, auditRequired: sensitive };
  return { allowed: true, reason: "allowed", masked: input.accessLevel === "masked_read", auditRequired: sensitive || input.accessLevel === "export" };
}

export function assertFieldgridAccess(input: Parameters<typeof authorizeFieldgridAccess>[0]): void {
  const decision = authorizeFieldgridAccess(input);
  if (!decision.allowed) throw new Error(`Forbidden: ${decision.reason}`);
}
