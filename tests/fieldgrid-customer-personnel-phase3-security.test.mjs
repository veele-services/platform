import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("phase 3 gates personnel MFA behind an explicit production feature flag", () => {
  const securityPage = read("artifacts/personeel-pwa/src/app/(app)/beveiliging/page.tsx");
  const mfaSettings = read("artifacts/personeel-pwa/src/app/(app)/beveiliging/MfaSettings.tsx");

  assert.match(securityPage, /NEXT_PUBLIC_ENABLE_PERSONNEL_MFA\s*===\s*"true"/u);
  assert.match(securityPage, /isPersonnelMfaEnabled\s*\?\s*\(/u);
  assert.match(securityPage, /<MfaSettings \/>/u);
  assert.doesNotMatch(mfaSettings, /nog niet beschikbaar|zodra Supabase/u);
});

test("phase 3 removes unfinished customer security placeholders from production UI", () => {
  const customerSecurityPage = read("artifacts/klant-pwa/src/app/(app)/beveiliging/page.tsx");

  assert.doesNotMatch(customerSecurityPage, /Twee-factor-authenticatie/u);
  assert.doesNotMatch(customerSecurityPage, /Sessies/u);
  assert.doesNotMatch(customerSecurityPage, /wordt voorbereid|wordt straks/u);
});

test("phase 3 uses basePath-safe auth links", () => {
  const personnelLogin = read("artifacts/personeel-pwa/src/components/LoginForm.tsx");
  const customerLogin = read("artifacts/klant-pwa/src/app/(auth)/login/LoginForm.tsx");
  const personnelNotFound = read("artifacts/personeel-pwa/src/app/not-found.tsx");

  assert.match(personnelLogin, /import Link from "next\/link"/u);
  assert.match(personnelLogin, /href="\/wachtwoord-vergeten"/u);
  assert.doesNotMatch(personnelLogin, /href="\/personeel\/wachtwoord-vergeten"/u);
  assert.doesNotMatch(personnelLogin, /<a\s/u);

  assert.match(customerLogin, /import Link from "next\/link"/u);
  assert.match(customerLogin, /href="\/wachtwoord-vergeten"/u);
  assert.doesNotMatch(customerLogin, /href="\/klant\/wachtwoord-vergeten"/u);
  assert.doesNotMatch(customerLogin, /<a\s/u);

  assert.match(personnelNotFound, /import Link from "next\/link"/u);
  assert.match(personnelNotFound, /href="\/"/u);
  assert.doesNotMatch(personnelNotFound, /href="\/personeel"/u);
  assert.doesNotMatch(personnelNotFound, /<a\s/u);
});

test("phase 3 keeps quick login accounts development-only", () => {
  const personnelLogin = read("artifacts/personeel-pwa/src/components/LoginForm.tsx");
  const customerLogin = read("artifacts/klant-pwa/src/app/(auth)/login/LoginForm.tsx");

  for (const source of [personnelLogin, customerLogin]) {
    assert.match(source, /const isDev = process\.env\.NODE_ENV === "development"/u);
    assert.match(source, /\{isDev && \(/u);
    assert.doesNotMatch(source, /process\.env\.NODE_ENV !== "production"/u);
  }
});
