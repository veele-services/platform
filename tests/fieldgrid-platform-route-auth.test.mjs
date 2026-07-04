import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("platform layout handles missing platform role without server error", () => {
  const layout = read("artifacts/backoffice/src/app/(platform)/layout.tsx");

  assert.ok(layout.includes("getCurrentPlatformUser"));
  assert.ok(layout.includes("NoPlatformAccess"));
  assert.ok(layout.includes("redirect(\"/login?next=/platform\")"));
  assert.ok(layout.includes("Geen platformtoegang"));
  assert.ok(!layout.includes("requirePlatformSupportUser"));
});

test("platform last-seen tracking is non-blocking", () => {
  const layout = read("artifacts/backoffice/src/app/(platform)/layout.tsx");

  assert.ok(layout.includes("try {"));
  assert.ok(layout.includes("await markCurrentPlatformUserSeen()"));
  assert.ok(layout.includes("last-seen update skipped"));
});

test("platform login preserves next destination through first-login password reset", () => {
  const loginPage = read("artifacts/backoffice/src/app/(auth)/login/page.tsx");
  const loginForm = read("artifacts/backoffice/src/components/auth/LoginForm.tsx");
  const resetPage = read("artifacts/backoffice/src/app/(auth)/reset-wachtwoord/page.tsx");
  const authActions = read("artifacts/backoffice/src/app/actions/auth.ts");

  assert.ok(loginPage.includes("isPlatformHost(host) ? \"/platform\" : \"/\""));
  assert.ok(loginPage.includes("nextPath={nextPath}"));
  assert.ok(loginForm.includes("name=\"next\""));
  assert.ok(authActions.includes("redirectPathFromFormValue(formData.get(\"next\"))"));
  assert.ok(authActions.includes("redirect(`/reset-wachtwoord?force=1&next=${encodeURIComponent(nextPath)}`)"));
  assert.ok(authActions.includes("redirect(nextPath)"));
  assert.ok(resetPage.includes("name=\"next\""));
  assert.ok(resetPage.includes("next: state.next ?? nextPath"));
});
