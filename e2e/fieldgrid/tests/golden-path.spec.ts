import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('1. Backoffice', async ({ page }) => {
  await page.context().addCookies([{ name: 'fieldgrid_e2e_auth_user', value: '20000000-0000-4000-8000-000000000102', domain: '127.0.0.1', path: '/' }]);
  await page.goto('http://127.0.0.1:9321/');
  await expect(page.locator('main')).toContainText('Backoffice dashboard');
  await expect(page.locator('main')).toContainText('Runtime Tenant A Customer');
  await expect(page.locator('main')).toContainText('Runtime Tenant A Assignment');
  await expect(page.locator('main')).toContainText('planning board');
  await expect(page.locator('main')).not.toContainText('Runtime Tenant B Customer');
});

test('2. Platform administration', async ({ page }) => {
  await page.context().addCookies([{ name: 'fieldgrid_e2e_auth_user', value: '20000000-0000-4000-8000-000000000001', domain: '127.0.0.1', path: '/' }]);
  await page.goto('http://127.0.0.1:9321/platform');
  await expect(page.locator('main')).toContainText('platform identity reaches platform surface');
  await page.context().clearCookies();
  await page.context().addCookies([{ name: 'fieldgrid_e2e_auth_user', value: '20000000-0000-4000-8000-000000000102', domain: '127.0.0.1', path: '/' }]);
  const response = await page.goto('http://127.0.0.1:9321/platform');
  expect(response?.status()).toBe(403);
});

test('3. Personnel', async ({ page }) => {
  await page.context().addCookies([{ name: 'fieldgrid_e2e_auth_user', value: '20000000-0000-4000-8000-000000000104', domain: '127.0.0.1', path: '/' }]);
  await page.goto('http://127.0.0.1:9322/personeel/assignments/70000000-0000-4000-8000-000000000001');
  await expect(page.locator('main')).toContainText('assigned Tenant A work visible');
  await expect(page.locator('main')).toContainText('assignment detail');
  await expect(page.locator('main')).toContainText('tasks');
  await expect(page.locator('main')).toContainText('hours report area');
  await expect(page.locator('main')).not.toContainText('Runtime Tenant B Assignment');
});

test('4. Customer', async ({ page }) => {
  await page.context().addCookies([{ name: 'fieldgrid_e2e_auth_user', value: '20000000-0000-4000-8000-000000000105', domain: '127.0.0.1', path: '/' }]);
  await page.goto('http://127.0.0.1:9323/klant');
  await expect(page.locator('main')).toContainText('Customer Tenant A assignments');
  await expect(page.locator('main')).toContainText('Approved runtime report A');
  await expect(page.locator('main')).toContainText('INV-RUNTIME-A-001');
  await expect(page.locator('main')).not.toContainText('INV-RUNTIME-B-001');
});

test('5. Negative guards', async ({ page, request }) => {
  let response = await request.get('http://127.0.0.1:9324/nope');
  expect(response.status()).toBe(404);
  response = await page.goto('http://127.0.0.1:9322/personeel/assignments/70000000-0000-4000-8000-000000000002');
  expect(response?.status()).toBe(404);
  await page.context().addCookies([{ name: 'fieldgrid_e2e_auth_user', value: '20000000-0000-4000-8000-000000000106', domain: '127.0.0.1', path: '/' }]);
  response = await page.goto('http://127.0.0.1:9322/personeel');
  expect(response?.status()).toBe(403);
  await expect(page.locator('main')).not.toContainText('Runtime Tenant B Assignment');
});
