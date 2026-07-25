import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("tenant and platform shells consume one canonical registry", () => {
  const tenant = read("artifacts/backoffice/src/components/layout/Sidebar.tsx");
  const platform = read(
    "artifacts/backoffice/src/components/platform/PlatformShell.tsx",
  );
  const header = read(
    "artifacts/backoffice/src/components/layout/DashboardHeader.tsx",
  );

  assert.match(tenant, /TENANT_NAVIGATION_GROUPS/u);
  assert.match(tenant, /TENANT_ROUTES/u);
  assert.match(platform, /PLATFORM_NAVIGATION_GROUPS/u);
  assert.match(platform, /PLATFORM_ROUTES/u);
  assert.match(header, /getFieldgridRoute/u);
  assert.doesNotMatch(tenant, /const NAV_ITEMS/u);
  assert.doesNotMatch(platform, /const NAV_ITEMS/u);
  assert.doesNotMatch(header, /const ROUTE_TITLES/u);
});

test("navigation groups use canonical collapsibles and collapsed tooltips", () => {
  for (const path of [
    "artifacts/backoffice/src/components/layout/Sidebar.tsx",
    "artifacts/backoffice/src/components/platform/PlatformShell.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /CollapsibleTrigger/u);
    assert.match(source, /CollapsibleContent/u);
    assert.match(source, /TooltipTrigger asChild/u);
    assert.match(source, /aria-current/u);
    assert.match(source, /min-h-11/u);
  }
});

test("global palette exposes keyboard navigation and honest scoped search", () => {
  const palette = read(
    "artifacts/backoffice/src/components/navigation/GlobalCommandPalette.tsx",
  );
  const header = read(
    "artifacts/backoffice/src/components/layout/DashboardHeader.tsx",
  );

  assert.match(palette, /event\.(?:metaKey|ctrlKey)/u);
  assert.match(palette, /key\.toLowerCase\(\) === "k"/u);
  assert.match(palette, /Zoek binnen een onderdeel/u);
  assert.match(palette, /Recent bekeken/u);
  assert.match(palette, /Nieuwe opdracht/u);
  assert.match(palette, /permissions\.has\("planning:read"\)/u);
  assert.match(header, /GlobalCommandPalette/u);
  assert.doesNotMatch(header, /Snel zoeken/u);
});

test("platform collapse preference persists locally", () => {
  const shell = read(
    "artifacts/backoffice/src/components/platform/PlatformShell.tsx",
  );
  assert.match(shell, /fieldgrid:platform-sidebar-collapsed/u);
  assert.match(shell, /localStorage\.getItem/u);
  assert.match(shell, /localStorage\.setItem/u);
});

test("route permissions are projected from the registry", () => {
  const permissions = read(
    "artifacts/backoffice/src/lib/auth/route-permissions.ts",
  );
  assert.match(permissions, /TENANT_ROUTES/u);
  assert.match(permissions, /permissionParts/u);
  assert.doesNotMatch(permissions, /prefix:\s*"\/planning"/u);
  const registry = read(
    "artifacts/backoffice/src/lib/navigation/route-registry.ts",
  );
  assert.match(
    registry,
    /href: "\/settings\/checklists"[\s\S]*permission: "checklists:read"/u,
  );
});
