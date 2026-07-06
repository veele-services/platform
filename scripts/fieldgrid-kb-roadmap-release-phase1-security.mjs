#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const outputDir =
  process.env.FIELDGRID_KB_ROADMAP_RELEASE_PHASE1_OUT_DIR ||
  join(process.cwd(), "outputs", "kb-roadmap-release-phase1-security");

const contentTables = [
  "kb_categories",
  "kb_articles",
  "kb_article_audiences",
  "kb_article_modules",
  "kb_article_permissions",
  "kb_article_media",
  "kb_article_related",
  "kb_article_versions",
  "kb_article_feedback",
  "kb_search_terms",
  "kb_search_events",
  "kb_tooltips",
  "kb_tooltip_audiences",
  "kb_tooltip_related_articles",
  "roadmap_items",
  "roadmap_item_audiences",
  "roadmap_item_modules",
  "roadmap_item_tenant_links",
  "roadmap_item_comments",
  "roadmap_item_votes",
  "roadmap_item_status_history",
  "roadmap_item_ticket_links",
  "release_categories",
  "releases",
  "release_items",
  "release_audiences",
  "release_modules",
  "release_media",
  "release_highlights",
  "release_dismissals",
  "release_roadmap_links",
  "release_ticket_links",
];

const migrationPaths = [
  "lib/db/migrations/081_knowledgebase_roadmap_releases_foundation.sql",
  "lib/db/migrations/082_knowledgebase_media_storage.sql",
  "lib/db/migrations/083_knowledgebase_search_feedback_tooltips.sql",
  "lib/db/migrations/084_release_highlight_dismissal_uniqueness.sql",
  "lib/db/migrations/085_retroactive_release_note_drafts.sql",
  "lib/db/migrations/086_knowledgebase_media_privacy_hardening.sql",
  "lib/db/migrations/087_kb_roadmap_release_direct_api_hardening.sql",
];

const report = {
  createdAt: new Date().toISOString(),
  mode: checkOnly ? "check" : "full",
  checks: [
    checkRlsCoverage(),
    checkDirectApiRevokes(),
    checkNoDirectRegrants(),
    checkRlsAntiPatterns(),
    checkServerSideVisibility(),
    checkKnowledgebaseMediaPrivacy(),
    checkProtectedMediaRoutes(),
  ],
};

await mkdir(outputDir, { recursive: true });
const reportPath = join(outputDir, "phase1-security.json");
await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

const failures = report.checks.flatMap((check) =>
  check.failures.map((failure) => ({ check: check.id, ...failure })),
);

if (failures.length > 0) {
  console.error(`Knowledgebase/roadmap/releases phase 1 security gate failed. Report: ${reportPath}`);
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(`Knowledgebase/roadmap/releases phase 1 security gate passed. Report: ${reportPath}`);

function read(path) {
  return readFileSync(path, "utf8");
}

function fileExists(path) {
  return existsSync(path);
}

function failure(message, evidence = null) {
  return { message, evidence };
}

function check(id, label, failures) {
  return { id, label, status: failures.length === 0 ? "passed" : "failed", failures };
}

function expectFileContains(path, expectations) {
  const failures = [];
  if (!fileExists(path)) return [failure(`Missing file: ${path}`)];
  const text = read(path);
  for (const expectation of expectations) {
    const found = typeof expectation.pattern === "string"
      ? text.includes(expectation.pattern)
      : expectation.pattern.test(text);
    if (!found) failures.push(failure(expectation.message, path));
  }
  return failures;
}

function checkRlsCoverage() {
  const foundationPath = "lib/db/migrations/081_knowledgebase_roadmap_releases_foundation.sql";
  const hardeningPath = "lib/db/migrations/087_kb_roadmap_release_direct_api_hardening.sql";
  const failures = [];

  if (!fileExists(foundationPath)) {
    failures.push(failure(`Missing foundation migration: ${foundationPath}`));
  } else {
    const sql = read(foundationPath);
    for (const table of contentTables) {
      if (!sql.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`)) {
        failures.push(failure(`Missing foundation RLS enable statement for ${table}.`, foundationPath));
      }
    }
  }

  failures.push(...expectFileContains(hardeningPath, [
    {
      pattern: "ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY",
      message: "Direct API hardening migration must keep RLS explicitly enabled.",
    },
  ]));

  return check("rls-coverage", "RLS is enabled for every KB, roadmap and release content table", failures);
}

function checkDirectApiRevokes() {
  const path = "lib/db/migrations/087_kb_roadmap_release_direct_api_hardening.sql";
  const failures = expectFileContains(path, [
    {
      pattern: "REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated",
      message: "Direct API hardening migration must revoke anon/authenticated table privileges.",
    },
    {
      pattern: "runtime access is mediated by server-side visibility helpers",
      message: "Direct API hardening migration must document the server-side access model.",
    },
  ]);

  if (fileExists(path)) {
    const sql = read(path);
    for (const table of contentTables) {
      if (!sql.includes(`'${table}'`)) {
        failures.push(failure(`Direct API hardening migration does not cover ${table}.`, path));
      }
    }
  }

  return check("direct-api-revokes", "Direct anon/authenticated Data API table privileges are explicitly revoked", failures);
}

function checkNoDirectRegrants() {
  const failures = [];
  const regrantPattern =
    /\bGRANT\b[\s\S]{0,220}\bON\b[\s\S]{0,80}\b(?:kb_[a-z_]+|roadmap_[a-z_]+|releases?|release_[a-z_]+)\b[\s\S]{0,160}\bTO\b[\s\S]{0,80}\b(?:anon|authenticated)\b/iu;

  for (const path of migrationPaths) {
    if (!fileExists(path)) {
      failures.push(failure(`Missing migration file: ${path}`));
      continue;
    }
    const sql = read(path);
    if (regrantPattern.test(sql)) {
      failures.push(failure("Do not grant direct anon/authenticated table access for KB/roadmap/release content tables.", path));
    }
  }

  return check("no-direct-regrants", "No migration grants direct content table access to anon/authenticated", failures);
}

function checkRlsAntiPatterns() {
  const failures = [];
  for (const path of migrationPaths) {
    if (!fileExists(path)) continue;
    const sql = read(path);
    if (/auth\.role\s*\(/iu.test(sql)) failures.push(failure("Do not use deprecated auth.role() in RLS policies.", path));
    if (/SECURITY\s+DEFINER/iu.test(sql)) failures.push(failure("Do not add SECURITY DEFINER functions for this surface.", path));
    if (/TO\s+authenticated\s+USING\s*\(\s*true\s*\)/iu.test(sql)) {
      failures.push(failure("TO authenticated must include authorization predicates, not USING (true).", path));
    }
  }
  return check("rls-anti-patterns", "RLS migrations avoid known Supabase anti-patterns", failures);
}

function checkServerSideVisibility() {
  const failures = [
    ...expectFileContains("lib/db/src/content-visibility.ts", [
      { pattern: "matchesTenantScope", message: "Visibility must include tenant scope." },
      { pattern: "matchesAudienceScope", message: "Visibility must include audience scope." },
      { pattern: "matchesModuleScope", message: "Visibility must include module scope." },
      { pattern: "matchesPermissionScope", message: "Visibility must include permission scope." },
      { pattern: "canReadPublishedContent", message: "Visibility must expose a central read decision." },
    ]),
    ...expectFileContains("lib/db/src/knowledgebase-content.ts", [
      { pattern: "canReadPublishedContent", message: "Knowledgebase reads must use central visibility decisions." },
      { pattern: "getKnowledgebaseMediaByIdForContext", message: "Knowledgebase media access must be context mediated." },
      { pattern: "publicUrl: null", message: "Knowledgebase helpers must not expose legacy public URLs." },
    ]),
    ...expectFileContains("lib/db/src/release-content.ts", [
      { pattern: "context.audiences.includes", message: "Release visibility must be audience scoped." },
      { pattern: "context.activeModuleKeys.includes", message: "Release visibility must be module scoped." },
      { pattern: "releaseDismissalsTable.dismissedAt", message: "Release highlights must filter dismissed rows." },
    ]),
    ...expectFileContains("artifacts/backoffice/src/app/actions/roadmap.ts", [
      { pattern: "isVisibleForTenant", message: "Tenant roadmap must use a central tenant visibility decision." },
      { pattern: "item.scope === \"tenant\"", message: "Tenant roadmap must restrict tenant-scoped items to the current tenant." },
      { pattern: "permissionKeys.has(\"roadmap:view\")", message: "Tenant roadmap requires roadmap:view." },
    ]),
  ];

  return check("server-side-visibility", "Server-side helpers enforce tenant, audience, module and permission scope", failures);
}

function checkKnowledgebaseMediaPrivacy() {
  const failures = [
    ...expectFileContains("lib/db/migrations/086_knowledgebase_media_privacy_hardening.sql", [
      { pattern: /SET\s+public\s*=\s*false/iu, message: "Knowledgebase media bucket must be private." },
      { pattern: "DROP POLICY IF EXISTS knowledgebase_media_public_read", message: "Public storage read policy must be dropped." },
      { pattern: /UPDATE\s+kb_article_media[\s\S]*public_url\s*=\s*NULL/iu, message: "Legacy public media URLs must be cleared." },
    ]),
    ...expectFileContains("lib/db/migrations/082_knowledgebase_media_storage.sql", [
      { pattern: "knowledgebase_media_management_write", message: "Storage upload policy must be management gated." },
      { pattern: "is_management()", message: "Storage management policies must require management context." },
    ]),
  ];

  return check("knowledgebase-media-privacy", "Knowledgebase media is private and management-gated", failures);
}

function checkProtectedMediaRoutes() {
  const routeFiles = [
    "artifacts/backoffice/src/app/(platform)/platform/knowledgebase/media/[mediaId]/route.ts",
    "artifacts/backoffice/src/app/(dashboard)/help/media/[mediaId]/route.ts",
    "artifacts/klant-pwa/src/app/(app)/help/media/[mediaId]/route.ts",
    "artifacts/personeel-pwa/src/app/(app)/help/media/[mediaId]/route.ts",
  ];
  const failures = [];

  for (const path of routeFiles) {
    failures.push(...expectFileContains(path, [
      { pattern: "getKnowledgebaseMediaByIdForContext", message: "Media route must check article visibility first." },
      { pattern: "createSignedUrl", message: "Media route must issue temporary signed URLs." },
      { pattern: "Cache-Control", message: "Media redirects must be private/no-store." },
      { pattern: "knowledgebase-media", message: "Media route must use the dedicated KB media bucket." },
    ]));
  }

  return check("protected-media-routes", "Protected media routes enforce visibility before signed URL creation", failures);
}
