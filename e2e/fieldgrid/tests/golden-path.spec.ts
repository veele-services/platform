import { expect, test, type Page, type Response } from '@playwright/test';

const tenantAHost = 'tenant-a.runtime.fieldgrid.test';
const tenantBHost = 'tenant-b.runtime.fieldgrid.test';
const platformHost = 'platform.fieldgrid.nl';
const suspendedHost = 'suspended.runtime.fieldgrid.test';
const unknownHost = 'unknown.runtime.fieldgrid.test';
const tenantAAssignmentId = '70000000-0000-4000-8000-000000000001';
const tenantBAssignmentId = '70000000-0000-4000-8000-000000000002';

function backofficeUrl(path: string, host = tenantAHost) {
  return `http://${host}:9321${path}`;
}

function personnelUrl(path: string, host = tenantAHost) {
  return `http://${host}:9322${path}`;
}

function customerUrl(path: string, host = tenantAHost) {
  return `http://${host}:9323${path}`;
}

async function useIdentity(page: Page, userId: string, host = tenantAHost) {
  await page.context().clearCookies();
  await page.context().addCookies([{ name: 'fieldgrid_e2e_auth_user', value: userId, domain: host, path: '/' }]);
}

async function expectRealApp(page: Page) {
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator('body')).not.toContainText('Fieldgrid E2E');
}

async function expectDeniedOrLogin(page: Page, response: Response | null) {
  const status = response?.status() ?? 0;
  if ([401, 403, 404, 302, 307].includes(status) || /login/.test(page.url())) return;
  await expect(page.locator('body')).toContainText(/Toegang geweigerd|Geen toegang|Geen platformtoegang|Geen actieve organisatietoegang|Pagina niet gevonden|Unauthorized|Forbidden|Niet ingelogd/i);
}

test.describe.configure({ mode: 'serial' });

test('1. Backoffice', async ({ page }) => {
  await useIdentity(page, '20000000-0000-4000-8000-000000000102');
  await page.goto(backofficeUrl('/'));
  await expectRealApp(page);
  await page.goto(backofficeUrl('/customers'));
  await expect(page.locator('main')).toContainText('Runtime Customer A');
  await expect(page.locator('main')).not.toContainText('Runtime Customer B');
  await page.goto(backofficeUrl('/assignments'));
  await expect(page.locator('main')).toContainText('Runtime Assignment A');
  await expect(page.locator('main')).not.toContainText('Runtime Assignment B');
  await page.goto(backofficeUrl('/planning'));
  await expect(page.locator('main')).toContainText(/Planbord|Werkbon-wachtrij/);
  await expect(page.locator('main')).toContainText(/Personnel A, Runtime|Runtime Personnel A/);
  await expect(page.locator('main')).not.toContainText(/Runtime Assignment B|RTB-A001|Personnel B/i);
});

test('2. Platform administration', async ({ page }) => {
  await useIdentity(page, '20000000-0000-4000-8000-000000000002', platformHost);
  await page.goto(backofficeUrl('/platform', platformHost));
  await expectRealApp(page);
  await expect(page.locator('main')).toContainText(/Platform|Tenant|Organisatie|Beheer/);
  await useIdentity(page, '20000000-0000-4000-8000-000000000102', platformHost);
  const denied = await page.goto(backofficeUrl('/platform', platformHost));
  await expectDeniedOrLogin(page, denied);
  await expect(page.locator('body')).not.toContainText('Runtime Customer B');
});

test('3. Personnel PWA', async ({ page }) => {
  await useIdentity(page, '20000000-0000-4000-8000-000000000104');
  await page.goto(personnelUrl('/personeel/opdrachten'));
  await expectRealApp(page);
  await expect(page.locator('main')).toContainText(/Runtime Assignment A|RTA-A001/);
  await expect(page.locator('main')).not.toContainText(/Runtime Assignment B|RTB-A001/);
  await page.goto(personnelUrl(`/personeel/opdrachten/${tenantAAssignmentId}`));
  await expect(page.locator('main')).toContainText(/Runtime Assignment A|RTA-A001|Taak|Taken/);
  await page.goto(personnelUrl('/personeel/uren'));
  await expect(page.locator('main')).toContainText(/Uren|Rapport|Werkbon/i);
});

test('4. Customer PWA', async ({ page }) => {
  await useIdentity(page, '20000000-0000-4000-8000-000000000105');
  await page.goto(customerUrl('/klant/opdrachten'));
  await expectRealApp(page);
  await expect(page.locator('main')).toContainText(/Runtime Assignment A|RTA-A001/);
  await expect(page.locator('main')).not.toContainText(/Runtime Assignment B|RTB-A001|internal-only/i);
  await page.goto(customerUrl('/klant/rapporten'));
  await expect(page.locator('main')).toContainText(/Runtime approved report A|Rapport|Goedgekeurd/);
  await page.goto(customerUrl('/klant/facturen'));
  await expect(page.locator('main')).toContainText(/RTA-INV-001|Factuur|Invoice/);
});

test('5. Negative guards', async ({ page }) => {
  await useIdentity(page, '20000000-0000-4000-8000-000000000202', tenantAHost);
  let response = await page.goto(backofficeUrl('/customers'));
  await expectDeniedOrLogin(page, response);
  await expect(page.locator('body')).not.toContainText('Runtime Customer A');
  await useIdentity(page, '20000000-0000-4000-8000-000000000102', unknownHost);
  response = await page.goto(backofficeUrl('/', unknownHost));
  await expectDeniedOrLogin(page, response);
  await useIdentity(page, '20000000-0000-4000-8000-000000000106', tenantAHost);
  response = await page.goto(personnelUrl('/personeel/opdrachten'));
  await expectDeniedOrLogin(page, response);
  await useIdentity(page, '20000000-0000-4000-8000-000000000401', suspendedHost);
  response = await page.goto(backofficeUrl('/', suspendedHost));
  await expectDeniedOrLogin(page, response);
  await useIdentity(page, '20000000-0000-4000-8000-000000000104', tenantAHost);
  response = await page.goto(personnelUrl(`/personeel/opdrachten/${tenantBAssignmentId}`));
  await expectDeniedOrLogin(page, response);
  await expect(page.locator('body')).not.toContainText('Runtime Assignment B');
});
