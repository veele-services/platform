#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const viewports = [
  { id: "mobile-390", width: 390, height: 844 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "desktop-1440", width: 1440, height: 1100 },
];

const baseUrl = (process.env.FIELDGRID_PLATFORM_PHASE13_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000").replace(/\/$/u, "");
const tenantDetailPath = process.env.FIELDGRID_PLATFORM_PHASE13_TENANT_DETAIL_PATH || "";
const outputDir = process.env.FIELDGRID_PLATFORM_PHASE13_OUT_DIR || join(process.cwd(), "artifacts", "platform-mobile-polish");
const authCookie = process.env.FIELDGRID_PLATFORM_PHASE13_COOKIE || "";

const targets = [
  { id: "dashboard", path: "/admin/platform", label: "Platform dashboard" },
  { id: "tenants", path: "/admin/platform/tenants", label: "Tenantlijst" },
  ...(tenantDetailPath
    ? [
        { id: "tenant-detail", path: tenantDetailPath, label: "Tenantdetail" },
        { id: "tenant-domains", path: `${tenantDetailPath}${tenantDetailPath.includes("?") ? "&" : "?"}tab=domains`, label: "Tenantdetail domeinen" },
      ]
    : []),
  { id: "tickets", path: "/admin/platform/tickets", label: "Tickets" },
  { id: "security", path: "/admin/platform/security", label: "Security en audit" },
];

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    throw new Error(
      `Playwright is niet geinstalleerd in deze workspace. Installeer het in de runner of draai de smoke in CI/staging. Originele fout: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function cookieFromHeader(header) {
  if (!header) return [];
  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, ...valueParts] = part.split("=");
      return {
        name,
        value: valueParts.join("="),
        url: baseUrl,
        httpOnly: true,
        sameSite: "Lax",
      };
    })
    .filter((cookie) => cookie.name && cookie.value);
}

async function main() {
  const { chromium } = await loadPlaywright();
  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      const cookies = cookieFromHeader(authCookie);
      if (cookies.length > 0) await context.addCookies(cookies);
      const page = await context.newPage();

      for (const target of targets) {
        const url = `${baseUrl}${target.path}`;
        const startedAt = Date.now();
        const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
        const screenshot = join(outputDir, `${viewport.id}-${target.id}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });
        const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
        const overlappedButtons = await page.evaluate(() => {
          const items = Array.from(document.querySelectorAll("button, a[href], input, select, textarea"));
          return items.filter((item) => {
            const rect = item.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && (rect.width < 32 || rect.height < 32);
          }).length;
        });

        results.push({
          target: target.id,
          label: target.label,
          viewport: viewport.id,
          url,
          status: response?.status() ?? null,
          screenshot,
          horizontalOverflow,
          undersizedInteractiveElements: overlappedButtons,
          durationMs: Date.now() - startedAt,
        });
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  const report = {
    createdAt: new Date().toISOString(),
    baseUrl,
    targets,
    viewports,
    requiresTenantDetailPath: !tenantDetailPath,
    results,
  };
  const reportPath = join(outputDir, "phase13-visual-smoke.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  const failures = results.filter((result) => result.horizontalOverflow || result.undersizedInteractiveElements > 0 || (result.status !== null && result.status >= 500));
  if (failures.length > 0) {
    console.error(`Phase 13 visual smoke failed. Report: ${reportPath}`);
    console.error(JSON.stringify(failures, null, 2));
    process.exit(1);
  }

  console.log(`Phase 13 visual smoke passed. Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
