import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { requireBlogCredential, type BlogCredential } from './auth';
import { blogQuery, blogWrite, type BlogTaxonomy } from './data';
import { BLOG_MEDIA_LIMIT, BLOG_MEDIA_TYPES, getBlogAsset, uploadBlogMedia } from './media';
import { blogOrigin, BLOG_CANONICAL_ORIGIN, blogEnvironment } from './origin';
import { BlogError, asRecord, assertPublishable, markdownDocument, positiveInt, text, validateBlogFields } from './validation';
import { expectedRevision, externalId, failure, idempotencyKey, invalidateBlog, json, publication, reply } from './http';
import type { BlogEntry } from './types';
import { connectorRead, connectorWrite } from './connector-data';
import { fieldgridConnectorConfiguration } from './connector-config';
import { draftRequest } from '@/lib/socialhero-connector/contract';
import { verifyPublishedBlog } from './publication-check';

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
}

async function fieldsFromService(body: Record<string, unknown>, current: BlogEntry | null, credential: BlogCredential) {
  const content = asRecord(body.content);
  if (content.format !== 'markdown' && content.format !== 'tiptap') throw new BlogError(422, 'VALIDATION_ERROR', 'Gebruik markdown of tiptap als inhoudsformaat.');
  const seo = asRecord(body.seo ?? {});
  const hero = body.hero === null || body.hero === undefined ? null : asRecord(body.hero);
  const taxonomy = await blogQuery<BlogTaxonomy>('taxonomy');
  const authorId = text(body.authorId ?? current?.draft.authorId ?? 'fieldgrid-redactie', 100, 'De auteur-ID');
  const categoryId = text(body.categoryId ?? current?.draft.categoryId ?? 'planning', 80, 'De categorie-ID');
  const author = taxonomy.authors.find(item => item.id === authorId);
  const category = taxonomy.categories.find(item => item.id === categoryId);
  if (!author || !category) throw new BlogError(422, 'VALIDATION_ERROR', 'Kies een bestaande auteur en categorie uit capabilities.');
  const [heroImage, shareImage] = await Promise.all([
    hero ? getBlogAsset(hero.assetId, hero.alt, hero.focalPoint, credential) : null,
    body.ogImageAssetId ? getBlogAsset(body.ogImageAssetId, hero?.alt ?? body.title, null, credential) : null,
  ]);
  const fields = validateBlogFields({ ...body, authorId, categoryId, author: author.name, category: category.name,
    slug: body.slug ?? (current?.published || current?.draft.slugManual ? current?.draft.slug : undefined),
    slugManual: body.slug !== undefined || current?.draft.slugManual === true,
    content: content.format === 'markdown' ? markdownDocument(content.body) : content.body,
    seoTitle: seo.title, seoDescription: seo.description, hero: heroImage, shareImage,
  });
  if (!fields.title || !fields.slug) throw new BlogError(422, 'VALIDATION_ERROR', 'Een titel en slug zijn verplicht.');
  return fields;
}

export async function socialHeroApi(request: Request, path: string[]) {
  const requestId = randomUUID();
  const respond = (body: unknown, status = 200, headers: Record<string, string> = {}) => {
    console.info(JSON.stringify({ event: 'blog_api_result', requestId, status }));
    return reply(body, status, { 'x-request-id': requestId, ...headers });
  };
  try {
    if (request.method === 'GET' && path.length === 1 && path[0] === 'capabilities') {
      const credential = await requireBlogCredential(request, 'read');
      if (credential.connectionId) {
        const configuration = fieldgridConnectorConfiguration();
        if (!configuration) throw new BlogError(503, 'TEMPORARILY_UNAVAILABLE', 'Deze websiteverbinding is nog niet ingesteld.');
        const { credential: actual, ...taxonomy } = await connectorRead<{ credential: BlogCredential } & BlogTaxonomy>(credential, 'capabilities');
        return respond({ contractVersion: 1, connectionId: actual.connectionId, destinationId: actual.destinationId,
          credentialState: actual.state, siteId: configuration.siteId, siteName: configuration.siteName,
          origin: configuration.origin, canonicalOrigin: BLOG_CANONICAL_ORIGIN, environment: configuration.environment, blogPath: '/blog',
          contentTypes: ['blog', 'article'], locales: ['nl-NL'], scopes: actual.scopes,
          contentFormats: ['markdown', 'tiptap'], media: { mimeTypes: BLOG_MEDIA_TYPES, maxBytes: BLOG_MEDIA_LIMIT, maxWidth: 8192, maxHeight: 8192, maxPixels: 24_000_000 },
          authors: taxonomy.authors, categories: taxonomy.categories });
      }
      const taxonomy = await blogQuery<BlogTaxonomy>('taxonomy');
      return respond({ siteId: 'fieldgrid', environment: blogEnvironment(), contractVersion: '1', blogPath: '/blog', publicOrigin: blogOrigin(), canonicalOrigin: BLOG_CANONICAL_ORIGIN,
        contentTypes: ['blog', 'article'], contentFormats: ['markdown', 'tiptap'], locales: ['nl-NL'],
        permissions: { read: credential.scopes.includes('read'), media: credential.scopes.includes('media:write'), drafts: credential.scopes.includes('draft:write'), publish: credential.scopes.includes('publish') },
        media: { formats: BLOG_MEDIA_TYPES, maxBytes: BLOG_MEDIA_LIMIT, maxWidth: 8192, maxHeight: 8192, maxPixels: 24_000_000 }, limits: { maxPayloadBytes: 512_000, requestsPerMinute: 60 }, ...taxonomy });
    }
    if (request.method === 'POST' && path.length === 1 && path[0] === 'media') {
      const credential = await requireBlogCredential(request, 'media:write');
      const media = await uploadBlogMedia(request, idempotencyKey(request), credential);
      return respond(credential.connectionId ? { assetId: media.assetId, mimeType: media.type, width: media.width, height: media.height } : media, 201);
    }
    if (request.method === 'DELETE' && path.length === 1 && path[0] === 'connection') {
      const credential = await requireBlogCredential(request, 'read');
      if (!credential.connectionId) throw new BlogError(403, 'PERMISSION_DENIED', 'Trek dit operatorcredential via de bestaande beheerprocedure in.');
      await connectorWrite(credential, 'revoke');
      return new Response(null, { status: 204, headers: { 'cache-control': 'no-store', 'x-request-id': requestId } });
    }
    if (path[0] !== 'posts' || ![2, 3].includes(path.length) || path.length === 3 && path[2] !== 'publish') throw new BlogError(404, 'NOT_FOUND', 'Route niet gevonden.');
    const xid = externalId(path[1]);
    const scope = request.method === 'GET' ? 'read' : request.method === 'PUT' && path.length === 2 ? 'draft:write' : request.method === 'POST' && path[2] === 'publish' ? 'publish' : null;
    if (!scope) throw new BlogError(404, 'NOT_FOUND', 'Route niet gevonden.');
    const credential = await requireBlogCredential(request, scope);
    const modern = Boolean(credential.connectionId);
    const current = modern ? await connectorRead<BlogEntry | null>(credential, 'get', { externalId: xid }) : await blogQuery<BlogEntry | null>('get', { externalId: xid });
    if (request.method === 'GET') {
      if (!current) throw new BlogError(404, modern ? 'POST_NOT_FOUND' : 'NOT_FOUND', 'Artikel niet gevonden.');
      const verified = current.publishedRevision ? await verifyPublishedBlog(current) : false;
      return respond(publication(current, modern, verified), 200, { etag: `"${current.revision}"` });
    }
    const key = idempotencyKey(request);
    const body = await json(request);
    const credentials = { credentialId: credential.id, tokenHash: credential.tokenHash };
    if (scope === 'draft:write') {
      if (modern && !Object.hasOwn(body, 'baseRevision')) throw new BlogError(400, 'VALIDATION_ERROR', 'baseRevision is verplicht: null bij aanmaken, anders de actuele revisie.');
      if (modern && (!draftRequest.safeParse(body).success || body.locale !== 'nl-NL')) throw new BlogError(422, 'VALIDATION_ERROR', 'Gebruik baseRevision, type blog of article, taal nl-NL, titel en Markdown-inhoud. Een hero vereist een eigen assetId en alt-tekst.');
      const revision = modern ? body.baseRevision === null ? 0 : positiveInt(body.baseRevision, 'De verwachte revisie') : expectedRevision(request);
      if (modern && request.headers.has('if-match') && expectedRevision(request) !== revision) throw new BlogError(409, 'REVISION_CONFLICT', 'baseRevision en If-Match moeten dezelfde revisie aanwijzen.');
      const requestHash = createHash('sha256').update(stable({ externalId: xid, expectedRevision: revision, body })).digest('hex');
      // Normalize only a new operation. A replay must return its committed
      // snapshot even after a newer slug or taxonomy revision has appeared.
      const replayPayload = { operation: 'draft', idempotencyKey: key, requestHash };
      const replay = modern ? await connectorRead<BlogEntry | null>(credential, 'receipt', replayPayload) : await blogQuery<BlogEntry | null>('receipt', replayPayload);
      if (replay) return respond(publication(replay, modern, replay.publishedRevision ? await verifyPublishedBlog(replay) : false), 200, { etag: `"${replay.revision}"` });
      const payload = { externalId: xid, source: 'socialhero', fields: await fieldsFromService(body, current, credential), expectedRevision: revision, idempotencyKey: key, requestHash, ...credentials };
      const entry = modern ? await connectorWrite<BlogEntry>(credential, 'draft', payload) : await blogWrite<BlogEntry>('draft', payload);
      return respond(publication(entry, modern, entry.publishedRevision ? await verifyPublishedBlog(entry) : false), 200, { etag: `"${entry.revision}"` });
    }
    const revision = positiveInt(body.revision, 'De te publiceren revisie');
    // SQL also validates publishability and the expected revision atomically.
    // Do not compare a replay against current state here: the durable receipt
    // must be returned even after a newer revision has subsequently appeared.
    const payload = { externalId: xid, revision, idempotencyKey: key, ...credentials };
    const entry = modern ? await connectorWrite<BlogEntry>(credential, 'publish', payload) : await blogWrite<BlogEntry>('publish', payload);
    assertPublishable(entry.published!);
    invalidateBlog();
    const verified = await verifyPublishedBlog(entry);
    return respond(publication(entry, modern, verified), verified ? 200 : 202, verified ? {} : { 'retry-after': '5' });
  } catch (error) { return failure(error, requestId); }
}
