import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("customer portal invite sends Fieldgrid temporary-password mail and persists portal access", () => {
  const action = read("artifacts/backoffice/src/app/actions/customers.ts");

  assert.match(action, /provisionPortalUserWithTemporaryPassword/u);
  assert.match(action, /portal:\s*"customer"/u);
  assert.match(action, /buildTemporaryPasswordEmail/u);
  assert.match(action, /sendEmailWithResult/u);
  assert.match(action, /customerPortalLoginUrl\(tenantId\)/u);
  assert.match(action, /upsertCustomerPortalInviteLink/u);
  assert.match(action, /markCustomerPortalInviteSent/u);
  assert.match(action, /insert\(customerUsersTable\)/u);
  assert.match(action, /status:\s*"invited"/u);
  assert.match(action, /inviteSentAt:\s*new Date\(\)/u);
  assert.match(action, /customerUserId:\s*invite\.customerUserId/u);
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
