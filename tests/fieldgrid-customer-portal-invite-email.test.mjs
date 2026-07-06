import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("customer portal invite sends Fieldgrid temporary-password mail and persists portal access", () => {
  const action = read("artifacts/backoffice/src/app/actions/customers.ts");

  assert.match(action, /async function sendCustomerPortalInvite/u);
  assert.match(action, /provisionPortalUserWithTemporaryPassword/u);
  assert.match(action, /portal:\s*"customer"/u);
  assert.match(action, /buildTemporaryPasswordEmail/u);
  assert.match(action, /sendEmailWithResult/u);
  assert.match(action, /customerPortalLoginUrl\(input\.tenantId\)/u);
  assert.match(action, /upsertCustomerPortalInviteLink/u);
  assert.match(action, /markCustomerPortalInviteSent/u);
  assert.match(action, /insert\(customerUsersTable\)/u);
  assert.match(action, /status:\s*"invited"/u);
  assert.match(action, /inviteSentAt:\s*new Date\(\)/u);
  assert.match(action, /customerUserId:\s*invite\.customerUserId/u);
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

test("customer portal activates invited links after a valid first login", () => {
  const portal = read("artifacts/klant-pwa/src/actions/customer.ts");

  assert.match(portal, /inArray\(customerUsersTable\.status,\s*\["active",\s*"invited"\]\)/u);
  assert.match(portal, /isNull\(customerUsersTable\.userId\)/u);
  assert.match(portal, /set\(\{\s*userId:\s*user\.id,\s*status:\s*"active",\s*lastLoginAt:\s*new Date\(\)\s*\}\)/u);
  assert.match(portal, /set\(\{\s*status:\s*"active",\s*lastLoginAt:\s*new Date\(\)\s*\}\)/u);
});

test("system mailer selects an enabled SMTP configuration instead of an arbitrary tenant row", () => {
  const email = read("artifacts/backoffice/src/lib/email.ts");

  assert.match(email, /where\(eq\(organizationSettingsTable\.smtpEnabled,\s*true\)\)/u);
  assert.match(email, /orderBy\(desc\(organizationSettingsTable\.updatedAt\)\)/u);
  assert.match(email, /smtpRows\.find\(\(row\) => row\.smtpHost && row\.smtpPort && row\.smtpFromEmail\)/u);
});

test("playwright authentication state output is ignored", () => {
  const ignore = read(".gitignore");

  assert.match(ignore, /\/outputs\/\*\*\/auth\//u);
});
