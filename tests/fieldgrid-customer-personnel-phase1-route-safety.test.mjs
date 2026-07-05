import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("phase 1 exposes env-free portal route helpers", () => {
  const packageJson = JSON.parse(read("lib/db/package.json"));
  const routes = read("lib/db/src/portal-routes.ts");

  assert.equal(packageJson.exports["./portal-routes"], "./src/portal-routes.ts");
  assert.match(routes, /export const backofficeRoutes/u);
  assert.match(routes, /export const customerPortalRoutes/u);
  assert.match(routes, /export const personnelPortalRoutes/u);
  assert.match(routes, /export function sanitizeCustomerPortalHref/u);
  assert.match(routes, /export function sanitizePersonnelPortalHref/u);
  assert.match(routes, /export function sanitizeBackofficeHref/u);

  assert.match(routes, /\/tickets\/customer/u);
  assert.match(routes, /\/meldingen\/tickets/u);
  assert.match(routes, /\/tickets\/personnel/u);
  assert.match(routes, /\/berichten/u);
  assert.match(routes, /\/assignments/u);
  assert.match(routes, /\/opdrachten/u);
});

test("customer producers use explicit backoffice hrefs and sanitize persisted notifications", () => {
  const customerTickets = read("artifacts/klant-pwa/src/actions/tickets.ts");
  const customerAssignments = read("artifacts/klant-pwa/src/actions/assignments.ts");
  const customerNotifications = read("artifacts/klant-pwa/src/actions/notifications.ts");

  assert.match(customerTickets, /backofficeRoutes\.customerTicket/u);
  assert.match(customerTickets, /backofficeHref/u);
  assert.doesNotMatch(customerTickets, /href:\s*`\/tickets\/customer/u);
  assert.doesNotMatch(customerTickets, /payload:\s*\{[\s\S]*?href:\s*`\/tickets\/customer/u);

  assert.match(customerAssignments, /backofficeRoutes\.assignment/u);
  assert.match(customerAssignments, /backofficeHref/u);
  assert.doesNotMatch(customerAssignments, /href:\s*`\/assignments/u);
  assert.doesNotMatch(customerAssignments, /payload:\s*\{[\s\S]*?href:\s*`\/assignments/u);

  assert.match(customerNotifications, /sanitizeCustomerPortalHref\(row\.href\)/u);
  assert.doesNotMatch(customerNotifications, /row\.href\s*\?\?\s*"\/meldingen"/u);
});

test("personnel producers use explicit backoffice hrefs and sanitize persisted notifications", () => {
  const personnelMessages = read("artifacts/personeel-pwa/src/actions/messages.ts");
  const personnelNotifications = read("artifacts/personeel-pwa/src/actions/notifications.ts");

  assert.match(personnelMessages, /backofficeRoutes\.personnelTicket/u);
  assert.match(personnelMessages, /backofficeHref/u);
  assert.doesNotMatch(personnelMessages, /href:\s*`\/tickets\/personnel/u);
  assert.doesNotMatch(personnelMessages, /payload:\s*\{[\s\S]*?href:\s*`\/tickets\/personnel/u);

  assert.match(personnelNotifications, /sanitizePersonnelPortalHref\(row\.href\)/u);
  assert.doesNotMatch(personnelNotifications, /href:\s*row\.href/u);
});

test("domain events and push worker sanitize recipient hrefs by audience", () => {
  const events = read("lib/db/src/events.ts");
  const worker = read("artifacts/api-server/src/lib/notification-worker.ts");

  assert.match(events, /sanitizePersonnelPortalHref\(href\)/u);
  assert.match(events, /sanitizeCustomerPortalHref\(href\)/u);
  assert.match(events, /href:\s*personnelHref/u);
  assert.match(events, /href:\s*customerHref/u);

  assert.match(worker, /sanitizePersonnelPortalHref\(rawHref\)/u);
  assert.match(worker, /sanitizeCustomerPortalHref\(rawHref\)/u);
  assert.match(worker, /sanitizeBackofficeHref\(rawHref\)/u);
  assert.match(worker, /payload\["backofficeHref"\]\s*\?\?\s*payload\["href"\]/u);
});
