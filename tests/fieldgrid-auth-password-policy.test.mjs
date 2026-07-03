import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should contain ${phrase}`);
  }
}

test("platform superadmin bootstrap creates a temporary owner login", () => {
  const seed = read("lib/db/src/seed/platform-admin.ts");
  const pkg = read("lib/db/package.json");

  assertContains(seed, [
    "PLATFORM_SUPERADMIN_EMAIL",
    "PLATFORM_ADMIN_EMAIL",
    "force_password_change",
    "platform-admin",
    "platform_role",
    "owner",
    "platform_users",
    "Temporary password",
  ], "platform admin seed");
  assertContains(pkg, ["seed:platform-admin"], "db package scripts");
});

test("temporary password invite helper supports all account surfaces", () => {
  const helper = read("artifacts/backoffice/src/lib/auth/portal-invites.ts");

  assertContains(helper, [
    "customer",
    "personnel",
    "tenant-admin",
    "platform-admin",
    "generateTemporaryPassword",
    "force_password_change",
  ], "portal invite helper");
});

test("global password policy is aligned to 8 characters", () => {
  const files = [
    "artifacts/backoffice/src/lib/password-strength.ts",
    "artifacts/personeel-pwa/src/lib/password-strength.ts",
    "artifacts/klant-pwa/src/lib/password-strength.ts",
  ];

  for (const path of files) {
    const content = read(path);
    assertContains(content, [
      "MIN_PASSWORD_LENGTH = 8",
      "evaluatePasswordStrength",
      "mediumPasswordMessage",
      "isMedium",
    ], path);
  }
});

test("backoffice forces temporary password users through reset", () => {
  const middleware = read("artifacts/backoffice/src/middleware.ts");
  const actions = read("artifacts/backoffice/src/app/actions/auth.ts");

  assertContains(middleware, ["force_password_change", "reset-wachtwoord?force=1"], "backoffice middleware");
  assertContains(actions, [
    "completePasswordReset",
    "force_password_change: false",
    "password_changed_at",
    "password_changed",
  ], "backoffice auth actions");
});

test("password fields provide visibility toggles on login and reset screens", () => {
  const files = [
    "artifacts/backoffice/src/components/auth/LoginForm.tsx",
    "artifacts/backoffice/src/app/(auth)/reset-wachtwoord/page.tsx",
    "artifacts/personeel-pwa/src/components/LoginForm.tsx",
    "artifacts/personeel-pwa/src/app/(auth)/reset-wachtwoord/page.tsx",
    "artifacts/klant-pwa/src/app/(auth)/login/LoginForm.tsx",
    "artifacts/klant-pwa/src/app/(auth)/reset-wachtwoord/page.tsx",
  ];

  for (const path of files) {
    const content = read(path);
    assertContains(content, ["Eye", "EyeOff", "Wachtwoord tonen", "Wachtwoord verbergen"], path);
  }
});

test("forgot password screens support recovery code verification", () => {
  const files = [
    "artifacts/backoffice/src/app/(auth)/wachtwoord-vergeten/page.tsx",
    "artifacts/personeel-pwa/src/app/(auth)/wachtwoord-vergeten/page.tsx",
    "artifacts/klant-pwa/src/app/(auth)/wachtwoord-vergeten/page.tsx",
  ];

  for (const path of files) {
    const content = read(path);
    assertContains(content, ["verifyOtp", "type: \"recovery\"", "Herstelcode", "Code controleren"], path);
  }
});
