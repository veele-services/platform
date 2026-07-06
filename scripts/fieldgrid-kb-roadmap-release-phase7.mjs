#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const outputDir =
  process.env.FIELDGRID_KB_ROADMAP_RELEASE_PHASE7_OUT_DIR ||
  join(process.cwd(), "outputs", "kb-roadmap-release-phase7");

const rlsTables = [
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
  "release_read_receipts",
  "release_roadmap_links",
  "release_ticket_links",
];

const routeFiles = [
  "artifacts/backoffice/src/app/(platform)/platform/knowledgebase/media/[mediaId]/route.ts",
  "artifacts/backoffice/src/app/(dashboard)/help/media/[mediaId]/route.ts",
  "artifacts/klant-pwa/src/app/(app)/help/media/[mediaId]/route.ts",
  "artifacts/personeel-pwa/src/app/(app)/help/media/[mediaId]/route.ts",
];

const deeplinkFiles = [
  "artifacts/backoffice/src/app/(dashboard)/help/[slug]/page.tsx",
  "artifacts/backoffice/src/app/(dashboard)/roadmap/[itemId]/page.tsx",
  "artifacts/backoffice/src/app/(dashboard)/releases/[slug]/page.tsx",
  "artifacts/backoffice/src/app/(platform)/platform/roadmap/[itemId]/page.tsx",
  "artifacts/backoffice/src/app/(platform)/platform/releases/[slug]/page.tsx",
  "artifacts/klant-pwa/src/app/(app)/help/[slug]/page.tsx",
  "artifacts/klant-pwa/src/app/(app)/releases/[slug]/page.tsx",
  "artifacts/personeel-pwa/src/app/(app)/help/[slug]/page.tsx",
  "artifacts/personeel-pwa/src/app/(app)/releases/[slug]/page.tsx",
];

const report = {
  createdAt: new Date().toISOString(),
  mode: checkOnly ? "check" : "full",
  checks: [
    checkRlsCoverage(),
    checkRlsAntiPatterns(),
    checkMediaPrivacy(),
    checkMediaRoutes(),
    checkNoDirectKnowledgebaseMediaLinks(),
    checkVisibilityHelpers(),
    checkRoadmapVisibility(),
    checkReleaseDismissState(),
    checkAuditCoverage(),
    checkDeeplinks(),
    checkPwaMobileSurface(),
    checkNoTenantSpecificHardcoding(),
  ],
};

await mkdir(outputDir, { recursive: true });
const reportPath = join(outputDir, "phase7-security-qa.json");
await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

const failures = report.checks.flatMap((check) =>
  check.failures.map((failure) => ({ check: check.id, ...failure })),
);

if (failures.length > 0) {
  console.error(`Knowledgebase/roadmap/releases phase 7 gate failed. Report: ${reportPath}`);
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(`Knowledgebase/roadmap/releases phase 7 gate passed. Report: ${reportPath}`);

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
  const paths = [
    "lib/db/migrations/081_knowledgebase_roadmap_releases_foundation.sql",
    "lib/db/migrations/091_kb_roadmap_release_p2.sql",
  ];
  const missing = paths.filter((path) => !fileExists(path));
  if (missing.length > 0) {
    return check("rls-coverage", "RLS enabled on all foundation tables", missing.map((path) => failure(`Missing file: ${path}`)));
  }
  const sql = paths.map((path) => read(path)).join("\n");
  const failures = rlsTables
    .filter((table) =>
      !sql.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`) &&
      !sql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`),
    )
    .map((table) => failure(`Missing RLS enable statement for ${table}.`, "lib/db/migrations"));
  return check("rls-coverage", "RLS enabled on all foundation tables", failures);
}

function checkRlsAntiPatterns() {
  const migrationPaths = [
    "lib/db/migrations/081_knowledgebase_roadmap_releases_foundation.sql",
    "lib/db/migrations/082_knowledgebase_media_storage.sql",
    "lib/db/migrations/083_knowledgebase_search_feedback_tooltips.sql",
    "lib/db/migrations/084_release_highlight_dismissal_uniqueness.sql",
    "lib/db/migrations/085_retroactive_release_note_drafts.sql",
    "lib/db/migrations/086_knowledgebase_media_privacy_hardening.sql",
    "lib/db/migrations/087_kb_roadmap_release_direct_api_hardening.sql",
    "lib/db/migrations/090_release_media_storage.sql",
    "lib/db/migrations/091_kb_roadmap_release_p2.sql",
  ];
  const failures = [];
  for (const path of migrationPaths) {
    if (!fileExists(path)) {
      failures.push(failure(`Missing migration file: ${path}`));
      continue;
    }
    const sql = read(path);
    if (/auth\.role\s*\(/iu.test(sql)) failures.push(failure("Do not use deprecated auth.role() in RLS policies.", path));
    if (/SECURITY\s+DEFINER/iu.test(sql)) failures.push(failure("Do not add SECURITY DEFINER functions for this surface.", path));
    if (/TO\s+authenticated\s+USING\s*\(\s*true\s*\)/iu.test(sql)) {
      failures.push(failure("TO authenticated must include authorization predicates, not USING (true).", path));
    }
  }
  return check("rls-anti-patterns", "RLS migrations avoid known Supabase anti-patterns", failures);
}

function checkMediaPrivacy() {
  const path = "lib/db/migrations/086_knowledgebase_media_privacy_hardening.sql";
  return check("media-privacy", "Knowledgebase media is private-by-default", expectFileContains(path, [
    {
      pattern: /SET\s+public\s*=\s*false/iu,
      message: "Hardening migration must set the knowledgebase-media bucket to private.",
    },
    {
      pattern: "DROP POLICY IF EXISTS knowledgebase_media_public_read",
      message: "Hardening migration must remove the public storage read policy.",
    },
    {
      pattern: /UPDATE\s+kb_article_media[\s\S]*public_url\s*=\s*NULL/iu,
      message: "Hardening migration must clear legacy public media URLs.",
    },
  ]));
}

function checkMediaRoutes() {
  const failures = [];
  for (const path of routeFiles) {
    failures.push(...expectFileContains(path, [
      {
        pattern: "getKnowledgebaseMediaByIdForContext",
        message: "Media route must use the central article visibility helper.",
      },
      {
        pattern: "createSignedUrl",
        message: "Media route must issue a temporary signed Supabase Storage URL.",
      },
      {
        pattern: "Cache-Control",
        message: "Media route must mark redirect responses private/no-store.",
      },
      {
        pattern: "knowledgebase-media",
        message: "Media route must target the dedicated knowledgebase-media bucket.",
      },
    ]));
  }
  return check("media-routes", "Knowledgebase media routes enforce visibility before signed URL creation", failures);
}

function checkNoDirectKnowledgebaseMediaLinks() {
  const paths = [
    "artifacts/backoffice/src/app/actions/knowledgebase.ts",
    "artifacts/backoffice/src/components/knowledgebase/KnowledgebaseArticleForm.tsx",
    "artifacts/backoffice/src/app/(dashboard)/help/[slug]/page.tsx",
    "artifacts/klant-pwa/src/app/(app)/help/[slug]/page.tsx",
    "artifacts/personeel-pwa/src/app/(app)/help/[slug]/page.tsx",
    "lib/db/src/knowledgebase-content.ts",
  ];
  const failures = [];
  for (const path of paths) {
    if (!fileExists(path)) {
      failures.push(failure(`Missing file: ${path}`));
      continue;
    }
    const text = read(path);
    if (path.endsWith("actions/knowledgebase.ts") && text.includes(".getPublicUrl(path)")) {
      failures.push(failure("Knowledgebase upload action must not create public storage URLs.", path));
    }
    if (text.includes("href={item.publicUrl")) {
      failures.push(failure("Knowledgebase media links must use protected /help/media or /platform/knowledgebase/media routes.", path));
    }
    if (path.endsWith("knowledgebase-content.ts") && !/publicUrl:\s*null/u.test(text)) {
      failures.push(failure("Knowledgebase helper must not expose legacy publicUrl values.", path));
    }
  }
  return check("no-direct-media-links", "Knowledgebase UI does not expose direct public media URLs", failures);
}

function checkVisibilityHelpers() {
  const failures = [
    ...expectFileContains("lib/db/src/content-visibility.ts", [
      { pattern: "matchesTenantScope", message: "Content visibility must include tenant scope." },
      { pattern: "matchesAudienceScope", message: "Content visibility must include audience scope." },
      { pattern: "matchesModuleScope", message: "Content visibility must include module scope." },
      { pattern: "matchesPermissionScope", message: "Content visibility must include permission scope." },
      { pattern: "canReadPublishedContent", message: "Content visibility must expose a central read decision." },
    ]),
    ...expectFileContains("lib/db/src/knowledgebase-content.ts", [
      { pattern: "canReadPublishedContent", message: "Knowledgebase listings must use central visibility decisions." },
      { pattern: "enrichRelatedArticles(visibleArticles", message: "Related articles must be calculated from visible articles only." },
      { pattern: "recordKnowledgebaseSearchEvent", message: "Search events must be explicit and server-side." },
      { pattern: "getKnowledgebaseMediaByIdForContext", message: "Knowledgebase media access must be mediated by a context helper." },
    ]),
  ];
  return check("visibility-helpers", "Tenant, audience, module and permission visibility is centralized", failures);
}

function checkRoadmapVisibility() {
  const path = "artifacts/backoffice/src/app/actions/roadmap.ts";
  return check("roadmap-visibility", "Roadmap board gates tenant items by module, audience and tenant", expectFileContains(path, [
    { pattern: "permissionKeys.has(\"roadmap:view\")", message: "Tenant roadmap requires roadmap:view permission." },
    { pattern: "activeModuleKeys.includes(\"roadmap\")", message: "Tenant roadmap requires roadmap module entitlement." },
    { pattern: "isVisibleForTenant", message: "Tenant roadmap must use a central item visibility function." },
    { pattern: "item.scope === \"tenant\"", message: "Tenant roadmap must restrict tenant-scoped items to the current tenant." },
    { pattern: "eq(roadmapItemCommentsTable.visibility, \"tenant_visible\")", message: "Tenant roadmap must hide platform-internal comments." },
    { pattern: "roadmap_status_changed", message: "Roadmap status changes must be audit logged." },
  ]));
}

function checkReleaseDismissState() {
  const failures = [
    ...expectFileContains("lib/db/migrations/084_release_highlight_dismissal_uniqueness.sql", [
      { pattern: "release_dismissals_highlight_user_unique_idx", message: "Release highlight dismissals need per-user uniqueness." },
    ]),
    ...expectFileContains("lib/db/src/release-content.ts", [
      { pattern: "getActiveReleaseHighlightsForContext", message: "Release highlights must use a context-aware helper." },
      { pattern: "releaseDismissalsTable.dismissedAt", message: "Release highlights must filter dismissed highlights." },
      { pattern: "context.audiences.includes(row.audienceKey)", message: "Release highlights must be audience-scoped." },
      { pattern: "context.activeModuleKeys.includes(row.moduleKey)", message: "Release highlights must be module-scoped." },
    ]),
    ...expectFileContains("artifacts/backoffice/src/app/actions/releases.ts", [
      { pattern: ".onConflictDoNothing()", message: "Backoffice release dismissals must be idempotent." },
      { pattern: "release_highlight_dismissed", message: "Backoffice release dismissals must be audit logged." },
    ]),
    ...expectFileContains("artifacts/klant-pwa/src/actions/releases.ts", [
      { pattern: ".onConflictDoNothing()", message: "Customer release dismissals must be idempotent." },
      { pattern: "release_highlight_dismissed", message: "Customer release dismissals must be audit logged." },
    ]),
    ...expectFileContains("artifacts/personeel-pwa/src/actions/releases.ts", [
      { pattern: ".onConflictDoNothing()", message: "Personnel release dismissals must be idempotent." },
      { pattern: "release_highlight_dismissed", message: "Personnel release dismissals must be audit logged." },
    ]),
  ];
  return check("release-dismiss-state", "Release highlights are audience/module scoped and dismissable per user", failures);
}

function checkAuditCoverage() {
  const failures = [
    ...expectFileContains("artifacts/backoffice/src/app/actions/knowledgebase.ts", [
      { pattern: "auditLogTable", message: "Knowledgebase management mutations must write audit log entries." },
      { pattern: "resource: \"kb\"", message: "Knowledgebase article mutations must identify kb resource." },
      { pattern: "resource: \"kb_category\"", message: "Knowledgebase category mutations must identify kb_category resource." },
      { pattern: "resource: \"help_tooltips\"", message: "Tooltip mutations must identify help_tooltips resource." },
      { pattern: "upload_media", message: "Knowledgebase media uploads must be audit logged." },
    ]),
    ...expectFileContains("artifacts/backoffice/src/app/actions/roadmap.ts", [
      { pattern: "roadmap_item_created", message: "Roadmap item creation must be audit logged." },
      { pattern: "roadmap_status_changed", message: "Roadmap status changes must be audit logged." },
      { pattern: "roadmap_comment_added", message: "Roadmap comments must be audit logged." },
      { pattern: "roadmap_item_archived", message: "Roadmap archiving must be audit logged." },
    ]),
    ...expectFileContains("artifacts/backoffice/src/app/actions/releases.ts", [
      { pattern: "release_created", message: "Release creation must be audit logged." },
      { pattern: "release_updated", message: "Release updates must be audit logged." },
      { pattern: "release_highlight_created", message: "Release highlights must be audit logged." },
      { pattern: "release_archived", message: "Release archiving must be audit logged." },
    ]),
  ];
  return check("audit-coverage", "Knowledgebase, roadmap and release mutations are audit logged", failures);
}

function checkDeeplinks() {
  const failures = [];
  for (const path of deeplinkFiles) {
    if (!fileExists(path)) failures.push(failure(`Missing deeplink route page: ${path}`));
  }
  for (const path of routeFiles) {
    if (!fileExists(path)) failures.push(failure(`Missing protected media deeplink route: ${path}`));
  }
  return check("deeplinks", "Help, roadmap, release and protected media deeplinks exist", failures);
}

function checkPwaMobileSurface() {
  const failures = [
    ...expectFileContains("artifacts/klant-pwa/src/app/(app)/help/page.tsx", [
      { pattern: "px-4", message: "Customer help index must preserve mobile horizontal padding." },
      { pattern: "grid", message: "Customer help index must use responsive grid/layout structure." },
    ]),
    ...expectFileContains("artifacts/klant-pwa/src/app/(app)/help/[slug]/page.tsx", [
      { pattern: "max-w-4xl", message: "Customer help detail must constrain reading width." },
      { pattern: "flex flex-wrap", message: "Customer help feedback buttons must wrap on mobile." },
    ]),
    ...expectFileContains("artifacts/personeel-pwa/src/app/(app)/help/page.tsx", [
      { pattern: "px-4", message: "Personnel help index must preserve mobile horizontal padding." },
      { pattern: "grid", message: "Personnel help index must use responsive grid/layout structure." },
    ]),
    ...expectFileContains("artifacts/personeel-pwa/src/app/(app)/help/[slug]/page.tsx", [
      { pattern: "max-w-4xl", message: "Personnel help detail must constrain reading width." },
      { pattern: "flex flex-wrap", message: "Personnel help feedback buttons must wrap on mobile." },
    ]),
  ];
  return check("pwa-mobile-surface", "PWA help surfaces retain mobile-safe structure", failures);
}

function checkNoTenantSpecificHardcoding() {
  const paths = [
    "lib/db/src/knowledgebase-content.ts",
    "lib/db/src/release-content.ts",
    "artifacts/backoffice/src/app/actions/knowledgebase.ts",
    "artifacts/backoffice/src/app/actions/roadmap.ts",
    "artifacts/backoffice/src/app/actions/releases.ts",
    ...routeFiles,
  ];
  const failures = [];
  for (const path of paths) {
    if (!fileExists(path)) continue;
    const text = read(path);
    if (/\bveele\b|veele-services/iu.test(text)) {
      failures.push(failure("Knowledgebase/roadmap/release phase 7 code must not add tenant-specific hardcoding.", path));
    }
  }
  return check("no-tenant-hardcoding", "No tenant-specific hardcoding was introduced", failures);
}
