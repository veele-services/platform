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

test("phase 7 backoffice renders printable QR labels without exposing database ids", () => {
  const qrLib = read("artifacts/backoffice/src/lib/inventory-qr.ts");
  const qrAction = read("artifacts/backoffice/src/app/actions/inventory-qr.ts");
  const qrPage = read("artifacts/backoffice/src/app/(dashboard)/inventory/[id]/qr/page.tsx");

  assertContains(qrLib, ["renderInventoryQrSvg", "buildInventoryScanUrl", "/i/", "NEXT_PUBLIC_PERSONNEL_PWA_URL", "QR_DATA_CODEWORDS"], "QR renderer");
  assertContains(qrAction, ["rotateInventoryQrToken", "randomUUID", "qr_token", "qr_generated_at", "inventory_qr_token_rotated"], "QR action");
  assertContains(qrPage, ["getInventoryQrLabel", "renderInventoryQrSvg", "buildInventoryScanUrl", "Opaque QR-token, niet gelijk aan database-id"], "QR page");
});

test("phase 7 PWA scan route resolves opaque tokens with login redirect and field-level authorization", () => {
  const action = read("artifacts/personeel-pwa/src/actions/inventory-scan.ts");
  const tokenPage = read("artifacts/personeel-pwa/src/app/scan/inventory/[token]/page.tsx");
  const aliasPage = read("artifacts/personeel-pwa/src/app/i/[token]/page.tsx");

  assertContains(
    action,
    [
      "getInventoryScanResult",
      "item.qr_token",
      "inventory_item_scanned",
      "inventory_item_scan_denied",
      "inventory_item_scan_not_found",
      "current_personnel_id",
      "assignment_personnel",
      "no_personnel_or_assignment_scope",
    ],
    "PWA scan action",
  );
  assertContains(tokenPage, ["/login?next=", "getInventoryScanResult", "Geen toegang", "Toegestane details", "Open inventaris op werkbon"], "PWA token page");
  assertContains(aliasPage, ["/scan/inventory/", "encodeURIComponent(token)"], "short QR alias page");
  assert.ok(!tokenPage.includes("purchaseValue"), "scan page must not render cost fields");
});

test("phase 7 manual code fallback and login form keep redirects safe", () => {
  const manualPage = read("artifacts/personeel-pwa/src/app/scan/inventory/page.tsx");
  const authAction = read("artifacts/personeel-pwa/src/actions/auth.ts");
  const loginPage = read("artifacts/personeel-pwa/src/app/(auth)/login/page.tsx");
  const loginForm = read("artifacts/personeel-pwa/src/components/LoginForm.tsx");

  assertContains(manualPage, ["resolveInventoryScanCode", "Inventariscode", "I000001", "/login?next=", "Details worden pas getoond na login en autorisatie"], "manual scan page");
  assertContains(authAction, ["sanitizeRedirectPath", "startsWith(\"//\")", "isLoginPath(trimmed)", "redirect(next ?? \"/\")"], "auth redirect sanitization");
  assertContains(loginPage, ["safeNext", "next?: string", "<LoginForm next={redirectPath} />"], "login page next wiring");
  assertContains(loginForm, ["next?: string | null", "type=\"hidden\" name=\"next\" value={next}"], "login form hidden next field");
});
