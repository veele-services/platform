import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function section(source, functionName) {
  const marker = `export async function ${functionName}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const next = source.indexOf("\nexport async function ", start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

const quotes = read("artifacts/backoffice/src/app/actions/quotes.ts");

test("backoffice quote actions expose a tenant-scoped quote helper", () => {
  assert.match(quotes, /requireCurrentTenantId/u);
  assert.match(quotes, /getQuoteAssignmentForCurrentTenant/u);
  assert.match(quotes, /innerJoin\(assignmentsTable, eq\(quotesTable\.assignmentId, assignmentsTable\.id\)\)/u);
  assert.match(quotes, /where\(and\(eq\(quotesTable\.id, quoteId\), eq\(assignmentsTable\.tenantId, tenantId\)\)\)/u);

  const tenantChecks = quotes.match(/eq\(assignmentsTable\.tenantId, tenantId\)/gu) ?? [];
  assert.ok(tenantChecks.length >= 10, "quote reads and writes should filter through assignments.tenantId");
});

test("quote read paths include tenant filters", () => {
  for (const functionName of [
    "getPendingQuotesCount",
    "getQuoteSummary",
    "listQuotes",
    "getQuote",
    "getQuoteForAssignment",
    "getAssignmentQuoteData",
  ]) {
    const body = section(quotes, functionName);
    assert.match(body, /requireCurrentTenantId\(\)/u, `${functionName} should resolve the current tenant`);
    assert.match(body, /eq\(assignmentsTable\.tenantId, tenantId\)/u, `${functionName} should filter by assignment tenant`);
  }
});

test("direct quote-id actions verify tenant scope before writes", () => {
  for (const functionName of ["approveQuote", "rejectQuote"]) {
    const body = section(quotes, functionName);
    assert.match(body, /getQuoteAssignmentForCurrentTenant\(id\)/u, `${functionName} should verify quote tenant scope`);
    assert.match(body, /if \(!quote\) return/u, `${functionName} should hide cross-tenant quote ids`);
  }

  const sendBody = section(quotes, "sendQuote");
  assert.match(sendBody, /requireCurrentTenantId\(\)/u);
  assert.match(sendBody, /where\(and\(eq\(quotesTable\.id, id\), eq\(assignmentsTable\.tenantId, tenantId\)\)\)/u);
});

test("quote creation and expiry processing stay tenant-scoped", () => {
  const createBody = section(quotes, "createQuote");
  assert.match(createBody, /requireCurrentTenantId\(\)/u);
  assert.match(createBody, /where\(and\(eq\(assignmentsTable\.id, assignmentId\), eq\(assignmentsTable\.tenantId, tenantId\)\)\)/u);

  const expiryBody = section(quotes, "processExpiredQuotes");
  assert.match(expiryBody, /requireCurrentTenantId\(\)/u);
  assert.match(expiryBody, /innerJoin\(assignmentsTable, eq\(quotesTable\.assignmentId, assignmentsTable\.id\)\)/u);
  assert.match(expiryBody, /eq\(assignmentsTable\.tenantId, tenantId\)/u);
});

test("quote summary uses qualified quote columns after tenant join", () => {
  const body = section(quotes, "getQuoteSummary");

  assert.match(body, /\$\{quotesTable\.status\}/u);
  assert.match(body, /\$\{quotesTable\.validityDate\}/u);
  assert.doesNotMatch(body, /WHERE status =/u);
  assert.doesNotMatch(body, /AND validity_date/u);
});
