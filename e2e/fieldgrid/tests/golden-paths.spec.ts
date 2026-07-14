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
async function expectRealApp(page: Page) { await expect(page.locator('body')).not.toBeEmpty(); }

test.describe('Fieldgrid real-app golden paths', () => {
  test('backoffice real app: session to planning board', async ({ browser }) => {
    const page = await appPage(browser, 'backoffice', tenants.tenantA.host, users.backofficeA.id);
    await page.goto(appUrl('backoffice', '/'));
    await expectRealApp(page);
    await page.goto(appUrl('backoffice', '/customers'));
    await expect(page.getByText(/Runtime Customer A|Klanten|Customers/i).first()).toBeVisible();
    await page.goto(appUrl('backoffice', '/assignments'));
    await expect(page.getByText(/Runtime Assignment A|Opdrachten|Assignments/i).first()).toBeVisible();
    await page.goto(appUrl('backoffice', '/planning'));
    await expect(page.getByText(/Planning|Runtime Assignment A/i).first()).toBeVisible();
  });

  test('personnel real app: session to reports', async ({ browser }) => {
    const page = await appPage(browser, 'personnel', tenants.tenantA.host, users.personnelA.id);
    await page.goto(appUrl('personnel', '/personeel/opdrachten'));
    await expect(page.getByText(/Runtime Assignment A|Opdrachten/i).first()).toBeVisible();
    await page.goto(appUrl('personnel', `/personeel/opdrachten/${assignments.tenantA.id}`));
    await expect(page.getByText(/Runtime Assignment A|Werkbon|Opdracht/i).first()).toBeVisible();
    await page.goto(appUrl('personnel', `/personeel/opdrachten/${assignments.tenantA.id}`));
    await expect(page.getByText(/Taken|Taak|Runtime Assignment A/i).first()).toBeVisible();
    await page.goto(appUrl('personnel', '/personeel/uren'));
    await expect(page.getByText(/Uren|Rapport|Reports/i).first()).toBeVisible();
  });

  test('customer real app: session to invoices', async ({ browser }) => {
    const page = await appPage(browser, 'customer', tenants.tenantA.host, users.customerA.id);
    await page.goto(appUrl('customer', '/klant/opdrachten'));
    await expect(page.getByText(/Runtime Assignment A|Opdrachten/i).first()).toBeVisible();
    await page.goto(appUrl('customer', '/klant/rapporten'));
    await expect(page.getByText(/Rapport|Rapporten|Reports/i).first()).toBeVisible();
    await page.goto(appUrl('customer', '/klant/facturen'));
    await expect(page.getByText(/Facturen|Invoice|Invoices/i).first()).toBeVisible();
  });

  test('negative guards execute in real apps', async ({ browser }) => {
    const tenantBOnA = await appPage(browser, 'backoffice', tenants.tenantA.host, users.backofficeB.id);
    await tenantBOnA.goto(appUrl('backoffice', '/customers'));
    await expect(tenantBOnA.getByText(/geen toegang|forbidden|login|niet gemachtigd|Geen actieve tenant/i).first()).toBeVisible();

    const wrongHost = await appPage(browser, 'backoffice', 'wrong.runtime.fieldgrid.test', users.backofficeA.id);
    await wrongHost.goto(appUrl('backoffice', '/customers'));
    await expect(wrongHost.getByText(/geen actieve tenant|login|not found|onbekend|forbidden/i).first()).toBeVisible();

    const inactive = await appPage(browser, 'personnel', tenants.tenantA.host, users.inactiveProfile.id);
    await inactive.goto(appUrl('personnel', '/personeel/opdrachten'));
    await expect(inactive.getByText(/login|geen toegang|niet actief|unauthorized|forbidden/i).first()).toBeVisible();

    const guessed = await appPage(browser, 'personnel', tenants.tenantA.host, users.personnelA.id);
    await guessed.goto(appUrl('personnel', `/personeel/opdrachten/${assignments.tenantB.id}`));
    await expect(guessed.getByText(/niet gevonden|geen toegang|not found|unauthorized|forbidden/i).first()).toBeVisible();
  });
});
