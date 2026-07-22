import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const tenantHost = 'tenant-a.runtime.fieldgrid.test';
const assignmentId = '70000000-0000-4000-8000-000000000001';
const adminUserId = '20000000-0000-4000-8000-000000000102';
const participantOneUserId = '20000000-0000-4000-8000-000000000104';
const participantTwoUserId = '20000000-0000-4000-8000-000000000107';
const customerUserId = '20000000-0000-4000-8000-000000000105';

const eventually = expect.configure({ timeout: 45_000 });

function backofficeUrl(path: string) {
  const suffix = path === '/' ? '' : path;
  return `http://${tenantHost}:9321/admin${suffix}`;
}

function personnelUrl(path: string) {
  return `http://${tenantHost}:9322${path}`;
}

function customerUrl(path: string) {
  return `http://${tenantHost}:9323${path}`;
}

async function identityContext(browser: Browser, userId: string): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.addCookies(['/admin', '/personeel', '/klant'].map((path) => ({
    name: 'fieldgrid_e2e_auth_user',
    value: userId,
    domain: tenantHost,
    path,
  })));
  return context;
}

async function goEnRouteAndStart(page: Page) {
  await page.goto(personnelUrl(`/personeel/opdrachten/${assignmentId}`));
  await eventually(page.locator('main')).toContainText(/Runtime Assignment A|RTA-A001/);

  await page.getByRole('button', { name: 'Onderweg' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Onderweg melden' }).click();
  await eventually(page.getByRole('button', { name: 'Start' })).toBeEnabled();

  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start werkzaamheden' }).click();
  await eventually(page.locator('main')).toContainText(/Gestart|Werkelijk/);
}

async function completeParticipant(page: Page) {
  await page.getByRole('button', { name: 'Afronden' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ja' }).click();
  await eventually(page).toHaveURL(/\/afronden\?result=completed/u);
  const completeButton = page.getByRole('button', { name: 'Definitief gereedmelden' });
  await eventually(completeButton).toBeEnabled();
  await completeButton.click();
  await eventually(page).toHaveURL(new RegExp(`/personeel/opdrachten/${assignmentId}$`, 'u'));
  await eventually(page.locator('main')).toContainText(/Afgerond|Werkelijk/);
}

test.describe.configure({ mode: 'serial' });

test('durable unassignment, reassignment, multi-person execution and actual-time projection', async ({ browser }) => {
  test.setTimeout(180_000);
  const adminContext = await identityContext(browser, adminUserId);
  const participantOneContext = await identityContext(browser, participantOneUserId);
  const participantTwoContext = await identityContext(browser, participantTwoUserId);
  const customerContext = await identityContext(browser, customerUserId);
  const admin = await adminContext.newPage();
  const participantOne = await participantOneContext.newPage();
  const participantTwo = await participantTwoContext.newPage();
  const customer = await customerContext.newPage();

  await participantTwo.goto(personnelUrl(`/personeel/opdrachten/${assignmentId}`));
  await eventually(participantTwo.locator('main')).toContainText(/Runtime Assignment A|RTA-A001/);

  await admin.goto(backofficeUrl(`/assignments/${assignmentId}?tab=gegevens`));
  const personnelCard = admin.getByRole('heading', { name: 'Medewerkers' }).locator('..');
  const secondParticipantRow = personnelCard.locator('li').filter({ hasText: 'Phase2 Personnel A' });
  await secondParticipantRow.getByRole('button', { name: 'Verwijderen' }).click();
  await admin.getByRole('textbox', { name: 'Reden voor ontkoppelen' }).fill('E2E: planning tijdelijk gewijzigd');
  await admin.getByRole('alertdialog').getByRole('button', { name: 'Ontkoppelen' }).click();
  await eventually(personnelCard).not.toContainText('Phase2 Personnel A');

  const deniedAfterUnassignment = await participantTwo.goto(personnelUrl(`/personeel/opdrachten/${assignmentId}`));
  expect([200, 404]).toContain(deniedAfterUnassignment?.status() ?? 0);
  await eventually(participantTwo.locator('body')).toContainText(/Pagina niet gevonden|Niet gevonden|404/i);

  await personnelCard.getByRole('combobox').click();
  await admin.getByRole('option', { name: /Personnel A, Phase2/ }).click();
  await personnelCard.getByRole('button', { name: 'Medewerker koppelen' }).click();
  await eventually(personnelCard).toContainText('Phase2 Personnel A');

  await participantTwo.goto(personnelUrl(`/personeel/opdrachten/${assignmentId}`));
  await eventually(participantTwo.locator('main')).toContainText(/Runtime Assignment A|RTA-A001/);

  await goEnRouteAndStart(participantOne);
  await goEnRouteAndStart(participantTwo);

  await completeParticipant(participantOne);
  await admin.reload({ waitUntil: 'domcontentloaded' });
  await eventually(admin.locator('main')).toContainText(/In uitvoering|Werkelijk/);

  await completeParticipant(participantTwo);
  await admin.reload({ waitUntil: 'domcontentloaded' });
  await eventually(admin.locator('main')).toContainText(/Afgerond|Werkelijk/);
  await eventually(admin.locator('main')).toContainText(/Gepland/);

  await customer.goto(customerUrl('/klant/opdrachten'), { waitUntil: 'domcontentloaded' });
  await eventually(customer.locator('main')).toContainText('Runtime Assignment A');
  await eventually(customer.locator('main')).toContainText('Werkelijk');
  await eventually(customer.locator('main')).toContainText('Gepland');

  await Promise.all([
    adminContext.close(),
    participantOneContext.close(),
    participantTwoContext.close(),
    customerContext.close(),
  ]);
});
