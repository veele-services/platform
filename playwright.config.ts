import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/fieldgrid/tests',
  reporter: [['list'], ['html', { outputFolder: 'artifacts/fieldgrid-playwright/playwright-report', open: 'never' }]],
  use: { browserName: 'chromium', trace: 'retain-on-failure' },
  workers: 1,
  webServer: {
    command: 'node e2e/fieldgrid/start-real-apps.mjs',
    url: 'http://127.0.0.1:9325/healthz',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
