import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repositoryRoot = new URL("../../", import.meta.url);

function read(relativePath) {
  return readFileSync(new URL(relativePath, repositoryRoot), "utf8");
}

function assertOrdered(source, earlier, later, label) {
  const earlierIndex = source.indexOf(earlier);
  const laterIndex = source.indexOf(later, earlierIndex + earlier.length);
  assert.notEqual(earlierIndex, -1, `${label}: missing ${earlier}`);
  assert.notEqual(laterIndex, -1, `${label}: missing ${later}`);
  assert.ok(
    earlierIndex < laterIndex,
    `${label}: ${earlier} must precede ${later}`,
  );
}

test("expired quote cron claims the persisted quote tenant before mail", () => {
  const source = read("artifacts/api-server/src/routes/expired-quotes.ts");

  assert.match(source, /tenantId:\s*quotesTable\.tenantId/u);
  assert.match(source, /const quoteTenantId = q\.tenantId/u);
  assert.match(source, /if \(!quoteTenantId\)/u);
  assert.match(
    source,
    /requireJobTenantModule\(\s*quoteTenantId,\s*"finance",?\s*\)/u,
  );
  assert.doesNotMatch(source, /customerTenantId/u);
  assert.match(source, /const today = amsterdamDateKey\(\)/u);
  assert.match(
    source,
    /eq\(quotesTable\.tenantId, quoteTenantId\)[\s\S]*eq\(quotesTable\.status, "sent"\)[\s\S]*lt\(quotesTable\.validityDate, today\)[\s\S]*\.returning\(\{/u,
  );
  assert.match(
    source,
    /if \(!claimed \|\| claimed\.tenantId !== quoteTenantId\) return false/u,
  );
  assert.match(
    source,
    /tenantId:\s+quoteTenantId,[\s\S]*action:\s+"expire_quote"/u,
  );
  assert.match(
    source,
    /idempotencyKey: `quote-expired:\$\{quoteTenantId\}:\$\{q\.id\}`/u,
  );
  assert.match(source, /if \(emailResult\.success\) \{\s*notified\+\+/u);
  assertOrdered(
    source,
    ".update(quotesTable)",
    "sendEmailWithResult({",
    "expired quote claim",
  );
});

test("payment reminder cron rechecks cutoff under an exclusive tenant claim", () => {
  const source = read("artifacts/api-server/src/routes/payment-reminders.ts");

  assert.match(source, /tenantId:\s+invoicesTable\.tenantId/u);
  assert.match(source, /const invoiceTenantId = invoice\.tenantId/u);
  assert.match(source, /if \(!invoiceTenantId\)/u);
  assert.match(
    source,
    /requireJobTenantModule\(\s*invoiceTenantId,\s*"finance",?\s*\)/u,
  );
  assert.doesNotMatch(source, /customerTenantId/u);
  assert.match(
    source,
    /eq\(invoicesTable\.id, invoice\.id\)[\s\S]*eq\(invoicesTable\.tenantId, invoiceTenantId\)[\s\S]*\.for\("update"\)/u,
  );
  assert.match(
    source,
    /eq\(organizationSettingsTable\.tenantId, invoiceTenantId\)[\s\S]*\.for\("share"\)/u,
  );
  assert.match(
    source,
    /lte\(invoicesTable\.dueDate, dueCutoff\)[\s\S]*isNull\(invoicesTable\.lastReminderSentAt\)[\s\S]*lt\(invoicesTable\.lastReminderSentAt, reminderCutoff\)[\s\S]*\.returning\(\{/u,
  );
  assert.match(
    source,
    /if \(!claimed \|\| claimed\.tenantId !== invoiceTenantId\) return null/u,
  );
  assert.match(
    source,
    /idempotencyKey: `payment-reminder:\$\{invoiceTenantId\}:\$\{invoice\.id\}:\$\{claim\.previousReminderSentAt\?\.toISOString\(\) \?\? "initial"\}`/u,
  );
  assert.doesNotMatch(
    source,
    /idempotencyKey:[^\n]*claim\.claimedAt/u,
    "a released claim must reuse the same provider idempotency key on retry",
  );
  assert.match(
    source,
    /deliveryEffect === "not_attempted"[\s\S]*eq\(invoicesTable\.lastReminderSentAt, claim\.claimedAt\)[\s\S]*\.returning\(\{ id: invoicesTable\.id \}\)/u,
  );
  assert.match(
    source,
    /tenantId:\s+invoiceTenantId,[\s\S]*action:\s+"payment_reminder_sent"/u,
  );
  assert.match(source, /sent\+\+;/u);
  assertOrdered(
    source,
    ".set({ lastReminderSentAt: claimedAt })",
    "sendEmailWithResult({",
    "payment reminder claim",
  );
});

test("changed best-effort notification IIFEs terminate in an explicit catch", () => {
  const expectedCounts = new Map([
    ["artifacts/backoffice/src/app/actions/reports.ts", 3],
    ["artifacts/klant-pwa/src/actions/assignments.ts", 2],
    ["artifacts/personeel-pwa/src/actions/leave.ts", 1],
    ["artifacts/personeel-pwa/src/actions/reports.ts", 1],
  ]);

  for (const [relativePath, expectedCount] of expectedCounts) {
    const source = read(relativePath);
    const iifeCount = source.match(/void \(async \(\) => \{/gu)?.length ?? 0;
    const caughtCount =
      source.match(/\}\)\(\)\.catch\(\([^)]*: unknown\) => \{/gu)?.length ?? 0;
    assert.equal(
      iifeCount,
      expectedCount,
      `${relativePath}: reviewed IIFE count`,
    );
    assert.equal(
      caughtCount,
      expectedCount,
      `${relativePath}: every best-effort IIFE must catch rejection`,
    );
    assert.doesNotMatch(
      source,
      /console\.error\([^\n]*\b(?:email|reason|formData|payload|cookie|token)\b/iu,
      `${relativePath}: catch logging must not include sensitive payload values`,
    );
  }
});

test("report decision notifications bind personnel to the assignment tenant", () => {
  const source = read("artifacts/backoffice/src/app/actions/reports.ts");
  assert.equal(
    source.match(/eq\(personnelTable\.tenantId, assignmentsTable\.tenantId\)/gu)
      ?.length ?? 0,
    2,
  );
  assert.equal(
    source.match(
      /eq\(organizationSettingsTable\.tenantId, assignmentsTable\.tenantId\)/gu,
    )?.length ?? 0,
    2,
  );
});
