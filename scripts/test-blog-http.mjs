/** Real local Next.js/DB acceptance. Token is read from a private fixture file only. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
const fixturePath = process.argv[2];
if (fixturePath !== '/tmp/fieldgrid-blog-runtime/fixture.json') throw Error('Explicit isolated fixture required');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const origin = fixture.publicOrigin;
if (origin !== 'http://127.0.0.1:3307') throw Error('Explicit isolated loopback origin required');
const token = fixture.siteToken, run = randomUUID(), xid = `fieldgrid-http-${run}`, initialSlug = `http-revisie-${run}`;
const results = [];
const note = name => results.push({ name, passed: true });
async function api(path, method = 'GET', payload, key, revision, authorization = token) {
  const headers = {};
  if (authorization) headers.authorization = `Bearer ${authorization}`;
  if (key) headers['idempotency-key'] = key;
  if (revision) headers['if-match'] = `"${revision}"`;
  if (payload && !(payload instanceof FormData)) headers['content-type'] = 'application/json';
  const response = await fetch(`${origin}/api/socialhero/v1${path}`, { method, headers, body: payload instanceof FormData ? payload : payload ? JSON.stringify(payload) : undefined, redirect: 'manual' });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
const postPath = `/posts/${xid}`;
assert.equal((await api('/capabilities', 'GET', undefined, undefined, undefined, null)).status, 401);
assert.equal((await api('/capabilities', 'GET', undefined, undefined, undefined, 'x'.repeat(40))).status, 403);
const capabilities = await api('/capabilities');
assert.equal(capabilities.body.siteId, 'fieldgrid');assert.equal(capabilities.body.canonicalOrigin, 'https://www.fieldgrid.nl');
note('Missing and invalid tokens fail closed; capabilities identify the exact local environment');

const png = await sharp({ create: { width: 600, height: 900, channels: 3, background: '#f6b31d' } }).png().toBuffer();
const form = bytes => { const value = new FormData(); value.set('file', new File([bytes], 'hero.png', { type: 'image/png' })); return value; };
const uploadKey = randomUUID();
const uploaded = await api('/media', 'POST', form(png), uploadKey);assert.equal(uploaded.status, 201);
assert.deepEqual((await api('/media', 'POST', form(png), uploadKey)).body, uploaded.body);
assert.equal((await api('/media', 'POST', form(Buffer.from('<html>not an image</html>')), randomUUID())).body.code, 'INVALID_MEDIA');
assert.equal((await fetch(`${origin}${uploaded.body.src}`)).status, 404);
note('Fully decoded image upload replays one asset; invalid bytes and unpublished media remain private');

const payload = { type: 'blog', locale: 'nl-NL', title: 'Eerste publieke titel', slug: initialSlug, excerpt: 'Een echte lokale proef van concept, revisie en redirect.', content: { format: 'markdown', body: '## Een controleerbare stap\nWerk met dezelfde revisie van planning tot uitvoering.' }, seo: { title: 'Fieldgrid revisieproef', description: 'Een echte lokale publicatieproef.' }, authorId: 'fieldgrid-redactie', categoryId: 'planning', tags: ['planning'], hero: { assetId: uploaded.body.assetId, alt: 'Een portretbeeld voor de lokale revisieproef.', focalPoint: { x: 0.25, y: 0.75 } } };
const draftKey = randomUUID();
const [first, concurrent] = await Promise.all([api(postPath, 'PUT', payload, draftKey), api(postPath, 'PUT', payload, draftKey)]);
assert.equal(first.status, 200);assert.deepEqual(concurrent.body, first.body);assert.equal(first.body.revision, 1);
assert.equal((await fetch(`${origin}/blog/${initialSlug}`)).status, 404);
const publishKey = randomUUID();const live = await api(`${postPath}/publish`, 'POST', { revision: 1 }, publishKey);
assert.equal(live.status, 200);assert.equal(live.body.publishedRevision, 1);
note('Concurrent identical draft writes create revision one and a private draft; publication exposes that exact revision');

const secondPayload = { ...payload, title: 'Een nieuwe concepttitel' };delete secondPayload.slug;
const secondKey = randomUUID();
const revision2 = await api(postPath, 'PUT', secondPayload, secondKey, 1);assert.equal(revision2.body.revision, 2);
const oldHtml = await (await fetch(`${origin}/blog/${initialSlug}`)).text();
assert.match(oldHtml, /<h1[^>]*>Eerste publieke titel<\/h1>/);assert.doesNotMatch(oldHtml, /<h1[^>]*>Een nieuwe concepttitel<\/h1>/);
assert.equal((await api(`${postPath}/publish`, 'POST', { revision: 1 }, randomUUID())).body.code, 'REVISION_CONFLICT');
assert.deepEqual((await api(`${postPath}/publish`, 'POST', { revision: 1 }, publishKey)).body, live.body);
const published2 = await api(`${postPath}/publish`, 'POST', { revision: 2 }, randomUUID());assert.equal(published2.body.publicUrl, `${origin}/blog/${initialSlug}`);
note('A title edit preserves the public slug and old live revision until publish; stale jobs conflict while an original publish receipt still replays');

const newSlug = `${initialSlug}-nieuw`;
const revision3 = await api(postPath, 'PUT', { ...payload, title: 'Een nieuwe concepttitel', slug: newSlug }, randomUUID(), 2);assert.equal(revision3.body.revision, 3);
assert.equal((await api(`${postPath}/publish`, 'POST', { revision: 3 }, randomUUID())).status, 200);
const redirect = await fetch(`${origin}/blog/${initialSlug}`, { redirect: 'manual' });assert.equal(redirect.status, 308);assert.equal(new URL(redirect.headers.get('location'), origin).pathname, `/blog/${newSlug}`);
assert.deepEqual((await api(postPath, 'PUT', secondPayload, secondKey, 1)).body, revision2.body, 'A replay with an inferred slug returns the original result after a later explicit slug change');
assert.equal((await api(`/posts/other-${run}`, 'PUT', payload, randomUUID())).body.code, 'SLUG_CONFLICT');
assert.equal((await api(postPath, 'PUT', { ...payload, title: 'Changed request' }, draftKey)).body.code, 'IDEMPOTENCY_CONFLICT');
const sitemap = await (await fetch(`${origin}/sitemap.xml`)).text();assert.ok(sitemap.includes(`https://www.fieldgrid.nl/blog/${newSlug}`));assert.ok(!sitemap.includes(`https://www.fieldgrid.nl/blog/${initialSlug}</loc>`));assert.ok(!sitemap.includes(`${origin}/blog/`));
note('A deliberate slug publication creates a permanent direct redirect, reserves history, rejects conflicting operations and updates the sitemap');

const unsafe = { ...payload, slug: `unsafe-${run}`, content: { format: 'tiptap', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Klik', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] } } };
assert.equal((await api(`/posts/unsafe-${run}`, 'PUT', unsafe, randomUUID())).status, 400);
const huge = await fetch(`${origin}/api/socialhero/v1/posts/large-${run}`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID(), 'content-type': 'application/json' }, body: JSON.stringify({ body: 'x'.repeat(520_000) }) });assert.equal(huge.status, 413);
assert.equal((await fetch(`${origin}/api/blog-admin`)).status, 403);
for (const [path, method] of [['/api/socialhero/v1/media', 'GET'], ['/api/socialhero/v1/capabilities', 'POST'], ['/fieldgrid-site/blog', 'GET']]) assert.equal((await fetch(`${origin}${path}`, { method, redirect: 'manual' })).status, 404);
note('Unsafe link protocols, excessive payloads, private APIs, internal rewrite paths and unlisted methods are rejected');

const report = { mode: 'Real local Next.js HTTP, real PostgREST/Postgres, explicit local Auth/Storage fixture adapters; no deployment or social delivery.', origin, externalId: xid, id: first.body.id, revision: 3, slug: newSlug, title: 'Een nieuwe concepttitel', checks: results, passed: true };
writeFileSync('/tmp/fieldgrid-blog-runtime/http-results.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
