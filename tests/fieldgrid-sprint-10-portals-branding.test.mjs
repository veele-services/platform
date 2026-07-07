import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertIncludes(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should include ${phrase}`);
  }
}

test("sprint 10 centralizes tenant branding with Fieldgrid defaults and plan gating", () => {
  const branding = read("lib/db/src/tenant-branding.ts");
  const dbIndex = read("lib/db/src/index.ts");

  assertIncludes(
    branding,
    [
      "FIELDGRID_BRAND_DEFAULTS",
      "platformName: \"Fieldgrid\"",
      "canTenantUseCustomBranding",
      "professional",
      "enterprise",
      "getTenantBranding",
      "getTenantBrandingCssVariables",
      "organizationSettingsTable.logoUrl",
      "getTenantPlanSnapshot",
    ],
    "tenant branding helper",
  );
  assertIncludes(dbIndex, ["./tenant-branding"], "db package exports");
  assert.ok(!branding.includes("Veele Services"), "Fieldgrid branding defaults should not use Veele Services");
});

test("sprint 10 keeps organization branding defaults Fieldgrid-first", () => {
  const organizationSettings = read("lib/db/src/schema/organization-settings.ts");
  const migration = read("lib/db/migrations/065_portal_branding_defaults.sql");

  assertIncludes(
    `${organizationSettings}\n${migration}`,
    [
      "Fieldgrid",
      "email_template_footer_text",
      "email_template_signature",
      "ALTER TABLE organization_settings",
    ],
    "organization branding defaults",
  );
  assert.ok(!organizationSettings.includes("Veele Services"), "new organization settings defaults should not mention Veele Services");
});

test("sprint 10 gates customer and personnel portal shells by host-bound tenant context", () => {
  const customerLayout = read("artifacts/klant-pwa/src/app/(app)/layout.tsx");
  const personnelLayout = read("artifacts/personeel-pwa/src/app/(app)/layout.tsx");

  assertIncludes(
    customerLayout,
    [
      "requireCurrentCustomerPortalTenantId",
      "getTenantBranding",
      "getTenantBrandingCssVariables",
      "isTenantModuleEnabled",
      "DesktopSidebar branding={branding}",
      "MobileHeader",
      "Het klantportaal is niet beschikbaar voor deze tenant.",
    ],
    "customer portal layout",
  );

  assertIncludes(
    personnelLayout,
    [
      "requireCurrentPersonnelPortalTenantId",
      "getTenantBranding",
      "getTenantBrandingCssVariables",
      "isTenantModuleEnabled",
      "DesktopSidebar branding={branding}",
      "MobileHeader",
      "De personeelsapp is niet beschikbaar voor deze tenant.",
    ],
    "personnel portal layout",
  );
});

test("sprint 10 applies branding props and module-aware navigation in both portal shells", () => {
  const customerHeader = read("artifacts/klant-pwa/src/components/MobileHeader.tsx");
  const customerSidebar = read("artifacts/klant-pwa/src/components/DesktopSidebar.tsx");
  const personnelHeader = read("artifacts/personeel-pwa/src/components/MobileHeader.tsx");
  const personnelSidebar = read("artifacts/personeel-pwa/src/components/DesktopSidebar.tsx");

  assertIncludes(
    `${customerHeader}\n${personnelHeader}`,
    ["PortalBrandingProps", "logoUrl", "displayName", "platformName", "accentColor"],
    "portal mobile branding",
  );
  assertIncludes(
    customerSidebar,
    ["featureFlags", "moduleKey: \"documents\"", "moduleKey: \"finance\"", "moduleKey: \"reporting\""],
    "customer portal sidebar",
  );
  assertIncludes(
    personnelSidebar,
    ["featureFlags", "moduleKey: \"documents\"", "FieldgridLogo branding={branding}"],
    "personnel portal sidebar",
  );
});

test("sprint 10 uses Fieldgrid as static PWA default instead of Veele tenant branding", () => {
  const staticFiles = [
    "artifacts/klant-pwa/src/app/layout.tsx",
    "artifacts/personeel-pwa/src/app/layout.tsx",
    "artifacts/klant-pwa/public/manifest.json",
    "artifacts/personeel-pwa/public/manifest.json",
  ];

  for (const path of staticFiles) {
    const content = read(path);
    assert.ok(content.includes("Fieldgrid"), `${path} should include Fieldgrid`);
    assert.ok(!content.includes("Veele Services"), `${path} should not include Veele Services`);
    assert.ok(!content.includes("Veele Klantportaal"), `${path} should not include Veele Klantportaal`);
    assert.ok(!content.includes("Veele Personeel"), `${path} should not include Veele Personeel`);
  }
});

test("sprint 10 canon doc links portal branding to required testmatrix coverage", () => {
  const sprintDoc = read("docs/fieldgrid-sprint-10-portals-branding.md");

  assertIncludes(
    sprintDoc,
    [
      "FG-PORTAL-C-001",
      "FG-PORTAL-C-003",
      "FG-PORTAL-P-001",
      "FG-PORTAL-P-004",
      "FG-MODULE-002",
      "FG-MODULE-003",
      "FG-MIG-001",
      "FG-MIG-002",
    ],
    "sprint 10 canon doc",
  );
});
