import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, expect } from '@playwright/test';

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

/** Local-only browser writes: taxonomy and two manual draft revisions. No real
 * publication is performed. HTTP202/200 publication feedback has its own explicit
 * browser mock, separate from the real SocialHero HTTP acceptance runner.
 */
export async function verifyBlogManagementUI(config) {
  const platform = new URL(config.platformOrigin);
  assert.equal(platform.protocol, 'http:');
  assert.ok(['localhost', '127.0.0.1'].includes(platform.hostname));
  assert.ok(platform.pathname === '/' && !platform.username && !platform.password && !platform.search && !platform.hash);
  assert.ok(config.storageState, 'Use the isolated administrator session');
  const directory = resolve(config.managementDirectory ?? '/tmp/fieldgrid-blog-management-browser');
  await mkdir(directory, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(config.browserExecutable ? { executablePath: config.browserExecutable } : {}) });
  const results = [], errors = [];
  try {
    const context = await browser.newContext({ storageState: config.storageState, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', viewport: { width: 1440, height: 1050 } });
    const page = await context.newPage();
    async function capture(name) { await capturePage(page, directory, name); }
    page.on('pageerror', error => errors.push(error.message));
    const suffix = randomUUID().slice(0, 8);
    const authorName = `Browserredacteur ${suffix}`, categoryName = `Browsercategorie ${suffix}`, categoryRenamed = `Planningproef ${suffix}`;
    let authorId, categoryId, draft;
    const taxonomyUrl = `${platform.origin}/api/blog-admin/taxonomy`;
    async function mutate(button) {
      const pending = page.waitForResponse(response => response.url() === taxonomyUrl && response.request().method() === 'POST');
      await button.click();
      const response = await pending;
      assert.equal(response.status(), 200, 'Real taxonomy mutation succeeds');
      return response.json();
    }
    async function openSettings() {
      const response = await page.goto(`${platform.origin}/platform/blog/instellingen`, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
      await expect(page.getByRole('heading', { name: 'Auteurs', exact: true })).toBeVisible();
    }
    const rowFor = (kind, name) => page.locator('li').filter({ has: page.getByRole('textbox', { name: `Naam ${kind} ${name}`, exact: true }) });
    const group = name => page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) }).filter({ hasNot: page.getByRole('heading', { name: name === 'Auteurs' ? 'Categorieën' : 'Auteurs', exact: true }) });
    await openSettings();
    await page.getByRole('textbox', { name: 'Nieuwe auteur', exact: true }).fill(authorName);
    let data = await mutate(group('Auteurs').getByRole('button', { name: 'Toevoegen', exact: true }));
    authorId = data.authors.find(item => item.name === authorName)?.id;
    assert.ok(authorId);
    await expect(rowFor('auteur', authorName)).toBeVisible();
    await page.getByRole('textbox', { name: 'Nieuwe categorie', exact: true }).fill(categoryName);
    data = await mutate(group('Categorieën').getByRole('button', { name: 'Toevoegen', exact: true }));
    categoryId = data.categories.find(item => item.name === categoryName)?.id;
    assert.ok(categoryId);
    await expect(rowFor('categorie', categoryName)).toBeVisible();
    await page.getByRole('textbox', { name: `Naam categorie ${categoryName}`, exact: true }).fill(categoryRenamed);
    data = await mutate(rowFor('categorie', categoryName).getByRole('button', { name: 'Opslaan', exact: true }));
    assert.equal(data.categories.find(item => item.id === categoryId)?.name, categoryRenamed);
    await expect(rowFor('categorie', categoryRenamed)).toBeVisible();
    await capture(`settings-desktop.png`);
    results.push('Real taxonomy API: author/category created and category renamed without changing its ID');

    await page.goto(`${platform.origin}/platform/blog`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('link', { name: 'Instellingen', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Nieuw artikel', exact: true }).click();
    const title1 = `Browserconcept ${suffix}`, title2 = `${title1} bijgewerkt`;
    await page.getByLabel('Titel', { exact: true }).fill(title1);
    await page.getByLabel('Samenvatting', { exact: true }).fill('Een geïsoleerde browserproef voor auteurs, categorieën en opgeslagen revisies.');
    await page.getByRole('button', { name: 'Markdown importeren', exact: true }).click();
    await page.getByLabel('Markdown', { exact: true }).fill('## Een gecontroleerd concept\n\nDeze lokale browserproef controleert het echte beheer en de revisiehistorie.');
    await page.getByRole('button', { name: 'Inhoud importeren', exact: true }).click();
    await page.getByLabel('Auteur', { exact: true }).selectOption(authorId);
    await page.getByLabel('Categorie', { exact: true }).selectOption(categoryId);
    async function saveDraft(method) {
      const pending = page.waitForResponse(response => response.url().startsWith(`${platform.origin}/api/blog-admin`) && response.request().method() === method && !response.url().endsWith('/media'));
      await page.getByRole('button', { name: 'Concept opslaan', exact: true }).click();
      const response = await pending;
      assert.ok([200, 201].includes(response.status()));
      draft = (await response.json()).post;
      await expect(page.getByRole('status').filter({ hasText: 'Concept opgeslagen.' })).toBeVisible();
    }
    await saveDraft('POST');
    assert.equal(draft.revision, 1);
    await expect(page.getByText('Revisie opgeslagen · revisie 1', { exact: true })).toBeVisible();
    await page.getByLabel('Titel', { exact: true }).fill(title2);
    await saveDraft('PATCH');
    assert.equal(draft.revision, 2);
    await expect(page.getByText('Revisie opgeslagen · revisie 2', { exact: true })).toBeVisible();
    const historyResponse = await context.request.get(`${platform.origin}/api/blog-admin/${draft.id}/revisions`);
    assert.equal(historyResponse.status(), 200);
    const history = await historyResponse.json();
    assert.equal(history.revisions.find(item => item.revision === 1)?.title, title1);
    assert.equal(history.revisions.find(item => item.revision === 2)?.title, title2);
    assert.ok(history.revisions.every(item => item.source === 'manual'));
    assert.deepEqual(history.publishEvents, [], 'The real write test creates drafts only');
    await page.locator('#blog-revision-history').scrollIntoViewIfNeeded();
    await capture(`revision-history-desktop.png`);
    results.push('Real editor saved two independent draft snapshots; API and rendered history preserve both titles');

    await page.getByRole('button', { name: 'Alle artikelen', exact: true }).click();
    await page.getByRole('combobox', { name: 'Filter op categorie', exact: true }).selectOption(categoryId);
    await page.getByRole('searchbox', { name: 'Zoek in artikelen', exact: true }).fill(authorName);
    await page.getByRole('button', { name: 'Concept', exact: true }).click();
    await expect(page.locator('.fg-editor-row').filter({ hasText: title2 })).toBeVisible();
    await expect(page.locator('.fg-editor-row').filter({ hasText: title2 })).toContainText(authorName);
    await expect(page.locator('.fg-editor-result-count')).toContainText('1 van');
    await capture(`filtered-list-desktop.png`);
    await page.getByRole('button', { name: 'Live', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Geen artikelen gevonden', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Filters wissen', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Filter op categorie', exact: true })).toHaveValue('');
    await expect(page.getByRole('searchbox', { name: 'Zoek in artikelen', exact: true })).toHaveValue('');
    results.push('Search by author combines with category/status filters; clearing filters restores the article list');

    await page.goto(`${platform.origin}/platform/blog?id=${draft.id}`, { waitUntil: 'networkidle' });
    let checks = 0, unexpectedSaves = 0;
    const pendingPost = { ...draft, published: draft.draft, publishedRevision: draft.revision, publishedAt: new Date().toISOString(), publicationVerified: false };
    page.on('request', request => { if (request.method() === 'PATCH' && request.url().endsWith(`/api/blog-admin/${draft.id}`)) unexpectedSaves++; });
    await page.route(`**/api/blog-admin/${draft.id}/publish`, route => {
      checks++;
      assert.equal(route.request().postDataJSON().expectedRevision, draft.revision);
      return route.fulfill({ status: checks === 1 ? 202 : 200, json: { post: { ...pendingPost, publicationVerified: checks > 1 }, publication: { state: checks > 1 ? 'published' : 'publishing' } } });
    });
    await page.getByRole('button', { name: 'Publiceren', exact: true }).click();
    await page.getByRole('button', { name: 'Publicatie bevestigen', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Publicatie wordt gecontroleerd. De openbare bevestiging volgt.' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Artikel gepubliceerd.' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Bekijk openbare pagina', exact: true })).toBeVisible();
    await capture(`publication-pending-desktop.png`);
    await page.getByRole('button', { name: 'Publicatie controleren', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Artikel gepubliceerd.' })).toBeVisible();
    assert.equal(checks, 2);
    assert.equal(unexpectedSaves, 0, 'Verification retries the same revision without a new save');
    await page.unroute(`**/api/blog-admin/${draft.id}/publish`);
    results.push('Explicit UI-only publication mock: HTTP202 stays pending; recheck uses the same ID/revision without a new save; HTTP200 confirms');

    await openSettings();
    for (const [kind, name, id, list] of [['auteur', authorName, authorId, 'authors'], ['categorie', categoryRenamed, categoryId, 'categories']]) {
      data = await mutate(rowFor(kind, name).getByRole('button', { name: /^Archiveren/ }));
      assert.equal(data[list].find(item => item.id === id)?.active, false);
      await expect(rowFor(kind, name)).toContainText('Gearchiveerd');
      data = await mutate(rowFor(kind, name).getByRole('button', { name: /^Opnieuw activeren/ }));
      assert.equal(data[list].find(item => item.id === id)?.active, true);
      await expect(rowFor(kind, name)).toContainText('Actief');
      data = await mutate(rowFor(kind, name).getByRole('button', { name: /^Archiveren/ }));
      assert.equal(data[list].find(item => item.id === id)?.active, false);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(`settings-mobile.png`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.goto(`${platform.origin}/platform/blog?id=${draft.id}`, { waitUntil: 'networkidle' });
    await expect(page.getByLabel('Auteur', { exact: true })).toHaveValue(authorId);
    await expect(page.getByLabel('Categorie', { exact: true })).toHaveValue(categoryId);
    await expect(page.getByLabel('Auteur', { exact: true }).locator('option:checked')).toContainText('gearchiveerd');
    await expect(page.getByLabel('Categorie', { exact: true }).locator('option:checked')).toContainText('gearchiveerd');
    await expect(page.getByText('Revisie opgeslagen · revisie 2', { exact: true })).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await capture(`editor-history-mobile.png`);
    await page.goto(`${platform.origin}/platform/blog`, { waitUntil: 'networkidle' });
    await page.getByRole('combobox', { name: 'Filter op categorie', exact: true }).selectOption(categoryId);
    await expect(page.locator('.fg-editor-row').filter({ hasText: title2 })).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await capture(`filtered-list-mobile.png`);
    results.push('Real archive/reactivate keeps IDs and referenced draft/history intact; archived items remain visible on the existing draft');
    results.push('Settings, filtered list and editor/history fit 390px mobile without horizontal overflow');
    assert.deepEqual(errors, []);
    const evidence = { passed: true, realBackend: ['Taxonomy create/update/archive/reactivate', 'Two draft saves and immutable revision history', 'Authenticated page reads and filters'], explicitMocks: ['Only publication HTTP202/200 UI feedback; no real publication performed by this runner'], results, draftId: draft.id, screenshotsDirectory: directory, browserErrors: errors.length };
    await writeFile(`${directory}/results.json`, JSON.stringify(evidence, null, 2));
    return evidence;
  } finally { await browser.close(); }
}

/** Refreshes visual evidence without any writes and checks an independently
 * published SocialHero fixture's real publication events. */
export async function verifyBlogManagementReadOnly(config) {
  const platform = new URL(config.platformOrigin);
  assert.equal(platform.protocol, 'http:');
  assert.ok(['localhost', '127.0.0.1'].includes(platform.hostname));
  assert.ok(config.storageState && /^[0-9a-f-]{36}$/i.test(config.readOnlyDraftId));
  const directory = resolve(config.managementDirectory ?? '/tmp/fieldgrid-blog-management-browser');
  await mkdir(directory, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(config.browserExecutable ? { executablePath: config.browserExecutable } : {}) });
  const results = [], errors = [];
  try {
    const context = await browser.newContext({ storageState: config.storageState, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', viewport: { width: 1440, height: 1050 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const listing = await context.request.get(`${platform.origin}/api/blog-admin`);
    assert.equal(listing.status(), 200);
    const posts = (await listing.json()).posts;
    const draft = posts.find(post => post.id === config.readOnlyDraftId);
    assert.ok(draft);
    for (const [size, viewport] of [['desktop', { width: 1440, height: 1050 }], ['mobile', { width: 390, height: 844 }]]) {
      await page.setViewportSize(viewport);
      await page.goto(`${platform.origin}/platform/blog/instellingen`, { waitUntil: 'networkidle' });
      await expect(page.getByRole('heading', { name: 'Auteurs', exact: true })).toBeVisible();
      await capturePage(page, directory, `settings-${size}.png`);
      await page.goto(`${platform.origin}/platform/blog?id=${draft.id}`, { waitUntil: 'networkidle' });
      await expect(page.getByText(`Revisie opgeslagen · revisie ${draft.revision}`, { exact: true })).toBeVisible();
      await capturePage(page, directory, `editor-history-${size}.png`);
      await page.goto(`${platform.origin}/platform/blog`, { waitUntil: 'networkidle' });
      await page.getByRole('combobox', { name: 'Filter op categorie', exact: true }).selectOption(draft.draft.categoryId);
      await expect(page.locator('.fg-editor-row').filter({ hasText: draft.draft.title })).toBeVisible();
      await capturePage(page, directory, `filtered-list-${size}.png`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    results.push('Read-only settings/editor/list captures after the existing mobile menu transition has completed; menu closed via real UI if needed');
    if (config.publishedPostId) {
      assert.match(config.publishedPostId, /^[0-9a-f-]{36}$/i);
      const published = posts.find(post => post.id === config.publishedPostId);
      assert.ok(published?.publishedRevision && published.publicationVerified === true, 'The independent HTTP fixture is publicly verified');
      const response = await context.request.get(`${platform.origin}/api/blog-admin/${published.id}/revisions`);
      assert.equal(response.status(), 200);
      const history = await response.json();
      assert.ok(history.publishEvents.some(event => event.revision === published.publishedRevision));
      for (const [size, viewport] of [['desktop', { width: 1440, height: 1050 }], ['mobile', { width: 390, height: 844 }]]) {
        await page.setViewportSize(viewport);
        await page.goto(`${platform.origin}/platform/blog?id=${published.id}`, { waitUntil: 'networkidle' });
        await expect(page.getByText(`Gepubliceerd · revisie ${published.publishedRevision}`, { exact: true })).toBeVisible();
        await expect(page.getByText('Huidige live versie', { exact: true })).toBeVisible();
        await capturePage(page, directory, `real-published-history-${size}.png`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
      results.push('Real independently published SocialHero article: current verified live revision and immutable publication events render on desktop/mobile; no mocks or writes');
    }
    assert.deepEqual(errors, []);
    const evidence = { passed: true, mode: 'Read-only real backend and browser; no mocks or writes', results, screenshotsDirectory: directory, browserErrors: errors.length };
    await writeFile(`${directory}/read-only-results.json`, JSON.stringify(evidence, null, 2));
    return evidence;
  } finally { await browser.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.ok(process.argv[2], 'Pass a private isolated browser-fixture configuration file');
  const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
  console.log(JSON.stringify(await (config.readOnly ? verifyBlogManagementReadOnly(config) : verifyBlogManagementUI(config)), null, 2));
}
