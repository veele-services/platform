import { expect, type Browser, type Page, test } from '@playwright/test';
import { assignments, tenants, users } from '../fixtures/tenants';

const ports = { backoffice: 9321, personnel: 9322, customer: 9323 } as const;
const cookieName = 'fieldgrid_e2e_user_id';

async function appPage(browser: Browser, app: keyof typeof ports, host: string, userId?: string): Promise<Page> {
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-host': host, 'x-forwarded-proto': 'http' } });
  if (userId) {
    await context.addCookies([{ name: cookieName, value: userId, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  }
  return context.newPage();
}
function appUrl(app: keyof typeof ports, path: string) { return `http://127.0.0.1:${ports[app]}${path}`; }
async function expectNotLogin(page: Page) { await expect(page).not.toHaveURL(/\/login/u); }

test.describe('Fieldgrid real-app golden paths', () => {
  test('backoffice real app: dashboard to planning board', async ({ browser }) => {
    const page = await appPage(browser, 'backoffice', tenants.tenantA.host, users.backofficeA.id);
    await page.goto(appUrl('backoffice', '/'));
    await expect(page).toHaveURL(appUrl('backoffice', '/'));
    await expectNotLogin(page);
    await expect(page.getByText(tenants.tenantA.name).first()).toBeVisible();

    await page.goto(appUrl('backoffice', '/customers'));
    await expect(page).toHaveURL(appUrl('backoffice', '/customers'));
    await expect(page.getByText('Runtime Customer A').first()).toBeVisible();
    await expect(page.getByText('Runtime Customer B')).toHaveCount(0);

    await page.goto(appUrl('backoffice', '/assignments'));
    await expect(page).toHaveURL(appUrl('backoffice', '/assignments'));
    await expect(page.getByText(assignments.tenantA.title).first()).toBeVisible();
    await expect(page.getByText(assignments.tenantB.title)).toHaveCount(0);

    await page.goto(appUrl('backoffice', '/planning'));
    await expect(page).toHaveURL(appUrl('backoffice', '/planning'));
    await expect(page.getByText(assignments.tenantA.title).first()).toBeVisible();
    await expect(page.getByText(assignments.tenantB.title)).toHaveCount(0);
  });

  test('platform administration smoke in backoffice app', async ({ browser }) => {
    const page = await appPage(browser, 'backoffice', 'platform.fieldgrid.nl', users.platformAdmin.id);
    await page.goto(appUrl('backoffice', '/platform'));
    await expect(page).toHaveURL(appUrl('backoffice', '/platform'));
    await expectNotLogin(page);
    await expect(page.getByText(/Platform/u).first()).toBeVisible();
  });

  test('personnel real app: assignment detail and hours/report area', async ({ browser }) => {
    const page = await appPage(browser, 'personnel', tenants.tenantA.host, users.personnelA.id);
    await page.goto(appUrl('personnel', '/personeel/opdrachten'));
    await expect(page).toHaveURL(appUrl('personnel', '/personeel/opdrachten'));
    await expect(page.getByText(assignments.tenantA.title).first()).toBeVisible();
    await expect(page.getByText(assignments.tenantB.title)).toHaveCount(0);

    await page.goto(appUrl('personnel', `/personeel/opdrachten/${assignments.tenantA.id}`));
    await expect(page).toHaveURL(appUrl('personnel', `/personeel/opdrachten/${assignments.tenantA.id}`));
    await expect(page.getByText(assignments.tenantA.title).first()).toBeVisible();
    await expect(page.getByText(assignments.tenantB.title)).toHaveCount(0);
    await expect(page.getByText(/Taken/u).first()).toBeVisible();

    await page.goto(appUrl('personnel', '/personeel/uren'));
    await expect(page).toHaveURL(appUrl('personnel', '/personeel/uren'));
    await expect(page.getByText(/Uren/u).first()).toBeVisible();
  });

  test('customer real app: assignments, approved reports, invoices', async ({ browser }) => {
    const page = await appPage(browser, 'customer', tenants.tenantA.host, users.customerA.id);
    await page.goto(appUrl('customer', '/klant/opdrachten'));
    await expect(page).toHaveURL(appUrl('customer', '/klant/opdrachten'));
    await expect(page.getByText(assignments.tenantA.title).first()).toBeVisible();
    await expect(page.getByText(assignments.tenantB.title)).toHaveCount(0);

    await page.goto(appUrl('customer', '/klant/rapporten'));
    await expect(page).toHaveURL(appUrl('customer', '/klant/rapporten'));
    await expect(page.getByText(/Rapporten/u).first()).toBeVisible();

    await page.goto(appUrl('customer', '/klant/facturen'));
    await expect(page).toHaveURL(appUrl('customer', '/klant/facturen'));
    await expect(page.getByText(/Facturen/u).first()).toBeVisible();
    await expect(page.getByText(assignments.tenantB.title)).toHaveCount(0);
  });

  test('negative guards execute in real apps without leaking Tenant B data', async ({ browser }) => {
    const tenantBOnA = await appPage(browser, 'backoffice', tenants.tenantA.host, users.backofficeB.id);
    await tenantBOnA.goto(appUrl('backoffice', '/customers'));
    await expect(tenantBOnA).not.toHaveURL(appUrl('backoffice', '/customers'));
    await expect(tenantBOnA.getByText('Runtime Customer B')).toHaveCount(0);

    const wrongHost = await appPage(browser, 'backoffice', 'wrong.runtime.fieldgrid.test', users.backofficeA.id);
    const wrongHostResponse = await wrongHost.goto(appUrl('backoffice', '/customers'));
    expect(wrongHostResponse?.status()).toBeGreaterThanOrEqual(300);
    await expect(wrongHost.getByText('Runtime Customer A')).toHaveCount(0);

    const inactive = await appPage(browser, 'personnel', tenants.tenantA.host, users.inactivePersonnel.id);
    await inactive.goto(appUrl('personnel', '/personeel/opdrachten'));
    await expect(inactive).not.toHaveURL(appUrl('personnel', '/personeel/opdrachten'));
    await expect(inactive.getByText(assignments.tenantA.title)).toHaveCount(0);

    const suspended = await appPage(browser, 'backoffice', 'suspended.runtime.fieldgrid.test', users.suspendedOwner.id);
    await suspended.goto(appUrl('backoffice', '/customers'));
    await expect(suspended).not.toHaveURL(appUrl('backoffice', '/customers'));
    await expect(suspended.getByText('Runtime Customer A')).toHaveCount(0);

    const guessed = await appPage(browser, 'personnel', tenants.tenantA.host, users.personnelA.id);
    const guessedResponse = await guessed.goto(appUrl('personnel', `/personeel/opdrachten/${assignments.tenantB.id}`));
    expect(guessedResponse?.status()).toBeGreaterThanOrEqual(300);
    await expect(guessed.getByText(assignments.tenantB.title)).toHaveCount(0);
  });
});
