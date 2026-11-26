/** Real local Fieldgrid HTTP/Postgres acceptance with an explicit SocialHero protocol adapter.
 * No hosted provider, remote credentials, worker delivery or direct database writes are used.
 * Codes/tokens stay in memory; the only output is a deliberately projected safe report.
 */
import { createServer, request as httpRequest } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const fixturePath = process.argv[2];
const statePath = '/tmp/fieldgrid-blog-runtime/connector-browser-state.json';
const outputPath = '/tmp/fieldgrid-blog-runtime/connector-http-results.json';
let stage = 'explicit isolated fixture';
let assertions = 0;
const checks = [];
const sensitive = new Set();
const adapterFailures = [];
const prefix = '/api/integrations/blog/v1/pairings';
const adapterOrigin = 'http://127.0.0.1:59424';
const run = randomUUID();
let server;

class AcceptanceError extends Error {
  constructor(code, detail = {}) { super(code); this.code = code; this.detail = detail; }
}
function ensure(condition, code, detail) {
  assertions++;
  if (!condition) throw new AcceptanceError(code, detail);
}
function note(name) { checks.push({ name, passed: true }); }
function safeBody(value) {
  const text = JSON.stringify(value);
  ensure(!/(?:encryptedCode|encryptedToken|accessToken|tokenHash|codeHash)/.test(text), 'SECRET_FIELD_IN_WEBSITE_RESPONSE');
  ensure(![...sensitive].some(secret => text.includes(secret)), 'SECRET_VALUE_IN_WEBSITE_RESPONSE');
}
function expectStatus(response, expected, code) {
  ensure(response.status === expected, code, { expectedStatus: expected, actualStatus: response.status,
    ...(typeof response.body?.code === 'string' && /^[A-Z_]{1,80}$/.test(response.body.code) ? { responseCode: response.body.code } : {}) });
}
function expectCode(response, status, code) {
  expectStatus(response, status, `${code}_STATUS`);
  ensure(response.body?.code === code, `${code}_SHAPE`);
  ensure(typeof response.body?.message === 'string' && typeof response.body?.requestId === 'string', 'STRUCTURED_ERROR_REQUIRED');
}
async function wire(url, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(url, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  const text = await response.text();
  let value = null;
  try { value = text ? JSON.parse(text) : null; } catch { /* Public pages are HTML. */ }
  if (value !== null) safeBody(value);
  return { status: response.status, headers: response.headers, body: value, text };
}
function marketingPrivateStatus(publicOrigin) {
  // Node fetch replaces Host with the URL authority; the raw HTTP client tests
  // the actual marketing hostname against the same explicit loopback server.
  return new Promise((resolve, reject) => {
    const request = httpRequest(`${publicOrigin}/api/blog-admin/connection`, { headers: { host: 'www.localhost:3307' } }, response => {
      response.resume();
      response.on('end', () => resolve({ status: response.statusCode, body: null }));
    });
    request.setTimeout(20_000, () => request.destroy(new AcceptanceError('MARKETING_HOST_REQUEST_TIMEOUT')));
    request.on('error', reject);
    request.end();
  });
}
function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
  response.end(JSON.stringify(body));
}
function providerError(response, status, code, privateMessage = '') {
  // Deliberately private provider text must never be reflected by the website.
  json(response, status, { code, message: privateMessage || 'Lokale contractadapter weigert deze actie.', requestId: randomUUID() });
}

async function main() {
  ensure(fixturePath === '/tmp/fieldgrid-blog-runtime/fixture.json', 'EXPLICIT_FIXTURE_REQUIRED');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  ensure(fixture.publicOrigin === 'http://127.0.0.1:3307' && fixture.platformOrigin === 'http://localhost:3307', 'EXPLICIT_LOOPBACK_ORIGINS_REQUIRED');
  const publicOrigin = fixture.publicOrigin, platformOrigin = fixture.platformOrigin;
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const cookies = state.cookies.filter(cookie => cookie.domain === 'localhost' && cookie.path === '/');
  ensure(cookies.length > 0, 'EXPLICIT_EDITOR_SESSION_REQUIRED');
  const cookie = cookies.map(item => `${item.name}=${item.value}`).join('; ');
  const admin = (body, options = {}) => wire(`${platformOrigin}/api/blog-admin/connection`, {
    method: body ? 'POST' : 'GET',
    headers: { ...(options.anonymous ? {} : { cookie }), ...(body ? { 'content-type': 'application/json', origin: options.origin ?? platformOrigin } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const api = (token, path, method = 'GET', body, key) => wire(`${publicOrigin}/api/socialhero/v1${path}`, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(key ? { 'idempotency-key': key } : {}),
      ...(body !== undefined && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}) },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const destinations = new Map();
  const codes = new Map();
  const connections = new Map();
  function newCode(project, { fail = null, loseVerifiedResponse = false } = {}) {
    if (!destinations.has(project)) destinations.set(project, randomUUID());
    const entry = { code: randomBytes(32).toString('base64url'), connectionId: randomUUID(), destinationId: destinations.get(project),
      token: randomBytes(32).toString('base64url'), attemptId: null, claimRequests: 0, verifyRequests: 0,
      codeExpiresAt: Date.now() + 600_000, expiresAt: null, fail, loseVerifiedResponse, verified: false };
    sensitive.add(entry.code); sensitive.add(entry.token);
    codes.set(entry.code, entry); connections.set(entry.connectionId, entry);
    return entry;
  }
  const adapterEvents = [];
  server = createServer(async (request, response) => {
    try {
      if (request.method !== 'POST') return providerError(response, 405, 'METHOD_NOT_ALLOWED');
      const url = new URL(request.url, adapterOrigin);
      if (url.pathname === `${prefix}/claim` && !url.search) {
        if (!request.headers['content-type']?.includes('application/json')) return providerError(response, 415, 'JSON_REQUIRED');
        const chunks = []; let size = 0;
        for await (const chunk of request) { size += chunk.length; if (size > 32_768) return providerError(response, 413, 'PAYLOAD_TOO_LARGE'); chunks.push(chunk); }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return providerError(response, 400, 'INVALID_JSON'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return providerError(response, 400, 'INVALID_JSON');
        ensure(Object.keys(body).sort().join(',') === 'attemptId,code,contractVersion,environment,origin,siteId', 'ADAPTER_CLAIM_EXACT_FIELDS');
        if (!/^[A-Za-z0-9_-]{43}$/.test(body.code) || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(body.siteId) || body.contractVersion !== 1) return providerError(response, 400, 'INVALID_PAIRING_CODE');
        const entry = codes.get(body.code);
        if (!entry) return providerError(response, 400, 'INVALID_PAIRING_CODE');
        entry.claimRequests++;
        if (entry.fail === 'expired') return providerError(response, 410, 'PAIRING_EXPIRED', entry.code);
        if (entry.expiresAt ? Date.parse(entry.expiresAt) <= Date.now() : entry.codeExpiresAt <= Date.now()) return providerError(response, 410, 'PAIRING_EXPIRED', entry.code);
        if (entry.fail === 'mismatch') return providerError(response, 409, 'DESTINATION_MISMATCH', entry.code);
        if (body.siteId !== 'fieldgrid' || body.origin !== publicOrigin || body.environment !== 'staging' || body.contractVersion !== 1) return providerError(response, 409, 'DESTINATION_MISMATCH', entry.code);
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.attemptId)) return providerError(response, 400, 'INVALID_PAIRING_CODE');
        if (entry.attemptId && entry.attemptId !== body.attemptId) return providerError(response, 400, 'INVALID_PAIRING_CODE', entry.code);
        entry.attemptId ??= body.attemptId;
        entry.expiresAt ??= new Date(Date.now() + 600_000).toISOString();
        adapterEvents.push('claim-reserved');
        return json(response, 200, { connectionId: entry.connectionId, destinationId: entry.destinationId, accessToken: entry.token, expiresAt: entry.expiresAt });
      }
      const match = url.pathname.match(/^\/api\/integrations\/blog\/v1\/pairings\/([a-f0-9-]{36})\/verify$/i);
      if (!match || url.search) return providerError(response, 404, 'NOT_FOUND');
      const entry = connections.get(match[1]);
      if (!entry?.attemptId || request.headers.authorization !== `Bearer ${entry.token}`) return providerError(response, 401, 'INVALID_CREDENTIAL');
      entry.verifyRequests++;
      const capabilities = await api(entry.token, '/capabilities');
      expectStatus(capabilities, 200, 'PENDING_CAPABILITIES_CALLBACK');
      const caps = capabilities.body;
      ensure(caps.contractVersion === 1 && caps.connectionId === entry.connectionId && caps.destinationId === entry.destinationId
        && caps.siteId === 'fieldgrid' && caps.origin === publicOrigin && caps.environment === 'staging', 'CALLBACK_IDENTITY_MATCH');
      ensure(['pending', 'active'].includes(caps.credentialState), 'CALLBACK_CREDENTIAL_STATE');
      if (caps.credentialState === 'pending') {
        ensure(JSON.stringify(caps.scopes) === '["read"]', 'PENDING_SCOPE_READ_ONLY');
        const blockedRead = await api(entry.token, '/posts/pending-probe');
        expectCode(blockedRead, 409, 'PAIRING_IN_PROGRESS');
        ensure(Number(blockedRead.headers.get('retry-after')) > 0, 'PENDING_RETRY_AFTER');
        expectCode(await api(entry.token, '/media', 'POST', {}), 409, 'PAIRING_IN_PROGRESS');
        expectCode(await api(entry.token, '/posts/pending-probe/publish', 'POST', { revision: 1 }, randomUUID()), 409, 'PAIRING_IN_PROGRESS');
      }
      entry.verified = true;
      adapterEvents.push(`verify-callback-${caps.credentialState}`);
      if (entry.loseVerifiedResponse) {
        entry.loseVerifiedResponse = false;
        adapterEvents.push('verified-response-lost');
        response.destroy(); return;
      }
      return json(response, 200, { connectionId: entry.connectionId, status: 'verified' });
    } catch (error) {
      adapterFailures.push({ code: error instanceof AcceptanceError ? error.code : 'ADAPTER_REQUEST_FAILED' });
      if (!response.destroyed) providerError(response, 503, 'PAIRING_UNAVAILABLE');
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(59424, '127.0.0.1', resolve); });

  stage = 'administrator and hostname boundaries';
  expectStatus(await admin(undefined, { anonymous: true }), 403, 'ANONYMOUS_ADMIN_DENIED');
  expectStatus(await marketingPrivateStatus(publicOrigin), 404, 'MARKETING_PRIVATE_ROUTE_DENIED');
  expectStatus(await admin({ action: 'disconnect' }, { origin: 'https://untrusted.invalid' }), 403, 'CROSS_SITE_ADMIN_DENIED');
  note('Anonymous administration, marketing private routes and cross-site mutations fail closed');

  stage = 'claim then lost verified response and durable resume';
  const primary = newCode('primary', { loseVerifiedResponse: true });
  const lost = await admin({ action: 'pair', code: primary.code, allowDraft: true, allowPublish: false });
  expectCode(lost, 503, 'PAIRING_UNAVAILABLE');
  ensure(adapterFailures.length === 0, 'PROVIDER_CALLBACK_FAILED');
  ensure(primary.verified && primary.claimRequests === 1 && primary.verifyRequests === 1, 'VERIFY_RESPONSE_LOSS_INJECTED_AFTER_CALLBACK');
  const pending = await admin(); expectStatus(pending, 200, 'PENDING_ADMIN_STATUS');
  ensure(pending.body.connection.status === 'pending' && pending.body.connection.connectionId === primary.connectionId, 'PENDING_STATE_DURABLE');
  const resumed = await admin({ action: 'verify' }); expectStatus(resumed, 200, 'RESUME_VERIFICATION');
  ensure(resumed.body.connection.status === 'active' && resumed.body.connection.allowDraft === true && resumed.body.connection.allowPublish === false, 'ACTIVE_WITH_EXPLICIT_DRAFT_AND_PUBLICATION_POLICY');
  ensure(primary.claimRequests === 1 && primary.verifyRequests === 2, 'RESUME_DOES_NOT_RECLAIM');
  expectStatus(await admin({ action: 'verify' }), 200, 'ACTIVE_VERIFY_IDEMPOTENT');
  ensure(primary.verifyRequests === 2, 'ACTIVE_CHECK_RETAINS_NO_PROVIDER_TOKEN');
  const caps = await api(primary.token, '/capabilities'); expectStatus(caps, 200, 'ACTIVE_CAPABILITIES');
  ensure(caps.body.credentialState === 'active' && JSON.stringify(caps.body.scopes) === '["read","draft"]', 'DEFAULT_READ_DRAFT_ONLY');
  ensure(caps.body.canonicalOrigin === 'https://www.fieldgrid.nl' && caps.body.origin === publicOrigin, 'DECLARED_PRODUCTION_CANONICAL_AND_VERIFICATION_ORIGIN');
  note('Real pending capabilities callback, blocked pending actions and durable resume after a lost verified response');

  stage = 'decoded image and concurrent draft creation';
  const png = await sharp({ create: { width: 512, height: 768, channels: 3, background: '#f6b31d' } }).png().toBuffer();
  const form = bytes => { const data = new FormData(); data.set('file', new File([bytes], 'connector-hero.png', { type: 'image/png' })); return data; };
  const mediaKey = randomUUID();
  const media = await api(primary.token, '/media', 'POST', form(png), mediaKey); expectStatus(media, 201, 'DECODED_MEDIA_UPLOAD');
  ensure(media.body.mimeType === 'image/png' && media.body.width === 512 && media.body.height === 768, 'DECODED_MEDIA_DIMENSIONS');
  const mediaReplay = await api(primary.token, '/media', 'POST', form(png), mediaKey); expectStatus(mediaReplay, 201, 'MEDIA_REPLAY');
  ensure(JSON.stringify(mediaReplay.body) === JSON.stringify(media.body), 'ONE_MEDIA_ASSET_FOR_RETRY');
  expectCode(await api(primary.token, '/media', 'POST', form(Buffer.from('<svg onload="alert(1)"/>')), randomUUID()), 422, 'INVALID_MEDIA');
  expectStatus(await wire(`${publicOrigin}/blog-media/${media.body.assetId}`), 404, 'UNPUBLISHED_MEDIA_NOT_PUBLIC');
  const externalId = `connector-http-${run}`, initialSlug = `connector-http-${run}`;
  const postPath = `/posts/${externalId}`;
  const body = { baseRevision: null, type: 'blog', locale: 'nl-NL', title: 'Connector HTTP eerste titel', slug: initialSlug,
    excerpt: 'Een herkenbare lokale contractproef met de echte Fieldgrid-API.',
    content: { format: 'markdown', body: '## Een controleerbare koppeling\nDeze lokale proef bewaart dezelfde bestemming en dezelfde revisie.' },
    seo: { title: 'Fieldgrid connectorproef', description: 'Lokale HTTP-acceptatie van de websitekoppeling.' },
    hero: { assetId: media.body.assetId, alt: 'Een echt gedecodeerd portretbeeld voor de connectorproef.', focalPoint: { x: 0.25, y: 0.75 } } };
  const draftKey = randomUUID();
  const [first, simultaneous] = await Promise.all([api(primary.token, postPath, 'PUT', body, draftKey), api(primary.token, postPath, 'PUT', body, draftKey)]);
  expectStatus(first, 200, 'FIRST_DRAFT_CREATED'); expectStatus(simultaneous, 200, 'CONCURRENT_DRAFT_REPLAY');
  ensure(JSON.stringify(first.body) === JSON.stringify(simultaneous.body) && first.body.revision === 1, 'CONCURRENT_CREATE_ONE_POST');
  ensure(first.body.state === 'draft' && first.body.draftRevision === 1 && first.body.publishedRevision === null
    && first.body.previewUrl === null && first.body.publicUrl === null && first.body.publishedAt === null, 'EXPLICIT_NULL_DRAFT_WIRE_FIELDS');
  expectStatus(await wire(`${publicOrigin}/blog/${initialSlug}`), 404, 'DRAFT_NOT_PUBLIC');
  const draftSitemap = await wire(`${publicOrigin}/sitemap.xml`); expectStatus(draftSitemap, 200, 'DRAFT_SITEMAP_AVAILABLE');
  ensure(!draftSitemap.text.includes(`/blog/${initialSlug}`), 'DRAFT_NOT_INDEXED_IN_SITEMAP');
  const readDraft = await api(primary.token, postPath); expectStatus(readDraft, 200, 'DRAFT_STATUS_READ');
  ensure(readDraft.body.postId === first.body.postId, 'STABLE_LOCAL_ARTICLE_MAPPING');
  expectCode(await api(primary.token, `/posts/missing-alt-${run}`, 'PUT', { ...body, slug: `missing-alt-${run}`, hero: { assetId: media.body.assetId } }, randomUUID()), 422, 'VALIDATION_ERROR');
  expectCode(await api(primary.token, postPath, 'PUT', { ...body, title: 'Andere inhoud met dezelfde sleutel' }, draftKey), 409, 'IDEMPOTENCY_CONFLICT');
  expectCode(await api(primary.token, `${postPath}/publish`, 'POST', { revision: 1 }, randomUUID()), 403, 'PERMISSION_DENIED');
  note('Real decoded media, concurrent idempotent draft creation, explicit null wire fields and denied unapproved publication');

  stage = 'explicit publication policy and exact revision';
  const allowed = await admin({ action: 'policy', allowDraft: true, allowPublish: true }); expectStatus(allowed, 200, 'EXPLICIT_PUBLISH_OPT_IN');
  ensure(allowed.body.connection.allowPublish === true, 'CURRENT_LOCAL_PUBLICATION_POLICY');
  const firstPublishKey = randomUUID();
  const live1 = await api(primary.token, `${postPath}/publish`, 'POST', { revision: 1 }, firstPublishKey); expectStatus(live1, 200, 'EXACT_REVISION_ONE_PUBLISHED');
  ensure(live1.body.state === 'published' && live1.body.publishedRevision === 1 && live1.body.publicUrl === `${publicOrigin}/blog/${initialSlug}`, 'PUBLISHED_REVISION_AND_VERIFICATION_ORIGIN');
  const page1 = await wire(live1.body.publicUrl); expectStatus(page1, 200, 'ANONYMOUS_PUBLISHED_ARTICLE');
  ensure(page1.text.includes(`href="https://www.fieldgrid.nl/blog/${initialSlug}"`) && /noindex/.test(page1.headers.get('x-robots-tag') ?? ''), 'PRODUCTION_CANONICAL_AND_LOCAL_NOINDEX');
  const visibleImage = await fetch(`${publicOrigin}/blog-media/${media.body.assetId}`, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  ensure(visibleImage.status === 200 && visibleImage.headers.get('content-type')?.startsWith('image/png'), 'PUBLISHED_MEDIA_READABLE');
  const visibleMetadata = await sharp(Buffer.from(await visibleImage.arrayBuffer())).metadata();
  ensure(visibleMetadata.width === 512 && visibleMetadata.height === 768, 'PUBLISHED_MEDIA_DECODES_CORRECTLY');
  stage = 'manual editor media remains bound to the machine article';
  const editorBefore = await wire(`${platformOrigin}/api/blog-admin`, { headers: { cookie } }); expectStatus(editorBefore, 200, 'EDITOR_ARTICLE_READ');
  const existing = editorBefore.body.posts.find(post => post.id === first.body.postId);
  ensure(existing?.revision === 1 && existing.source === 'socialhero', 'EDITOR_USES_EXISTING_MACHINE_ARTICLE');
  const manualPng = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#2563eb' } }).png().toBuffer();
  const manualMedia = await wire(`${platformOrigin}/api/blog-admin/media?postId=${first.body.postId}`, {
    method: 'POST', headers: { cookie, origin: platformOrigin, 'idempotency-key': randomUUID() }, body: form(manualPng),
  });
  expectStatus(manualMedia, 201, 'EDITOR_UPLOAD_BOUND_TO_EXISTING_POST');
  ensure(manualMedia.body.assetId !== media.body.assetId && manualMedia.body.image.src === `/blog-media/${manualMedia.body.assetId}`
    && manualMedia.body.width === 640 && manualMedia.body.height === 480, 'EDITOR_UPLOAD_DECODED_AND_MAPPED');
  expectStatus(await wire(`${publicOrigin}/blog-media/${manualMedia.body.assetId}`), 404, 'EDITOR_NEW_DRAFT_MEDIA_NOT_PUBLIC');
  const manualSave = await wire(`${platformOrigin}/api/blog-admin/${first.body.postId}`, {
    method: 'PATCH', headers: { cookie, origin: platformOrigin, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
    body: JSON.stringify({ expectedRevision: 1, fields: { ...existing.draft, title: 'Connector HTTP nieuwe concepttitel',
      hero: { ...manualMedia.body.image, alt: 'Een nieuwe blauwe afbeelding die de redacteur bij hetzelfde artikel heeft toegevoegd.' } } }),
  });
  expectStatus(manualSave, 200, 'EDITOR_UPDATES_EXISTING_MACHINE_ARTICLE');
  ensure(manualSave.body.post.id === first.body.postId && manualSave.body.post.revision === 2
    && manualSave.body.post.draft.hero.src === manualMedia.body.image.src, 'EDITOR_SAVE_PRESERVES_MAPPING_AND_HERO');
  const revision2 = await api(primary.token, postPath); expectStatus(revision2, 200, 'MACHINE_READS_EDITOR_REVISION');
  ensure(revision2.body.postId === first.body.postId && revision2.body.revision === 2 && revision2.body.publishedRevision === 1 && revision2.body.draftRevision === 2 && revision2.body.slug === initialSlug, 'DRAFT_LIVE_REVISION_SEPARATION');
  const unchangedLive = await wire(live1.body.publicUrl);
  ensure(unchangedLive.text.includes('<h1') && unchangedLive.text.includes('Connector HTTP eerste titel') && !unchangedLive.text.includes('Connector HTTP nieuwe concepttitel'), 'OLD_LIVE_VISIBLE_UNTIL_PUBLISH');
  const secondBody = { ...body, baseRevision: 1, title: 'Een verouderde machinewijziging' }; delete secondBody.slug;
  expectCode(await api(primary.token, postPath, 'PUT', secondBody, randomUUID()), 409, 'REVISION_CONFLICT');
  expectCode(await api(primary.token, `${postPath}/publish`, 'POST', { revision: 1 }, randomUUID()), 409, 'REVISION_CONFLICT');
  const oldPublishReplay = await api(primary.token, `${postPath}/publish`, 'POST', { revision: 1 }, firstPublishKey); expectStatus(oldPublishReplay, 200, 'ORIGINAL_PUBLISH_RECEIPT_REPLAY');
  ensure(oldPublishReplay.body.publishedRevision === 1, 'ORIGINAL_PUBLISH_RECEIPT_SNAPSHOT');
  const secondPublishKey = randomUUID();
  expectStatus(await api(primary.token, `${postPath}/publish`, 'POST', { revision: 2 }, secondPublishKey), 200, 'EXACT_REVISION_TWO_PUBLISHED');
  const manualLive = await wire(live1.body.publicUrl); expectStatus(manualLive, 200, 'EDITOR_REVISION_PUBLIC');
  ensure(manualLive.text.includes('Connector HTTP nieuwe concepttitel') && manualLive.text.includes(`/blog-media/${manualMedia.body.assetId}`), 'MACHINE_PUBLICATION_CONTAINS_EDITOR_TITLE_AND_HERO');
  const manualVisibleImage = await fetch(`${publicOrigin}/blog-media/${manualMedia.body.assetId}`, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  ensure(manualVisibleImage.status === 200, 'EDITOR_MEDIA_PUBLIC_AFTER_MACHINE_PUBLISH');
  const manualMetadata = await sharp(Buffer.from(await manualVisibleImage.arrayBuffer())).metadata();
  ensure(manualMetadata.width === 640 && manualMetadata.height === 480, 'EDITOR_MEDIA_PUBLIC_BYTES_DECODE');
  expectStatus(await admin({ action: 'policy', allowDraft: false, allowPublish: true }), 200, 'INDEPENDENT_PUBLICATION_PERMISSION');
  const publicationOnly = await api(primary.token, '/capabilities'); expectStatus(publicationOnly, 200, 'PUBLICATION_ONLY_CAPABILITIES');
  ensure(JSON.stringify(publicationOnly.body.scopes) === '["read","publish"]', 'PUBLICATION_PERMISSION_DOES_NOT_GRANT_DRAFT');
  expectCode(await api(primary.token, postPath, 'PUT', secondBody, randomUUID()), 403, 'PERMISSION_DENIED');
  expectCode(await api(primary.token, '/media', 'POST', form(png), randomUUID()), 403, 'PERMISSION_DENIED');
  expectStatus(await api(primary.token, `${postPath}/publish`, 'POST', { revision: 2 }, randomUUID()), 200, 'EXISTING_REVISION_PUBLISHES_WITHOUT_DRAFT_PERMISSION');
  expectStatus(await admin({ action: 'policy', allowDraft: true, allowPublish: false }), 200, 'PUBLISH_POLICY_DISABLED');
  expectCode(await api(primary.token, `${postPath}/publish`, 'POST', { revision: 2 }, secondPublishKey), 403, 'PERMISSION_DENIED');
  expectCode(await api(primary.token, `${postPath}/publish`, 'POST', { revision: 2 }, randomUUID()), 403, 'PERMISSION_DENIED');
  note('The editor uploads a new hero to the existing machine article; stale machine work conflicts and exact current-revision publication includes the editor image. Independent publish permission allows the existing revision without draft/media writes; disabling publication also blocks old receipts');

  stage = 'explicit slug publication and canonical sitemap';
  expectStatus(await admin({ action: 'policy', allowDraft: true, allowPublish: true }), 200, 'SLUG_PUBLICATION_OPT_IN');
  const finalSlug = `${initialSlug}-nieuw`;
  const revision3 = await api(primary.token, postPath, 'PUT', { ...body, baseRevision: 2, title: 'Connector HTTP gepubliceerde eindtitel', slug: finalSlug }, randomUUID()); expectStatus(revision3, 200, 'EXPLICIT_NEW_SLUG_DRAFT');
  ensure(revision3.body.revision === 3, 'THIRD_REVISION');
  const live3 = await api(primary.token, `${postPath}/publish`, 'POST', { revision: 3 }, randomUUID()); expectStatus(live3, 200, 'NEW_SLUG_PUBLISHED');
  const redirect = await wire(`${publicOrigin}/blog/${initialSlug}`); expectStatus(redirect, 308, 'OLD_SLUG_PERMANENT_REDIRECT');
  ensure(new URL(redirect.headers.get('location'), publicOrigin).pathname === `/blog/${finalSlug}`, 'DIRECT_NEW_SLUG_REDIRECT');
  const sitemap = await wire(`${publicOrigin}/sitemap.xml`); expectStatus(sitemap, 200, 'SITEMAP_AVAILABLE');
  ensure(sitemap.text.includes(`https://www.fieldgrid.nl/blog/${finalSlug}`) && !sitemap.text.includes(`${publicOrigin}/blog/`), 'SITEMAP_USES_PRODUCTION_CANONICAL');
  note('Explicit slug publication creates a direct permanent redirect and keeps production canonical URLs in the sitemap');

  stage = 'same-destination credential rotation';
  expectStatus(await admin({ action: 'policy', allowDraft: true, allowPublish: false }), 200, 'EXPLICIT_PUBLICATION_OPT_OUT_BEFORE_ROTATION');
  const replacement = newCode('primary');
  const pairedAgain = await admin({ action: 'pair', code: replacement.code, allowDraft: true, allowPublish: false }); expectStatus(pairedAgain, 200, 'SAME_DESTINATION_REPAIRED');
  ensure(pairedAgain.body.connection.destinationId === primary.destinationId && pairedAgain.body.connection.connectionId !== primary.connectionId
    && pairedAgain.body.connection.allowPublish === false, 'ROTATION_PRESERVES_DESTINATION_AND_PUBLICATION_OPT_OUT');
  expectCode(await api(primary.token, '/capabilities'), 401, 'INVALID_CREDENTIAL');
  const afterRotation = await api(replacement.token, postPath); expectStatus(afterRotation, 200, 'MAPPING_SURVIVES_ROTATION');
  ensure(afterRotation.body.postId === first.body.postId && afterRotation.body.revision === 3, 'SAME_ARTICLE_AFTER_ROTATION');
  const draftReplay = await api(replacement.token, postPath, 'PUT', body, draftKey); expectStatus(draftReplay, 200, 'DRAFT_RECEIPT_SURVIVES_ROTATION');
  ensure(JSON.stringify(draftReplay.body) === JSON.stringify(first.body), 'ORIGINAL_DRAFT_RECEIPT_SNAPSHOT');
  const rotatedMedia = await api(replacement.token, '/media', 'POST', form(png), mediaKey); expectStatus(rotatedMedia, 201, 'MEDIA_RECEIPT_SURVIVES_ROTATION');
  ensure(rotatedMedia.body.assetId === media.body.assetId, 'SAME_ASSET_AFTER_ROTATION');
  note('Reconnection preserves destination, article, idempotent receipts and publication opt-out while revoking the old token');

  stage = 'draft opt-out and read-only reconnection';
  const readOnlyPolicy = await admin({ action: 'policy', allowDraft: false, allowPublish: false }); expectStatus(readOnlyPolicy, 200, 'EXPLICIT_DRAFT_OPT_OUT');
  ensure(readOnlyPolicy.body.connection.allowDraft === false && readOnlyPolicy.body.connection.allowPublish === false, 'BOTH_LOCAL_OPT_OUTS_VISIBLE');
  const readOnlyCaps = await api(replacement.token, '/capabilities'); expectStatus(readOnlyCaps, 200, 'READ_ONLY_CAPABILITIES');
  ensure(JSON.stringify(readOnlyCaps.body.scopes) === '["read"]', 'DRAFT_OPT_OUT_IS_ENFORCED');
  expectCode(await api(replacement.token, postPath, 'PUT', body, draftKey), 403, 'PERMISSION_DENIED');
  expectCode(await api(replacement.token, '/media', 'POST', form(png), randomUUID()), 403, 'PERMISSION_DENIED');
  expectStatus(await api(replacement.token, postPath), 200, 'READ_PERMISSION_REMAINS_AFTER_DRAFT_OPT_OUT');
  const readOnlyReplacement = newCode('primary');
  const readOnlyPair = await admin({ action: 'pair', code: readOnlyReplacement.code, allowDraft: false, allowPublish: false }); expectStatus(readOnlyPair, 200, 'READ_ONLY_DESTINATION_REPAIRED');
  ensure(readOnlyPair.body.connection.allowDraft === false && readOnlyPair.body.connection.allowPublish === false, 'RECONNECT_PRESERVES_BOTH_OPT_OUTS');
  expectCode(await api(replacement.token, '/capabilities'), 401, 'INVALID_CREDENTIAL');
  const readOnlyAfterRotation = await api(readOnlyReplacement.token, '/capabilities'); expectStatus(readOnlyAfterRotation, 200, 'READ_ONLY_ROTATED_CAPABILITIES');
  ensure(JSON.stringify(readOnlyAfterRotation.body.scopes) === '["read"]', 'NO_SILENT_SCOPE_ESCALATION_ON_RECONNECT');
  note('Explicit draft and publication opt-outs survive reconnection; read stays available and draft/media receipt replays are blocked');

  stage = 'a different destination cannot access old mapping, assets or receipts';
  const other = newCode('other');
  const otherPair = await admin({ action: 'pair', code: other.code, allowDraft: true, allowPublish: true }); expectStatus(otherPair, 200, 'OTHER_DESTINATION_PAIRED');
  ensure(otherPair.body.connection.allowDraft === true && otherPair.body.connection.allowPublish === true, 'CONFIRMED_NEW_DESTINATION_DEFAULTS');
  ensure(other.destinationId !== primary.destinationId, 'DIFFERENT_LOGICAL_DESTINATION');
  expectCode(await api(readOnlyReplacement.token, '/capabilities'), 401, 'INVALID_CREDENTIAL');
  expectCode(await api(other.token, postPath), 404, 'POST_NOT_FOUND');
  expectCode(await api(other.token, postPath, 'PUT', { ...body, slug: `other-${run}` }, draftKey), 422, 'INVALID_MEDIA');
  const otherMedia = await api(other.token, '/media', 'POST', form(png), mediaKey); expectStatus(otherMedia, 201, 'OTHER_DESTINATION_OWN_MEDIA');
  ensure(otherMedia.body.assetId !== media.body.assetId, 'ASSET_ID_IS_DESTINATION_SCOPED');
  const otherDraft = await api(other.token, postPath, 'PUT', { ...body, slug: `other-${run}`, hero: { ...body.hero, assetId: otherMedia.body.assetId } }, draftKey); expectStatus(otherDraft, 200, 'OTHER_DESTINATION_OWN_ARTICLE');
  ensure(otherDraft.body.postId !== first.body.postId && otherDraft.body.revision === 1 && otherDraft.body.slug === `other-${run}`, 'ARTICLE_AND_RECEIPT_ISOLATION');
  const otherPublished = await api(other.token, `${postPath}/publish`, 'POST', { revision: 1 }, randomUUID()); expectStatus(otherPublished, 200, 'CONFIRMED_NEW_DEFAULTS_ALLOW_PUBLICATION');
  expectStatus(await wire(`${publicOrigin}/blog/other-${run}`), 200, 'OTHER_DESTINATION_PUBLICATION_VISIBLE');
  note('Another destination gets its own media, article and receipt for the same external ID and keys; explicitly confirmed defaults permit publication');

  stage = 'machine revocation, expired or mismatched codes and local disconnect';
  expectStatus(await api(other.token, '/connection', 'DELETE'), 204, 'TOKEN_SPECIFIC_DELETE');
  expectCode(await api(other.token, '/connection', 'DELETE'), 401, 'INVALID_CREDENTIAL');
  const expired = newCode('expired', { fail: 'expired' });
  expectCode(await admin({ action: 'pair', code: expired.code, allowDraft: true, allowPublish: true }), 410, 'PAIRING_EXPIRED');
  const mismatched = newCode('mismatched', { fail: 'mismatch' });
  expectCode(await admin({ action: 'pair', code: mismatched.code, allowDraft: true, allowPublish: true }), 409, 'DESTINATION_MISMATCH');
  const finalConnection = newCode('primary');
  expectStatus(await admin({ action: 'pair', code: finalConnection.code, allowDraft: false, allowPublish: false }), 200, 'FINAL_ADMIN_DISCONNECT_FIXTURE');
  expectStatus(await admin({ action: 'check' }), 200, 'LOCAL_ACTIVE_CONNECTION_CHECK');
  expectStatus(await admin({ action: 'disconnect' }), 200, 'IMMEDIATE_LOCAL_DISCONNECT');
  expectStatus(await admin({ action: 'disconnect' }), 200, 'IDEMPOTENT_LOCAL_DISCONNECT');
  expectCode(await api(finalConnection.token, '/capabilities'), 401, 'INVALID_CREDENTIAL');
  const retained = await wire(`${publicOrigin}/blog/${finalSlug}`); expectStatus(retained, 200, 'PUBLIC_HISTORY_RETAINED_AFTER_DISCONNECT');
  const editor = await wire(`${platformOrigin}/api/blog-admin`, { headers: { cookie } }); expectStatus(editor, 200, 'EDITOR_HISTORY_AVAILABLE');
  ensure(editor.body.posts.some(post => post.id === first.body.postId) && editor.body.posts.some(post => post.id === otherDraft.body.postId), 'EDITOR_RETAINS_BOTH_DESTINATION_HISTORIES');
  ensure(editor.body.posts.filter(post => post.externalId === externalId).length === 2, 'ONE_ARTICLE_PER_DESTINATION');
  ensure(adapterFailures.length === 0, 'ALL_PROVIDER_CALLBACKS_SUCCEEDED');
  note('Token-specific and local revocation are idempotent; expired/bound codes are safe errors and article history survives');

  return {
    passed: true, run, checkedAt: new Date().toISOString(),
    mode: 'Real Fieldgrid Next.js HTTP + real PostgREST/Postgres; explicit local Auth/Storage adapters and a local SocialHero claim/verify protocol adapter. No hosted claim, provider worker or social delivery.',
    source: { baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), workingTreeChangesIncluded: true },
    origins: { public: publicOrigin, platform: platformOrigin, socialHeroAdapter: adapterOrigin, canonical: 'https://www.fieldgrid.nl' },
    providerAcceptanceBoundary: 'Capabilities declare the production canonical and retain the local publication origin. This test verifies real Fieldgrid HTTP with a local claim/verify adapter; hosted pairing, provider follow-up and worker publication are covered separately.',
    post: { postId: first.body.postId, externalId, slug: finalSlug, revision: 3, title: 'Connector HTTP gepubliceerde eindtitel' },
    otherPost: { postId: otherDraft.body.postId, externalId, slug: otherDraft.body.slug, revision: 1 },
    assertions, checks, adapter: { claims: [...codes.values()].reduce((sum, entry) => sum + entry.claimRequests, 0), verifies: [...codes.values()].reduce((sum, entry) => sum + entry.verifyRequests, 0), lostVerifiedResponses: adapterEvents.filter(event => event === 'verified-response-lost').length, callbackFailures: adapterFailures.length },
    finalConnectionState: 'disconnected',
  };
}

try {
  const report = await main();
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  const report = { passed: false, run, checkedAt: new Date().toISOString(), stage, assertions, checks,
    failure: error instanceof AcceptanceError ? { code: error.code, ...error.detail } : { code: 'LOCAL_ACCEPTANCE_FAILED' },
    adapterFailures };
  // Avoid every raw exception/response: even failed acceptance must not print credentials.
  if (fixturePath === '/tmp/fieldgrid-blog-runtime/fixture.json') writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
}
