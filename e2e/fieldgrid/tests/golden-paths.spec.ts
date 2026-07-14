import { expect, type Page, test } from '@playwright/test';
import { assignments, tenants, users } from '../fixtures/tenants';

const base = 'http://127.0.0.1:9321';
function url(path: string, host = tenants.tenantA.host) { return `${base}${path}${path.includes('?') ? '&' : '?'}host=${host}`; }
async function login(page: Page, role: 'backoffice' | 'personnel' | 'customer', user = users[`${role}A`]) {
  await page.goto(url(`/?role=${role}`));
  await page.getByLabel('email').fill(user.email);
  await page.getByLabel('password').fill(user.password);
  await page.getByRole('button', { name: 'Login' }).click();
}
async function expectPage(page: Page, name: string) { await expect(page.getByRole('heading', { name })).toBeVisible(); await expect(page.getByTestId('run-id')).toContainText('fg-'); }

test.describe('Fieldgrid Playwright golden path foundation', () => {
  test('backoffice smoke: login to planning board', async ({ page }) => {
    await login(page, 'backoffice');
    await expectPage(page, 'dashboard');
    await page.getByRole('link', { name: 'customer list' }).click();
    await expectPage(page, 'customer list');
    await page.getByRole('link', { name: 'assignment list' }).click();
    await expectPage(page, 'assignment list');
    await page.getByRole('link', { name: 'planning board' }).click();
    await expectPage(page, 'planning board');
  });

  test('personnel smoke: login to reports', async ({ page }) => {
    await login(page, 'personnel');
    await expectPage(page, 'assignment list');
    await page.getByRole('link', { name: 'assignment detail' }).click();
    await expectPage(page, 'assignment detail');
    await page.getByRole('link', { name: 'tasks' }).click();
    await expectPage(page, 'tasks');
    await page.getByRole('link', { name: 'reports' }).click();
    await expectPage(page, 'reports');
  });

  test('customer smoke: login to invoices', async ({ page }) => {
    await login(page, 'customer');
    await expectPage(page, 'assignments');
    await page.getByRole('link', { name: 'reports' }).click();
    await expectPage(page, 'reports');
    await page.getByRole('link', { name: 'invoices' }).click();
    await expectPage(page, 'invoices');
  });

  test('negative access controls', async ({ page }) => {
    await page.goto(url('/?role=backoffice', tenants.tenantA.host));
    await page.getByLabel('email').fill(users.backofficeB.email);
    await page.getByLabel('password').fill(users.backofficeB.password);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByTestId('error')).toContainText('Tenant or role mismatch');

    await page.context().clearCookies();
    await page.goto(url('/dashboard', 'wrong.localhost'));
    await expect(page.getByTestId('error')).toContainText('Unknown tenant host');

    await page.context().clearCookies();
    await page.goto(url('/?role=personnel', tenants.tenantA.host));
    await page.getByLabel('email').fill(users.inactiveA.email);
    await page.getByLabel('password').fill(users.inactiveA.password);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByTestId('error')).toContainText('Profile inactive');

    await login(page, 'personnel');
    await page.goto(`${base}/assignments/${assignments.tenantB.id}`);
    await expect(page.getByTestId('error')).toContainText('Assignment unavailable for tenant');
  });
});
