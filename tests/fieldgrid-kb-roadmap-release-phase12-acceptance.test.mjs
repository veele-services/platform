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

test("phase 12 exposes an executable Playwright acceptance harness", () => {
  const script = read("scripts/fieldgrid-kb-roadmap-release-phase12-acceptance.mjs");
  const pkg = read("package.json");

  assertContains(
    script,
    [
      "loadPlaywright",
      "FIELDGRID_PHASE12_PLATFORM_BASE_URL",
      "FIELDGRID_PHASE12_TENANT_BASE_URL",
      "FIELDGRID_PHASE12_CUSTOMER_BASE_URL",
      "FIELDGRID_PHASE12_PERSONNEL_BASE_URL",
      "FIELDGRID_PHASE12_PLATFORM_STORAGE_STATE",
      "FIELDGRID_PHASE12_TENANT_STORAGE_STATE",
      "FIELDGRID_PHASE12_CUSTOMER_STORAGE_STATE",
      "FIELDGRID_PHASE12_PERSONNEL_STORAGE_STATE",
      "mobile-390",
      "tablet-768",
      "desktop-1440",
      "screenshots",
      "horizontalOverflow",
      "dialogOverflow",
      "strictEvidence",
    ],
    "phase 12 script",
  );

  assertContains(
    pkg,
    [
      "fieldgrid:kb-roadmap-release-phase12-acceptance",
      "fieldgrid:kb-roadmap-release-phase12-acceptance:check",
      "fieldgrid:kb-roadmap-release-phase12-acceptance:strict",
    ],
    "package scripts",
  );
});

test("phase 12 covers required runtime flows", () => {
  const script = read("scripts/fieldgrid-kb-roadmap-release-phase12-acceptance.mjs");

  assertContains(
    script,
    [
      "autocomplete",
      "tooltip",
      "tiptap",
      "release",
      "roadmap",
      "notification-events",
      "protected-media-routes",
      "runMediaNoAccessChecks",
      "/platform/knowledgebase",
      "/platform/releases",
      "/platform/roadmap",
      "/help",
      "/releases",
      "/roadmap/new",
    ],
    "phase 12 runtime flow coverage",
  );
});

test("phase 12 documentation describes strict evidence and artifacts", () => {
  const docs = read("docs/fieldgrid-knowledgebase-roadmap-release-phase12-acceptance.md");
  const completion = read("docs/knowledgebase-roadmap-release-completion-plan.md");

  assertContains(
    `${docs}\n${completion}`,
    [
      "outputs/kb-roadmap-release-phase12-acceptance",
      "FIELDGRID_PHASE12_PLATFORM_BASE_URL",
      "FIELDGRID_PHASE12_TENANT_BASE_URL",
      "FIELDGRID_PHASE12_CUSTOMER_BASE_URL",
      "FIELDGRID_PHASE12_PERSONNEL_BASE_URL",
      "390x844",
      "768x1024",
      "1440x1100",
      "fieldgrid:kb-roadmap-release-phase12-acceptance:strict",
      "strict evidence",
    ],
    "phase 12 documentation",
  );
});
