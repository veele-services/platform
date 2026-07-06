#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const outputDir =
  process.env.FIELDGRID_KB_ROADMAP_RELEASE_PHASE2_OUT_DIR ||
  join(process.cwd(), "outputs", "kb-roadmap-release-phase2-deeplinks");

const report = {
  createdAt: new Date().toISOString(),
  mode: checkOnly ? "check" : "full",
  checks: [
    checkShortcodeRoute(),
    checkProtectedMediaRoute(),
    checkLoginNextPreservation(),
    checkVisibilityStatuses(),
    checkSupportCopyUi(),
  ],
};

await mkdir(outputDir, { recursive: true });
const reportPath = join(outputDir, "phase2-deeplinks.json");
await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

const failures = report.checks.flatMap((check) =>
  check.failures.map((failure) => ({ check: check.id, ...failure })),
);

if (failures.length > 0) {
  console.error(`Knowledgebase/roadmap/releases phase 2 deeplink gate failed. Report: ${reportPath}`);
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(`Knowledgebase/roadmap/releases phase 2 deeplink gate passed. Report: ${reportPath}`);

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

function checkShortcodeRoute() {
  const path = "artifacts/backoffice/src/app/h/[tenantCode]/[slug]/page.tsx";
  return check("shortcode-route", "Stable /h/{tenant-code}/{article-slug} route exists", expectFileContains(path, [
    {
      pattern: "getShortcodeKnowledgebaseArticle",
      message: "Shortcode route must use the server-side visibility action.",
    },
    {
      pattern: "/login?next=",
      message: "Shortcode route must redirect unauthenticated users with a next path.",
    },
    {
      pattern: "module_inactive",
      message: "Shortcode route must render a module inactive fallback.",
    },
    {
      pattern: "access_denied",
      message: "Shortcode route must render an access denied fallback.",
    },
    {
      pattern: "article_not_found",
      message: "Shortcode route must render an article not found fallback.",
    },
  ]));
}

function checkProtectedMediaRoute() {
  const path = "artifacts/backoffice/src/app/h/[tenantCode]/[slug]/media/[mediaId]/route.ts";
  return check("protected-media-route", "Shortcode media route keeps storage signed and permission checked", expectFileContains(path, [
    {
      pattern: "getShortcodeKnowledgebaseMedia",
      message: "Shortcode media route must use the server-side media visibility action.",
    },
    {
      pattern: "createSignedUrl",
      message: "Shortcode media route must use signed storage URLs.",
    },
    {
      pattern: "Cache-Control",
      message: "Shortcode media route must avoid public caching.",
    },
  ]));
}

function checkLoginNextPreservation() {
  const path = "artifacts/backoffice/src/middleware.ts";
  return check("login-next-preservation", "Protected deeplinks preserve next through login and password reset", expectFileContains(path, [
    {
      pattern: "loginUrlWithNext",
      message: "Middleware must preserve next for unauthenticated protected routes.",
    },
    {
      pattern: "resetPasswordUrlWithNext",
      message: "Middleware must preserve next for mandatory password changes.",
    },
    {
      pattern: "request.nextUrl.searchParams.get(\"next\")",
      message: "Middleware must honor safe next on login for already-authenticated users.",
    },
  ]));
}

function checkVisibilityStatuses() {
  const path = "artifacts/backoffice/src/app/actions/knowledgebase-help.ts";
  return check("visibility-statuses", "Shortcode action resolves tenant and keeps article visibility server-side", expectFileContains(path, [
    {
      pattern: "resolveTenantByKnowledgebaseCode",
      message: "Shortcode action must resolve tenants by stable tenant code.",
    },
    {
      pattern: "userHasActiveTenant",
      message: "Shortcode action must require active tenant membership.",
    },
    {
      pattern: "getEffectiveUserPermissions(user.id, tenant.id)",
      message: "Shortcode action must use tenant-specific effective permissions.",
    },
    {
      pattern: "listEnabledKnowledgebaseModuleKeysForTenant",
      message: "Shortcode action must use tenant module entitlements.",
    },
    {
      pattern: "publishedArticleExistsForTenant",
      message: "Shortcode action must distinguish not found from hidden content without leaking details.",
    },
  ]));
}

function checkSupportCopyUi() {
  const failures = [
    ...expectFileContains("artifacts/backoffice/src/components/knowledgebase/CopySupportLinkButton.tsx", [
      {
        pattern: "navigator.clipboard.writeText",
        message: "Copy support link component must copy to the clipboard.",
      },
    ]),
    ...expectFileContains("artifacts/backoffice/src/app/(dashboard)/help/[slug]/page.tsx", [
      {
        pattern: "getTenantKnowledgebaseSupportLink",
        message: "Tenant help detail must fetch a stable support link.",
      },
      {
        pattern: "CopySupportLinkButton",
        message: "Tenant help detail must expose copy support link UI.",
      },
    ]),
    ...expectFileContains("artifacts/backoffice/src/app/(platform)/platform/knowledgebase/articles/[articleId]/page.tsx", [
      {
        pattern: "knowledgebaseSupportUrlTemplate",
        message: "Platform article editor must show a support link template.",
      },
      {
        pattern: "CopySupportLinkButton",
        message: "Platform article editor must expose copy support link UI.",
      },
    ]),
  ];

  return check("support-copy-ui", "Platform and tenant help UIs expose copyable stable support links", failures);
}
