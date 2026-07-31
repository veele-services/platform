import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("phase 11 groups personnel modules and hides disabled module links", () => {
  const sidebar = read("artifacts/personeel-pwa/src/components/DesktopSidebar.tsx");

  for (const marker of [
    'label: "Werk"',
    'label: "Inbox"',
    'label: "Mijn zaken"',
    'label: "Ondersteuning"',
    'label: "Home"',
    'label: "Planning"',
    'label: "Open diensten"',
    'label: "Uren"',
    'label: "Berichten"',
    'label: "Nieuws"',
    'label: "Meldingen"',
    'label: "Beschikbaarheid"',
    'label: "Documenten"',
    'moduleKey: "notifications"',
    'moduleKey: "documents"',
    'moduleKey: "knowledgebase"',
    'moduleKey: "releases"',
  ]) {
    assert.match(sidebar, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }

  assert.match(sidebar, /href="\/instellingen"/u);
  assert.match(sidebar, /group\.items\.filter/u);
  assert.match(sidebar, /isVisible\(item\.moduleKey, featureFlags\)/u);
});

test("phase 11 keeps mobile bottom navigation compact and work-floor focused", () => {
  const bottomNav = read("artifacts/personeel-pwa/src/components/BottomNav.tsx");
  const labels = [...bottomNav.matchAll(/label: "([^"]+)"/gu)].map((match) => match[1]);

  assert.deepEqual(labels, ["Home", "Uren", "Planning", "Inbox", "Meer"]);
  assert.match(bottomNav, /href: "\/berichten"/u);
  assert.match(bottomNav, /match: \["\/berichten", "\/meldingen"\]/u);
  assert.doesNotMatch(bottomNav, /label: "Nieuws"/u);
});

test("phase 11 keeps More secondary and avoids duplicate primary destinations", () => {
  const more = read("artifacts/personeel-pwa/src/app/(app)/meer/page.tsx");

  for (const marker of [
    'href: "/nieuws"',
    'label: "Nieuws"',
    'href: "/instellingen"',
    'label: "Instellingen"',
    'moduleKey: "documents"',
    'moduleKey: "knowledgebase"',
    'moduleKey: "releases"',
  ]) {
    assert.match(more, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }

  assert.doesNotMatch(more, /href: "\/meldingen"/u);
  assert.doesNotMatch(more, /href: "\/openstaand"/u);
  assert.match(more, /visibleLinks = MORE_LINKS\.filter/u);
});

test("phase 11 shares mobile header chrome and gives tablet more width", () => {
  const mobileHeader = read("artifacts/personeel-pwa/src/components/MobileHeader.tsx");
  const workOrderHeader = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/WorkOrderHeader.tsx");
  const appLayout = read("artifacts/personeel-pwa/src/app/(app)/layout.tsx");
  const pageShell = read("artifacts/personeel-pwa/src/components/MobilePageShell.tsx");

  assert.match(mobileHeader, /export function MobileHeaderBar/u);
  assert.match(mobileHeader, /leading\?: ReactNode/u);
  assert.match(workOrderHeader, /MobileHeaderBar/u);
  assert.doesNotMatch(workOrderHeader, /MobileHeaderActions/u);
  assert.match(appLayout, /max-w-\[1200px\]/u);
  assert.match(pageShell, /md:max-w-5xl/u);
  assert.match(pageShell, /xl:max-w-6xl/u);
});
