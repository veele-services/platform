#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

export const FIELDGRID_VISUAL_REGRESSION_VERSION =
  "fieldgrid-visual-regression-snapshots-v1";

export const visualRegressionViewports = [
  { id: "mobile-320", width: 320, height: 568 },
  { id: "mobile-390", width: 390, height: 844 },
  { id: "mobile-430", width: 430, height: 932 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "tablet-landscape-1024", width: 1024, height: 768 },
  { id: "desktop-1280", width: 1280, height: 800 },
  { id: "desktop-1440", width: 1440, height: 1100 },
  { id: "desktop-1920", width: 1920, height: 1080 },
  {
    id: "zoom-200-1024",
    width: 1024,
    height: 768,
    cssZoom: 2,
  },
];

export const visualRegressionTargetGroups = [
  {
    id: "platform-backoffice",
    label: "Platform backoffice",
    baseUrlEnv: "FIELDGRID_BACKOFFICE_BASE_URL",
    storageStateEnv: "FIELDGRID_BACKOFFICE_STORAGE_STATE",
    cookieEnv: "FIELDGRID_BACKOFFICE_COOKIE",
    personas: [
      {
        id: "platform-owner",
        storageStateEnv: "FIELDGRID_PLATFORM_OWNER_STORAGE_STATE",
        cookieEnv: "FIELDGRID_PLATFORM_OWNER_COOKIE",
        fallbackStorageStateEnv: "FIELDGRID_BACKOFFICE_STORAGE_STATE",
        fallbackCookieEnv: "FIELDGRID_BACKOFFICE_COOKIE",
      },
      {
        id: "platform-admin",
        storageStateEnv: "FIELDGRID_PLATFORM_ADMIN_STORAGE_STATE",
        cookieEnv: "FIELDGRID_PLATFORM_ADMIN_COOKIE",
      },
      {
        id: "platform-support",
        storageStateEnv: "FIELDGRID_PLATFORM_SUPPORT_STORAGE_STATE",
        cookieEnv: "FIELDGRID_PLATFORM_SUPPORT_COOKIE",
      },
    ],
    routes: [
      "/admin/platform",
      "/admin/platform/accelerators",
      "/admin/platform/tenants",
      "/admin/platform/notifications",
      "/admin/platform/security",
      "/admin/platform/staging-smoke",
    ],
  },
  {
    id: "tenant-backoffice",
    label: "Tenant backoffice",
    baseUrlEnv: "FIELDGRID_TENANT_BACKOFFICE_BASE_URL",
    storageStateEnv: "FIELDGRID_TENANT_BACKOFFICE_STORAGE_STATE",
    cookieEnv: "FIELDGRID_TENANT_BACKOFFICE_COOKIE",
    personas: [
      {
        id: "tenant-management",
        storageStateEnv: "FIELDGRID_TENANT_MANAGEMENT_STORAGE_STATE",
        cookieEnv: "FIELDGRID_TENANT_MANAGEMENT_COOKIE",
        fallbackStorageStateEnv: "FIELDGRID_TENANT_BACKOFFICE_STORAGE_STATE",
        fallbackCookieEnv: "FIELDGRID_TENANT_BACKOFFICE_COOKIE",
      },
      {
        id: "tenant-planner",
        storageStateEnv: "FIELDGRID_TENANT_PLANNER_STORAGE_STATE",
        cookieEnv: "FIELDGRID_TENANT_PLANNER_COOKIE",
      },
      {
        id: "tenant-administration",
        storageStateEnv: "FIELDGRID_TENANT_ADMINISTRATION_STORAGE_STATE",
        cookieEnv: "FIELDGRID_TENANT_ADMINISTRATION_COOKIE",
      },
    ],
    routes: [
      "/admin",
      "/admin/customers",
      "/admin/objects",
      "/admin/assignments",
      "/admin/documents",
    ],
  },
  {
    id: "customer-portal",
    label: "Klantenportaal",
    baseUrlEnv: "FIELDGRID_CUSTOMER_PORTAL_BASE_URL",
    storageStateEnv: "FIELDGRID_CUSTOMER_PORTAL_STORAGE_STATE",
    cookieEnv: "FIELDGRID_CUSTOMER_PORTAL_COOKIE",
    personas: [
      {
        id: "customer",
        storageStateEnv: "FIELDGRID_CUSTOMER_PORTAL_STORAGE_STATE",
        cookieEnv: "FIELDGRID_CUSTOMER_PORTAL_COOKIE",
      },
    ],
    routes: [
      "/",
      "/opdrachten",
      "/objecten",
      "/financieel",
      "/documenten",
      "/meldingen/tickets",
      "/help",
    ],
  },
  {
    id: "personnel-portal",
    label: "Personeelsportaal",
    baseUrlEnv: "FIELDGRID_PERSONNEL_PORTAL_BASE_URL",
    storageStateEnv: "FIELDGRID_PERSONNEL_PORTAL_STORAGE_STATE",
    cookieEnv: "FIELDGRID_PERSONNEL_PORTAL_COOKIE",
    personas: [
      {
        id: "personnel",
        storageStateEnv: "FIELDGRID_PERSONNEL_PORTAL_STORAGE_STATE",
        cookieEnv: "FIELDGRID_PERSONNEL_PORTAL_COOKIE",
      },
    ],
    routes: [
      "/",
      "/opdrachten",
      "/openstaand",
      "/uren",
      "/berichten",
      "/beschikbaarheid",
      "/documenten",
      "/help",
    ],
  },
];

const DEFAULT_ARTIFACT_DIR = "artifacts/visual-regression";
const DEFAULT_BASELINE_DIR = "tests/visual-regression/baselines";
const DEFAULT_MAX_DIFF_PIXEL_RATIO = 0.001;
const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const args = {
    check: false,
    run: false,
    strict: false,
    target: "all",
    artifactDir: DEFAULT_ARTIFACT_DIR,
    baselineDir:
      process.env.FIELDGRID_VISUAL_REGRESSION_BASELINE_DIR ||
      DEFAULT_BASELINE_DIR,
    updateBaselines: false,
    maxDiffPixelRatio: Number(
      process.env.FIELDGRID_VISUAL_REGRESSION_MAX_DIFF_PIXEL_RATIO ||
        DEFAULT_MAX_DIFF_PIXEL_RATIO,
    ),
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--check") args.check = true;
    else if (value === "--run") args.run = true;
    else if (value === "--strict") args.strict = true;
    else if (value === "--target") {
      args.target = argv[index + 1] ?? "all";
      index += 1;
    } else if (value?.startsWith("--target=")) {
      args.target = value.slice("--target=".length);
    } else if (value === "--artifact-dir") {
      args.artifactDir = argv[index + 1] ?? DEFAULT_ARTIFACT_DIR;
      index += 1;
    } else if (value?.startsWith("--artifact-dir=")) {
      args.artifactDir = value.slice("--artifact-dir=".length);
    } else if (value === "--baseline-dir") {
      args.baselineDir = argv[index + 1] ?? DEFAULT_BASELINE_DIR;
      index += 1;
    } else if (value?.startsWith("--baseline-dir=")) {
      args.baselineDir = value.slice("--baseline-dir=".length);
    } else if (value === "--update-baselines") {
      args.updateBaselines = true;
    } else if (value === "--max-diff-pixel-ratio") {
      args.maxDiffPixelRatio = Number(argv[index + 1]);
      index += 1;
    } else if (value?.startsWith("--max-diff-pixel-ratio=")) {
      args.maxDiffPixelRatio = Number(
        value.slice("--max-diff-pixel-ratio=".length),
      );
    }
  }

  if (!args.check && !args.run) args.check = true;
  return args;
}

function normalizeBaseUrl(value) {
  if (!value) return null;
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function browserLaunchOptions() {
  const hostResolverRules =
    process.env.FIELDGRID_BROWSER_HOST_RESOLVER_RULES?.trim();
  return {
    headless: true,
    ...(hostResolverRules
      ? { args: [`--host-resolver-rules=${hostResolverRules}`] }
      : {}),
  };
}

function routeUrl(baseUrl, route) {
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  return `${baseUrl}${normalizedRoute}`;
}

function sanitizeFilename(value) {
  return value
    .replace(/^\/$/, "root")
    .replace(/^\//, "")
    .replace(/[^a-z0-9._-]+/giu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function selectedGroups(target) {
  if (!target || target === "all") return visualRegressionTargetGroups;
  return visualRegressionTargetGroups.filter((group) => group.id === target);
}

function validatePlan(groups, options = {}) {
  const errors = [];
  const targetIds = new Set();

  for (const group of groups) {
    if (targetIds.has(group.id))
      errors.push(`Duplicate target id: ${group.id}`);
    targetIds.add(group.id);
    if (!group.baseUrlEnv) errors.push(`${group.id} mist baseUrlEnv.`);
    if (!Array.isArray(group.routes) || group.routes.length === 0)
      errors.push(`${group.id} heeft geen routes.`);
    if (!Array.isArray(group.personas) || group.personas.length === 0) {
      errors.push(`${group.id} heeft geen persona's.`);
    }
    for (const route of group.routes) {
      if (!route.startsWith("/"))
        errors.push(`${group.id} route moet met / beginnen: ${route}`);
    }
  }

  const requiredViewports = new Set([
    "320x568",
    "390x844",
    "430x932",
    "768x1024",
    "1024x768",
    "1280x800",
    "1440x1100",
    "1920x1080",
  ]);
  for (const viewport of visualRegressionViewports) {
    requiredViewports.delete(`${viewport.width}x${viewport.height}`);
  }
  if (requiredViewports.size > 0) {
    errors.push(
      `Verplichte viewports ontbreken: ${[...requiredViewports].join(", ")}.`,
    );
  }
  if (!visualRegressionViewports.some((viewport) => viewport.cssZoom === 2)) {
    errors.push("Een 200%-zoomcontrole ontbreekt.");
  }
  if (
    !Number.isFinite(options.maxDiffPixelRatio) ||
    options.maxDiffPixelRatio < 0 ||
    options.maxDiffPixelRatio > 1
  ) {
    errors.push("maxDiffPixelRatio moet een getal tussen 0 en 1 zijn.");
  }
  return errors;
}

export function buildVisualRegressionPlan(env = process.env, options = {}) {
  const target = options.target ?? "all";
  const groups = selectedGroups(target).map((group) => ({
    ...group,
    baseUrl: normalizeBaseUrl(env[group.baseUrlEnv]),
    personas: group.personas.map((persona) => ({
      ...persona,
      storageStatePath:
        env[persona.storageStateEnv] ||
        env[persona.fallbackStorageStateEnv] ||
        null,
      cookie: env[persona.cookieEnv] || env[persona.fallbackCookieEnv] || null,
    })),
  }));
  const maxDiffPixelRatio =
    options.maxDiffPixelRatio ?? DEFAULT_MAX_DIFF_PIXEL_RATIO;
  const errors = validatePlan(groups, { maxDiffPixelRatio });
  if (groups.length === 0)
    errors.push(`Onbekende visual regression target: ${target}`);

  return {
    version: FIELDGRID_VISUAL_REGRESSION_VERSION,
    generatedAt: new Date().toISOString(),
    artifactDir: options.artifactDir ?? DEFAULT_ARTIFACT_DIR,
    baselineDir: options.baselineDir ?? DEFAULT_BASELINE_DIR,
    requireBaselines: Boolean(options.strict),
    updateBaselines: Boolean(options.updateBaselines),
    maxDiffPixelRatio,
    viewports: visualRegressionViewports,
    groups,
    errors,
  };
}

async function addCookieIfConfigured(context, cookie, baseUrl) {
  if (!cookie || !baseUrl) return;
  const url = new URL(baseUrl);
  const cookies = cookie
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, ...rest] = part.split("=");
      return {
        name,
        value: rest.join("="),
        domain: url.hostname,
        path: "/",
        httpOnly: true,
        secure: url.protocol === "https:",
        sameSite: "Lax",
      };
    })
    .filter((item) => item.name && item.value);
  if (cookies.length > 0) await context.addCookies(cookies);
}

async function captureRoute({
  browser,
  group,
  persona,
  route,
  viewport,
  artifactRoot,
  baselineRoot,
  requireBaselines,
  updateBaselines,
  maxDiffPixelRatio,
}) {
  const targetDir = path.join(artifactRoot, group.id, persona.id, viewport.id);
  await fs.mkdir(targetDir, { recursive: true });
  const screenshotPath = path.join(targetDir, `${sanitizeFilename(route)}.png`);
  const baselinePath = path.join(
    baselineRoot,
    group.id,
    persona.id,
    viewport.id,
    `${sanitizeFilename(route)}.png`,
  );
  const contextOptions = {
    viewport: {
      width: Math.round(viewport.width / (viewport.cssZoom ?? 1)),
      height: Math.round(viewport.height / (viewport.cssZoom ?? 1)),
    },
    deviceScaleFactor: viewport.cssZoom ?? 1,
  };
  if (persona.storageStatePath) {
    contextOptions.storageState = persona.storageStatePath;
  }
  const context = await browser.newContext(contextOptions);
  await addCookieIfConfigured(context, persona.cookie, group.baseUrl);
  const page = await context.newPage();
  const url = routeUrl(group.baseUrl, route);

  try {
    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.addStyleTag({
      content:
        "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;caret-color:transparent!important;}[data-fieldgrid-dev-nav],nextjs-portal{display:none!important;}",
    });
    const finalUrl = page.url();
    const finalPathname = new URL(finalUrl).pathname;
    const authRedirected =
      /\/(?:login|onboarding|wachtwoord-wijzigen|context-kiezen|privacy)(?:\/|$)/u.test(
        finalPathname,
      );
    const routeMatches =
      !["customer-portal", "personnel-portal"].includes(group.id) ||
      samePathname(finalUrl, url);
    const focusCheck = await verifyKeyboardFocus(page);
    const axe = await scanAccessibility(page);
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
      animations: "disabled",
      caret: "hide",
    });
    const metrics = await page.evaluate(() => {
      const body = document.body;
      const root = document.documentElement;
      const viewportWidth = root.clientWidth;
      const overflowStyles = new Set(["auto", "scroll", "hidden", "clip"]);
      const isContainedByOverflowAncestor = (element, elementRect) => {
        let ancestor = element.parentElement;
        while (ancestor && ancestor !== body && ancestor !== root) {
          const style = window.getComputedStyle(ancestor);
          if (overflowStyles.has(style.overflowX)) {
            const rect = ancestor.getBoundingClientRect();
            const ancestorIsInsideViewport =
              rect.left >= -4 && rect.right <= viewportWidth + 4;
            const clipsElement =
              elementRect.left < rect.left - 1 ||
              elementRect.right > rect.right + 1;
            if (ancestorIsInsideViewport && clipsElement) return true;
          }
          ancestor = ancestor.parentElement;
        }
        return false;
      };
      const selectorFor = (element) => {
        const id = element.id ? `#${element.id}` : "";
        const classes =
          element.classList.length > 0
            ? `.${[...element.classList].slice(0, 2).join(".")}`
            : "";
        return `${element.tagName.toLowerCase()}${id}${classes}`;
      };
      const overflowingElements = [...document.querySelectorAll("body *")]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          const visible =
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden";
          const overflowPx = Math.max(
            0,
            rect.right - viewportWidth,
            -rect.left,
          );
          return { element, rect, visible, overflowPx };
        })
        .filter(
          ({ element, rect, visible, overflowPx }) =>
            visible &&
            overflowPx > 4 &&
            !isContainedByOverflowAncestor(element, rect),
        );
      const interactiveSelector =
        "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link]";
      const nestedInteractive = [
        ...document.querySelectorAll(interactiveSelector),
      ].filter((element) => element.querySelector(interactiveSelector));
      const unnamedControls = [
        ...document.querySelectorAll(
          "button, input:not([type=hidden]), select, textarea, [role=button]",
        ),
      ].filter((element) => {
        const label =
          element.getAttribute("aria-label") ||
          element.getAttribute("aria-labelledby") ||
          element.getAttribute("title") ||
          element.textContent?.trim() ||
          (element instanceof HTMLInputElement && element.labels?.length
            ? "labelled"
            : "");
        return !label;
      });
      const undersizedControls = [
        ...document.querySelectorAll(interactiveSelector),
      ].filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          element.getAttribute("aria-hidden") !== "true" &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          (rect.width < 44 || rect.height < 44)
        );
      });
      const rootScrollWidth = root.scrollWidth;
      const bodyScrollWidth = body?.scrollWidth ?? 0;
      return {
        scrollWidth: Math.max(rootScrollWidth, bodyScrollWidth),
        rootScrollWidth,
        bodyScrollWidth,
        clientWidth: viewportWidth,
        overflowingElementCount: overflowingElements.length,
        maxOverflowPx: Math.max(
          0,
          rootScrollWidth - viewportWidth,
          bodyScrollWidth - viewportWidth,
          ...overflowingElements.map(({ overflowPx }) => overflowPx),
        ),
        overflowingElementSelectors: overflowingElements
          .slice(0, 10)
          .map(({ element }) => selectorFor(element)),
        bodyTextLength: body?.innerText?.trim().length ?? 0,
        bodyHeight: body?.getBoundingClientRect().height ?? 0,
        hasServerError:
          /(?:internal server error|application error|unhandled runtime error)/iu.test(
            body?.innerText ?? "",
          ),
        nestedInteractiveCount: nestedInteractive.length,
        unnamedControlCount: unnamedControls.length,
        undersizedControlCount: undersizedControls.length,
      };
    });
    const hasHorizontalOverflow = hasHorizontalOverflowFromMetrics(metrics);
    const isBlank = metrics.bodyTextLength < 10 || metrics.bodyHeight < 120;
    const hasAccessibilityWarnings =
      metrics.nestedInteractiveCount > 0 ||
      metrics.unnamedControlCount > 0 ||
      (viewport.width <= 430 && metrics.undersizedControlCount > 0) ||
      !focusCheck.ok ||
      axe.seriousOrCriticalViolations > 0;
    const hasHttpFailure = !response || response.status() >= 400;
    const captureIsValid =
      !hasHttpFailure &&
      !authRedirected &&
      routeMatches &&
      !metrics.hasServerError &&
      !hasHorizontalOverflow &&
      !isBlank &&
      !hasAccessibilityWarnings;
    const baseline = await compareVisualSnapshot({
      screenshotPath,
      baselinePath,
      updateBaselines,
      maxDiffPixelRatio,
      captureIsValid,
    });
    const hasVisualRegression =
      baseline.status === "changed" ||
      baseline.status === "rejected" ||
      (requireBaselines && baseline.status === "missing");

    return {
      groupId: group.id,
      personaId: persona.id,
      route,
      viewport: viewport.id,
      zoom: viewport.cssZoom ?? 1,
      url,
      finalUrl,
      screenshotPath,
      baselinePath,
      status: visualCaptureStatus({
        captureIsValid,
        hasVisualRegression,
      }),
      httpStatus: response?.status() ?? null,
      authRedirected,
      routeMatches,
      captureIsValid,
      hasHorizontalOverflow,
      hasAccessibilityWarnings,
      hasVisualRegression,
      isBlank,
      metrics,
      focusCheck,
      axe,
      baseline,
      error: null,
    };
  } catch (error) {
    return {
      groupId: group.id,
      personaId: persona.id,
      route,
      viewport: viewport.id,
      zoom: viewport.cssZoom ?? 1,
      url,
      screenshotPath: null,
      status: "blocked",
      httpStatus: null,
      authRedirected: false,
      hasHorizontalOverflow: false,
      hasAccessibilityWarnings: false,
      isBlank: true,
      metrics: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await context.close();
  }
}

function samePathname(left, right) {
  const normalize = (value) => {
    const pathname = new URL(value).pathname.replace(/\/+$/u, "");
    return pathname || "/";
  };
  return normalize(left) === normalize(right);
}

async function verifyKeyboardFocus(page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.keyboard.press("Tab");
  await page.waitForTimeout(100);
  return page.evaluate(() => {
    const selector =
      "button:not([disabled]), a[href], input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const visibleFocusables = [...document.querySelectorAll(selector)].filter(
      (element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      },
    );
    if (visibleFocusables.length === 0) {
      return { ok: false, reason: "no-visible-focusable-control" };
    }
    const active = document.activeElement;
    const rect =
      active instanceof HTMLElement ? active.getBoundingClientRect() : null;
    return {
      ok:
        active instanceof HTMLElement &&
        active !== document.body &&
        visibleFocusables.includes(active) &&
        rect !== null &&
        rect.width > 0 &&
        rect.height > 0,
      reason:
        active instanceof HTMLElement &&
        active !== document.body &&
        visibleFocusables.includes(active)
          ? null
          : "tab-did-not-reach-a-visible-control",
      tagName: active?.tagName ?? null,
    };
  });
}

async function scanAccessibility(page) {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const analysis = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = analysis.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  return {
    violationCount: analysis.violations.length,
    seriousOrCriticalViolations: seriousOrCritical.length,
    violations: seriousOrCritical.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.length,
    })),
  };
}

export async function compareVisualSnapshot({
  screenshotPath,
  baselinePath,
  updateBaselines,
  maxDiffPixelRatio,
  captureIsValid,
}) {
  const screenshot = await fs.readFile(screenshotPath);
  const actualSha256 = createHash("sha256").update(screenshot).digest("hex");

  if (updateBaselines) {
    if (captureIsValid !== true) {
      return {
        status: "rejected",
        actualSha256,
        expectedSha256: null,
        reason: "capture-validation-failed",
      };
    }
    await fs.mkdir(path.dirname(baselinePath), { recursive: true });
    await fs.copyFile(screenshotPath, baselinePath);
    return {
      status: "updated",
      actualSha256,
      expectedSha256: actualSha256,
    };
  }

  try {
    const expected = await fs.readFile(baselinePath);
    const expectedSha256 = createHash("sha256").update(expected).digest("hex");
    const comparator = playwrightPngComparator();
    const comparison = comparator(screenshot, expected, {
      threshold: 0.2,
      maxDiffPixelRatio,
    });
    const diffPath = `${screenshotPath.replace(/\.png$/u, "")}.diff.png`;
    if (comparison?.diff) {
      await fs.writeFile(diffPath, comparison.diff);
    } else {
      await fs.rm(diffPath, { force: true });
    }
    return {
      status: comparison ? "changed" : "matched",
      actualSha256,
      expectedSha256,
      maxDiffPixelRatio,
      diffPath: comparison?.diff ? diffPath : null,
      errorMessage: comparison?.errorMessage ?? null,
    };
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return {
        status: "missing",
        actualSha256,
        expectedSha256: null,
      };
    }
    throw error;
  }
}

export function hasHorizontalOverflowFromMetrics(metrics) {
  return (
    metrics.scrollWidth > metrics.clientWidth + 4 ||
    metrics.overflowingElementCount > 0 ||
    metrics.maxOverflowPx > 4
  );
}

export function visualCaptureStatus({ captureIsValid, hasVisualRegression }) {
  return captureIsValid === true && !hasVisualRegression ? "ok" : "warning";
}

function playwrightPngComparator() {
  const playwrightPackagePath = require.resolve("playwright/package.json");
  const comparatorPath = path.resolve(
    path.dirname(playwrightPackagePath),
    "..",
    "playwright-core",
    "lib",
    "server",
    "utils",
    "comparators.js",
  );
  const { getComparator } = require(comparatorPath);
  return getComparator("image/png");
}

export async function runVisualRegressionSnapshots(
  options = {},
  env = process.env,
) {
  const plan = buildVisualRegressionPlan(env, options);
  const artifactRoot = path.resolve(process.cwd(), plan.artifactDir);
  const baselineRoot = path.resolve(process.cwd(), plan.baselineDir);
  await fs.mkdir(artifactRoot, { recursive: true });

  if (plan.errors.length > 0) {
    return {
      ...plan,
      status: "blocked",
      results: [],
      summaryPath: null,
    };
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch(browserLaunchOptions());
  const results = [];

  try {
    for (const group of plan.groups) {
      if (!group.baseUrl) {
        results.push({
          groupId: group.id,
          route: "*",
          viewport: "*",
          status: "manual",
          error: `${group.baseUrlEnv} is niet gezet.`,
        });
        continue;
      }

      for (const persona of group.personas) {
        if (!persona.storageStatePath && !persona.cookie) {
          results.push({
            groupId: group.id,
            personaId: persona.id,
            route: "*",
            viewport: "*",
            status: "manual",
            error: `${persona.storageStateEnv} of ${persona.cookieEnv} is niet gezet.`,
          });
          continue;
        }
        for (const viewport of plan.viewports) {
          for (const route of group.routes) {
            results.push(
              await captureRoute({
                browser,
                group,
                persona,
                route,
                viewport,
                artifactRoot,
                baselineRoot,
                requireBaselines: plan.requireBaselines,
                updateBaselines: plan.updateBaselines,
                maxDiffPixelRatio: plan.maxDiffPixelRatio,
              }),
            );
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  const status = results.some((result) => result.status === "blocked")
    ? "blocked"
    : results.some((result) => result.status === "warning")
      ? "warning"
      : results.some((result) => result.status === "manual")
        ? "manual"
        : "ok";
  const summary = {
    ...plan,
    status,
    results,
    totals: {
      ok: results.filter((result) => result.status === "ok").length,
      warning: results.filter((result) => result.status === "warning").length,
      blocked: results.filter((result) => result.status === "blocked").length,
      manual: results.filter((result) => result.status === "manual").length,
    },
  };
  const summaryPath = path.join(artifactRoot, "visual-regression-summary.json");
  await fs.writeFile(
    summaryPath,
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );

  return {
    ...summary,
    summaryPath,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const plan = buildVisualRegressionPlan(process.env, args);

  if (args.check) {
    const runtimeReady =
      plan.groups.length > 0 &&
      plan.groups.every(
        (group) =>
          group.baseUrl &&
          group.personas.every(
            (persona) => persona.storageStatePath || persona.cookie,
          ),
      );
    if (runtimeReady && plan.errors.length === 0) {
      const summary = await runVisualRegressionSnapshots({
        ...args,
        check: false,
        run: true,
        strict: true,
      });
      console.log(JSON.stringify(summary, null, 2));
      process.exit(summary.status === "ok" ? 0 : 1);
    }

    const status = plan.errors.length > 0 ? "blocked" : "manual";
    console.log(
      JSON.stringify(
        {
          version: plan.version,
          status,
          artifactDir: plan.artifactDir,
          baselineDir: plan.baselineDir,
          maxDiffPixelRatio: plan.maxDiffPixelRatio,
          evidence: "not-run-authenticated-base-url-or-state-missing",
          targets: plan.groups.map((group) => ({
            id: group.id,
            label: group.label,
            baseUrlEnv: group.baseUrlEnv,
            routes: group.routes,
            personas: group.personas.map((persona) => ({
              id: persona.id,
              storageStateEnv: persona.storageStateEnv,
              cookieEnv: persona.cookieEnv,
            })),
          })),
          viewports: plan.viewports.map((viewport) => ({
            id: viewport.id,
            width: viewport.width,
            height: viewport.height,
            zoom: viewport.cssZoom ?? 1,
          })),
          errors: plan.errors,
        },
        null,
        2,
      ),
    );
    process.exit(status === "blocked" ? 1 : 0);
  }

  const summary = await runVisualRegressionSnapshots(args);
  console.log(JSON.stringify(summary, null, 2));
  if ((args.strict || args.updateBaselines) && summary.status !== "ok") {
    process.exit(1);
  }
}

const entrypoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (entrypoint && import.meta.url === entrypoint) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
