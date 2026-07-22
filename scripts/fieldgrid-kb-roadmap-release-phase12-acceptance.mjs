#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const options = parseArgs(args);
const outputDir =
  options.outDir ||
  process.env.FIELDGRID_KB_ROADMAP_RELEASE_PHASE12_OUT_DIR ||
  join(process.cwd(), "outputs", "kb-roadmap-release-phase12-acceptance");

const viewports = [
  { id: "mobile-390", width: 390, height: 844 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "desktop-1440", width: 1440, height: 1100 },
];

const mediaNoAccessId = "00000000-0000-0000-0000-000000000000";
const searchQuery = process.env.FIELDGRID_PHASE12_SEARCH_QUERY || "factuur";

const staticChecks = [
  checkPackageScripts(),
  checkPlaywrightHarnessContract(),
  checkSurfaceRoutes(),
  checkAutocompleteRuntimeSurfaces(),
  checkTooltipRuntimeSurfaces(),
  checkTipTapRenderingSurface(),
  checkReleaseMediaAndHighlights(),
  checkRoadmapTriageSurface(),
  checkNotificationEvents(),
  checkProtectedMediaRoutes(),
  checkCompletionPlan(),
];

const roleConfigs = buildRoleConfigs(process.env);
const livePlan = roleConfigs.map((role) => ({
  id: role.id,
  label: role.label,
  baseUrl: redactUrl(role.baseUrl),
  hasAuth: role.hasAuth,
  hasStorageState: Boolean(role.storageState),
  hasCookie: Boolean(role.cookie),
  targets: role.targets.map(({ id, path, label, expectations }) => ({ id, path, label, expectations })),
}));

let liveResults = [];
let mediaAccessResults = [];
let liveError = null;

if (!options.check && roleConfigs.some((role) => role.baseUrl)) {
  try {
    ({ liveResults, mediaAccessResults } = await runLiveAcceptance(roleConfigs));
  } catch (error) {
    liveError = error instanceof Error ? error.message : String(error);
  }
}

const report = {
  version: "fieldgrid-kb-roadmap-release-phase12-acceptance-v1",
  createdAt: new Date().toISOString(),
  mode: options.check ? "check" : "full",
  strictEvidence: options.strictEvidence,
  viewports,
  livePlan,
  staticChecks,
  liveResults,
  mediaAccessResults,
  liveError,
  finalAcceptance: buildFinalAcceptance(staticChecks, roleConfigs, liveResults, mediaAccessResults, liveError),
};

await mkdir(outputDir, { recursive: true });
const reportPath = join(outputDir, "phase12-acceptance.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const staticFailures = staticChecks.flatMap((check) =>
  check.failures.map((failure) => ({ check: check.id, ...failure })),
);
const liveFailures = liveResults.filter((result) => result.status === "failed");
const mediaFailures = mediaAccessResults.filter((result) => result.status === "failed");
const missingStrictEvidence = options.strictEvidence
  ? roleConfigs
      .filter((role) => !role.baseUrl || !role.hasAuth)
      .map((role) => ({
        role: role.id,
        message: "Strict evidence requires base URL and authenticated cookie or storageState.",
        requiredEnv: role.requiredEnv,
      }))
  : [];
const missingStrictScreenshots =
  options.strictEvidence && liveResults.length < roleConfigs.length * viewports.length
    ? [{
        message: "Strict evidence requires screenshots for platform admin, tenant admin, customer and personnel on all viewports.",
        expectedMinimum: roleConfigs.length * viewports.length,
        actual: liveResults.length,
      }]
    : [];

if (staticFailures.length > 0 || liveFailures.length > 0 || mediaFailures.length > 0 || liveError || missingStrictEvidence.length > 0 || missingStrictScreenshots.length > 0) {
  console.error(`Knowledgebase/roadmap/releases phase 12 acceptance failed. Report: ${reportPath}`);
  if (staticFailures.length > 0) console.error(JSON.stringify(staticFailures, null, 2));
  if (liveFailures.length > 0) console.error(JSON.stringify(liveFailures, null, 2));
  if (mediaFailures.length > 0) console.error(JSON.stringify(mediaFailures, null, 2));
  if (missingStrictEvidence.length > 0) console.error(JSON.stringify(missingStrictEvidence, null, 2));
  if (missingStrictScreenshots.length > 0) console.error(JSON.stringify(missingStrictScreenshots, null, 2));
  if (liveError) console.error(liveError);
  process.exit(1);
}

console.log(`Knowledgebase/roadmap/releases phase 12 acceptance passed. Report: ${reportPath}`);

function parseArgs(argv) {
  const parsed = {
    check: false,
    strictEvidence: false,
    outDir: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [flag, inlineValue] = arg.split("=", 2);
    const nextValue = () => inlineValue ?? argv[++index];

    switch (flag) {
      case "--check":
        parsed.check = true;
        break;
      case "--strict-evidence":
        parsed.strictEvidence = true;
        break;
      case "--out":
      case "--out-dir":
        parsed.outDir = resolve(process.cwd(), nextValue());
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function printUsage() {
  console.log(`Fieldgrid KB/roadmap/releases phase 12 acceptance

Usage:
  pnpm fieldgrid:kb-roadmap-release-phase12-acceptance:check
  pnpm fieldgrid:kb-roadmap-release-phase12-acceptance
  pnpm fieldgrid:kb-roadmap-release-phase12-acceptance:strict

Strict evidence needs these role inputs:
  FIELDGRID_PHASE12_PLATFORM_BASE_URL + FIELDGRID_PHASE12_PLATFORM_COOKIE or FIELDGRID_PHASE12_PLATFORM_STORAGE_STATE
  FIELDGRID_PHASE12_TENANT_BASE_URL + FIELDGRID_PHASE12_TENANT_COOKIE or FIELDGRID_PHASE12_TENANT_STORAGE_STATE
  FIELDGRID_PHASE12_CUSTOMER_BASE_URL + FIELDGRID_PHASE12_CUSTOMER_COOKIE or FIELDGRID_PHASE12_CUSTOMER_STORAGE_STATE
  FIELDGRID_PHASE12_PERSONNEL_BASE_URL + FIELDGRID_PHASE12_PERSONNEL_COOKIE or FIELDGRID_PHASE12_PERSONNEL_STORAGE_STATE
`);
}

function read(path) {
  return readFileSync(path, "utf8");
}

function fileExists(path) {
  return existsSync(path);
}

function failure(message, evidence = null) {
  return { message, evidence };
}

function check(id, label, failures, warnings = []) {
  return {
    id,
    label,
    status: failures.length === 0 ? "passed" : "failed",
    warnings,
    failures,
  };
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

function checkPackageScripts() {
  return check("package-scripts", "Package scripts expose phase 12 acceptance gate", expectFileContains("package.json", [
    {
      pattern: "fieldgrid:kb-roadmap-release-phase12-acceptance",
      message: "Missing phase 12 acceptance script.",
    },
    {
      pattern: "fieldgrid:kb-roadmap-release-phase12-acceptance:check",
      message: "Missing phase 12 check script.",
    },
    {
      pattern: "fieldgrid:kb-roadmap-release-phase12-acceptance:strict",
      message: "Missing phase 12 strict evidence script.",
    },
  ]));
}

function checkPlaywrightHarnessContract() {
  const path = "scripts/fieldgrid-kb-roadmap-release-phase12-acceptance.mjs";
  return check("playwright-harness", "Phase 12 has an executable Playwright evidence harness", expectFileContains(path, [
    { pattern: "loadPlaywright", message: "Harness must lazy-load Playwright for live runs." },
    { pattern: "FIELDGRID_PHASE12_PLATFORM_BASE_URL", message: "Harness must support platform admin base URL." },
    { pattern: "FIELDGRID_PHASE12_TENANT_BASE_URL", message: "Harness must support tenant admin base URL." },
    { pattern: "FIELDGRID_PHASE12_CUSTOMER_BASE_URL", message: "Harness must support customer PWA base URL." },
    { pattern: "FIELDGRID_PHASE12_PERSONNEL_BASE_URL", message: "Harness must support personnel PWA base URL." },
    { pattern: "mobile-390", message: "Harness must capture mobile viewport evidence." },
    { pattern: "tablet-768", message: "Harness must capture tablet viewport evidence." },
    { pattern: "desktop-1440", message: "Harness must capture desktop viewport evidence." },
    { pattern: "horizontalOverflow", message: "Harness must detect horizontal scroll." },
    { pattern: "dialogOverflow", message: "Harness must detect broken dialogs/sheets." },
    { pattern: "screenshots", message: "Harness must write screenshots into output artifacts." },
  ]));
}

function checkSurfaceRoutes() {
  const paths = [
    "artifacts/backoffice/src/app/(platform)/platform/knowledgebase/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/knowledgebase/articles/new/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/knowledgebase/tooltips/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/releases/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/releases/categories/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/roadmap/page.tsx",
    "artifacts/backoffice/src/app/(dashboard)/help/page.tsx",
    "artifacts/backoffice/src/app/(dashboard)/releases/page.tsx",
    "artifacts/backoffice/src/app/(dashboard)/roadmap/page.tsx",
    "artifacts/klant-pwa/src/app/(app)/help/page.tsx",
    "artifacts/klant-pwa/src/app/(app)/releases/page.tsx",
    "artifacts/klant-pwa/src/app/(app)/roadmap/new/page.tsx",
    "artifacts/personeel-pwa/src/app/(app)/help/page.tsx",
    "artifacts/personeel-pwa/src/app/(app)/releases/page.tsx",
    "artifacts/personeel-pwa/src/app/(app)/roadmap/new/page.tsx",
    "artifacts/backoffice/src/app/h/[tenantCode]/[slug]/page.tsx",
  ];
  return check("surface-routes", "Phase 12 runtime surfaces exist for all audiences", paths.filter((path) => !fileExists(path)).map((path) => failure(`Missing route: ${path}`)));
}

function checkAutocompleteRuntimeSurfaces() {
  const failures = [
    ...expectFileContains("artifacts/backoffice/src/components/knowledgebase/KnowledgebaseAutocompleteSearch.tsx", [
      { pattern: 'role="combobox"', message: "Backoffice autocomplete must expose combobox semantics." },
      { pattern: 'role="listbox"', message: "Backoffice autocomplete must expose listbox semantics." },
      { pattern: "ArrowDown", message: "Backoffice autocomplete must support keyboard navigation." },
    ]),
    ...expectFileContains("artifacts/klant-pwa/src/components/KnowledgebaseAutocompleteSearch.tsx", [
      { pattern: 'role="combobox"', message: "Customer autocomplete must expose combobox semantics." },
      { pattern: 'role="listbox"', message: "Customer autocomplete must expose listbox semantics." },
      { pattern: "ArrowDown", message: "Customer autocomplete must support keyboard navigation." },
    ]),
    ...expectFileContains("artifacts/personeel-pwa/src/components/KnowledgebaseAutocompleteSearch.tsx", [
      { pattern: 'role="combobox"', message: "Personnel autocomplete must expose combobox semantics." },
      { pattern: 'role="listbox"', message: "Personnel autocomplete must expose listbox semantics." },
      { pattern: "ArrowDown", message: "Personnel autocomplete must support keyboard navigation." },
    ]),
  ];
  return check("autocomplete-runtime", "Help search/autocomplete is testable on every runtime surface", failures);
}

function checkTooltipRuntimeSurfaces() {
  const pageFiles = [
    "artifacts/backoffice/src/app/(platform)/platform/knowledgebase/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/knowledgebase/tooltips/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/releases/page.tsx",
    "artifacts/backoffice/src/app/(platform)/platform/roadmap/page.tsx",
  ];
  const componentFiles = [
    "artifacts/backoffice/src/components/knowledgebase/FeatureHelp.tsx",
    "artifacts/klant-pwa/src/components/FeatureHelp.tsx",
    "artifacts/personeel-pwa/src/components/FeatureHelp.tsx",
  ];
  const failures = [
    ...pageFiles.flatMap((path) => expectFileContains(path, [
      { pattern: /ResolvedFeatureHelp|FeatureHelp/u, message: "Platform page must render a resolved help component." },
    ])),
    ...componentFiles.flatMap((path) => expectFileContains(path, [
      { pattern: "Help:", message: "Tooltip/help trigger must expose an accessible Help label." },
    ])),
  ];
  return check("tooltip-runtime", "FeatureHelp tooltips are available to Playwright by accessible label", failures);
}

function checkTipTapRenderingSurface() {
  const failures = [
    ...expectFileContains("artifacts/backoffice/src/components/knowledgebase/TipTapKnowledgebaseEditor.tsx", [
      { pattern: "Table2", message: "TipTap editor must expose table controls." },
      { pattern: "CalloutNode", message: "TipTap editor must support callout nodes." },
      { pattern: "KnowledgebaseMediaNode", message: "TipTap editor must support inline knowledgebase media." },
      { pattern: "VideoEmbedNode", message: "TipTap editor must support video embeds." },
      { pattern: "sanitizeEditorUrl", message: "TipTap editor must sanitize links and embeds." },
      { pattern: "Undo2", message: "TipTap editor must expose undo." },
      { pattern: "Redo2", message: "TipTap editor must expose redo." },
      { pattern: "KnowledgebaseContentRenderer", message: "TipTap editor must provide preview rendering." },
    ]),
    ...expectFileContains("artifacts/backoffice/src/components/knowledgebase/KnowledgebaseContentRenderer.tsx", [
      { pattern: "[&_table]", message: "Renderer must style tables." },
      { pattern: "data-type='callout'", message: "Renderer must style callouts." },
      { pattern: "rewriteKnowledgebaseMediaUrls", message: "Renderer must rewrite protected media URLs per surface." },
    ]),
  ];
  return check("tiptap-runtime", "TipTap authoring and rendering are covered by QA selectors", failures);
}

function checkReleaseMediaAndHighlights() {
  const failures = [
    ...expectFileContains("artifacts/backoffice/src/components/releases/ReleaseForm.tsx", [
      { pattern: "uploadReleaseMedia", message: "Release form must upload release media." },
      { pattern: /screenshots/iu, message: "Release form must expose screenshot/media guidance." },
      { pattern: "mediaBasePath", message: "Release form must render media through a protected base path." },
    ]),
    ...expectFileContains("artifacts/backoffice/src/app/(platform)/platform/releases/categories/page.tsx", [
      { pattern: "saveReleaseCategoryFromForm", message: "Release category management must support create/update." },
      { pattern: "archiveReleaseCategoryFromForm", message: "Release category management must support archive." },
    ]),
    ...expectFileContains("lib/db/src/release-content.ts", [
      { pattern: "getActiveReleaseHighlightsForContext", message: "Release highlights must be runtime-context aware." },
      { pattern: "getReleaseMediaByIdForContext", message: "Release media must be runtime-context aware." },
    ]),
  ];
  return check("release-media-highlights", "Release media, categories, highlights and dismiss state are QA-visible", failures);
}

function checkRoadmapTriageSurface() {
  const failures = [
    ...expectFileContains("artifacts/backoffice/src/app/(platform)/platform/roadmap/page.tsx", [
      { pattern: "StatusQuickButtons", message: "Roadmap board must expose quick status action forms." },
      { pattern: "changePlatformRoadmapStatus", message: "Roadmap board must expose status quick actions." },
      { pattern: "changePlatformRoadmapPriority", message: "Roadmap board must expose priority quick actions." },
      { pattern: "linkPlatformRoadmapReleases", message: "Roadmap board must support release linking from the board." },
      { pattern: "addPlatformRoadmapComment", message: "Roadmap board must support comments from the board." },
      { pattern: "Tenant featurewensen", message: "Roadmap board must separate tenant feature requests." },
      { pattern: "Statusgeschiedenis", message: "Roadmap board must expose status history." },
    ]),
    ...expectFileContains("artifacts/backoffice/src/app/actions/roadmap.ts", [
      { pattern: "roadmap_status_changed", message: "Roadmap status changes must be audit logged." },
      { pattern: "roadmap_item_done", message: "Roadmap done status must emit notification event." },
      { pattern: "roadmap_comment_added", message: "Roadmap comments must emit notification event." },
    ]),
  ];
  return check("roadmap-triage", "Roadmap Kanban triage has quick actions, history and event hooks", failures);
}

function checkNotificationEvents() {
  const failures = [
    ...expectFileContains("lib/db/migrations/088_kb_roadmap_release_notification_events.sql", [
      { pattern: "kb_article_published", message: "KB publish notification event missing." },
      { pattern: "roadmap_status_changed", message: "Roadmap status notification event missing." },
      { pattern: "release_highlight_active", message: "Release highlight notification event missing." },
    ]),
    ...expectFileContains("artifacts/backoffice/src/lib/content-notification-events.ts", [
      { pattern: "notificationDeliveryQueueTable", message: "Content event emitter must enqueue delivery rows." },
      { pattern: "triggerNotificationWorker", message: "Content event emitter must trigger the notification worker." },
      { pattern: "content_notification_event_emitted", message: "Content event emitter must audit emitted events." },
    ]),
  ];
  return check("notification-events", "KB, roadmap and release notification events are wired to the worker", failures);
}

function checkProtectedMediaRoutes() {
  const routeFiles = [
    "artifacts/backoffice/src/app/(platform)/platform/knowledgebase/media/[mediaId]/route.ts",
    "artifacts/backoffice/src/app/(dashboard)/help/media/[mediaId]/route.ts",
    "artifacts/klant-pwa/src/app/(app)/help/media/[mediaId]/route.ts",
    "artifacts/personeel-pwa/src/app/(app)/help/media/[mediaId]/route.ts",
    "artifacts/backoffice/src/app/(platform)/platform/releases/media/[mediaId]/route.ts",
    "artifacts/backoffice/src/app/(dashboard)/releases/media/[mediaId]/route.ts",
    "artifacts/klant-pwa/src/app/(app)/releases/media/[mediaId]/route.ts",
    "artifacts/personeel-pwa/src/app/(app)/releases/media/[mediaId]/route.ts",
  ];
  const failures = routeFiles.flatMap((path) => expectFileContains(path, [
    { pattern: "createSignedUrl", message: "Protected media route must create short-lived signed URLs." },
    { pattern: "Cache-Control", message: "Protected media route must use private/no-store cache headers." },
  ]));
  return check("protected-media-routes", "Knowledgebase and release media routes are private and access-checked", failures);
}

function checkCompletionPlan() {
  return check("completion-plan", "Completion plan documents phase 12 QA gate", expectFileContains("docs/knowledgebase-roadmap-release-completion-plan.md", [
    { pattern: "Fase 12 - Echte Playwright QA En Acceptatie", message: "Completion plan must retain phase 12." },
    { pattern: "fieldgrid:kb-roadmap-release-phase12-acceptance:strict", message: "Completion plan must document strict phase 12 gate." },
    { pattern: "outputs/kb-roadmap-release-phase12-acceptance", message: "Completion plan must document output artifacts." },
  ]));
}

function buildRoleConfigs(env) {
  return [
    {
      id: "platform-admin",
      label: "Platform admin",
      baseUrl: trimTrailingSlash(env.FIELDGRID_PHASE12_PLATFORM_BASE_URL || env.FIELDGRID_PLATFORM_BASE_URL || ""),
      cookie: env.FIELDGRID_PHASE12_PLATFORM_COOKIE || env.FIELDGRID_PLATFORM_ADMIN_COOKIE || "",
      storageState: env.FIELDGRID_PHASE12_PLATFORM_STORAGE_STATE || env.FIELDGRID_PLATFORM_ADMIN_STORAGE_STATE || "",
      requiredEnv: [
        "FIELDGRID_PHASE12_PLATFORM_BASE_URL",
        "FIELDGRID_PHASE12_PLATFORM_COOKIE or FIELDGRID_PHASE12_PLATFORM_STORAGE_STATE",
      ],
      targets: [
        { id: "knowledgebase", path: "/admin/platform/knowledgebase", label: "Platform knowledgebase", expectations: ["autocomplete", "tooltip"] },
        { id: "knowledgebase-new", path: "/admin/platform/knowledgebase/articles/new", label: "TipTap article editor", expectations: ["tiptap", "media"] },
        { id: "tooltips", path: "/admin/platform/knowledgebase/tooltips", label: "Tooltip management", expectations: ["tooltip"] },
        { id: "releases", path: "/admin/platform/releases", label: "Release management", expectations: ["release"] },
        { id: "release-categories", path: "/admin/platform/releases/categories", label: "Release categories", expectations: ["release"] },
        { id: "roadmap", path: "/admin/platform/roadmap", label: "Roadmap Kanban", expectations: ["roadmap", "tooltip"] },
      ],
    },
    {
      id: "tenant-admin",
      label: "Tenant admin",
      baseUrl: trimTrailingSlash(env.FIELDGRID_PHASE12_TENANT_BASE_URL || env.FIELDGRID_TENANT_BACKOFFICE_BASE_URL || ""),
      cookie: env.FIELDGRID_PHASE12_TENANT_COOKIE || env.FIELDGRID_TENANT_BACKOFFICE_COOKIE || "",
      storageState: env.FIELDGRID_PHASE12_TENANT_STORAGE_STATE || env.FIELDGRID_TENANT_BACKOFFICE_STORAGE_STATE || "",
      requiredEnv: [
        "FIELDGRID_PHASE12_TENANT_BASE_URL",
        "FIELDGRID_PHASE12_TENANT_COOKIE or FIELDGRID_PHASE12_TENANT_STORAGE_STATE",
      ],
      targets: [
        { id: "help", path: "/help", label: "Tenant help", expectations: ["autocomplete"] },
        { id: "releases", path: "/releases", label: "Tenant releases", expectations: ["release"] },
        { id: "roadmap", path: "/roadmap", label: "Tenant roadmap", expectations: ["roadmap"] },
        { id: "tenant-kb-management", path: "/help/beheer", label: "Tenant KB management", expectations: ["tiptap"] },
      ],
    },
    {
      id: "customer",
      label: "Customer PWA",
      baseUrl: trimTrailingSlash(env.FIELDGRID_PHASE12_CUSTOMER_BASE_URL || env.FIELDGRID_CUSTOMER_PORTAL_BASE_URL || ""),
      cookie: env.FIELDGRID_PHASE12_CUSTOMER_COOKIE || env.FIELDGRID_CUSTOMER_PORTAL_COOKIE || "",
      storageState: env.FIELDGRID_PHASE12_CUSTOMER_STORAGE_STATE || env.FIELDGRID_CUSTOMER_PORTAL_STORAGE_STATE || "",
      requiredEnv: [
        "FIELDGRID_PHASE12_CUSTOMER_BASE_URL",
        "FIELDGRID_PHASE12_CUSTOMER_COOKIE or FIELDGRID_PHASE12_CUSTOMER_STORAGE_STATE",
      ],
      targets: [
        { id: "help", path: "/help", label: "Customer help", expectations: ["autocomplete"] },
        { id: "releases", path: "/releases", label: "Customer releases", expectations: ["release"] },
        { id: "feature-request", path: "/roadmap/new", label: "Customer feature request", expectations: ["roadmap"] },
      ],
    },
    {
      id: "personnel",
      label: "Personnel PWA",
      baseUrl: trimTrailingSlash(env.FIELDGRID_PHASE12_PERSONNEL_BASE_URL || env.FIELDGRID_PERSONNEL_PORTAL_BASE_URL || ""),
      cookie: env.FIELDGRID_PHASE12_PERSONNEL_COOKIE || env.FIELDGRID_PERSONNEL_PORTAL_COOKIE || "",
      storageState: env.FIELDGRID_PHASE12_PERSONNEL_STORAGE_STATE || env.FIELDGRID_PERSONNEL_PORTAL_STORAGE_STATE || "",
      requiredEnv: [
        "FIELDGRID_PHASE12_PERSONNEL_BASE_URL",
        "FIELDGRID_PHASE12_PERSONNEL_COOKIE or FIELDGRID_PHASE12_PERSONNEL_STORAGE_STATE",
      ],
      targets: [
        { id: "help", path: "/help", label: "Personnel help", expectations: ["autocomplete"] },
        { id: "releases", path: "/releases", label: "Personnel releases", expectations: ["release"] },
        { id: "feature-request", path: "/roadmap/new", label: "Personnel feature request", expectations: ["roadmap"] },
      ],
    },
  ].map((role) => ({ ...role, hasAuth: Boolean(role.cookie || role.storageState) }));
}

function trimTrailingSlash(value) {
  return value.replace(/\/$/u, "");
}

function redactUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value;
  }
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    throw new Error(
      `Playwright is niet geinstalleerd in deze workspace. Installeer Playwright in CI/staging of herstel de dependency cache. Originele fout: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function runLiveAcceptance(roles) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const mediaResults = [];
  await mkdir(join(outputDir, "screenshots"), { recursive: true });

  try {
    for (const role of roles) {
      if (!role.baseUrl || !role.hasAuth) {
        results.push({
          role: role.id,
          status: "skipped",
          reason: "Missing base URL or authenticated cookie/storageState.",
          requiredEnv: role.requiredEnv,
        });
        continue;
      }

      for (const viewport of viewports) {
        const context = await newContextForRole(browser, role, viewport);
        const page = await context.newPage();

        for (const target of role.targets) {
          const url = joinUrl(role.baseUrl, target.path);
          const screenshot = join(outputDir, "screenshots", `${role.id}-${viewport.id}-${target.id}.png`);
          const startedAt = Date.now();

          try {
            const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
            await runTargetInteractions(page, target);
            await page.screenshot({ path: screenshot, fullPage: true });
            const metrics = await collectPageMetrics(page, target.expectations);
            const failures = evaluateTargetMetrics(metrics, target.expectations, response?.status() ?? null);
            results.push({
              role: role.id,
              target: target.id,
              label: target.label,
              viewport: viewport.id,
              url,
              status: failures.length > 0 ? "failed" : "captured",
              httpStatus: response?.status() ?? null,
              screenshot,
              durationMs: Date.now() - startedAt,
              failures,
              ...metrics,
            });
          } catch (error) {
            results.push({
              role: role.id,
              target: target.id,
              viewport: viewport.id,
              url,
              status: "failed",
              screenshot,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        mediaResults.push(...await runMediaNoAccessChecks(context, role));
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  return { liveResults: results, mediaAccessResults: mediaResults };
}

async function newContextForRole(browser, role, viewport) {
  const contextOptions = { viewport };
  if (role.storageState && fileExists(role.storageState)) {
    contextOptions.storageState = role.storageState;
  }
  const context = await browser.newContext(contextOptions);
  const cookies = cookieFromHeader(role.cookie, role.baseUrl);
  if (cookies.length > 0) await context.addCookies(cookies);
  return context;
}

function cookieFromHeader(header, baseUrl) {
  if (!header) return [];
  const origin = new URL(baseUrl).origin;
  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, ...valueParts] = part.split("=");
      return {
        name,
        value: valueParts.join("="),
        url: origin,
        httpOnly: true,
        sameSite: "Lax",
      };
    })
    .filter((cookie) => cookie.name && cookie.value);
}

function joinUrl(baseUrl, path) {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

async function runTargetInteractions(page, target) {
  if (target.expectations.includes("autocomplete")) {
    const input = page.locator('[role="combobox"]').first();
    if (await input.count()) {
      await input.fill(searchQuery);
      await page.waitForTimeout(450);
    }
  }

  if (target.expectations.includes("tooltip")) {
    const helpTrigger = page.locator('button[aria-label^="Help:"]').first();
    if (await helpTrigger.count()) {
      await helpTrigger.click({ timeout: 5000 });
      await page.waitForTimeout(150);
    }
  }
}

async function collectPageMetrics(page, expectations) {
  return page.evaluate((expected) => {
    const text = document.body?.innerText || "";
    const interactive = Array.from(document.querySelectorAll("button, a[href], input, select, textarea"));
    const undersizedInteractiveElements = interactive.filter((item) => {
      const rect = item.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.width < 32 || rect.height < 32);
    }).length;
    const dialogs = Array.from(document.querySelectorAll("[role='dialog'], [data-radix-popper-content-wrapper], [data-state='open']"));
    const dialogOverflow = dialogs.some((item) => {
      const rect = item.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.left < -8 || rect.right > window.innerWidth + 8);
    });
    const brokenImages = Array.from(document.images).filter((image) => image.complete && image.naturalWidth === 0).length;
    const combobox = document.querySelector('[role="combobox"]');
    const listbox = document.querySelector('[role="listbox"]');
    const helpTriggers = document.querySelectorAll('button[aria-label^="Help:"]').length;
    const links = Array.from(document.querySelectorAll("a[href]")).map((link) => link.getAttribute("href") || "");

    return {
      expectations: expected,
      currentPath: window.location.pathname,
      pageTitle: document.title,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      dialogOverflow,
      undersizedInteractiveElements,
      brokenImages,
      hasServerError: /Application error|server-side exception|Digest:|Pagina kon niet laden/iu.test(text),
      hasCombobox: Boolean(combobox),
      hasAutocompleteListbox: Boolean(listbox),
      helpTriggerCount: helpTriggers,
      hasTipTapEditor: /Tip|Let op|Voorbeeld|Tabel|Afbeelding|Video|Voorvertoning|Undo|Redo/iu.test(text),
      hasRoadmapStatus: /Nieuw|In overweging|In ontwikkeling|Afgerond|Statushistorie/iu.test(text),
      hasReleaseSurface: /Release|Versie|Uitgelicht|Highlight|Versienotes/iu.test(text),
      hasNoAccessLeakText: /platform_admin|service_role|DATABASE_URL|JWT|SUPABASE_SERVICE_ROLE/iu.test(text),
      protectedMediaLinks: links.filter((href) => /\/(?:help|releases|platform\/knowledgebase|platform\/releases)\/media\//u.test(href)).length,
    };
  }, expectations);
}

function evaluateTargetMetrics(metrics, expectations, httpStatus) {
  const failures = [];
  if (httpStatus !== null && httpStatus >= 500) failures.push({ id: "http-5xx", httpStatus });
  if (metrics.horizontalOverflow) failures.push({ id: "horizontal-overflow", scrollWidth: metrics.scrollWidth, clientWidth: metrics.clientWidth });
  if (metrics.dialogOverflow) failures.push({ id: "dialog-overflow" });
  if (metrics.hasServerError) failures.push({ id: "server-error-text" });
  if (metrics.hasNoAccessLeakText) failures.push({ id: "sensitive-error-text" });
  if (metrics.brokenImages > 0) failures.push({ id: "broken-images", count: metrics.brokenImages });
  if (expectations.includes("autocomplete") && !metrics.hasCombobox) failures.push({ id: "missing-autocomplete-combobox" });
  if (expectations.includes("tooltip") && metrics.helpTriggerCount === 0) failures.push({ id: "missing-help-tooltip" });
  if (expectations.includes("tiptap") && !metrics.hasTipTapEditor) failures.push({ id: "missing-tiptap-surface" });
  if (expectations.includes("roadmap") && !metrics.hasRoadmapStatus) failures.push({ id: "missing-roadmap-status-surface" });
  if (expectations.includes("release") && !metrics.hasReleaseSurface) failures.push({ id: "missing-release-surface" });
  return failures;
}

async function runMediaNoAccessChecks(context, role) {
  const results = [];
  const paths = [
    `/help/media/${mediaNoAccessId}`,
    `/releases/media/${mediaNoAccessId}`,
  ];

  for (const path of paths) {
    const url = joinUrl(role.baseUrl, path);
    try {
      const response = await context.request.get(url, { maxRedirects: 0, timeout: 15000 });
      const status = response.status();
      results.push({
        role: role.id,
        url,
        status: [401, 403, 404].includes(status) ? "passed" : "failed",
        httpStatus: status,
        expectation: "Unknown media id must not return a readable 2xx response.",
      });
    } catch (error) {
      results.push({
        role: role.id,
        url,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

function buildFinalAcceptance(checks, roles, results, mediaResults, error) {
  const configuredRoles = roles.filter((role) => role.baseUrl && role.hasAuth).map((role) => role.id);
  return {
    staticGate: checks.every((check) => check.status === "passed") ? "passed" : "failed",
    configuredRoles,
    screenshotsCaptured: results.filter((result) => result.status === "captured").length,
    screenshotFailures: results.filter((result) => result.status === "failed").length,
    mediaAccessChecks: mediaResults.length,
    mediaAccessFailures: mediaResults.filter((result) => result.status === "failed").length,
    liveError: error,
    strictCommand:
      "pnpm fieldgrid:kb-roadmap-release-phase12-acceptance:strict",
    artifactDirectory: "outputs/kb-roadmap-release-phase12-acceptance",
  };
}
