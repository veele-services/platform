import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import sharp from 'sharp';

/** A separate, deliberate write test against the isolated local database.
 * It creates a manual draft and leaves the published SocialHero fixture intact.
 */
export async function verifyBlogEditor(config) {
  const platform = new URL(config.platformOrigin);
  assert.ok(platform.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(platform.hostname));
  assert.ok(config.storageState, 'Use the isolated platform administrator session');
  const browser = await chromium.launch({ headless: true, ...(config.browserExecutable ? { executablePath: config.browserExecutable } : {}) });
  const errors = [];
  try {
    const context = await browser.newContext({ storageState: config.storageState, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', viewport: { width: 1440, height: 1050 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${platform.origin}/platform/blog`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Nieuw artikel', exact: true }).click();
    const suffix = randomUUID().slice(0, 8);
    const firstTitle = `Redactie proef ${suffix}`;
    await page.getByLabel('Titel', { exact: true }).fill(firstTitle);
    const slug = page.getByRole('textbox', { name: /^Slug/ });
    await expect(slug).toHaveValue(`redactie-proef-${suffix}`);
    await page.getByLabel('Samenvatting', { exact: true }).fill('Een afzonderlijke browserproef voor handmatige redactie.');
    await page.getByRole('button', { name: 'Markdown importeren', exact: true }).click();
    await page.getByLabel('Markdown', { exact: true }).fill('## Een heldere werkdag\n\nEen **vet** woord, een *cursief* woord en een [veilige link](/platform).\n\n- Planning controleren\n- Werkbon invullen\n\n<table><script>alert(1)</script></table>');
    await page.getByRole('button', { name: 'Inhoud importeren', exact: true }).click();
    await expect(page.locator('.fg-rich-content h2')).toHaveText('Een heldere werkdag');
    await expect(page.locator('.fg-rich-content strong')).toHaveText('vet');
    await expect(page.locator('.fg-rich-content script')).toHaveCount(0);

    async function save() {
      const responsePromise = page.waitForResponse(response => response.url().includes('/api/blog-admin') && ['POST', 'PATCH'].includes(response.request().method()) && !response.url().endsWith('/media'));
      await page.getByRole('button', { name: /^(Concept|Revisie) opslaan$/ }).click();
      const response = await responsePromise;
      assert.ok([200, 201].includes(response.status()));
      const result = await response.json();
      await expect(page.getByRole('status')).toContainText(/Concept opgeslagen\.|Revisie opgeslagen\./);
      return result.post;
    }
    let post = await save();
    assert.equal(post.draft.slugManual, false);
    const idempotencyKey = `manual-browser-idempotency-${suffix}`;
    const duplicateFields = { ...post.draft, title: `${firstTitle} idempotent`, slug: `idempotent-manual-${suffix}` };
    const duplicateReplies = await Promise.all([0, 1].map(() => context.request.post(`${platform.origin}/api/blog-admin`, { headers: { origin: platform.origin, 'Idempotency-Key': idempotencyKey }, data: { fields: duplicateFields } })));
    for (const response of duplicateReplies) assert.ok([200, 201].includes(response.status()));
    const duplicatePosts = await Promise.all(duplicateReplies.map(async response => (await response.json()).post));
    assert.equal(duplicatePosts[0].id, duplicatePosts[1].id);
    assert.equal(duplicatePosts[0].revision, 1);
    assert.equal(duplicatePosts[1].revision, 1);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByLabel('Titel', { exact: true }).fill(`${firstTitle} vervolg`);
    await expect(slug).toHaveValue(`redactie-proef-${suffix}-vervolg`);
    post = await save();
    const manualSlug = `eigen-redactie-url-${suffix}`;
    await slug.fill(manualSlug);
    await page.getByLabel('Titel', { exact: true }).fill(`${firstTitle} eigen titel`);
    await expect(slug).toHaveValue(manualSlug);
    post = await save();
    assert.equal(post.draft.slugManual, true);

    await page.getByRole('button', { name: 'Afbeeldingen', exact: true }).click();
    const bytes = await sharp({ create: { width: 800, height: 1000, channels: 3, background: { r: 54, g: 131, b: 65 } } }).png().toBuffer();
    const upload = page.waitForResponse(response => response.url().endsWith('/api/blog-admin/media') && response.request().method() === 'POST');
    await page.locator('.fg-media-field').first().locator('input[type="file"]').setInputFiles({ name: 'local-editor-proof.png', mimeType: 'image/png', buffer: bytes });
    assert.equal((await upload).status(), 201);
    await page.getByLabel('Alt-tekst hero', { exact: true }).fill('Groen testbeeld uit de lokale redactieproef.');
    const horizontal = page.getByRole('slider', { name: 'Focus horizontaal', exact: true });
    const vertical = page.getByRole('slider', { name: 'Focus verticaal', exact: true });
    await horizontal.press('Home');
    for (let step = 0; step < 25; step++) await horizontal.press('ArrowRight');
    await vertical.press('End');
    for (let step = 0; step < 30; step++) await vertical.press('ArrowLeft');
    post = await save();
    assert.equal(post.draft.hero.x, 0.25);
    assert.equal(post.draft.hero.y, 0.7);
    assert.equal(post.draft.authorId, 'fieldgrid-redactie');
    assert.equal(post.published, null);
    assert.ok(!post.draft.content.content.some(node => node.type === 'script'));
    await page.getByRole('button', { name: 'Voorbeeld', exact: true }).click();
    await page.waitForURL(`**/platform/blog/preview/${post.id}`);
    await expect(page.locator('h1')).toHaveText(post.draft.title);
    await expect(page.locator('article strong').filter({ hasText: /^vet$/ })).toBeVisible();
    assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
    const publicResponse = await context.request.get(`${config.publicOrigin}/blog/${manualSlug}`);
    assert.equal(publicResponse.status(), 404, 'Manual drafts remain outside the public website');
    await page.getByRole('link', { name: 'Terug naar de redactie', exact: true }).click();
    await expect(page.getByLabel('Titel', { exact: true })).toHaveValue(post.draft.title);
    async function publish() {
      await page.getByRole('button', { name: 'Publiceren', exact: true }).click();
      const responsePromise = page.waitForResponse(response => response.url().endsWith('/publish') && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Publicatie bevestigen', exact: true }).click();
      const response = await responsePromise;
      assert.equal(response.status(), 200);
      const value = await response.json();
      await expect(page.getByRole('status')).toContainText('Artikel gepubliceerd.');
      return value.post;
    }
    post = await publish();
    const firstPublishedTitle = post.published.title;
    assert.equal((await context.request.get(`${config.publicOrigin}/blog/${manualSlug}`)).status(), 200);
    const nextTitle = `${firstTitle} nieuwe revisie`;
    await page.getByLabel('Titel', { exact: true }).fill(nextTitle);
    await expect(slug).toHaveValue(manualSlug);
    post = await save();
    assert.equal(post.published.title, firstPublishedTitle);
    assert.equal(post.draft.title, nextTitle);
    const oldLive = await (await context.request.get(`${config.publicOrigin}/blog/${manualSlug}`)).text();
    assert.ok(oldLive.includes(firstPublishedTitle));
    assert.ok(!oldLive.includes(nextTitle), 'An open revision cannot leak into the public HTML');
    await page.getByRole('button', { name: 'URL wijzigen', exact: true }).click();
    const newSlug = `${manualSlug}-nieuw`;
    await slug.fill(newSlug);
    post = await publish();
    assert.equal(post.published.slug, newSlug);
    const redirect = await context.request.get(`${config.publicOrigin}/blog/${manualSlug}`, { maxRedirects: 0 });
    assert.equal(redirect.status(), 308);
    assert.ok(redirect.headers().location.endsWith(`/blog/${newSlug}`));
    const current = await context.request.get(`${config.publicOrigin}/blog/${newSlug}`);
    assert.equal(current.status(), 200);
    assert.ok((await current.text()).includes(nextTitle));
    const sitemap = await (await context.request.get(`${config.publicOrigin}/sitemap.xml`)).text();
    assert.ok(sitemap.includes(`https://www.fieldgrid.nl/blog/${newSlug}</loc>`));
    assert.ok(!sitemap.includes(`https://www.fieldgrid.nl/blog/${manualSlug}</loc>`));
    assert.deepEqual(errors, []);
    await context.close();
    return { postId: post.id, revision: post.revision, status: 'published', results: ['Markdown imported as structured TipTap content with executable HTML inert', 'Automatic draft slugs survive save and reload; manual slugs remain fixed', 'Manual upload uses the same media API and saves alt text and focal point', 'Saved concept renders in authenticated noindex preview and stays publicly unavailable', 'Concurrent authenticated create with one idempotency key returns one article at revision 1', 'Manual publish, live/draft separation and deliberate slug redirect complete through the editor'], browserErrors: errors.length };
  } finally { await browser.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.ok(process.argv[2], 'Pass the temporary local browser fixture JSON');
  console.log(JSON.stringify(await verifyBlogEditor(JSON.parse(await readFile(process.argv[2], 'utf8'))), null, 2));
}
