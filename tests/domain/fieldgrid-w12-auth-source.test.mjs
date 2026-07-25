import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const loginPage = read("artifacts/backoffice/src/app/(auth)/login/page.tsx");
const loginForm = read(
  "artifacts/backoffice/src/components/auth/LoginForm.tsx",
);
const authLayout = read("artifacts/backoffice/src/app/(auth)/layout.tsx");
const authAction = read("artifacts/backoffice/src/app/actions/auth.ts");
const forgotPasswordPage = read(
  "artifacts/backoffice/src/app/(auth)/wachtwoord-vergeten/page.tsx",
);
const resetPasswordPage = read(
  "artifacts/backoffice/src/app/(auth)/reset-wachtwoord/page.tsx",
);
const profileOnboardingPage = read(
  "artifacts/backoffice/src/app/(auth)/profiel-instellen/page.tsx",
);

test("login uses a scroll-safe dynamic viewport and Dutch metadata", () => {
  assert.match(loginPage, /title: "Inloggen"/);
  assert.match(loginPage, /min-h-dvh/);
  assert.match(loginPage, /env\(safe-area-inset-top\)/);
  assert.match(loginPage, /env\(safe-area-inset-bottom\)/);
  assert.match(authLayout, /min-h-dvh/);
  assert.doesNotMatch(loginPage, /fixed inset-0/);
  assert.doesNotMatch(authLayout, /min-h-screen|h-screen/);
});

test("login consumes canonical form and feedback primitives", () => {
  for (const contract of [
    "@/components/ui/alert",
    "@/components/ui/button",
    "@/components/ui/input",
    "@/components/ui/label",
  ]) {
    assert.match(loginForm, new RegExp(contract.replaceAll("/", "\\/")));
  }
  assert.doesNotMatch(loginForm, /style=\{/);
  assert.match(loginForm, /process\.env\.NODE_ENV === "development"/);
  assert.match(loginForm, /aria-busy=\{pending\}/);
  assert.match(loginForm, /Wachtwoord tonen/);
});

test("safe next paths remain fail-closed in page and server action", () => {
  assert.match(loginPage, /!value\.startsWith\("\/"\)/);
  assert.match(loginPage, /value\.startsWith\("\/\/"\)/);
  assert.ok(loginPage.includes('value.includes("\\\\")'));
  assert.match(authAction, /redirectPathFromFormValue/);
  assert.match(authAction, /next\.startsWith\("\/\/"\)/);
});

test("credential recovery and profile onboarding share the canonical auth controls", () => {
  for (const source of [forgotPasswordPage, resetPasswordPage]) {
    assert.match(source, /@\/components\/ui\/alert/);
    assert.match(source, /@\/components\/ui\/button/);
    assert.match(source, /@\/components\/ui\/input/);
    assert.match(source, /@\/components\/ui\/label/);
    assert.doesNotMatch(source, /style=\{/);
    assert.doesNotMatch(source, /<button/);
    assert.match(source, /min-h-11|<Button/);
  }

  assert.match(resetPasswordPage, /aria-invalid=\{!passwordsMatch\}/);
  assert.match(resetPasswordPage, /aria-pressed=\{showPassword\}/);
  assert.match(resetPasswordPage, /safeNextPath/);
  assert.match(forgotPasswordPage, /autoComplete="one-time-code"/);
  assert.match(profileOnboardingPage, /@\/components\/ui\/button/);
  assert.doesNotMatch(profileOnboardingPage, /<button/);
});
