import { expect, test, type Page } from '@playwright/test';

const tenantAHost = 'tenant-a.runtime.fieldgrid.test';
const tenantBHost = 'tenant-b.runtime.fieldgrid.test';
const platformHost = 'platform.fieldgrid.nl';
const suspendedHost = 'suspended.runtime.fieldgrid.test';
const unknownHost = 'unknown.runtime.fieldgrid.test';
const tenantAAssignmentId = '70000000-0000-4000-8000-000000000001';
const tenantBAssignmentId = '70000000-0000-4000-8000-000000000002';

async function useIdentity(page: Page, userId: string, host = tenantAHost) {
  await page.context().clearCookies();
  await page.context().addCookies([{ name: 'fieldgrid_e2e_auth_user', value: userId, domain: '127.0.0.1', path: '/' }]);
  await page.setExtraHTTPHeaders({ host, 'x-forwarded-host': host, 'x-forwarded-proto': 'http' });
}

async function expectRealApp(page: Page) {
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator('body')).not.toContainText('Fieldgrid E2E');
}

test.describe.configure({ mode: 'serial' });

test('1. Backoffice', async ({ page }) => {
  await useIdentity(page, '20000000-0000-4000-8000-000000000102');
  await page.goto('http://127.0.0.1:9321/');
  await expectRealApp(page);
  await page.goto('http://127.0.0.1:9321/customers');
  await expect(page.locator('main')).toContainText('Runtime Customer A');
  await expect(page.locator('main')).not.toContainText('Runtime Customer B');
  await page.goto('http://127.0.0.1:9321/assignments');
  await expect(page.locator('main')).toContainText('Runtime Assignment A');
  await expect(page.locator('main')).not.toContainText('Runtime Assignment B');
  await page.goto('http://127.0.0.1:9321/planning');
  await expect(page.locator('main')).toContainText(/Runtime Assignment A|RTA-A001/);
});

test('2. Platform administration', async ({ page }) => {
  await useIdentity(page, '20000000-0000-4000-8000-000000000002', platformHost);
  await page.goto('http://127.0.0.1:9321/platform');
  await expectRealApp(page);
  await expect(page.locator('main')).toContainText(/Platform|Tenant|Organisatie|Beheer/);
  await useIdentity(page, '20000000-0000-4000-8000-000000000102', platformHost);
  const denied = await page.goto('http://127.0.0.1:9321/platform');
  expect([401, 403, 404, 302, 307].includes(denied?.status() ?? 0) || /login/.test(page.url())).toBeTruthy();
  await expect(page.locator('body')).not.toContainText('Runtime Customer B');
});

test('3. Personnel PWA', async ({ page }) => {
  await useIdentity(page, '20000000-0000-4000-8000-000000000104');
  await page.goto('http://127.0.0.1:9322/personeel/opdrachten');
  await expectRealApp(page);
  await expect(page.locator('main')).toContainText(/Runtime Assignment A|RTA-A001/);
  await expect(page.locator('main')).not.toContainText(/Runtime Assignment B|RTB-A001/);
  await page.goto(`http://127.0.0.1:9322/personeel/opdrachten/${tenantAAssignmentId}`);
  await expect(page.locator('main')).toContainText(/Runtime Assignment A|RTA-A001|Taak|Taken/);
  await page.goto('http://127.0.0.1:9322/personeel/uren');
  await expect(page.locator('main')).toContainText(/Uren|Rapport|Werkbon/);
});

test('4. Customer PWA', async ({ page }) => {
  await useIdentity(page, '20000000-0000-4000-8000-000000000105');
  await page.goto('http://127.0.0.1:9323/klant/opdrachten');
  await expectRealApp(page);
  await expect(page.locator('main')).toContainText(/Runtime Assignment A|RTA-A001/);
  await expect(page.locator('main')).not.toContainText(/Runtime Assignment B|RTB-A001|internal-only/i);
  await page.goto('http://127.0.0.1:9323/klant/rapporten');
  await expect(page.locator('main')).toContainText(/Runtime approved report A|Rapport|Goedgekeurd/);
  await page.goto('http://127.0.0.1:9323/klant/facturen');
  await expect(page.locator('main')).toContainText(/RTA-INV-001|Factuur|Invoice/);
});

test('5. Negative guards', async ({ page }) => {
  await useIdentity(page, '20000000-0000-4000-8000-000000000202', tenantAHost);
  let response = await page.goto('http://127.0.0.1:9321/customers');
  expect([401, 403, 404, 302, 307].includes(response?.status() ?? 0) || /login/.test(page.url())).toBeTruthy();
  await expect(page.locator('body')).not.toContainText('Runtime Customer A');
  await useIdentity(page, '20000000-0000-4000-8000-000000000102', unknownHost);
  response = await page.goto('http://127.0.0.1:9321/');
  expect([401, 403, 404, 302, 307].includes(response?.status() ?? 0) || /login/.test(page.url())).toBeTruthy();
  await useIdentity(page, '20000000-0000-4000-8000-000000000106', tenantAHost);
  response = await page.goto('http://127.0.0.1:9322/personeel/opdrachten');
  expect([401, 403, 404, 302, 307].includes(response?.status() ?? 0) || /login/.test(page.url())).toBeTruthy();
  await useIdentity(page, '20000000-0000-4000-8000-000000000401', suspendedHost);
  response = await page.goto('http://127.0.0.1:9321/');
  expect([401, 403, 404, 302, 307].includes(response?.status() ?? 0) || /login/.test(page.url())).toBeTruthy();
  await useIdentity(page, '20000000-0000-4000-8000-000000000104', tenantAHost);
  response = await page.goto(`http://127.0.0.1:9322/personeel/opdrachten/${tenantBAssignmentId}`);
  expect([401, 403, 404, 302, 307].includes(response?.status() ?? 0) || /login/.test(page.url())).toBeTruthy();
  await expect(page.locator('body')).not.toContainText('Runtime Assignment B');
});
