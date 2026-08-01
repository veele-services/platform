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

test("phase 16 adds executable customer/personnel releasegate", () => {
  const script = read(
    "scripts/fieldgrid-customer-personnel-phase16-releasegate.mjs",
  );
  const hrefContract = read(
    "scripts/lib/fieldgrid-navigation-href-contract.mjs",
  );
  const pkg = read("package.json");

  assertContains(
    `${script}\n${hrefContract}`,
    [
      "customerTargets",
      "personnelTargets",
      "mobile-320",
      "mobile-390",
      "mobile-430",
      "tablet-768",
      "tablet-landscape-1024",
      "desktop-1280",
      "desktop-1440",
      "desktop-1920",
      "zoom-200-1024",
      "checkNavigationHrefs",
      "findBrokenLocalNavigationHrefs",
      '.replace(/\\$\\{[^}]+\\}/gu, ":param")',
      "checkRawDialogs",
      "checkSecurityCopy",
      "checkNotificationHrefs",
      "runScreenshots",
      "runtimeEvidenceStatus",
      "horizontalOverflow",
      "hasServerError",
      "undersizedInteractiveElements",
      "rect.width < 44 || rect.height < 44",
      "FIELDGRID_CUSTOMER_PORTAL_STORAGE_STATE",
      "FIELDGRID_PERSONNEL_PORTAL_STORAGE_STATE",
      "isAuthenticationRedirect",
      "samePathname",
      "verifyKeyboardFocus",
      "AxeBuilder",
      "CP16-P1-AUTHENTICATED-SCREENSHOTS",
    ],
    "phase 16 releasegate script",
  );

  assertContains(
    pkg,
    [
      "fieldgrid:customer-personnel-final-gate",
      "fieldgrid:customer-personnel-final-gate:check",
      "fieldgrid:customer-personnel-final-gate:strict",
    ],
    "package scripts",
  );
});

test("phase 16 documents screenshot evidence inputs and route coverage", () => {
  const docs = read(
    "docs/fieldgrid-customer-personnel-phase-16-releasegate.md",
  );

  assertContains(
    docs,
    [
      "FIELDGRID_CUSTOMER_PORTAL_BASE_URL",
      "FIELDGRID_PERSONNEL_PORTAL_BASE_URL",
      "FIELDGRID_CUSTOMER_PORTAL_COOKIE",
      "FIELDGRID_PERSONNEL_PORTAL_COOKIE",
      "FIELDGRID_CUSTOMER_OBJECT_PATH",
      "FIELDGRID_CUSTOMER_ASSIGNMENT_PATH",
      "FIELDGRID_PERSONNEL_ASSIGNMENT_PATH",
      "390x844",
      "320x568",
      "430x932",
      "768x1024",
      "1024x768",
      "1280x800",
      "1440x1100",
      "1920x1080",
      "200%",
      "dashboard",
      "objectdetail",
      "opdrachtdetail",
      "profiel, beveiliging en instellingen",
      "44x44",
      "Axe",
      "toetsenbordfocus",
    ],
    "phase 16 documentation",
  );
});

test("phase 16 releasegate enforces acceptance risks from the roadmap", () => {
  const script = read(
    "scripts/fieldgrid-customer-personnel-phase16-releasegate.mjs",
  );
  const hrefContract = read(
    "scripts/lib/fieldgrid-navigation-href-contract.mjs",
  );

  assertContains(
    `${script}\n${hrefContract}`,
    [
      "broken-local-href",
      "raw-browser-dialog",
      "security-placeholder-copy",
      "forbidden-audience-href",
      "unknown-audience-href",
      "/meldingen/tickets",
      "/berichten",
      "/help",
      "/releases",
      "/roadmap",
      "/platform",
    ],
    "phase 16 acceptance enforcement",
  );
});
