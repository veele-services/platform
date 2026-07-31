#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const outputDir = args.outDir || process.env.FIELDGRID_DASHBOARD_UI_AUDIT_OUT_DIR || join(process.cwd(), "outputs", "fieldgrid-dashboard-ui-audit");
const screenshotDir = join(outputDir, "screenshots");

const viewports = [
  { id: "mobile-320", width: 320, height: 568 },
  { id: "mobile-390", width: 390, height: 844 },
  { id: "mobile-430", width: 430, height: 932 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "tablet-landscape-1024", width: 1024, height: 768 },
  { id: "desktop-1280", width: 1280, height: 800 },
  { id: "desktop-1440", width: 1440, height: 1100 },
  { id: "desktop-1920", width: 1920, height: 1080 },
  { id: "zoom-200-1024", width: 1024, height: 768, cssZoom: 2 },
];

const staticChecks = [
  checkPackageScript(),
  checkTenantSidebarPersistence(),
  checkDashboardSurfaces(),
];

const roleConfigs = buildRoleConfigs();
let liveResults = [];
let liveError = null;

if (roleConfigs.some((role) => role.baseUrl && role.hasAuth)) {
  try {
    liveResults = await runLiveAudit(roleConfigs);
  } catch (error) {
    liveError = error instanceof Error ? error.message : String(error);
  }
}

const report = {
  version: "fieldgrid-dashboard-ui-audit-v1",
  createdAt: new Date().toISOString(),
  mode: args.check ? "check" : "full",
  strictEvidence: args.strictEvidence,
  viewports,
  roles: roleConfigs.map((role) => ({
    id: role.id,
    label: role.label,
    baseUrl: redactUrl(role.baseUrl),
    hasAuth: role.hasAuth,
    targets: role.targets.map(({ id, path, label }) => ({ id, path, label })),
  })),
  staticChecks,
  liveResults,
  liveError,
  summary: buildSummary(staticChecks, liveResults, liveError),
};

await mkdir(outputDir, { recursive: true });
const reportPath = join(outputDir, "dashboard-ui-audit.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const staticFailures = staticChecks.flatMap((item) => item.failures.map((failure) => ({ check: item.id, ...failure })));
const liveFailures = liveResults.filter((result) => result.status === "failed");
const missingStrictEvidence = args.strictEvidence
  ? roleConfigs
      .filter((role) => !role.baseUrl || !role.hasAuth)
      .map((role) => ({
        role: role.id,
        message: "Strict dashboard evidence requires a base URL plus storage state or cookie.",
        requiredEnv: role.requiredEnv,
      }))
  : [];
const expectedScreenshots = roleConfigs
  .filter((role) => role.baseUrl && role.hasAuth)
  .reduce((total, role) => total + role.targets.length * viewports.length, 0);
const missingStrictScreenshots =
  args.strictEvidence && liveResults.length < expectedScreenshots
    ? [{
        message: "Strict dashboard evidence requires screenshots for every configured target on all viewports.",
        expectedMinimum: expectedScreenshots,
        actual: liveResults.length,
      }]
    : [];

if (staticFailures.length || liveFailures.length || liveError || missingStrictEvidence.length || missingStrictScreenshots.length) {
  console.error(`Fieldgrid dashboard UI audit failed. Report: ${reportPath}`);
  if (staticFailures.length) console.error(JSON.stringify(staticFailures, null, 2));
  if (liveFailures.length) console.error(JSON.stringify(liveFailures, null, 2));
  if (missingStrictEvidence.length) console.error(JSON.stringify(missingStrictEvidence, null, 2));
  if (missingStrictScreenshots.length) console.error(JSON.stringify(missingStrictScreenshots, null, 2));
  if (liveError) console.error(liveError);
  process.exit(1);
}

if (liveResults.length === 0) {
  console.log(`Fieldgrid dashboard UI audit static checks passed; authenticated runtime evidence is manual. Report: ${reportPath}`);
} else {
  console.log(`Fieldgrid dashboard UI audit passed with authenticated runtime evidence. Report: ${reportPath}`);
}

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
  console.log(`Fieldgrid dashboard UI audit

Usage:
  pnpm fieldgrid:dashboard-ui-audit:check
  pnpm fieldgrid:dashboard-ui-audit
  pnpm fieldgrid:dashboard-ui-audit:strict

Live evidence uses these environment variables, with FIELDGRID_PHASE12_* as fallback:
  FIELDGRID_DASHBOARD_AUDIT_PLATFORM_BASE_URL
  FIELDGRID_DASHBOARD_AUDIT_TENANT_BASE_URL
  FIELDGRID_DASHBOARD_AUDIT_CUSTOMER_BASE_URL
  FIELDGRID_DASHBOARD_AUDIT_PERSONNEL_BASE_URL

Each role needs either *_STORAGE_STATE or *_COOKIE. If storage states from phase 12 exist
under outputs/kb-roadmap-release-phase12-acceptance/auth, those are used automatically.
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
    failures,
    warnings,
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

function checkPackageScript() {
  return check("package-script", "Dashboard UI audit script is exposed", expectFileContains("package.json", [
    { pattern: "fieldgrid:dashboard-ui-audit", message: "Missing dashboard UI audit package script." },
    { pattern: "fieldgrid:dashboard-ui-audit:check", message: "Missing dashboard UI audit check package script." },
    { pattern: "fieldgrid:dashboard-ui-audit:strict", message: "Missing dashboard UI audit strict package script." },
  ]));
}

function checkTenantSidebarPersistence() {
  return check("tenant-sidebar-collapse", "Tenant sidebar collapse is persistent and accessible", [
    ...expectFileContains("artifacts/backoffice/src/providers/sidebar-provider.tsx", [
      { pattern: "fieldgrid:tenant-sidebar-collapsed", message: "Sidebar collapsed state must persist in localStorage." },
      { pattern: "toggleCollapsed", message: "Sidebar provider must expose a collapse toggle." },
    ]),
    ...expectFileContains("artifacts/backoffice/src/components/layout/DashboardHeader.tsx", [
      { pattern: "Sidebar inklappen", message: "Dashboard header must expose a collapse button." },
      { pattern: "PanelLeftClose", message: "Dashboard header must use a clear collapse icon." },
    ]),
  ]);
}

function checkDashboardSurfaces() {
  const paths = [
    "artifacts/backoffice/src/app/(platform)/platform/page.tsx",
    "artifacts/backoffice/src/app/(dashboard)/page.tsx",
    "artifacts/klant-pwa/src/app/(app)/page.tsx",
    "artifacts/personeel-pwa/src/app/(app)/page.tsx",
  ];
  return check(
    "dashboard-surfaces",
    "Platform, tenant, customer and personnel dashboard surfaces exist",
    paths.filter((path) => !fileExists(path)).map((path) => failure(`Missing dashboard surface: ${path}`)),
  );
}

function buildRoleConfigs() {
  const defaultAuthDir = join(process.cwd(), "outputs", "kb-roadmap-release-phase12-acceptance", "auth");
  const defaultStorage = {
    platform: join(defaultAuthDir, "platform-admin.json"),
    tenant: join(defaultAuthDir, "tenant-admin.json"),
    customer: join(defaultAuthDir, "customer.json"),
    personnel: join(defaultAuthDir, "personnel.json"),
  };

  return [
    {
      id: "platform-admin",
      label: "Platform admin",
      baseUrl: firstEnv("FIELDGRID_DASHBOARD_AUDIT_PLATFORM_BASE_URL", "FIELDGRID_PHASE12_PLATFORM_BASE_URL"),
      storageState: firstEnv("FIELDGRID_DASHBOARD_AUDIT_PLATFORM_STORAGE_STATE", "FIELDGRID_PHASE12_PLATFORM_STORAGE_STATE") || existingDefault(defaultStorage.platform),
      cookie: firstEnv("FIELDGRID_DASHBOARD_AUDIT_PLATFORM_COOKIE", "FIELDGRID_PHASE12_PLATFORM_COOKIE"),
      requiredEnv: ["FIELDGRID_DASHBOARD_AUDIT_PLATFORM_BASE_URL", "FIELDGRID_DASHBOARD_AUDIT_PLATFORM_STORAGE_STATE"],
      targets: [
        { id: "dashboard", label: "Platform dashboard", path: "/admin/platform" },
        { id: "tenants", label: "Tenants", path: "/admin/platform/tenants" },
        { id: "knowledgebase", label: "Knowledgebase", path: "/admin/platform/knowledgebase" },
        { id: "roadmap", label: "Roadmap", path: "/admin/platform/roadmap" },
        { id: "releases", label: "Releases", path: "/admin/platform/releases" },
        { id: "settings", label: "Instellingen", path: "/admin/platform/settings" },
      ],
    },
    {
      id: "tenant-admin",
      label: "Tenant admin",
      baseUrl: firstEnv("FIELDGRID_DASHBOARD_AUDIT_TENANT_BASE_URL", "FIELDGRID_PHASE12_TENANT_BASE_URL"),
      storageState: firstEnv("FIELDGRID_DASHBOARD_AUDIT_TENANT_STORAGE_STATE", "FIELDGRID_PHASE12_TENANT_STORAGE_STATE") || existingDefault(defaultStorage.tenant),
      cookie: firstEnv("FIELDGRID_DASHBOARD_AUDIT_TENANT_COOKIE", "FIELDGRID_PHASE12_TENANT_COOKIE"),
      requiredEnv: ["FIELDGRID_DASHBOARD_AUDIT_TENANT_BASE_URL", "FIELDGRID_DASHBOARD_AUDIT_TENANT_STORAGE_STATE"],
      targets: [
        { id: "dashboard", label: "Tenant dashboard", path: "/" },
        { id: "planning", label: "Planning", path: "/admin/planning" },
        { id: "assignments", label: "Opdrachten", path: "/admin/assignments" },
        { id: "customers", label: "Klanten", path: "/admin/customers" },
        { id: "objects", label: "Objecten", path: "/admin/objects" },
        { id: "personnel", label: "Personeel", path: "/admin/personnel" },
        { id: "tickets", label: "Tickets", path: "/admin/tickets" },
        { id: "help", label: "Help", path: "/help" },
      ],
    },
    {
      id: "customer",
      label: "Customer portal",
      baseUrl: firstEnv("FIELDGRID_DASHBOARD_AUDIT_CUSTOMER_BASE_URL", "FIELDGRID_PHASE12_CUSTOMER_BASE_URL"),
      storageState: firstEnv("FIELDGRID_DASHBOARD_AUDIT_CUSTOMER_STORAGE_STATE", "FIELDGRID_PHASE12_CUSTOMER_STORAGE_STATE") || existingDefault(defaultStorage.customer),
      cookie: firstEnv("FIELDGRID_DASHBOARD_AUDIT_CUSTOMER_COOKIE", "FIELDGRID_PHASE12_CUSTOMER_COOKIE"),
      requiredEnv: ["FIELDGRID_DASHBOARD_AUDIT_CUSTOMER_BASE_URL", "FIELDGRID_DASHBOARD_AUDIT_CUSTOMER_STORAGE_STATE"],
      targets: [
        { id: "dashboard", label: "Klantportaal dashboard", path: "/" },
        { id: "assignments", label: "Opdrachten", path: "/opdrachten" },
        { id: "objects", label: "Objecten", path: "/objecten" },
        { id: "invoices", label: "Facturen", path: "/facturen" },
        { id: "tickets", label: "Tickets", path: "/meldingen/tickets" },
        { id: "help", label: "Help", path: "/help" },
        { id: "releases", label: "Releases", path: "/releases" },
      ],
    },
    {
      id: "personnel",
      label: "Personnel portal",
      baseUrl: firstEnv("FIELDGRID_DASHBOARD_AUDIT_PERSONNEL_BASE_URL", "FIELDGRID_PHASE12_PERSONNEL_BASE_URL"),
      storageState: firstEnv("FIELDGRID_DASHBOARD_AUDIT_PERSONNEL_STORAGE_STATE", "FIELDGRID_PHASE12_PERSONNEL_STORAGE_STATE") || existingDefault(defaultStorage.personnel),
      cookie: firstEnv("FIELDGRID_DASHBOARD_AUDIT_PERSONNEL_COOKIE", "FIELDGRID_PHASE12_PERSONNEL_COOKIE"),
      requiredEnv: ["FIELDGRID_DASHBOARD_AUDIT_PERSONNEL_BASE_URL", "FIELDGRID_DASHBOARD_AUDIT_PERSONNEL_STORAGE_STATE"],
      targets: [
        { id: "dashboard", label: "Personeelsapp dashboard", path: "/" },
        { id: "openstaand", label: "Openstaand", path: "/openstaand" },
        { id: "assignments", label: "Opdrachten", path: "/opdrachten" },
        { id: "messages", label: "Berichten", path: "/berichten" },
        { id: "availability", label: "Beschikbaarheid", path: "/beschikbaarheid" },
        { id: "help", label: "Help", path: "/help" },
        { id: "releases", label: "Releases", path: "/releases" },
      ],
    },
  ].map((role) => ({
    ...role,
    hasAuth: Boolean(role.storageState || role.cookie),
  }));
}

function firstEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

function existingDefault(path) {
  return existsSync(path) ? path : "";
}

async function runLiveAudit(roles) {
  const { chromium } = await loadPlaywright();
  const results = [];
  await mkdir(screenshotDir, { recursive: true });

  const hostResolverRules =
    process.env.FIELDGRID_BROWSER_HOST_RESOLVER_RULES?.trim();
  const browser = await chromium.launch({
    headless: true,
    ...(hostResolverRules
      ? { args: [`--host-resolver-rules=${hostResolverRules}`] }
      : {}),
  });
  try {
    for (const role of roles) {
      if (!role.baseUrl || !role.hasAuth) continue;
      for (const viewport of viewports) {
        const context = await browser.newContext({
          viewport: {
            width: Math.round(viewport.width / (viewport.cssZoom ?? 1)),
            height: Math.round(viewport.height / (viewport.cssZoom ?? 1)),
          },
          deviceScaleFactor: viewport.cssZoom ?? 1,
          storageState: role.storageState || undefined,
          ignoreHTTPSErrors: true,
          reducedMotion: "reduce",
        });
        if (role.cookie) {
          await context.addCookies(parseCookieHeader(role.cookie, role.baseUrl));
        }
        const page = await context.newPage();
        for (const target of role.targets) {
          results.push(await auditTarget(page, role, target, viewport));
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  return results;
}

async function auditTarget(page, role, target, viewport) {
  const url = buildTargetUrl(role.baseUrl, target.path);
  const startedAt = Date.now();
  const consoleErrors = [];
  const failedRequests = [];

  const onConsole = (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 500));
  };
  const onRequestFailed = (request) => {
    failedRequests.push({ url: redactUrl(request.url()), failure: request.failure()?.errorText ?? "request failed" });
  };

  page.on("console", onConsole);
  page.on("requestfailed", onRequestFailed);

  let responseStatus = null;
  let responseUrl = url;
  let screenshotPath = "";
  let metrics = null;
  let sidebarCollapse = null;
  let focusCheck = null;
  let axe = null;
  const failures = [];

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    responseStatus = response?.status() ?? null;
    responseUrl = response?.url() ?? page.url();
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    await page.addStyleTag({
      content:
        "[data-fieldgrid-dev-nav],nextjs-portal{display:none!important;}",
    });
    if (role.id === "tenant-admin" && target.id === "dashboard" && viewport.id === "desktop-1440") {
      sidebarCollapse = await verifyTenantSidebarCanCollapse(page);
      if (!sidebarCollapse.ok) failures.push(sidebarCollapse.message);
    }

    metrics = await collectMetricsWithRetry(page);
    const authRedirected = isAuthenticationRedirect(responseUrl);
    const routeChanged =
      ["customer", "personnel"].includes(role.id) &&
      !samePathname(responseUrl, url);
    focusCheck = await verifyKeyboardFocus(page);
    axe = await scanAccessibility(page);
    if (responseStatus === null || responseStatus >= 400) failures.push(`HTTP status ${responseStatus ?? "ontbreekt"}`);
    if (authRedirected) failures.push(`Authenticated route redirected to ${redactUrl(responseUrl)}.`);
    if (routeChanged) failures.push(`Authenticated route resolved to an unexpected path: ${redactUrl(responseUrl)}.`);
    if (metrics.serverError) failures.push("Application error text is visible.");
    if (metrics.blankPage) failures.push("Page appears blank or not loaded.");
    if (metrics.horizontalOverflow > 8) failures.push(`Horizontal overflow ${metrics.horizontalOverflow}px.`);
    if (metrics.visibleDialogOverflowCount > 0) failures.push(`Visible dialog/sheet overflow count ${metrics.visibleDialogOverflowCount}.`);
    if (viewport.width <= 430 && metrics.undersizedTouchTargetCount > 0) {
      failures.push(`Touch targets smaller than 44x44: ${metrics.undersizedTouchTargetCount}.`);
    }
    if (!focusCheck.ok) failures.push(`Keyboard focus check failed: ${focusCheck.reason}.`);
    if (axe.seriousOrCriticalViolations > 0) {
      failures.push(`Axe serious/critical violations: ${axe.seriousOrCriticalViolations}.`);
    }
    if (consoleErrors.some((entry) => /Application error|server action|chunk|hydration|not found on the server/i.test(entry))) {
      failures.push("Console contains high-risk runtime errors.");
    }

    screenshotPath = join(screenshotDir, `${role.id}-${target.id}-${viewport.id}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    page.off("console", onConsole);
    page.off("requestfailed", onRequestFailed);
  }

  return {
    role: role.id,
    label: role.label,
    target: target.id,
    targetLabel: target.label,
    viewport: viewport.id,
    url: redactUrl(url),
    responseUrl: redactUrl(responseUrl),
    responseStatus,
    authRedirected: isAuthenticationRedirect(responseUrl),
    routeMatches: samePathname(responseUrl, url),
    durationMs: Date.now() - startedAt,
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    metrics,
    focusCheck,
    axe,
    sidebarCollapse,
    consoleErrors: consoleErrors.slice(0, 8),
    failedRequests: failedRequests.slice(0, 8),
    screenshotPath: screenshotPath ? resolve(screenshotPath) : "",
  };
}

async function verifyTenantSidebarCanCollapse(page) {
  const button = page.getByRole("button", { name: /Sidebar (in|uit)klappen/ }).first();
  const isVisible = await button.isVisible().catch(() => false);
  if (!isVisible) return { ok: false, message: "Tenant sidebar collapse button is not visible." };

  async function sidebarWidth() {
    return page.evaluate(() => {
      const aside = document.querySelector("aside");
      return aside?.getBoundingClientRect().width ?? 0;
    });
  }

  const before = await sidebarWidth();
  if (before <= 100) {
    await button.click();
    await page.waitForTimeout(200);
  }
  const expanded = await sidebarWidth();
  await button.click();
  await page.waitForTimeout(250);
  const collapsed = await sidebarWidth();

  return {
    ok: expanded >= 180 && collapsed <= 100,
    message: `Tenant sidebar collapse measured expanded=${expanded}px collapsed=${collapsed}px.`,
    beforeWidth: before,
    expandedWidth: expanded,
    collapsedWidth: collapsed,
  };
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const text = body.innerText || "";
    const viewportWidth = window.innerWidth;
    const rootOverflowX = window.getComputedStyle(doc).overflowX;
    const bodyOverflowX = window.getComputedStyle(body).overflowX;
    const pageClipsHorizontalOverflow =
      ["hidden", "clip"].includes(rootOverflowX) &&
      ["hidden", "clip"].includes(bodyOverflowX);
    const scrollWidth = pageClipsHorizontalOverflow
      ? Math.max(viewportWidth, body.clientWidth)
      : Math.max(doc.scrollWidth, body.scrollWidth);
    const horizontalOverflow = Math.max(0, scrollWidth - viewportWidth);
    const serverError = /Application error|Pagina kon niet laden|client-side exception|server-side exception|Digest:/i.test(text);
    const blankPage = text.trim().length < 35;
    const visibleDialogOverflowCount = Array.from(document.querySelectorAll('[role="dialog"], [data-radix-dialog-content], [data-state="open"]'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && (rect.right > viewportWidth + 8 || rect.left < -8);
      }).length;
    const incoherentOverlapCount = Array.from(document.querySelectorAll("main button, main a, main input, main select, main textarea"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.right > viewportWidth + 8 || rect.left < -8);
      }).length;
    const undersizedTouchTargetCount = Array.from(
      document.querySelectorAll(
        "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link]",
      ),
    ).filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        element.getAttribute("aria-hidden") !== "true" &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        (rect.width < 44 || rect.height < 44)
      );
    }).length;

    return {
      textLength: text.trim().length,
      title: document.title,
      horizontalOverflow,
      scrollWidth,
      viewportWidth,
      serverError,
      blankPage,
      visibleDialogOverflowCount,
      incoherentOverlapCount,
      undersizedTouchTargetCount,
    };
  });
}

async function verifyKeyboardFocus(page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.keyboard.press("Tab");
  await page.waitForTimeout(100);
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body) {
      return { ok: false, reason: "tab-did-not-focus-a-control", tagName: active?.tagName ?? null };
    }
    const rect = active.getBoundingClientRect();
    const style = window.getComputedStyle(active);
    const visibleIndicator =
      (style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0) ||
      style.boxShadow !== "none";
    return {
      ok:
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        visibleIndicator,
      reason: visibleIndicator ? null : "focused-control-has-no-visible-indicator",
      tagName: active.tagName,
      visibleIndicator,
    };
  });
}

async function scanAccessibility(page) {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const analysis = await new AxeBuilder({ page }).analyze();
  const violations = analysis.violations
    .filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.length,
    }));
  return {
    seriousOrCriticalViolations: violations.length,
    violations,
  };
}

function isAuthenticationRedirect(value) {
  if (!value) return false;
  const pathname = new URL(value).pathname;
  return /\/(?:login|onboarding|wachtwoord-wijzigen|context-kiezen|privacy)(?:\/|$)/u.test(pathname);
}

function samePathname(left, right) {
  const normalize = (value) => {
    const pathname = new URL(value).pathname.replace(/\/+$/u, "");
    return pathname || "/";
  };
  return normalize(left) === normalize(right);
}

async function collectMetricsWithRetry(page) {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await collectMetrics(page);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/Execution context was destroyed|navigation/i.test(message)) throw error;
      await page.waitForLoadState("domcontentloaded", { timeout: 8_000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
  }
  throw lastError ?? new Error("Could not collect page metrics.");
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    throw new Error(`Playwright is niet geinstalleerd in deze workspace. Installeer dependencies of run corepack pnpm install. Originele fout: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseCookieHeader(cookieHeader, baseUrl) {
  const parsedUrl = new URL(baseUrl);
  const domain = parsedUrl.hostname;
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, ...valueParts] = part.split("=");
      return {
        name,
        value: valueParts.join("="),
        domain,
        path: "/",
        httpOnly: false,
        secure: parsedUrl.protocol === "https:",
        sameSite: "Lax",
      };
    });
}

function ensureSlash(url) {
  return url.endsWith("/") ? url : `${url}/`;
}

function buildTargetUrl(baseUrl, path) {
  const url = new URL(ensureSlash(baseUrl));
  if (path === "/" || path === "") return url.toString();

  const basePath = url.pathname === "/" ? "/" : ensureSlash(url.pathname);
  const nextPath = path.startsWith("/") ? path.slice(1) : path;
  url.pathname = `${basePath}${nextPath}`.replace(/\/{2,}/g, "/");
  url.search = "";
  url.hash = "";
  return url.toString();
}

function redactUrl(value) {
  if (!value) return value;
  return value.replace(/([?&](?:token|code|password|secret|key)=)[^&]+/gi, "$1[redacted]");
}

function buildSummary(checks, results, error) {
  const failures = checks.filter((item) => item.status === "failed").length + results.filter((item) => item.status === "failed").length + (error ? 1 : 0);
  return {
    status:
      failures > 0
        ? "failed"
        : results.length > 0
          ? "passed"
          : "manual",
    staticChecks: checks.length,
    liveResults: results.length,
    failures,
  };
}
