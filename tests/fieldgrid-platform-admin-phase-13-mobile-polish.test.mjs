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

test("phase 13 adds shared platform mobile polish utilities", () => {
  const css = read("artifacts/backoffice/src/app/globals.css");

  assertContains(
    css,
    [
      ".platform-page",
      "overflow-x: hidden",
      ".platform-long-text",
      "overflow-wrap: anywhere",
      ".platform-scroll-x",
      "-webkit-overflow-scrolling: touch",
      ".platform-tab-strip",
      "scroll-snap-type: x proximity",
      ".platform-empty-state",
      "@media (max-width: 767px)",
      "min-height: 2.5rem",
    ],
    "platform polish css",
  );
});

test("phase 13 improves the platform shell drawer and touch navigation", () => {
  const shell = read("artifacts/backoffice/src/components/platform/PlatformShell.tsx");

  assertContains(
    shell,
    [
      "platform-shell",
      "max-w-[calc(100vw-2rem)]",
      "min-h-11",
      "sticky top-0",
      "overflow-hidden",
      "closeNavigation",
      "onClick={closeNavigation}",
    ],
    "platform shell",
  );
});

test("phase 13 activates mobile polish on platform surfaces", () => {
  const pages = [
    "artifacts/backoffice/src/app/(platform)/platform/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/tenants/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/tenants/[tenantId]/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/tickets/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/tickets/[ticketId]/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/security/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/operations/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/staging-smoke/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/notifications/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/subscriptions/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/users/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/settings/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/onboarding/page.tsx",
  ];

  for (const path of pages) {
    assert.ok(read(path).includes("platform-page"), `${path} should activate platform-page`);
  }
});

test("phase 13 covers tenant list, tenant detail tabs, domains, tickets and audit", () => {
  const tenants = read("artifacts/backoffice/src/app/(platform)/platform/tenants/page.tsx");
  const tenantDetail = read("artifacts/backoffice/src/app/(platform)/platform/tenants/[tenantId]/page.tsx");
  const tickets = read("artifacts/backoffice/src/app/(platform)/platform/tickets/page.tsx");
  const security = read("artifacts/backoffice/src/app/(platform)/platform/security/page.tsx");

  assertContains(tenants, ["TenantMobileList", "lg:hidden", "platform-scroll-x", "flex flex-wrap items-center gap-2"], "tenant list");
  assertContains(
    tenantDetail,
    [
      "platform-scroll-x",
      "platform-tab-strip",
      "whitespace-nowrap",
      "DomainsTab",
      "DNS instructies",
      "platform-long-text",
      "platform-page",
    ],
    "tenant detail",
  );
  assertContains(tickets, ["TicketCard", "platform-empty-state", "platform-page"], "tickets page");
  assertContains(security, ["EventCard", "SupportGrantForm", "platform-empty-state", "platform-page"], "security page");
});

test("phase 13 adds executable screenshot smoke contract", () => {
  const script = read("scripts/fieldgrid-platform-admin-phase13-visual-smoke.mjs");
  const pkg = read("package.json");
  const docs = read("docs/fieldgrid-platform-admin-phase-13-mobile-polish.md");

  assertContains(
    script,
    [
      "mobile-390",
      "tablet-768",
      "desktop-1440",
      "/platform/tenants",
      "/platform/tickets",
      "/platform/security",
      "horizontalOverflow",
      "undersizedInteractiveElements",
      "page.screenshot",
    ],
    "phase 13 screenshot smoke",
  );
  assertContains(pkg, ["fieldgrid:platform-phase13-visual-smoke"], "package scripts");
  assertContains(docs, ["390x844", "768x1024", "1440x1100", "Geen horizontale overflow"], "phase 13 documentation");
});
