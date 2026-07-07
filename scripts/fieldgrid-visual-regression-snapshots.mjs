#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const FIELDGRID_VISUAL_REGRESSION_VERSION = "fieldgrid-visual-regression-snapshots-v1";

export const visualRegressionViewports = [
  { id: "mobile-390", width: 390, height: 844 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "desktop-1440", width: 1440, height: 1000 },
];

export const visualRegressionTargetGroups = [
  {
    id: "platform-backoffice",
    label: "Platform backoffice",
    baseUrlEnv: "FIELDGRID_BACKOFFICE_BASE_URL",
    storageStateEnv: "FIELDGRID_BACKOFFICE_STORAGE_STATE",
    cookieEnv: "FIELDGRID_BACKOFFICE_COOKIE",
    routes: [
      "/platform",
      "/platform/accelerators",
      "/platform/tenants",
      "/platform/notifications",
      "/platform/security",
      "/platform/staging-smoke",
    ],
  },
  {
    id: "tenant-backoffice",
    label: "Tenant backoffice",
    baseUrlEnv: "FIELDGRID_TENANT_BACKOFFICE_BASE_URL",
    storageStateEnv: "FIELDGRID_TENANT_BACKOFFICE_STORAGE_STATE",
    cookieEnv: "FIELDGRID_TENANT_BACKOFFICE_COOKIE",
    routes: ["/dashboard", "/customers", "/objects", "/assignments", "/documents"],
  },
  {
    id: "customer-portal",
    label: "Klantenportaal",
    baseUrlEnv: "FIELDGRID_CUSTOMER_PORTAL_BASE_URL",
    storageStateEnv: "FIELDGRID_CUSTOMER_PORTAL_STORAGE_STATE",
    cookieEnv: "FIELDGRID_CUSTOMER_PORTAL_COOKIE",
    routes: ["/", "/dashboard", "/documenten", "/facturen"],
  },
  {
    id: "personnel-portal",
    label: "Personeelsportaal",
    baseUrlEnv: "FIELDGRID_PERSONNEL_PORTAL_BASE_URL",
    storageStateEnv: "FIELDGRID_PERSONNEL_PORTAL_STORAGE_STATE",
    cookieEnv: "FIELDGRID_PERSONNEL_PORTAL_COOKIE",
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
    if (targetIds.has(group.id)) errors.push(`Duplicate target id: ${group.id}`);
    targetIds.add(group.id);
    if (!group.baseUrlEnv) errors.push(`${group.id} mist baseUrlEnv.`);
    if (!Array.isArray(group.routes) || group.routes.length === 0) errors.push(`${group.id} heeft geen routes.`);
    for (const route of group.routes) {
      if (!route.startsWith("/")) errors.push(`${group.id} route moet met / beginnen: ${route}`);
    }
  }

  if (visualRegressionViewports.length < 3) errors.push("Minimaal drie viewports zijn vereist.");
  return errors;
}

export function buildVisualRegressionPlan(env = process.env, options = {}) {
  const target = options.target ?? "all";
  const groups = selectedGroups(target).map((group) => ({
    ...group,
    baseUrl: normalizeBaseUrl(env[group.baseUrlEnv]),
    storageStatePath: env[group.storageStateEnv] || null,
    cookie: env[group.cookieEnv] || null,
  }));
  const errors = validatePlan(groups);
  if (groups.length === 0) errors.push(`Onbekende visual regression target: ${target}`);

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

async function captureRoute({ browser, group, route, viewport, artifactRoot }) {
  const targetDir = path.join(artifactRoot, group.id, viewport.id);
  await fs.mkdir(targetDir, { recursive: true });
  const screenshotPath = path.join(targetDir, `${sanitizeFilename(route)}.png`);
  const contextOptions = {
    viewport: { width: viewport.width, height: viewport.height },
  };
  if (group.storageStatePath) contextOptions.storageState = group.storageStatePath;
  const context = await browser.newContext(contextOptions);
  await addCookieIfConfigured(context, group.cookie, group.baseUrl);
  const page = await context.newPage();
  const url = routeUrl(group.baseUrl, route);

  try {
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const metrics = await page.evaluate(() => {
      const body = document.body;
      const root = document.documentElement;
      return {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        bodyTextLength: body?.innerText?.trim().length ?? 0,
        bodyHeight: body?.getBoundingClientRect().height ?? 0,
      };
    });
    const hasHorizontalOverflow = metrics.scrollWidth > metrics.clientWidth + 4;
    const isBlank = metrics.bodyTextLength < 10 || metrics.bodyHeight < 120;

    return {
      groupId: group.id,
      route,
      viewport: viewport.id,
      url,
      screenshotPath,
      status: response?.ok() && !hasHorizontalOverflow && !isBlank ? "ok" : "warning",
      httpStatus: response?.status() ?? null,
      hasHorizontalOverflow,
      isBlank,
      metrics,
      error: null,
    };
  } catch (error) {
    return {
      groupId: group.id,
      route,
      viewport: viewport.id,
      url,
      screenshotPath: null,
      status: "blocked",
      httpStatus: null,
      hasHorizontalOverflow: false,
      isBlank: true,
      metrics: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await context.close();
  }
}

export async function runVisualRegressionSnapshots(options = {}, env = process.env) {
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

      for (const viewport of plan.viewports) {
        for (const route of group.routes) {
          results.push(await captureRoute({ browser, group, route, viewport, artifactRoot }));
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
  await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

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
          })),
          viewports: plan.viewports.map((viewport) => viewport.id),
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

const entrypoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entrypoint && import.meta.url === entrypoint) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
