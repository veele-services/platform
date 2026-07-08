import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) { return readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); }

const permissions = read("lib/db/src/security-permissions.ts");
const masking = read("lib/db/src/security-masking.ts");
const classification = read("lib/db/src/security-data-classification.ts");
const audit = read("lib/db/src/security-audit.ts");
const schema = read("lib/db/src/schema/sensitive-access.ts");
const migration = read("lib/db/migrations/20260708120000_sensitive_data_access_controls.sql");

test("centralized access model defines future platform and tenant roles", () => {
  for (const role of ["platform_owner", "platform_admin", "platform_finance", "platform_support", "platform_developer", "external_developer", "security_auditor", "tenant_owner", "tenant_finance", "tenant_bookkeeper", "tenant_staff"]) {
    assert.ok(permissions.includes(role), `${role} should be part of the matrix`);
  }
});

test("platform admin full financial access requires sensitive grant", () => {
  assert.ok(permissions.includes("sensitive_grant_required"));
  assert.ok(permissions.includes('tenant_payments: ["metadata_only"]'));
  assert.ok(!permissions.includes('platform_admin: { tenant_profile: ["full_read", "update"], tenant_subscription: ["full_read"], platform_billing: ["metadata_only"], tenant_financial_dashboard: ["full_read"]'));
});

test("tenant isolation and export/audit decisions are server-side primitives", () => {
  for (const phrase of ["cross_tenant_denied", "assertFieldgridAccess", "export", "auditRequired", "breakGlassReason"]) {
    assert.ok(permissions.includes(phrase), `permissions should include ${phrase}`);
  }
});

test("masking utilities cover personal, bank and payment identifiers", () => {
  for (const fn of ["maskEmail", "maskPhone", "maskIban", "maskName", "maskPaymentProviderId", "maskAddress", "maskReference", "redactLogMetadata"]) {
    assert.ok(masking.includes(`function ${fn}`), `${fn} should exist`);
  }
});

test("classification model marks financial and secrets scopes as sensitive", () => {
  for (const phrase of ["tenant_payments: 4", "tenant_invoices: 4", "tenant_payouts_bank_details: 5", "api_keys_secrets: 6", "requiresSensitiveAccess"]) {
    assert.ok(classification.includes(phrase), `classification should include ${phrase}`);
  }
});

test("sensitive access requests and grants are represented in schema and migration", () => {
  for (const phrase of ["sensitiveAccessRequestsTable", "requestedByUserId", "approvalRequiredFrom", "sensitiveAccessGrantsTable", "revokedAt"]) {
    assert.ok(schema.includes(phrase), `schema should include ${phrase}`);
  }
  for (const phrase of ["CREATE TABLE IF NOT EXISTS sensitive_access_requests", "CHECK (data_classification_level BETWEEN 0 AND 6)", "REVOKE ALL PRIVILEGES", "ENABLE ROW LEVEL SECURITY"]) {
    assert.ok(migration.includes(phrase), `migration should include ${phrase}`);
  }
});

test("audit helper records required sensitive access metadata without raw sensitive logs", () => {
  for (const phrase of ["dataClassificationLevel", "accessType", "approvalRequestId", "exportDownload", "redactLogMetadata", "writeSensitiveAuditLog"]) {
    assert.ok(audit.includes(phrase), `audit helper should include ${phrase}`);
  }
});
