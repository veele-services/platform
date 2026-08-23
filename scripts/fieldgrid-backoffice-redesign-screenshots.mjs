#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const outputDir = resolve(
  process.env.FIELDGRID_REDESIGN_SCREENSHOT_DIR ??
    "outputs/backoffice-redesign-acceptance",
);
const host = "tenant-a.runtime.fieldgrid.test";
const baseUrl = `http://${host}:9321/admin`;
const adminUserId = "20000000-0000-4000-8000-000000000102";

const targets = [
  {
    id: "dashboard-desktop-1440",
    path: "",
    heading: "Dashboard",
    viewport: { width: 1440, height: 900 },
  },
  {
    id: "dashboard-mobile-390",
    path: "",
    heading: "Dashboard",
    viewport: { width: 390, height: 844 },
  },
  {
    id: "planning-desktop-1440",
    path: "/planning",
    heading: "Planning",
    viewport: { width: 1440, height: 900 },
  },
  {
    id: "personnel-360-desktop-1440",
    path: "/personnel/60000000-0000-4000-8000-000000000001",
    heading: "Runtime Personnel A",
    viewport: { width: 1440, height: 900 },
  },
  {
    id: "personnel-360-mobile-390",
    path: "/personnel/60000000-0000-4000-8000-000000000001",
    heading: "Runtime Personnel A",
    viewport: { width: 390, height: 844 },
  },
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [`--host-resolver-rules=MAP ${host} 127.0.0.1`],
});
const context = await browser.newContext({
  locale: "nl-NL",
  timezoneId: "Europe/Amsterdam",
});
await context.addCookies([
  {
    name: "fieldgrid_e2e_auth_user",
    value: adminUserId,
    domain: host,
    path: "/admin",
  },
]);

const evidence = [];
try {
  for (const target of targets) {
    const page = await context.newPage();
    await page.setViewportSize(target.viewport);
    const url = `${baseUrl}${target.path}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("main").waitFor({ state: "visible", timeout: 60_000 });
    await page
      .getByRole("heading", { level: 1, name: target.heading })
      .waitFor({ state: "visible", timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    const path = join(outputDir, `${target.id}.png`);
    await page.screenshot({ path, fullPage: true });
    evidence.push({
      ...target,
      url,
      screenshot: path,
      pageHorizontalOverflow: overflow,
    });

    if (target.id === "dashboard-mobile-390") {
      await page.getByRole("button", { name: "Navigatie openen" }).click();
      const drawer = page.locator('[role="dialog"][data-state="open"]');
      await drawer.waitFor({ state: "visible" });
      const drawerWidth = await drawer.evaluate(
        (element) => element.getBoundingClientRect().width,
      );
      const navigationPath = join(
        outputDir,
        "dashboard-mobile-navigation-390.png",
      );
      await page.screenshot({ path: navigationPath, fullPage: false });
      evidence.push({
        id: "dashboard-mobile-navigation-390",
        path: target.path,
        viewport: target.viewport,
        url,
        screenshot: navigationPath,
        pageHorizontalOverflow: overflow,
        drawerWidth,
      });
    }
    await page.close();
  }
} finally {
  await browser.close();
}

const manifestPath = join(outputDir, "manifest.json");
await writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      schemaVersion: "1.0.0",
      createdAt: new Date().toISOString(),
      baseUrl,
      evidence,
    },
    null,
    2,
  )}\n`,
);

if (evidence.some((item) => item.pageHorizontalOverflow)) {
  throw new Error(
    `Onbedoelde horizontale overflow gevonden. Zie ${manifestPath}`,
  );
}

console.log(`Backoffice-redesign screenshots opgeslagen: ${manifestPath}`);
