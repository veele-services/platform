export const FIELDGRID_DATA_CLASSIFICATION_LEVELS = {
  0: "Public / non-sensitive",
  1: "Platform operational metadata",
  2: "Tenant operational data",
  3: "Personal data",
  4: "Sensitive financial data",
  5: "Highly sensitive / confidential data",
  6: "Restricted system/security data",
} as const;

export type FieldgridDataClassificationLevel = keyof typeof FIELDGRID_DATA_CLASSIFICATION_LEVELS;

export type FieldgridDataScope =
  | "tenant_profile"
  | "tenant_subscription"
  | "platform_billing"
  | "tenant_financial_dashboard"
  | "tenant_payments"
  | "tenant_invoices"
  | "tenant_refunds"
  | "tenant_payouts_bank_details"
  | "tenant_customers_contacts"
  | "tenant_staff_employees"
  | "operational_planning"
  | "reports"
  | "attachments"
  | "exports"
  | "audit_logs"
  | "security_logs"
  | "support_diagnostics"
  | "webhook_payment_diagnostics"
  | "api_keys_secrets"
  | "production_debug_tools";

export const FIELDGRID_SCOPE_CLASSIFICATION: Record<FieldgridDataScope, FieldgridDataClassificationLevel> = {
  tenant_profile: 1,
  tenant_subscription: 1,
  platform_billing: 4,
  tenant_financial_dashboard: 4,
  tenant_payments: 4,
  tenant_invoices: 4,
  tenant_refunds: 4,
  tenant_payouts_bank_details: 5,
  tenant_customers_contacts: 3,
  tenant_staff_employees: 3,
  operational_planning: 2,
  reports: 3,
  attachments: 5,
  exports: 5,
  audit_logs: 5,
  security_logs: 6,
  support_diagnostics: 2,
  webhook_payment_diagnostics: 5,
  api_keys_secrets: 6,
  production_debug_tools: 6,
};

export function getClassificationForScope(scope: FieldgridDataScope): FieldgridDataClassificationLevel {
  return FIELDGRID_SCOPE_CLASSIFICATION[scope];
}

export function requiresSensitiveAccess(level: FieldgridDataClassificationLevel): boolean {
  return level >= 4;
}

export function requiresMasking(level: FieldgridDataClassificationLevel): boolean {
  return level >= 3;
}
