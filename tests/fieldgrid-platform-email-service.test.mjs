import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("platform email service centralizes providers, encrypted config and delivery logging", () => {
  const service = read("lib/db/src/email-service.ts");
  const secretCrypto = read("lib/db/src/email-secret-crypto.ts");
  const smtp = read("lib/db/src/email-smtp.ts");
  const schema = read("lib/db/src/schema/platform-email.ts");
  const migration = read("lib/db/migrations/093_platform_email_providers.sql");
  const sendGridMigration = read(
    "lib/db/migrations/20260729100000_sendgrid_platform_email_provider.sql",
  );
  const sendGrid = read("lib/db/src/email-sendgrid.ts");
  const pkg = read("lib/db/package.json");

  assert.match(service, /sendTransactionalEmail/u);
  assert.match(service, /new Resend/u);
  assert.match(service, /sendWithSendGrid/u);
  assert.match(service, /sendgrid_api/u);
  assert.match(sendGrid, /https:\/\/api\.sendgrid\.com\/v3\/mail\/send/u);
  assert.match(sendGrid, /https:\/\/api\.eu\.sendgrid\.com\/v3\/mail\/send/u);
  assert.match(sendGrid, /Authorization: `Bearer \$\{config\.apiKey\}`/u);
  assert.match(sendGrid, /response\.status !== 202/u);
  assert.match(sendGrid, /attachment\.content\.toString\("base64"\)/u);
  assert.match(service, /SG\\\.\[A-Za-z0-9\._-\]/u);
  assert.match(service, /sendSmtpMail/u);
  assert.match(secretCrypto, /FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY/u);
  assert.match(secretCrypto, /aes-256-gcm/u);
  assert.match(service, /encryptPlatformEmailConfig/u);
  assert.match(service, /decryptPlatformEmailConfig/u);
  assert.match(service, /safeDecryptPlatformEmailConfig/u);
  assert.match(service, /E-mailsecret kon niet worden ontcijferd/u);
  assert.match(service, /status:\s*configError \? "error"/u);
  assert.match(service, /safeDecryptPlatformEmailConfig\(existing\.encryptedConfigJson\)\.config/u);
  assert.match(service, /lastTestedAt: null/u);
  assert.match(service, /lastTestStatus: null/u);
  assert.match(service, /lastTestError: null/u);
  assert.match(service, /platformProviderConfigurationFingerprint/u);
  assert.match(service, /providerConfigurationFingerprint/u);
  assert.match(service, /\.for\("update"\)/u);
  assert.match(
    service,
    /platformProviderConfigurationFingerprint\(current\) !==[\s\S]*?result\.providerConfigurationFingerprint/u,
  );
  assert.match(service, /normalizeTemplateInput/u);
  assert.match(service, /provider = await resolveActiveProvider\(normalizedInput\.tenantId\);/u);
  assert.match(
    service,
    /scope: \{ kind: "platform" \}[\s\S]*?selectEmailProviderForMessage\(\{/u,
  );
  assert.match(service, /sendTemplatedEmail/u);
  assert.doesNotMatch(service, /getLegacySmtpProvider|legacy_smtp/u);
  assert.doesNotMatch(
    service,
    /where\(eq\(organizationSettingsTable\.smtpEnabled,\s*true\)\)/u,
  );
  assert.match(service, /selectEmailProviderForMessage/u);
  assert.match(service, /isTenantRuntimeActive/u);
  assert.match(service, /return \{ success: false, message: sanitizeError\(error\) \}/u);
  assert.match(service, /emailDeliveryLogTable/u);
  assert.match(smtp, /STARTTLS/u);
  assert.match(smtp, /AUTH LOGIN/u);
  assert.match(schema, /platformEmailProvidersTable/u);
  assert.match(schema, /emailDeliveryLogTable/u);
  assert.match(migration, /encrypted_config_json text NOT NULL/u);
  assert.match(migration, /ALTER TABLE public\.platform_email_providers ENABLE ROW LEVEL SECURITY/u);
  assert.match(migration, /REVOKE ALL ON TABLE public\.email_delivery_log FROM anon, authenticated/u);
  assert.match(sendGridMigration, /'sendgrid_api'/u);
  assert.match(
    sendGridMigration,
    /platform_email_providers_provider_type_check/u,
  );
  assert.match(sendGridMigration, /email_delivery_log_provider_type_check/u);
  assert.match(pkg, /"\.\/email-service": "\.\/src\/email-service\.ts"/u);
});

test("deploy workflow passes platform email encryption key to runtime env", () => {
  const deploy = read(".github/workflows/deploy.yml");

  assert.match(
    deploy,
    /FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY:\s*\$\{\{\s*secrets\.FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY\s*\}\}/u,
  );
  assert.match(
    deploy,
    /printf 'FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY=%s\\n' "\$FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY"/u,
  );
});

test("application surfaces no longer call mail providers directly", () => {
  const appMailFiles = [
    "artifacts/backoffice/src/lib/email.ts",
    "artifacts/klant-pwa/src/lib/email.ts",
    "artifacts/personeel-pwa/src/lib/email.ts",
    "artifacts/api-server/src/lib/email.ts",
  ];

  for (const file of appMailFiles) {
    const content = read(file);
    assert.match(content, /sendTransactionalEmail/u, `${file} should use the central service`);
    assert.doesNotMatch(content, /new Resend|resend\.emails|sendSmtpMail|@\/lib\/smtp-mailer/u, `${file} should not call providers directly`);
  }

  const appPackageFiles = [
    "artifacts/backoffice/package.json",
    "artifacts/klant-pwa/package.json",
    "artifacts/personeel-pwa/package.json",
    "artifacts/api-server/package.json",
  ];

  for (const file of appPackageFiles) {
    const content = read(file);
    assert.doesNotMatch(content, /"resend"/u, `${file} should not depend on Resend directly`);
  }
});

test("platform admin exposes provider-agnostic email settings and testmail", () => {
  const action = read("artifacts/backoffice/src/app/actions/platform-settings.ts");
  const page = read("artifacts/backoffice/src/app/(platform)/platform/settings/page.tsx");
  const form = read("artifacts/backoffice/src/components/platform/PlatformEmailProviderForm.tsx");

  assert.match(action, /getPlatformEmailProviderSettings/u);
  assert.match(action, /savePlatformEmailProviderSettings/u);
  assert.match(action, /sendPlatformEmailTest/u);
  assert.match(action, /platform_email_provider_updated/u);
  assert.match(action, /platform_email_test_sent/u);
  assert.match(page, /PlatformEmailProviderForm/u);
  assert.match(
    page,
    /updatePlatformEmailProviderSettingsAction\(\s*formData:\s*FormData,\s*\)/u,
  );
  assert.match(form, /event\.preventDefault\(\)/u);
  assert.match(form, /useTransition/u);
  assert.match(form, /setState\(result\)/u);
  assert.match(form, /role=\{state\.success \? "status" : "alert"\}/u);
  assert.match(form, /router\.refresh\(\)/u);
  assert.match(page, /Resend API/u);
  assert.match(page, /SendGrid API/u);
  assert.match(page, /SMTP/u);
  assert.match(page, /Testmail versturen/u);
  assert.match(form, /maskedSecret/u);
  assert.match(form, /name="sendgridApiKey"/u);
  assert.match(form, /name="sendgridApiRegion"/u);
  assert.match(form, /name="sendingDomain"/u);
  assert.match(form, /Mail Send/u);
  assert.doesNotMatch(form, /SendGrid later/u);
  assert.doesNotMatch(page, /RESEND_API_KEY/u);
  assert.doesNotMatch(form, /RESEND_API_KEY/u);
});

test("tenant mail settings support platform, SMTP and Resend API transports", () => {
  const service = read("lib/db/src/email-service.ts");
  const schema = read("lib/db/src/schema/organization-settings.ts");
  const migration = read("lib/db/migrations/094_tenant_email_transport.sql");
  const action = read("artifacts/backoffice/src/app/actions/settings.ts");
  const view = read("artifacts/backoffice/src/components/settings/MailSettingsView.tsx");

  assert.match(schema, /emailTransport/u);
  assert.match(schema, /emailApiKeyEncrypted/u);
  assert.match(migration, /email_transport/u);
  assert.match(migration, /organization_settings_email_transport_check/u);
  assert.match(service, /getTenantProvider/u);
  assert.match(service, /resolveActiveProvider\(normalizedInput\.tenantId\)/u);
  assert.match(action, /encryptPlatformEmailConfig/u);
  assert.match(action, /clearApiKey/u);
  assert.match(action, /where\(eq\(organizationSettingsTable\.tenantId,\s*tenantId\)\)/u);
  assert.match(view, /Platform standaard/u);
  assert.match(view, /Resend/u);
  assert.match(view, /Opgeslagen API key verwijderen/u);
  assert.doesNotMatch(view, /RESEND_API_KEY/u);
});
