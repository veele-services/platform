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

test("payment reminder cron creates one tenant-bound durable outbox item per cycle", () => {
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
    /eq\(invoicesTable\.customerId, customersTable\.id\)[\s\S]*eq\(customersTable\.tenantId, invoiceTenantId\)/u,
  );
  assert.match(
    source,
    /eq\(organizationSettingsTable\.tenantId, invoiceTenantId\)[\s\S]*\.for\("share"\)/u,
  );
  assert.match(
    source,
    /currentInvoice\.dueDate > dueCutoff[\s\S]*currentInvoice\.lastReminderSentAt >= reminderCutoff/u,
  );
  assert.match(
    source,
    /\.insert\(notificationDeliveryQueueTable\)[\s\S]*eventKey: "payment_reminder"[\s\S]*recipientType: "customer"[\s\S]*customerId: currentInvoice\.customerId/u,
  );
  assert.match(
    source,
    /fieldgridPurpose: "invoice_payment_reminder"[\s\S]*templateKey: "invoice_payment_reminder"[\s\S]*templateVariables[\s\S]*invoiceId: invoice\.id[\s\S]*herinneringDagen/u,
  );
  assert.match(
    source,
    /const cycleKey = `payment-reminder:\$\{invoiceTenantId\}:\$\{invoice\.id\}:\$\{currentInvoice\.lastReminderSentAt\?\.getTime\(\) \?\? "initial"\}`/u,
  );
  assert.match(
    source,
    /idempotencyKey: cycleKey,[\s\S]*deliveryKey: cycleKey/u,
  );
  assert.match(
    source,
    /\.onConflictDoUpdate\(\{[\s\S]*target: notificationDeliveryQueueTable\.idempotencyKey[\s\S]*targetWhere: sql`\$\{notificationDeliveryQueueTable\.idempotencyKey\} is not null`[\s\S]*status: "retry"[\s\S]*maxAttempts: sql<number>`least\([\s\S]*20,[\s\S]*setWhere: and\([\s\S]*"failed"[\s\S]*"skipped"[\s\S]*lt\(notificationDeliveryQueueTable\.attempts, 20\)/u,
  );
  assert.match(source, /queued\+\+;/u);
  assert.match(
    source,
    /res\.json\(\{ ok: true, queued, skipped, moduleDisabled \}\)/u,
  );
  assert.doesNotMatch(source, /sendEmailWithResult/u);
  assert.doesNotMatch(source, /\.set\(\{ lastReminderSentAt:/u);
  assertOrdered(
    source,
    '.for("update")',
    ".insert(notificationDeliveryQueueTable)",
    "payment reminder outbox enqueue",
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
