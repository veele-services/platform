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

  assertContains(middleware, ["force_password_change", "resetPasswordUrlWithNext", "url.searchParams.set(\"force\", \"1\")"], "backoffice middleware");
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
    assertContains(content, ["Herstelcode", "Code controleren"], path);
    assert.ok(
      content.includes("verifyOtp") || content.includes("signInWithPassword"),
      `${path} should verify the recovery code before opening password reset`,
    );
  }
});

test("klant PWA password reset avoids deployment-stale server action ids", () => {
  const forgotPage = read("artifacts/klant-pwa/src/app/(auth)/wachtwoord-vergeten/page.tsx");
  const resetPage = read("artifacts/klant-pwa/src/app/(auth)/reset-wachtwoord/page.tsx");
  const authActions = read("artifacts/klant-pwa/src/actions/auth.ts");
  const mailHelper = read("artifacts/klant-pwa/src/lib/email.ts");
  const requestRoute = read("artifacts/klant-pwa/src/app/api/auth/password-reset/request/route.ts");
  const completeRoute = read("artifacts/klant-pwa/src/app/api/auth/password-reset/complete/route.ts");
  const serviceWorker = read("artifacts/klant-pwa/public/sw.js");

  assertContains(forgotPage, [
    "fetch(\"/klant/api/auth/password-reset/request\"",
    "cache: \"no-store\"",
  ], "klant forgot password page");
  assert.doesNotMatch(forgotPage, /import \{ requestPasswordResetCode \}/u);

  assertContains(resetPage, [
    "fetch(\"/klant/api/auth/password-reset/complete\"",
    "cache: \"no-store\"",
  ], "klant reset password page");
  assert.doesNotMatch(resetPage, /useActionState/u);
  assert.doesNotMatch(resetPage, /import \{ completePasswordReset \}/u);

  assertContains(requestRoute, ["requestPasswordResetCode", "Cache-Control", "no-store"], "request route");
  assertContains(completeRoute, ["completePasswordReset", "Cache-Control", "no-store"], "complete route");
  assertContains(authActions, [
    "requireCurrentCustomerPortalTenantId",
    "findCustomerResetAccount",
    "eq(customerUsersTable.tenantId, tenantId)",
    "tenant_id: tenantId",
    "sendEmailWithResult",
    "purpose: \"customer_portal_password_reset\"",
    "if (!sent.success) throw new Error",
  ], "klant auth actions");
  assertContains(mailHelper, [
    "@workspace/db/email-service",
    "sendTransactionalEmail",
    "tenantId: opts.tenantId ?? null",
    "customer_portal",
  ], "klant mail helper");
  assert.doesNotMatch(mailHelper, /new Resend|sendSmtpMail|RESEND_API_KEY/u);
  assertContains(serviceWorker, ["static-v3"], "klant service worker");
  assert.doesNotMatch(serviceWorker, /pathname\.startsWith\(`\$\{APP_PREFIX\}\/_next\/static\/`\)/u);
});

test("portal password reset and logged-out routes are tenant-aware behind /klant and /personeel prefixes", () => {
  const customerMiddleware = read("artifacts/klant-pwa/src/middleware.ts");
  const personnelMiddleware = read("artifacts/personeel-pwa/src/middleware.ts");
  const personnelActions = read("artifacts/personeel-pwa/src/actions/auth.ts");
  const personnelMailHelper = read("artifacts/personeel-pwa/src/lib/email.ts");

  assertContains(customerMiddleware, [
    "function routePath",
    "pathname.startsWith(`${BASE}/`)",
    "normalizedPathname === \"/login\"",
    "normalizedPathname === \"/wachtwoord-vergeten\"",
    "const isPasswordResetApi = normalizedPathname.startsWith(\"/api/auth/password-reset\")",
    "const canBypassForcedPasswordChange",
    "normalizedPathname.startsWith(\"/api/auth/password-reset\")",
    "normalizedPathname === \"/sw.js\"",
    "normalizedPathname === \"/manifest.json\"",
    "user && mustChangePassword && !canBypassForcedPasswordChange",
  ], "customer portal middleware");

  assertContains(personnelMiddleware, [
    "function routePath",
    "pathname.startsWith(`${BASE}/`)",
    "normalizedPathname === \"/login\"",
    "normalizedPathname === \"/wachtwoord-vergeten\"",
    "normalizedPathname === \"/sw.js\"",
    "normalizedPathname === \"/manifest.json\"",
  ], "personnel portal middleware");

  assertContains(personnelActions, [
    "requireCurrentPersonnelPortalTenantId",
    "findPersonnelResetAccount",
    "eq(personnelTable.tenantId, tenantId)",
    "tenant_id: tenantId",
    "purpose: \"personnel_portal_password_reset\"",
    "if (!sent.success) throw new Error",
  ], "personnel auth actions");
  assertContains(personnelMailHelper, [
    "sendEmailWithResult",
    "tenantId: opts.tenantId ?? null",
    "personnel_portal",
  ], "personnel mail helper");
});
