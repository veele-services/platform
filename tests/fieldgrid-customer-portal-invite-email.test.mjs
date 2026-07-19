import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("customer portal invite sends an activation challenge and persists portal access", () => {
  const action = read("artifacts/backoffice/src/app/actions/customers.ts");

  assert.match(action, /async function sendCustomerPortalInvite/u);
  assert.match(action, /findAuthUserByEmail/u);
  assert.match(action, /hasUsableExistingAccount/u);
  assert.match(action, /provisionPortalUserForActivation/u);
  assert.match(action, /allowExistingActive:\s*true/u);
  assert.match(action, /portal:\s*"customer"/u);
  assert.match(action, /activationUrl:/u);
  assert.match(action, /delivery:\s*"activation_challenge"/u);
  assert.match(action, /delivery:\s*"existing_access"/u);
  assert.match(action, /buildStyledNotificationEmail/u);
  assert.match(action, /sendEmailWithResult/u);
  assert.match(action, /customerPortalLoginUrl\(input\.tenantId\)/u);
  assert.match(action, /upsertCustomerPortalInviteLink/u);
  assert.match(action, /markCustomerPortalInviteSent/u);
  assert.match(action, /status:\s*"invited"/u);
  assert.match(action, /activationChallenge:\s*invite\.delivery === "activation_challenge"/u);
  assert.doesNotMatch(action, /temporaryPassword|buildTemporaryPasswordEmail/u);
});

test("customer portal invite reuses existing auth users across tenants", () => {
  const action = read("artifacts/backoffice/src/app/actions/customers.ts");

  assert.match(action, /const existingAuthUser = await findAuthUserByEmail\(admin, email\)/u);
  assert.match(action, /existingAuthUser\?\.app_metadata\?\.credential_activation_pending !== true/u);
  assert.match(action, /authUserId:\s*existingAuthUser\.id/u);
  assert.match(action, /Uw bestaande Fieldgrid-account heeft nu toegang tot het klantportaal/u);
  assert.match(action, /Log in met uw bestaande e-mailadres en wachtwoord/u);
  assert.match(action, /purpose:\s*"customer_portal_invite"/u);
  assert.match(action, /delivery:\s*"existing_access"/u);
});

test("creating a customer can immediately invite the primary contact", () => {
  const action = read("artifacts/backoffice/src/app/actions/customers.ts");
  const form = read("artifacts/backoffice/src/components/customers/CustomerForm.tsx");

  assert.match(action, /invitePortal\?:\s*boolean/u);
  assert.match(action, /if \(data\.invitePortal && !parsed\.data\.contactEmail\)/u);
  assert.match(action, /sendCustomerPortalInvite\(\{\s*tenantId,\s*customerId:\s*created!\.id,/u);
  assert.match(action, /action:\s*"auto_invite_customer_portal"/u);
  assert.match(action, /action:\s*"auto_invite_customer_portal_failed"/u);
  assert.match(action, /purpose:\s*"customer_portal_invite"/u);
  assert.match(action, /inviteResult = \{ sent: false, message \}/u);

  assert.match(form, /id="invitePortal"/u);
  assert.match(form, /invitePortalTouched/u);
  assert.match(form, /if \(!invitePortalTouched\) setInvitePortal\(true\)/u);
  assert.match(form, /disabled=\{!canInvitePortal\}/u);
  assert.match(form, /invitePortal:\s+mode === "create" \? invitePortal : undefined/u);
  assert.match(form, /Klant aangemaakt en klantportaaluitnodiging verstuurd/u);
  assert.match(form, /Klant aangemaakt, maar uitnodiging niet verstuurd/u);
});

test("customer contact email uniqueness is tenant scoped", () => {
  const schema = read("lib/db/src/schema/customers.ts");
  const migration = read("lib/db/migrations/092_customer_contact_email_tenant_scope.sql");

  assert.doesNotMatch(schema, /contactEmail:\s*varchar\("contact_email", \{ length: 255 \}\)\.unique\(\)/u);
  assert.match(schema, /uniqueIndex\("customers_tenant_contact_email_unique_idx"\)\.on\(table\.tenantId, table\.contactEmail\)/u);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS customers_contact_email_unique/u);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_contact_email_unique_idx/u);
  assert.match(migration, /ON public\.customers \(tenant_id, contact_email\)/u);
});

test("customer portal accepts only already activated immutable user links", () => {
  const portal = read("artifacts/klant-pwa/src/actions/customer.ts");

  assert.match(portal, /eq\(customerUsersTable\.status, "active"\)/u);
  assert.match(portal, /eq\(customerUsersTable\.userId, user\.id\)/u);
  assert.doesNotMatch(portal, /isNull\(customerUsersTable\.userId\)/u);
  assert.doesNotMatch(portal, /\.set\(\{[^}]*userId:/u);
  assert.match(portal, /set\(\{ lastLoginAt: new Date\(\) \}\)/u);
});

test("system mailer uses the central platform email service", () => {
  const email = read("artifacts/backoffice/src/lib/email.ts");
  const service = read("lib/db/src/email-service.ts");
  const migration = read("lib/db/migrations/093_platform_email_providers.sql");

  assert.match(email, /sendTransactionalEmail/u);
  assert.doesNotMatch(email, /new Resend|sendSmtpMail|RESEND_API_KEY/u);
  assert.match(service, /platformEmailProvidersTable/u);
  assert.match(service, /emailDeliveryLogTable/u);
  assert.match(service, /encryptPlatformEmailConfig/u);
  assert.match(migration, /platform_email_providers/u);
  assert.match(migration, /email_delivery_log/u);
  assert.match(migration, /REVOKE ALL ON TABLE public\.platform_email_providers FROM anon, authenticated/u);
});

test("playwright authentication state output is ignored", () => {
  const ignore = read(".gitignore");

  assert.match(ignore, /\/outputs\/\*\*\/auth\//u);
});
