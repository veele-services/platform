import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

loadEnvConfig(process.cwd());
if ((process.env.SUPABASE_URL ?? "").includes("127.0.0.1")) {
  const local = JSON.parse(execFileSync("pnpm", ["supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })) as Record<string, string>;
  process.env.SUPABASE_URL = local.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = local.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = local.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = local.SERVICE_ROLE_KEY;
  process.env.DATABASE_URL = local.DB_URL;
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 30_000,
  expect: { timeout: 8_000, toHaveScreenshot: { maxDiffPixelRatio: 0.015, animations: "disabled" } },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure", screenshot: "only-on-failure", locale: "nl-NL", timezoneId: "Europe/Amsterdam" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    { command: "node tests/e2e/sendgrid-server.mjs", url: "http://127.0.0.1:59329/health", reuseExistingServer: false },
    { command: "pnpm dev", url: "http://127.0.0.1:3000/login", reuseExistingServer: false, timeout: 120_000,
      env: { DEPLOY_TARGET: "local", FIELDGRID_TEST_SENDGRID: "1", OPENROUTESERVICE_API_KEY: "fictional-travel-e2e-only", SENDGRID_API_KEY: "SG.fieldgrid-local-e2e-placeholder", SENDGRID_FROM_EMAIL: "noreply@fieldgrid.test", ADMIN_API_SECRET:"fieldgrid-local-e2e-worker-placeholder-only",
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(resolve("tests/e2e/travel-interceptor.mjs")).href}` },
    },
  ],
});
