import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function functionBlock(source, functionName) {
  const marker = `export async function ${functionName}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const next = source.indexOf("\nexport async function ", start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

const customerQuotes = read("artifacts/klant-pwa/src/actions/quotes.ts");
const customerAssignments = read("artifacts/klant-pwa/src/actions/assignments.ts");

test("customer quote list hides draft quotes", () => {
  const body = functionBlock(customerQuotes, "getMyQuotes");

  assert.match(customerQuotes, /CUSTOMER_VISIBLE_QUOTE_STATUSES/u);
  assert.match(customerQuotes, /\["sent", "approved", "rejected", "expired"\]/u);
  assert.doesNotMatch(customerQuotes, /CUSTOMER_VISIBLE_QUOTE_STATUSES[^\n]*draft/u);
  assert.match(body, /eq\(quotesTable\.customerId, identity\.customerId\)/u);
  assert.match(body, /eq\(assignmentsTable\.customerId, identity\.customerId\)/u);
  assert.match(body, /eq\(assignmentsTable\.tenantId, identity\.tenantId\)/u);
  assert.match(body, /inArray\(quotesTable\.status, CUSTOMER_VISIBLE_QUOTE_STATUSES\)/u);
});

test("customer assignment list hides draft quote joins", () => {
  const body = functionBlock(customerAssignments, "getMyAssignments");

  assert.match(customerAssignments, /CUSTOMER_VISIBLE_QUOTE_STATUSES/u);
  assert.match(customerAssignments, /\["sent", "approved", "rejected", "expired"\]/u);
  assert.doesNotMatch(customerAssignments, /CUSTOMER_VISIBLE_QUOTE_STATUSES[^\n]*draft/u);
  assert.match(body, /leftJoin\(\s*quotesTable,\s*and\(/u);
  assert.match(body, /eq\(quotesTable\.assignmentId, assignmentsTable\.id\)/u);
  assert.match(body, /inArray\(quotesTable\.status, CUSTOMER_VISIBLE_QUOTE_STATUSES\)/u);
  assert.match(body, /eq\(assignmentsTable\.customerId, identity\.customerId\)/u);
  assert.match(body, /eq\(assignmentsTable\.tenantId, identity\.tenantId\)/u);
});

test("customer assignment detail hides draft quote joins", () => {
  const body = functionBlock(customerAssignments, "getMyAssignmentDetail");

  assert.match(body, /leftJoin\(\s*quotesTable,\s*and\(/u);
  assert.match(body, /eq\(quotesTable\.assignmentId, assignmentsTable\.id\)/u);
  assert.match(body, /inArray\(quotesTable\.status, CUSTOMER_VISIBLE_QUOTE_STATUSES\)/u);
  assert.match(body, /eq\(assignmentsTable\.id,\s+assignmentId\)/u);
  assert.match(body, /eq\(assignmentsTable\.customerId, identity\.customerId\)/u);
  assert.match(body, /eq\(assignmentsTable\.tenantId,\s+identity\.tenantId\)/u);
});

test("customer quote actions still require a sent quote awaiting approval", () => {
  for (const functionName of ["approveQuote", "rejectQuote"]) {
    const body = functionBlock(customerAssignments, functionName);

    assert.match(body, /eq\(assignmentsTable\.customerId, identity\.customerId\)/u);
    assert.match(body, /eq\(assignmentsTable\.tenantId,\s+identity\.tenantId\)/u);
    assert.match(body, /eq\(assignmentsTable\.status,\s+"awaiting_approval"\)/u);
    assert.match(body, /eq\(quotesTable\.status,\s+"sent"\)/u);
  }
});
