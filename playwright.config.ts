import { defineConfig, devices } from '@playwright/test';

const runId = process.env.FIELDGRID_E2E_RUN_ID ?? `fieldgrid-e2e-${Date.now()}-${process.env.GITHUB_RUN_ID ?? 'local'}`;

export default defineConfig({
  testDir: './e2e/fieldgrid/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'artifacts/playwright/html-report', open: 'never' }],
    ['json', { outputFile: 'artifacts/playwright/test-summary.json' }],
  ],
  outputDir: `artifacts/playwright/test-results/${runId}`,
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  webServer: {
    command: `FIELDGRID_E2E_RUN_ID=${runId} node e2e/fieldgrid/start-real-apps.mjs`,
    url: 'http://127.0.0.1:9325/healthz',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
