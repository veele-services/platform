import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/fieldgrid/tests',
  forbidOnly: Boolean(process.env.CI),
  outputDir: 'artifacts/fieldgrid-playwright/test-results',
  reporter: [
    ['list'],
    ['json', { outputFile: 'artifacts/fieldgrid-playwright/playwright-results.json' }],
    ['junit', { outputFile: 'artifacts/fieldgrid-playwright/junit/results.xml' }],
    ['html', { outputFolder: 'artifacts/fieldgrid-playwright/playwright-report', open: 'never' }],
  ],
  use: {
    browserName: 'chromium',
    launchOptions: {
      args: [
        [
          '--host-resolver-rules=MAP tenant-a.runtime.fieldgrid.test 127.0.0.1',
          'MAP tenant-b.runtime.fieldgrid.test 127.0.0.1',
          'MAP suspended.runtime.fieldgrid.test 127.0.0.1',
          'MAP unknown.runtime.fieldgrid.test 127.0.0.1',
          'MAP platform.runtime.fieldgrid.test 127.0.0.1',
        ].join(','),
      ],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  workers: 1,
});
