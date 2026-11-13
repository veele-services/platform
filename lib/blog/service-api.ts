import 'server-only';
import { createHash } from 'node:crypto';
import { requireBlogCredential } from './auth';
import { blogQuery, blogWrite, type BlogTaxonomy } from './data';
import { BLOG_MEDIA_LIMIT, BLOG_MEDIA_TYPES, getBlogAsset, uploadBlogMedia } from './media';
import { blogOrigin, BLOG_CANONICAL_ORIGIN, blogEnvironment } from './origin';
import { BlogError, asRecord, assertPublishable, markdownDocument, positiveInt, text, validateBlogFields } from './validation';
import { expectedRevision, externalId, failure, idempotencyKey, invalidateBlog, json, publication, reply } from './http';
import type { BlogEntry } from './types';

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
}

async function fieldsFromService(body: Record<string, unknown>, current: BlogEntry | null) {
  const content = asRecord(body.content);
  if (content.format !== 'markdown' && content.format !== 'tiptap') throw new BlogError(422, 'VALIDATION_ERROR', 'Gebruik markdown of tiptap als inhoudsformaat.');
  const seo = asRecord(body.seo ?? {});
  const hero = body.hero === null || body.hero === undefined ? null : asRecord(body.hero);
  const taxonomy = await blogQuery<BlogTaxonomy>('taxonomy');
  const authorId = text(body.authorId, 100, 'De auteur-ID');
  const categoryId = text(body.categoryId, 80, 'De categorie-ID');
  const author = taxonomy.authors.find(item => item.id === authorId);
  const category = taxonomy.categories.find(item => item.id === categoryId);
  if (!author || !category) throw new BlogError(422, 'VALIDATION_ERROR', 'Kies een bestaande auteur en categorie uit capabilities.');
  const [heroImage, shareImage] = await Promise.all([
    hero ? getBlogAsset(hero.assetId, hero.alt, hero.focalPoint) : null,
    body.ogImageAssetId ? getBlogAsset(body.ogImageAssetId, hero?.alt ?? body.title) : null,
  ]);
  const fields = validateBlogFields({ ...body, authorId, categoryId, author: author.name, category: category.name,
    slug: body.slug ?? current?.draft.slug, content: content.format === 'markdown' ? markdownDocument(content.body) : content.body,
    seoTitle: seo.title, seoDescription: seo.description, hero: heroImage, shareImage,
  });
  if (!fields.title || !fields.slug) throw new BlogError(422, 'VALIDATION_ERROR', 'Een titel en slug zijn verplicht.');
  return fields;
}

export async function socialHeroApi(request: Request, path: string[]) {
  try {
    if (request.method === 'GET' && path.length === 1 && path[0] === 'capabilities') {
      const credential = await requireBlogCredential(request, 'read');
      const taxonomy = await blogQuery<BlogTaxonomy>('taxonomy');
      return reply({ siteId: 'fieldgrid', environment: blogEnvironment(), contractVersion: '1', blogPath: '/blog', publicOrigin: blogOrigin(), canonicalOrigin: BLOG_CANONICAL_ORIGIN,
        contentTypes: ['blog', 'article'], contentFormats: ['markdown', 'tiptap'], locales: ['nl-NL'],
        permissions: { read: credential.scopes.includes('read'), media: credential.scopes.includes('media:write'), drafts: credential.scopes.includes('draft:write'), publish: credential.scopes.includes('publish') },
        media: { formats: BLOG_MEDIA_TYPES, maxBytes: BLOG_MEDIA_LIMIT, maxWidth: 8192, maxHeight: 8192, maxPixels: 24_000_000 }, limits: { maxPayloadBytes: 512_000, requestsPerMinute: 60 }, ...taxonomy });
    }
    if (request.method === 'POST' && path.length === 1 && path[0] === 'media') {
      const credential = await requireBlogCredential(request, 'media:write');
      return reply(await uploadBlogMedia(request, idempotencyKey(request), credential), 201);
    }
    if (path[0] !== 'posts' || ![2, 3].includes(path.length) || path.length === 3 && path[2] !== 'publish') return reply({ code: 'NOT_FOUND', error: 'Route niet gevonden.' }, 404);
    const xid = externalId(path[1]);
    const scope = request.method === 'GET' ? 'read' : request.method === 'PUT' && path.length === 2 ? 'draft:write' : request.method === 'POST' && path[2] === 'publish' ? 'publish' : null;
    if (!scope) return reply({ code: 'NOT_FOUND', error: 'Route niet gevonden.' }, 404);
    const credential = await requireBlogCredential(request, scope);
    const current = await blogQuery<BlogEntry | null>('get', { externalId: xid });
    if (request.method === 'GET') {
      if (!current) return reply({ code: 'NOT_FOUND', error: 'Artikel niet gevonden.' }, 404);
      return reply(publication(current), 200, { etag: `"${current.revision}"` });
    }
    const key = idempotencyKey(request);
    const body = await json(request);
    const credentials = { credentialId: credential.id, tokenHash: credential.tokenHash };
    if (scope === 'draft:write') {
      const revision = expectedRevision(request);
      const requestHash = createHash('sha256').update(stable({ externalId: xid, expectedRevision: revision, body })).digest('hex');
      // Normalize only a new operation. A replay must return its committed
      // snapshot even after a newer slug or taxonomy revision has appeared.
      const replay = await blogQuery<BlogEntry | null>('receipt', { operation: 'draft', idempotencyKey: key, requestHash });
      if (replay) return reply(publication(replay), 200, { etag: `"${replay.revision}"` });
      const entry = await blogWrite<BlogEntry>('draft', { externalId: xid, source: 'socialhero', fields: await fieldsFromService(body, current), expectedRevision: revision, idempotencyKey: key, requestHash, ...credentials });
      return reply(publication(entry), 200, { etag: `"${entry.revision}"` });
    }
    const revision = positiveInt(body.revision, 'De te publiceren revisie');
    // SQL also validates publishability and the expected revision atomically.
    // Do not compare a replay against current state here: the durable receipt
    // must be returned even after a newer revision has subsequently appeared.
    const entry = await blogWrite<BlogEntry>('publish', { externalId: xid, revision, idempotencyKey: key, ...credentials });
    assertPublishable(entry.published!);
    invalidateBlog();
    return reply(publication(entry));
  } catch (error) { return failure(error); }
}
