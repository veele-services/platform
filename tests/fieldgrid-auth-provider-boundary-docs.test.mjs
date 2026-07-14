import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const adr = read("docs/architecture/adr-auth-provider-boundary.md");
const migrationPlan = read("docs/architecture/auth-provider-migration-plan.md");
const acceptanceMatrix = read("docs/security/auth-runtime-acceptance-matrix.md");
const inventory = JSON.parse(read("docs/architecture/auth-provider-dependency-inventory.json"));

const mandatoryDecisionKeys = [
  "hostOnlyFieldgridAuthCookies",
  "noMagicLinksAsCanonicalFlow",
  "noTemporaryPasswordByEmail",
  "challengeCodeFlow",
  "resetGrantFlow",
  "sessionRevocationRequirements",
  "administratorResetStepUpMfa",
  "wrongHostSessionDenial",
  "suspendedTenantDenial",
  "personnelCustomerProfileUniqueness",
  "platformAssuranceLevel",
  "csrfSessionCookieModel",
  "jwtCustomClaimsNoTenantDependency",
  "databaseDerivedTenantIdentity",
  "supabaseReplacementMigrationPath",
];

const acceptanceCases = [
  "backoffice login",
  "personnel login",
  "customer login",
  "wrong-host login",
  "stale cookie",
  "suspended tenant",
  "inactive profile",
  "reset request",
  "challenge verification",
  "expired challenge",
  "used challenge",
  "too many attempts",
  "resend cooldown",
  "password update",
  "session revocation",
  "admin reset step-up",
  "multi-tenant platform account",
  "brute-force/rate limiting",
];

const evidenceClasses = [
  "static",
  "unit",
  "DB integration",
  "RLS",
  "API runtime",
  "browser E2E",
  "provider mock",
  "staging",
];

test("auth boundary ADR records every mandatory decision", () => {
  for (const key of mandatoryDecisionKeys) {
    assert.match(inventory.mandatoryDecisions[key], /accepted|proposed/, `${key} inventory decision`);
  }

  for (const snippet of [
    "Supabase Auth remains the credential and session backend for now",
    "Host-only Fieldgrid auth cookies",
    "HttpOnly` is not currently proven or configured",
    "Target requirement: move toward a server-only/`HttpOnly` session boundary",
    "No magic links as canonical flow",
    "No temporary password by e-mail",
    "Challenge-code flow",
    "Reset grant flow",
    "Session revocation requirements",
    "mandatory capability and acceptance requirement, not a claim that full revocation is already implemented",
    "Administrator reset step-up/MFA",
    "Wrong-host session denial",
    "Suspended tenant denial",
    "Personnel/customer profile uniqueness",
    "Platform assurance level",
    "CSRF/session-cookie model",
    "JWT custom claims",
    "Database-derived tenant identity",
    "Migration path",
  ]) {
    assert.match(adr, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), snippet);
  }
});

test("inventory and migration plan preserve provider boundary invariants", () => {
  assert.match(adr, /Status: Proposed, pending owner acceptance/);
  assert.match(inventory.currentCookieBehavior, /HttpOnly is not currently proven or configured/);
  assert.match(inventory.targetCookieRequirement, /server-only\/HttpOnly session boundary/);
  assert.match(inventory.currentRevocationCapability, /may not yet expose a complete all-session provider refresh-session revocation seam/);
  assert.match(inventory.jwtTenantClaimDependency, /Do not depend on tenant_id JWT claims/);
  assert.match(inventory.resetModel, /Challenge-code verification creates a short-lived reset grant/);
  assert.match(inventory.sessionRevocationRequirement, /mandatory target capability and acceptance requirement/);
  assert.match(inventory.stepUpRequirement, /step-up\/MFA/);

  for (const invariant of [
    "No dependency on `tenant_id` JWT claims",
    "No magic links as the canonical flow",
    "No temporary passwords by e-mail",
    "short-lived one-time reset grant",
    "recent step-up or MFA evidence",
    "target capability",
    "never claim `HttpOnly` until implemented and browser-tested",
    "browser-readable cookies remain",
  ]) {
    assert.match(migrationPlan, new RegExp(invariant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), invariant);
  }
});

test("acceptance matrix covers required cases and evidence classes", () => {
  for (const evidenceClass of evidenceClasses) {
    assert.match(acceptanceMatrix, new RegExp(evidenceClass), `${evidenceClass} evidence class`);
  }

  for (const acceptanceCase of acceptanceCases) {
    assert.match(acceptanceMatrix, new RegExp(`\\| ${acceptanceCase} \\|`), acceptanceCase);
  }

  assert.match(acceptanceMatrix, /Personnel tenant binding is database-derived/);
  assert.match(acceptanceMatrix, /Valid provider session on the wrong host is denied/);
  assert.match(acceptanceMatrix, /Admin\/support reset initiation and grant issuance require recent step-up\/MFA/);
});


test("ADR distinguishes current cookie facts from target HttpOnly requirement", () => {
  assert.match(adr, /Current verified behavior.*host-derived cookie name.*SameSite=Lax.*Secure` only in production/s);
  assert.match(adr, /HttpOnly` is not currently proven or configured/);
  assert.match(adr, /Target requirement: move toward a server-only\/`HttpOnly` session boundary/);
  assert.doesNotMatch(adr, /`Secure`, `HttpOnly`, and `SameSite=Lax` by default/);
  assert.match(migrationPlan, /Current cookie behavior is host-only, `path=\/`, `SameSite=Lax`, production-`Secure`/);
});

test("ADR distinguishes revocation target from current repository capability", () => {
  assert.match(adr, /Current repository capability may not yet expose a complete all-session provider revocation seam/);
  assert.match(inventory.currentRevocationCapability, /may not yet expose a complete all-session provider refresh-session revocation seam/);
  assert.match(migrationPlan, /do not state complete all-session revocation is already implemented/);
});
