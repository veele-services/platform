import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/fieldgrid/tests',
  reporter: [['list'], ['html', { outputFolder: 'artifacts/fieldgrid-playwright/playwright-report', open: 'never' }]],
  use: { browserName: 'chromium', trace: 'retain-on-failure' },
  workers: 1,
});
