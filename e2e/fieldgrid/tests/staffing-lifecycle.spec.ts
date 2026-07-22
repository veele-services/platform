import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const tenantHost = 'tenant-a.runtime.fieldgrid.test';
const assignmentId = '70000000-0000-4000-8000-000000000001';
const adminUserId = '20000000-0000-4000-8000-000000000102';
const participantOneUserId = '20000000-0000-4000-8000-000000000104';
const participantTwoUserId = '20000000-0000-4000-8000-000000000107';
const customerUserId = '20000000-0000-4000-8000-000000000105';
const participantOnePersonnelId = '60000000-0000-4000-8000-000000000001';
const participantTwoPersonnelId = '60000000-0000-4000-8000-000000000107';
const navigationOptions = { waitUntil: 'domcontentloaded' as const, timeout: 120_000 };

const eventually = expect.configure({ timeout: 120_000 });

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

function participantStatus(personnelId: string): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for durable staffing evidence.');

  return execFileSync('psql', [
    databaseUrl,
    '--no-psqlrc',
    '--tuples-only',
    '--no-align',
    '--command',
    `SELECT participant_status
       FROM public.assignment_participant_executions
      WHERE assignment_id = '${assignmentId}'
        AND personnel_id = '${personnelId}'
        AND participant_status <> 'removed'
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
  ], { encoding: 'utf8' }).trim();
}

async function waitForParticipantStatus(personnelId: string, status: string) {
  await expect.poll(() => participantStatus(personnelId), {
    message: `participant ${personnelId} should reach durable status ${status}`,
    timeout: 120_000,
  }).toBe(status);
}

async function loadPersonnelAssignment(page: Page) {
  await page.goto(personnelUrl(`/personeel/opdrachten/${assignmentId}`), navigationOptions);
  await eventually(page.locator('main')).toContainText(/Runtime Assignment A|RTA-A001/);
}

async function goEnRouteAndStart(page: Page, personnelId: string) {
  await loadPersonnelAssignment(page);

  const startButton = page.getByRole('button', { name: 'Start' });
  if (!(await startButton.isEnabled())) {
    const enRouteButton = page.getByRole('button', { name: 'Onderweg' });
    await eventually(enRouteButton).toBeEnabled();
    await enRouteButton.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Onderweg melden' }).click();
    await waitForParticipantStatus(personnelId, 'en_route');
    await loadPersonnelAssignment(page);
  }
  await eventually(page.getByRole('button', { name: 'Start' })).toBeEnabled();

  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start werkzaamheden' }).click();
  await waitForParticipantStatus(personnelId, 'in_progress');
  await loadPersonnelAssignment(page);
  await eventually(page.locator('main')).toContainText(/Gestart|Werkelijk/);
}

async function completeParticipant(page: Page, personnelId: string) {
  await page.getByRole('button', { name: 'Afronden' }).click();
  const completionLink = page.getByRole('dialog').getByRole('link', { name: 'Ja' });
  const completionHref = await completionLink.getAttribute('href');
  expect(completionHref).toMatch(/\/opdrachten\/[^/]+\/afronden\?result=completed$/u);
  await page.goto(new URL(completionHref!, page.url()).toString(), navigationOptions);
  await eventually(page).toHaveURL(/\/afronden\?result=completed/u);
  const completeButton = page.getByRole('button', { name: 'Definitief gereedmelden' });
  await eventually(completeButton).toBeEnabled();
  await completeButton.click();
  await waitForParticipantStatus(personnelId, 'completed');
  await loadPersonnelAssignment(page);
  await eventually(page.locator('main')).toContainText(/Afgerond|Werkelijk/);
}

test.describe.configure({ mode: 'serial' });

test('durable unassignment, reassignment, multi-person execution and actual-time projection', async ({ browser }) => {
  test.setTimeout(600_000);
  const adminContext = await identityContext(browser, adminUserId);
  const participantOneContext = await identityContext(browser, participantOneUserId);
  const participantTwoContext = await identityContext(browser, participantTwoUserId);
  const customerContext = await identityContext(browser, customerUserId);
  const admin = await adminContext.newPage();
  const participantOne = await participantOneContext.newPage();
  const participantTwo = await participantTwoContext.newPage();
  const customer = await customerContext.newPage();

  await loadPersonnelAssignment(participantTwo);

  await admin.goto(backofficeUrl(`/assignments/${assignmentId}?tab=gegevens`), navigationOptions);
  const personnelCard = admin.getByRole('heading', { name: 'Medewerkers' }).locator('..');
  const secondParticipantRow = personnelCard.locator('li').filter({ hasText: 'Phase2 Personnel A' });
  await secondParticipantRow.getByRole('button', { name: 'Verwijderen' }).click();
  await admin.getByRole('textbox', { name: 'Reden voor ontkoppelen' }).fill('E2E: planning tijdelijk gewijzigd');
  await admin.getByRole('alertdialog').getByRole('button', { name: 'Ontkoppelen' }).click();
  await eventually(personnelCard).not.toContainText('Phase2 Personnel A');

  const deniedAfterUnassignment = await participantTwo.goto(
    personnelUrl(`/personeel/opdrachten/${assignmentId}`),
    navigationOptions,
  );
  expect([200, 404]).toContain(deniedAfterUnassignment?.status() ?? 0);
  await eventually(participantTwo.locator('body')).toContainText(/Pagina niet gevonden|Niet gevonden|404/i);

  await personnelCard.getByRole('combobox').click();
  await admin.getByRole('option', { name: /Personnel A, Phase2/ }).click();
  await personnelCard.getByRole('button', { name: 'Medewerker koppelen' }).click();
  await eventually(personnelCard).toContainText('Phase2 Personnel A');

  await loadPersonnelAssignment(participantTwo);

  await goEnRouteAndStart(participantOne, participantOnePersonnelId);
  await goEnRouteAndStart(participantTwo, participantTwoPersonnelId);

  await completeParticipant(participantOne, participantOnePersonnelId);
  await admin.reload(navigationOptions);
  await eventually(admin.locator('main')).toContainText(/In uitvoering|Werkelijk/);

  await completeParticipant(participantTwo, participantTwoPersonnelId);
  await admin.reload(navigationOptions);
  await eventually(admin.locator('main')).toContainText(/Afgerond|Werkelijk/);
  await eventually(admin.locator('main')).toContainText(/Gepland/);

  await customer.goto(customerUrl('/klant/opdrachten'), navigationOptions);
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
