import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("central email template registry validates variables, escaping, text and CTA safety", () => {
  const templates = read("lib/db/src/email-templates.ts");
  const service = read("lib/db/src/email-service.ts");
  const pkg = read("lib/db/package.json");

  for (const key of [
    "account_invite",
    "password_reset",
    "invoice_available",
    "invoice_payment_reminder",
    "quote_decision_received",
    "notification_manual",
    "platform_email_test",
  ]) {
    assert.match(templates, new RegExp(`"${key}"`, "u"), `${key} should be registered`);
  }

  assert.match(templates, /FIELDGRID_CLEAN_OPS_EMAIL_THEME/u);
  assert.match(templates, /primaryColor:\s*"#16A34A"/u);
  assert.match(templates, /function escapeHtml/u);
  assert.match(templates, /function textToHtml/u);
  assert.match(templates, /function isSafeUrl/u);
  assert.match(templates, /EmailTemplateValidationError/u);
  assert.match(templates, /requiredVariables/u);
  assert.match(templates, /optionalVariables/u);
  assert.match(templates, /renderEmailTemplatePreview/u);
  assert.match(templates, /consumeRenderedEmailMetadata/u);
  assert.match(service, /normalizeTemplateInput/u);
  assert.match(service, /sendTemplatedEmail/u);
  assert.match(service, /renderedTemplateKey/u);
  assert.match(pkg, /"\.\/email-templates": "\.\/src\/email-templates\.ts"/u);
});

test("tenant email template overrides are private and tenant scoped", () => {
  const schema = read("lib/db/src/schema/email-templates.ts");
  const schemaIndex = read("lib/db/src/schema/index.ts");
  const migration = read("lib/db/migrations/099_email_template_overrides.sql");
  const templates = read("lib/db/src/email-templates.ts");

  assert.match(schema, /tenantEmailTemplateOverridesTable/u);
  assert.match(schema, /tenantId: uuid\("tenant_id"\)/u);
  assert.match(schema, /templateKey: varchar\("template_key"/u);
  assert.match(schemaIndex, /export \* from "\.\/email-templates"/u);
  assert.match(migration, /tenant_email_template_overrides/u);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/u);
  assert.match(migration, /REVOKE ALL ON TABLE public\.tenant_email_template_overrides FROM anon, authenticated/u);
  assert.match(templates, /getTenantTemplateOverride/u);
  assert.match(templates, /applyTemplateOverride/u);
  assert.match(templates, /introTemplate\.split/u);
});

test("application email builders use the central template renderer", () => {
  const helperFiles = [
    "artifacts/backoffice/src/lib/email.ts",
    "artifacts/klant-pwa/src/lib/email.ts",
    "artifacts/personeel-pwa/src/lib/email.ts",
    "artifacts/api-server/src/lib/email.ts",
  ];

  for (const file of helperFiles) {
    const content = read(file);
    assert.match(content, /renderEmailTemplatePreview/u, `${file} should render through the central registry`);
    assert.doesNotMatch(content, /baseTemplate\(|function ctaButton|Veele platform|Test SMTP-instellingen Veele/u);
  }

  const settings = read("artifacts/backoffice/src/app/actions/settings.ts");
  assert.match(settings, /buildNotificationTestEmail/u);
  assert.match(settings, /buildTenantMailSettingsTestEmail/u);
  assert.doesNotMatch(settings, /Veele-Test-2026|Test SMTP-instellingen Veele|Veele platform/u);
});

test("tenant-aware mail callsites pass tenant context into the provider service", () => {
  const paymentReminders = read("artifacts/api-server/src/routes/payment-reminders.ts");
  const expiredQuotes = read("artifacts/api-server/src/routes/expired-quotes.ts");
  const worker = read("artifacts/api-server/src/lib/notification-worker.ts");
  const invoices = read("artifacts/backoffice/src/app/actions/invoices.ts");
  const reports = read("artifacts/backoffice/src/app/actions/reports.ts");
  const availability = read("artifacts/backoffice/src/app/actions/availability.ts");

  assert.match(paymentReminders, /tenantId:\s*invoice\.customerTenantId/u);
  assert.match(expiredQuotes, /tenantId:\s*q\.customerTenantId/u);
  assert.match(worker, /tenantId:\s*item\.tenant_id/u);
  assert.match(invoices, /purpose:\s*"invoice_available"/u);
  assert.match(invoices, /purpose:\s*"invoice_payment_reminder"/u);
  assert.match(reports, /purpose:\s*"report_submitted"/u);
  assert.match(reports, /purpose:\s*"report_approved"/u);
  assert.match(reports, /purpose:\s*"report_rejected"/u);
  assert.match(availability, /purpose:\s*"leave_request_decision"/u);
});

test("email template documentation is present", () => {
  assert.match(read("docs/email-white-label-audit.md"), /Fieldgrid e-mail white-label audit/u);
  assert.match(read("docs/email-template-system.md"), /Fieldgrid e-mail template system/u);
  assert.match(read("docs/email-template-variables.md"), /account_invite/u);
});
