import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

test("phase 14 defines an executable read-only platform-admin final gate", () => {
  const script = read("scripts/fieldgrid-platform-admin-final-gate.mjs");
  const pkg = read("package.json");

  assertContains(
    script,
    [
      "PLATFORM_ADMIN_FINAL_GATE_VERSION",
      "platform-admin-final-gate-v1",
      "destructive: false",
      "noMigration: true",
      "strictEvidence",
      "FG-PA-GATE-ROLES",
      "FG-PA-GATE-HOST-FIRST",
      "FG-PA-GATE-ENTERPRISE-CUSTOM-DOMAIN",
      "FG-PA-GATE-NON-ENTERPRISE-DENIAL",
      "FG-PA-GATE-CADDY-ASK",
      "FG-PA-GATE-LIFECYCLE",
      "FG-PA-GATE-SUBSCRIPTION-DOWNGRADE",
      "FG-PA-GATE-TICKETS",
      "FG-PA-GATE-NOTIFICATIONS",
      "FG-PA-GATE-AUDIT-EXPORT",
      "FG-PA-GATE-MOBILE-SCREENSHOTS",
      "FG-PA-GATE-BUILD-TYPECHECK",
      "FG-PA-EXCEPTION-RUNTIME-ARTIFACTS",
      "FG-PA-EXCEPTION-MOBILE-ARTIFACTS",
      "fieldgrid:platform-phase13-visual-smoke",
      "pnpm run typecheck && pnpm -r --if-present run build",
    ],
    "phase 14 script",
  );

  assertContains(
    pkg,
    [
      "fieldgrid:platform-admin-final-gate",
      "fieldgrid:platform-admin-final-gate:check",
      "fieldgrid:platform-admin-final-gate:strict",
    ],
    "package scripts",
  );
});

test("phase 14 is visible through the platform staging-smoke dashboard and JSON model", () => {
  const action = read("artifacts/backoffice/src/app/actions/platform-smoke.ts");
  const types = read("artifacts/backoffice/src/app/actions/platform-smoke.types.ts");
  const page = read("artifacts/backoffice/src/app/(platform)/platform/staging-smoke/page.tsx");

  assertContains(
    `${action}\n${types}`,
    [
      "PlatformAdminReleaseGate",
      "PlatformAdminReleaseGateItem",
      "PlatformAdminReleaseGateException",
      "buildPlatformAdminReleaseGate",
      "platformAdminReleaseGate",
      "FG-PA-GATE-CADDY-ASK",
      "FG-PA-GATE-BUILD-TYPECHECK",
      "requiredCommands",
      "artifacts/platform-admin-final-gate",
    ],
    "platform smoke model",
  );

  assertContains(
    page,
    [
      "PlatformAdminReleaseGateCard",
      "Platform-admin release gate",
      "Open uitzonderingen",
      "Verplichte commands",
      "dashboard.platformAdminReleaseGate",
      "platform-long-text",
    ],
    "staging smoke page",
  );
});

test("phase 14 documentation records the go/no-go checklist with owners and exceptions", () => {
  const docs = read("docs/fieldgrid-platform-admin-phase-14-final-gate.md");

  assertContains(
    docs,
    [
      "Go/no-go checklist",
      "Runtime tests voor platform owner/admin/support",
      "field-demo pilot host-first checks",
      "Enterprise custom-domain staging test",
      "Non-Enterprise custom-domain denial",
      "Caddy ask endpoint staging test",
      "Tenant lifecycle smoke",
      "Subscription downgrade smoke",
      "Ticket lifecycle smoke",
      "Meldingen smoke",
      "Audit export smoke",
      "Mobile screenshots",
      "Build en typecheck volledig groen",
      "post-launch accepted",
      "FG-PA-EXCEPTION-RUNTIME-ARTIFACTS",
      "FG-PA-EXCEPTION-MOBILE-ARTIFACTS",
      "/api/platform/staging-smoke",
      "platformAdminReleaseGate",
    ],
    "phase 14 docs",
  );
});

test("phase 14 final gate check command validates its contract", () => {
  const output = execFileSync("node", ["scripts/fieldgrid-platform-admin-final-gate.mjs", "--check"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });

  assert.match(output, /Fieldgrid platform-admin final gate contract is valid/u);
});
