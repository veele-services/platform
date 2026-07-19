import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const tenantHost = 'tenant-a.runtime.fieldgrid.test';
const assignmentId = '70000000-0000-4000-8000-000000000001';
const artifactDir = join(process.cwd(), 'artifacts', 'fieldgrid-playwright', 'accessibility');

async function useIdentity(page: Page, userId: string) {
  await page.context().clearCookies();
  await page.context().addCookies([{ name: 'fieldgrid_e2e_auth_user', value: userId, domain: tenantHost, path: '/' }]);
}

async function scan(page: Page, id: string, viewport: 'desktop' | 'mobile') {
  await page.setViewportSize(viewport === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await page.reload();
  const startedAt = new Date().toISOString();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const violations = result.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''));
  const record = {
    schemaVersion: '1.0.0',
    testId: id,
    viewport,
    url: new URL(page.url()).pathname,
    startedAt,
    finishedAt: new Date().toISOString(),
    status: violations.length === 0 ? 'passed' : 'failed',
    ruleset: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    seriousOrCriticalViolations: violations.length,
    keyboardFailures: 0,
    violations: violations.map(({ id: ruleId, impact, help, nodes }) => ({
      ruleId,
      impact,
      help,
      targets: nodes.map((node) => node.target),
    })),
  };
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(artifactDir, `${id.toLowerCase()}-${viewport}.json`), `${JSON.stringify(record, null, 2)}\n`);
  return violations;
}

test('FG-P2D-A11Y-BO backoffice planboard axe, keyboard, focus and dialog', async ({ page }) => {
  await useIdentity(page, '20000000-0000-4000-8000-000000000102');
  await page.goto(`http://${tenantHost}:9321/planning`);
  await expect(page.locator('main')).toContainText(/Planbord|Werkbon-wachtrij/);
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).not.toHaveCount(0);
  const violations = [
    ...(await scan(page, 'FG-P2D-A11Y-BO', 'desktop')),
    ...(await scan(page, 'FG-P2D-A11Y-BO', 'mobile')),
  ];

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`http://${tenantHost}:9321/assignments/${assignmentId}?tab=gegevens`);
  const personnelCard = page.getByRole('heading', { name: 'Medewerkers' }).locator('..');
  await personnelCard.locator('li').filter({ hasText: 'Phase2 Personnel A' }).getByRole('button', { name: 'Verwijderen' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Reden voor ontkoppelen' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(violations, 'backoffice desktop/mobile serious/critical axe violations').toEqual([]);
});

test('FG-P2D-A11Y-PERSONNEL personnel assignment axe and keyboard', async ({ page }) => {
  await useIdentity(page, '20000000-0000-4000-8000-000000000104');
  await page.goto(`http://${tenantHost}:9322/personeel/opdrachten/${assignmentId}`);
  await expect(page.locator('main')).toContainText(/Runtime Assignment A|RTA-A001/);
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).not.toHaveCount(0);
  const violations = [...(await scan(page, 'FG-P2D-A11Y-PERSONNEL', 'desktop')), ...(await scan(page, 'FG-P2D-A11Y-PERSONNEL', 'mobile'))];
  expect(violations, 'personnel desktop/mobile serious/critical axe violations').toEqual([]);
});

test('FG-P2D-A11Y-CUSTOMER customer assignment axe and keyboard', async ({ page }) => {
  await useIdentity(page, '20000000-0000-4000-8000-000000000105');
  await page.goto(`http://${tenantHost}:9323/klant/opdrachten`);
  await expect(page.locator('main')).toContainText(/Runtime Assignment A|RTA-A001/);
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).not.toHaveCount(0);
  const violations = [...(await scan(page, 'FG-P2D-A11Y-CUSTOMER', 'desktop')), ...(await scan(page, 'FG-P2D-A11Y-CUSTOMER', 'mobile'))];
  expect(violations, 'customer desktop/mobile serious/critical axe violations').toEqual([]);
});

test('FG-P2D-A11Y-RECOVERY credential recovery labels, errors, axe and mobile', async ({ page }) => {
  await page.goto(`http://${tenantHost}:9323/klant/wachtwoord-vergeten`);
  await expect(page.getByLabel('E-mailadres')).toBeVisible();
  await page.getByLabel('E-mailadres').fill('customer.a@example.com');
  await page.getByLabel('E-mailadres').focus();
  await expect(page.getByLabel('E-mailadres')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Herstelcode versturen' })).toBeFocused();
  await page.getByRole('button', { name: 'Herstelcode versturen' }).click();
  const code = page.getByLabel('Herstelcode');
  await expect(code).toBeVisible();
  await code.fill('000000');
  await page.getByRole('button', { name: 'Code controleren' }).click();
  await expect(page.locator('#code-error')).toHaveAttribute('role', 'alert');
  await expect(code).toHaveAttribute('aria-invalid', 'true');
  await expect(code).toHaveAttribute('aria-describedby', 'code-error');
  const violations = [...(await scan(page, 'FG-P2D-A11Y-RECOVERY', 'desktop')), ...(await scan(page, 'FG-P2D-A11Y-RECOVERY', 'mobile'))];
  expect(violations, 'recovery desktop/mobile serious/critical axe violations').toEqual([]);
});
