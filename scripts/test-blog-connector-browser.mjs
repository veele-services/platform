import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, expect } from '@playwright/test';

function localOrigin(value) {
  const url = new URL(value);
  assert.equal(url.protocol, 'http:');
  assert.ok(['localhost', '127.0.0.1', 'www.localhost'].includes(url.hostname));
  assert.ok(url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash);
  return url.origin;
}

async function capturePage(page, directory, name) {
  // Resizing starts the existing platform sidebar's CSS transition.
  await page.waitForTimeout(450);
  const shade = page.getByRole('button', { name: 'Sluit navigatie', exact: true });
  if (await shade.count()) await page.getByRole('button', { name: 'Sluit menu', exact: true }).click();
  await page.waitForTimeout(450);
  if (page.viewportSize().width <= 680) {
    await expect(shade).toHaveCount(0);
    assert.ok(await page.locator('.fg-sidebar').evaluate(element => element.getBoundingClientRect().right <= 1), 'Mobile platform menu is closed before capturing content');
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: `${directory}/${name}`, fullPage: true });
}

/** Real authenticated Next.js page and read-only backend checks. Browser API mocks
 * exercise client recovery states; they are explicitly separate from the real
 * SocialHero pairing/publishing acceptance runner. Never save a trace or session.
 */
export async function verifyBlogConnectorUI(config) {
  const platform = localOrigin(config.platformOrigin);
  const publicOrigin = localOrigin(config.publicOrigin ?? `http://127.0.0.1:${new URL(platform).port}`);
  assert.ok(config.storageState, 'Use the isolated administrator session');
  const directory = resolve(config.directory ?? '/tmp/fieldgrid-connector-browser');
  await mkdir(directory, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(config.browserExecutable ? { executablePath: config.browserExecutable } : {}) });
  const results = [], errors = [];
  try {
    const context = await browser.newContext({ storageState: config.storageState, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', viewport: { width: 1440, height: 1050 } });
    const status = await context.request.get(`${platform}/api/blog-admin/connection`);
    assert.equal(status.status(), 200);
    const live = await status.json();
    assert.ok(['unconfigured', 'disconnected', 'pending', 'active', 'expired', 'rejected'].includes(live.connection?.status));
    assert.equal(typeof live.connection.allowDraft, 'boolean');
    assert.equal(typeof live.connection.allowPublish, 'boolean');
    const safeKeys = ['status', 'environment', 'siteId', 'siteName', 'origin', 'socialHeroOrigin', 'allowDraft', 'allowPublish', 'policyConfigured', 'policyUpdatedAt', 'policyUpdatedBy', 'scopes', 'connectionId', 'destinationId', 'expiresAt', 'lastCheckedAt'];
    assert.ok(Object.keys(live.connection).every(key => safeKeys.includes(key)), 'Real status contains only the safe documented projection');
    const anonymous = await browser.newContext();
    assert.equal((await anonymous.request.get(`${platform}/api/blog-admin/connection`)).status(), 403);
    // The explicit IP alias overrides only public blog routes in the local harness.
    // Other IP paths may resolve as platform paths and must still deny anonymously.
    assert.ok([403, 404].includes((await anonymous.request.get(`${publicOrigin}/api/blog-admin/connection`)).status()));
    assert.equal((await anonymous.request.get(`${publicOrigin}/api/blog-admin/connection`, { headers: { host: `www.localhost:${new URL(publicOrigin).port}` } })).status(), 404, 'The actual marketing hostname hides the private API');
    await anonymous.close();
    results.push('Real authenticated safe status, anonymous denial and marketing-host private API isolation');

    const page = await context.newPage();
    async function capture(name) { await capturePage(page, directory, name); }
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install();
    const base = { status: 'disconnected', environment: 'staging', siteId: 'fieldgrid', siteName: 'Fieldgrid', origin: 'https://www.staging.fieldgrid.nl', socialHeroOrigin: 'https://socialhero-staging.dgwebservices.nl', allowDraft: true, allowPublish: true, policyConfigured: false, scopes: ['read', 'draft', 'publish'] };
    let state = { ...base }, pairAttempts = 0, verifyAttempts = 0, statusRequests = 0;
    let failClaimOnce = true, rejectPair = false;
    const writes = [], fixtureCode = 'one-time-browser-fixture';
    await page.route('**/api/blog-admin/connection', async route => {
      const request = route.request();
      assert.equal(new URL(request.url()).search, '');
      if (request.method() === 'GET') { statusRequests++; return route.fulfill({ json: { connection: state } }); }
      const body = request.postDataJSON();
      writes.push(body.action);
      if (body.action === 'pair') {
        pairAttempts++;
        assert.equal(body.code, fixtureCode);
        assert.equal(body.allowDraft, false);
        assert.equal(body.allowPublish, true);
        if (rejectPair) return route.fulfill({ status: 400, json: { code: 'INVALID_PAIRING_CODE', message: 'raw-provider-data-must-not-render', connection: state } });
        state = { ...state, allowDraft: body.allowDraft, allowPublish: body.allowPublish, policyConfigured: true };
        if (failClaimOnce) {
          failClaimOnce = false;
          state = { ...state, status: 'pending', connectionId: 'fixture-pending', expiresAt: '2026-11-26T15:10:00.000Z' };
          return route.fulfill({ status: 503, json: { code: 'TEMPORARILY_UNAVAILABLE', message: 'raw-provider-data-must-not-render' } });
        }
        state = { ...state, status: 'active', connectionId: 'fixture-active' };
      } else if (body.action === 'verify') {
        verifyAttempts++;
        state = { ...state, status: 'active', connectionId: 'fixture-active', lastCheckedAt: '2026-11-26T15:00:00.000Z' };
      } else if (body.action === 'policy') {
        assert.equal(typeof body.allowDraft, 'boolean');
        assert.equal(typeof body.allowPublish, 'boolean');
        state = { ...state, allowDraft: body.allowDraft, allowPublish: body.allowPublish, policyConfigured: true };
      } else if (body.action === 'check') state = { ...state, lastCheckedAt: '2026-11-26T15:01:00.000Z' };
      else if (body.action === 'disconnect') state = { ...base, allowDraft: state.allowDraft, allowPublish: state.allowPublish, policyConfigured: true };
      else assert.fail('Unexpected connector action');
      return route.fulfill({ json: { connection: state } });
    });
    await page.goto(`${platform}/platform/blog/socialhero`, { waitUntil: 'networkidle' });
    await expect(page.getByText('Niet gekoppeld', { exact: true })).toBeVisible();
    assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
    const draftPermission = page.getByRole('checkbox', { name: 'SocialHero mag concepten aanleveren', exact: true });
    const publishPermission = page.getByRole('checkbox', { name: 'SocialHero mag automatisch publiceren', exact: true });
    await expect(draftPermission).toBeChecked();
    await expect(publishPermission).toBeChecked();
    await expect(publishPermission).toBeEnabled();
    await expect(page.getByText('SocialHero mag artikelen zelfstandig live zetten volgens de campagneplanning en de ingestelde goedkeuringsmodus.', { exact: true })).toBeVisible();
    await expect(page.getByText('Staging blijft buiten zoekmachines.', { exact: false })).toBeVisible();
    await capture(`disconnected-desktop.png`);
    await draftPermission.uncheck();
    await page.getByLabel('Eenmalige koppelcode', { exact: true }).fill(fixtureCode);
    await page.getByRole('button', { name: 'Verbinden', exact: true }).click();
    await expect(page.getByText('SocialHero is tijdelijk niet bereikbaar.', { exact: false })).toBeVisible();
    await expect(page.getByLabel('Eenmalige koppelcode', { exact: true })).toHaveValue(fixtureCode);
    await expect(draftPermission).not.toBeChecked();
    await expect(publishPermission).toBeChecked();
    await expect(page.getByText('raw-provider-data-must-not-render')).toHaveCount(0);
    await page.getByRole('button', { name: 'Opnieuw proberen', exact: true }).click();
    await expect(page.getByText('Gekoppeld', { exact: true })).toBeVisible();
    assert.equal(pairAttempts, 1);
    assert.equal(verifyAttempts, 1);
    assert.ok(statusRequests >= 2);
    await expect(page.getByLabel('Eenmalige koppelcode', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Publiceren toegestaan', { exact: true })).toBeVisible();
    assert.equal(state.allowPublish, true, 'First-pair publication permission needs no extra post-pair consent');
    results.push('UI mock: both first-pair permissions default on; a draft opt-out and code survive a temporary failure; retry resumes verification without a duplicate claim');

    await draftPermission.check();
    await publishPermission.uncheck();
    await expect(page.getByText('Publiceren toegestaan', { exact: true })).toBeVisible();
    await expect(page.getByText('Deze wijzigingen zijn nog niet opgeslagen.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Toestemmingen opslaan', exact: true }).click();
    await expect(page.getByText('Publiceren uitgeschakeld', { exact: true })).toBeVisible();
    await expect(page.getByText('Concepten toegestaan', { exact: true })).toBeVisible();
    assert.equal(writes.filter(action => action === 'policy').length, 1);
    await page.getByRole('button', { name: 'Verbinding controleren', exact: true }).click();
    await expect(page.getByText('De verbinding is gecontroleerd.', { exact: true })).toBeVisible();
    await capture(`active-desktop.png`);
    results.push('UI mock: later draft/publication changes take effect only after an explicit policy save');

    await page.getByRole('button', { name: 'Opnieuw koppelen', exact: true }).click();
    await page.getByLabel('Eenmalige koppelcode', { exact: true }).fill(fixtureCode);
    await page.clock.fastForward(120_001);
    await expect(page.getByLabel('Eenmalige koppelcode', { exact: true })).toHaveValue('');
    await draftPermission.uncheck();
    await publishPermission.check();
    await page.getByLabel('Eenmalige koppelcode', { exact: true }).fill(fixtureCode);
    rejectPair = true;
    await page.getByRole('button', { name: 'Verbinden', exact: true }).click();
    await expect(page.getByText('Deze koppelcode is ongeldig of al gebruikt.', { exact: false })).toBeVisible();
    await expect(page.getByLabel('Eenmalige koppelcode', { exact: true })).toHaveCount(0);
    await expect(page.getByText('raw-provider-data-must-not-render')).toHaveCount(0);
    assert.ok(!JSON.stringify(await context.storageState()).includes(fixtureCode));
    assert.ok(!page.url().includes(fixtureCode));
    results.push('UI mock: code clears within two minutes and on terminal failure; no code in URL/browser storage or screenshots');

    await page.getByRole('button', { name: 'Ontkoppelen', exact: true }).click();
    await expect(page.getByText('Koppeling ontkoppelen?', { exact: true })).toBeVisible();
    assert.equal(state.status, 'active');
    await page.getByRole('button', { name: 'Annuleren', exact: true }).click();
    assert.equal(state.status, 'active');
    await page.getByRole('button', { name: 'Ontkoppelen', exact: true }).click();
    await page.getByRole('button', { name: 'Ontkoppeling bevestigen', exact: true }).click();
    await expect(page.getByText('Niet gekoppeld', { exact: true })).toBeVisible();
    await expect(publishPermission).not.toBeChecked();
    results.push('UI mock: disconnect requires confirmation and preserves the saved publication opt-out before reconnect');

    for (const [name, viewport] of [['mobile', { width: 390, height: 844 }], ['small-mobile', { width: 320, height: 740 }]]) {
      await page.setViewportSize(viewport);
      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.getByText('Niet gekoppeld', { exact: true })).toBeVisible();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} fits without horizontal overflow`);
      await capture(`disconnected-${name}.png`);
    }
    state = { ...base, status: 'pending', connectionId: 'fixture-pending', expiresAt: '2026-11-26T15:10:00.000Z' };
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByText('Bevestiging nodig', { exact: true })).toBeVisible();
    await expect(publishPermission).toHaveCount(0);
    await capture(`pending-mobile.png`);
    await page.getByRole('button', { name: 'Verificatie hervatten', exact: true }).click();
    await expect(page.getByText('Gekoppeld', { exact: true })).toBeVisible();
    await capture(`active-mobile.png`);
    state = { ...base, status: 'unconfigured', socialHeroOrigin: null };
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByText('Nog niet ingesteld', { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel('Eenmalige koppelcode', { exact: true })).toHaveCount(0);
    await expect(publishPermission).toHaveCount(0);
    results.push('UI mocks: disconnected, pending, active and unconfigured states fit desktop and 390/320px mobile');
    assert.deepEqual(errors, []);
    const evidence = { passed: true, realBackend: ['Authenticated safe status', 'Anonymous denial', 'Marketing-host private API isolation'], explicitMocks: ['All connector mutations and recovery-state scenarios'], results, screenshotsDirectory: directory, browserErrors: errors.length };
    await writeFile(`${directory}/results.json`, JSON.stringify(evidence, null, 2));
    return evidence;
  } finally { await browser.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.ok(process.argv[2], 'Pass a private isolated browser-fixture configuration file');
  console.log(JSON.stringify(await verifyBlogConnectorUI(JSON.parse(await readFile(process.argv[2], 'utf8'))), null, 2));
}
