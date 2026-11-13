import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

function localOrigin(value) {
  const url = new URL(value);
  assert.equal(url.protocol, 'http:');
  assert.ok(['localhost', '127.0.0.1', 'www.localhost'].includes(url.hostname), 'Browser acceptance requires an explicitly isolated local website');
  assert.equal(url.pathname, '/');
  assert.ok(!url.username && !url.password && !url.search && !url.hash);
  return url.origin;
}

/** Runs against a real Next.js runtime and its isolated database fixture.
 * Credentials remain in the temporary Playwright state; never print that state.
 */
export async function verifyBlogBrowser(config) {
  const publicOrigin = localOrigin(config.publicOrigin);
  const platformOrigin = localOrigin(config.platformOrigin);
  assert.match(config.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.match(config.postId, /^[0-9a-f-]{36}$/i);
  assert.ok(config.title && Number.isInteger(config.revision));
  const directory = resolve(config.screenshotsDirectory ?? '/tmp/fieldgrid-blog-browser');
  await mkdir(directory, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(config.browserExecutable ? { executablePath: config.browserExecutable } : {}) });
  const errors = [];
  const results = [];
  try {
    const context = await browser.newContext({ locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(`${publicOrigin}/blog/${config.slug}`, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    const source = await response.text();
    const head = source.split('</head>')[0];
    assert.ok(head.includes(`name="socialhero:revision" content="${config.revision}"`), 'Published revision is in the original HTML head');
    if (config.externalId) assert.ok(head.includes(`name="socialhero:external-id" content="${config.externalId}"`));
    assert.ok(head.includes(`href="https://www.fieldgrid.nl/blog/${config.slug}"`), 'Canonical remains on the production marketing origin');
    assert.ok(head.includes('property="og:type" content="article"'));
    assert.ok(head.includes('name="twitter:card" content="summary_large_image"'));
    assert.ok(source.includes('application/ld+json'));
    const structuredData = await page.locator('script[type="application/ld+json"]').allTextContents();
    assert.ok(structuredData.some(text => {
      const value = JSON.parse(text);
      return ['Article', 'BlogPosting'].includes(value['@type']) && value.headline === config.title && value.author?.name === 'Fieldgrid';
    }));
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.locator('h1').innerText(), config.title);
    assert.ok(await page.locator('article h2').count() > 0, 'Editorial content starts at H2');
    const hero = page.locator('article > div').first().locator('img').filter({ hasNot: page.locator('[aria-hidden="true"]') });
    assert.ok(await hero.count() > 0);
    const image = await page.locator('article img').evaluateAll(images => images.find(item => item.getAttribute('alt') && item.naturalWidth > 0)?.getAttribute('alt'));
    assert.ok(image, 'The decoded article image retains its alt text');
    const robots = response.headers()['x-robots-tag'] ?? await page.locator('meta[name="robots"]').getAttribute('content');
    assert.match(robots, /noindex/, 'Local verification remains outside the production index');
    const sitemap = await context.request.get(`${publicOrigin}/sitemap.xml`);
    assert.equal(sitemap.status(), 200);
    assert.ok((await sitemap.text()).includes(`https://www.fieldgrid.nl/blog/${config.slug}`));
    results.push('Original HTML metadata, JSON-LD, canonical, media and sitemap');

    for (const [size, viewport] of [['desktop', { width: 1440, height: 1050 }], ['mobile', { width: 390, height: 844 }]]) {
      await page.setViewportSize(viewport);
      await page.goto(`${publicOrigin}/blog/${config.slug}`, { waitUntil: 'networkidle' });
      assert.ok(await page.locator('h1').isVisible());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${size} article fits its viewport`);
      await page.screenshot({ path: `${directory}/article-${size}.png`, fullPage: true });
      await page.goto(`${publicOrigin}/blog`, { waitUntil: 'networkidle' });
      assert.ok(await page.getByRole('heading', { name: config.title }).isVisible());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${size} overview fits its viewport`);
      await page.screenshot({ path: `${directory}/overview-${size}.png`, fullPage: true });
      results.push(`${size}: public overview and detail rendered without horizontal overflow`);
    }
    const denied = await page.goto(`${platformOrigin}/platform/blog/preview/${config.postId}`, { waitUntil: 'networkidle' });
    assert.ok(new URL(page.url()).pathname.startsWith('/login') || denied.status() === 404, 'Anonymous users cannot read a draft preview');
    await context.close();

    if (config.storageState) {
      const editorContext = await browser.newContext({ storageState: config.storageState, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' });
      const editor = await editorContext.newPage();
      editor.on('pageerror', error => errors.push(error.message));
      for (const [size, viewport] of [['desktop', { width: 1440, height: 1050 }], ['mobile', { width: 390, height: 844 }]]) {
        await editor.setViewportSize(viewport);
        await editor.goto(`${platformOrigin}/platform/blog?id=${config.postId}`, { waitUntil: 'networkidle' });
        assert.ok(await editor.getByLabel('Titel', { exact: true }).isVisible());
        assert.ok(await editor.getByRole('textbox', { name: 'Artikelinhoud' }).isVisible());
        assert.ok(await editor.getByLabel('Auteur', { exact: true }).isVisible());
        assert.ok(await editor.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${size} editor fits its viewport`);
        await editor.screenshot({ path: `${directory}/editor-${size}.png`, fullPage: true });
        await editor.getByRole('button', { name: 'Afbeeldingen', exact: true }).click();
        assert.ok(await editor.getByLabel('Alt-tekst hero', { exact: true }).isVisible());
        assert.ok(await editor.getByLabel('Focus horizontaal').isVisible());
        await editor.screenshot({ path: `${directory}/editor-media-${size}.png`, fullPage: true });
        await editor.goto(`${platformOrigin}/platform/blog/preview/${config.postId}`, { waitUntil: 'networkidle' });
        assert.ok(await editor.getByText('Afgeschermd concept', { exact: false }).isVisible());
        assert.equal(await editor.locator('h1').innerText(), config.draftTitle ?? config.title);
        assert.match(await editor.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
        await editor.screenshot({ path: `${directory}/preview-${size}.png`, fullPage: true });
        results.push(`${size}: authenticated TipTap editor, media focal controls and private preview`);
      }
      await editorContext.close();
    }
    assert.deepEqual(errors, [], 'Browser emitted no uncaught runtime errors');
    return { results, screenshotsDirectory: directory, browserErrors: errors.length };
  } finally { await browser.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const file = process.argv[2];
  assert.ok(file, 'Pass a temporary local fixture JSON file');
  const config = JSON.parse(await readFile(file, 'utf8'));
  console.log(JSON.stringify(await verifyBlogBrowser(config), null, 2));
}
