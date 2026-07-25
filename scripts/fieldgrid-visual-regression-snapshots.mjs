#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

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
    routes: ["/", "/dashboard", "/documenten", "/facturen"],
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
    routes: ["/", "/planning", "/berichten", "/documenten"],
  },
];

const DEFAULT_ARTIFACT_DIR = "artifacts/visual-regression";

function parseArgs(argv) {
  const args = {
    check: false,
    run: false,
    strict: false,
    target: "all",
    artifactDir: DEFAULT_ARTIFACT_DIR,
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
    }
  }

  if (!args.check && !args.run) args.check = true;
  return args;
}

function normalizeBaseUrl(value) {
  if (!value) return null;
  return value.endsWith("/") ? value.slice(0, -1) : value;
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

function validatePlan(groups) {
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
  const errors = validatePlan(groups);
  if (groups.length === 0)
    errors.push(`Onbekende visual regression target: ${target}`);

  return {
    version: FIELDGRID_VISUAL_REGRESSION_VERSION,
    generatedAt: new Date().toISOString(),
    artifactDir: options.artifactDir ?? DEFAULT_ARTIFACT_DIR,
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
}) {
  const targetDir = path.join(artifactRoot, group.id, persona.id, viewport.id);
  await fs.mkdir(targetDir, { recursive: true });
  const screenshotPath = path.join(targetDir, `${sanitizeFilename(route)}.png`);
  const contextOptions = {
    viewport: { width: viewport.width, height: viewport.height },
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
    if (viewport.cssZoom) {
      await page.evaluate((zoom) => {
        document.documentElement.style.zoom = String(zoom);
      }, viewport.cssZoom);
    }
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const metrics = await page.evaluate(() => {
      const body = document.body;
      const root = document.documentElement;
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
        ...document.querySelectorAll(
          "button, input:not([type=hidden]), select, textarea, [role=button]",
        ),
      ].filter((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          (rect.width < 44 || rect.height < 44)
        );
      });
      return {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        bodyTextLength: body?.innerText?.trim().length ?? 0,
        bodyHeight: body?.getBoundingClientRect().height ?? 0,
        nestedInteractiveCount: nestedInteractive.length,
        unnamedControlCount: unnamedControls.length,
        undersizedControlCount: undersizedControls.length,
      };
    });
    const hasHorizontalOverflow = metrics.scrollWidth > metrics.clientWidth + 4;
    const isBlank = metrics.bodyTextLength < 10 || metrics.bodyHeight < 120;
    const hasAccessibilityWarnings =
      metrics.nestedInteractiveCount > 0 ||
      metrics.unnamedControlCount > 0 ||
      metrics.undersizedControlCount > 0;

    return {
      groupId: group.id,
      personaId: persona.id,
      route,
      viewport: viewport.id,
      zoom: viewport.cssZoom ?? 1,
      url,
      screenshotPath,
      status:
        response?.ok() &&
        !hasHorizontalOverflow &&
        !isBlank &&
        !hasAccessibilityWarnings
          ? "ok"
          : "warning",
      httpStatus: response?.status() ?? null,
      hasHorizontalOverflow,
      hasAccessibilityWarnings,
      isBlank,
      metrics,
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

export async function runVisualRegressionSnapshots(
  options = {},
  env = process.env,
) {
  const plan = buildVisualRegressionPlan(env, options);
  const artifactRoot = path.resolve(process.cwd(), plan.artifactDir);
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
  const browser = await chromium.launch({ headless: true });
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
    const status = plan.errors.length > 0 ? "blocked" : "ok";
    console.log(
      JSON.stringify(
        {
          version: plan.version,
          status,
          artifactDir: plan.artifactDir,
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
    process.exit(status === "ok" ? 0 : 1);
  }

  const summary = await runVisualRegressionSnapshots(args);
  console.log(JSON.stringify(summary, null, 2));
  if (args.strict && summary.status !== "ok") process.exit(1);
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
