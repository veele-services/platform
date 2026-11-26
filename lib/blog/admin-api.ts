import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { requireBlogEditor, requireBlogHost, requireSameOrigin } from './auth';
import { blogAdminQuery, blogAdminWrite, type BlogTaxonomy } from './data';
import { uploadBlogMedia } from './media';
import { failure, invalidateBlog, json, reply } from './http';
import { BlogError, positiveInt, validateBlogFields } from './validation';
import { normalizeSlug, type BlogEntry } from './types';
import { blogEnvironment } from './origin';
import { blogConnectorAdmin } from './connector-admin';
import { verifyPublishedBlog } from './publication-check';

export async function blogAdminApi(request: Request, path: string[] = []) {
  try {
    requireBlogHost(request, 'platform');
    const db = await requireBlogEditor();
    if (path.length === 1 && path[0] === 'connection') return blogConnectorAdmin(request, db);
    if (request.method === 'GET' && path.length === 1 && path[0] === 'taxonomy') return reply(await blogAdminQuery('taxonomy.manage', {}, db));
    if (request.method === 'GET' && path.length === 2 && path[1] === 'revisions' && /^[a-f0-9-]{36}$/.test(path[0])) return reply(await blogAdminQuery('history', { id: path[0] }, db));
    if (request.method === 'GET' && !path.length) {
      const [posts, taxonomy] = await Promise.all([blogAdminQuery<BlogEntry[]>('list', {}, db), blogAdminQuery<BlogTaxonomy>('taxonomy', {}, db)]);
      return reply({ posts, configured: true, ...taxonomy });
    }
    requireSameOrigin(request);
    const key = request.headers.get('idempotency-key') ?? randomUUID();
    if (request.method === 'POST' && path.length === 1 && path[0] === 'media') {
      const postId = new URL(request.url).searchParams.get('postId');
      if (postId !== null) {
        if (!/^[a-f0-9-]{36}$/.test(postId)) throw new BlogError(422, 'INVALID_MEDIA', 'Kies een geldig artikel voor deze afbeelding.');
        if (!await blogAdminQuery<BlogEntry | null>('get', { id: postId }, db)) throw new BlogError(404, 'POST_NOT_FOUND', 'Artikel niet gevonden.');
      }
      const media = await uploadBlogMedia(request, key, undefined, postId ?? undefined);
      return reply({ ...media, image: { src: media.src, width: media.width, height: media.height, alt: '', x: 0.5, y: 0.5 } }, 201);
    }
    const body = await json(request);
    if (request.method === 'POST' && path.length === 1 && path[0] === 'taxonomy') {
      if (!['author', 'category'].includes(String(body.kind)) || typeof body.name !== 'string' || !body.name.trim() || body.name.length > 160 || typeof body.active !== 'boolean') throw new BlogError(422, 'VALIDATION_ERROR', 'Vul een naam en de actieve status van de auteur of categorie in.');
      const id = typeof body.id === 'string' ? body.id : normalizeSlug(body.name);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 100) throw new BlogError(422, 'VALIDATION_ERROR', 'Gebruik een geldige unieke ID met kleine letters, cijfers en koppeltekens.');
      await blogAdminWrite(`taxonomy.${body.kind}`, { id, name: body.name.trim(), active: body.active, create: body.id === undefined, idempotencyKey: key }, db);
      return reply(await blogAdminQuery('taxonomy.manage', {}, db));
    }
    if (request.method === 'POST' && !path.length) {
      const externalId = `manual:${createHash('sha256').update(`fieldgrid:${blogEnvironment()}:${key}`).digest('hex')}`;
      const post = await blogAdminWrite<BlogEntry>('draft', { externalId, source: 'manual', fields: validateBlogFields(body.fields), expectedRevision: 0, idempotencyKey: key }, db);
      return reply({ post }, 201);
    }
    if (!/^[a-f0-9-]{36}$/.test(path[0] ?? '')) throw new BlogError(404, 'NOT_FOUND', 'Artikel niet gevonden.');
    if (request.method === 'PATCH' && path.length === 1) {
      const current = await blogAdminQuery<BlogEntry | null>('get', { id: path[0] }, db);
      if (!current) throw new BlogError(404, 'NOT_FOUND', 'Artikel niet gevonden.');
      const post = await blogAdminWrite<BlogEntry>('draft', { id: current.id, externalId: current.externalId, source: current.source, fields: validateBlogFields(body.fields), expectedRevision: positiveInt(body.expectedRevision, 'De verwachte revisie'), idempotencyKey: key }, db);
      return reply({ post });
    }
    if (request.method === 'POST' && path.length === 2 && path[1] === 'publish') {
      const post = await blogAdminWrite<BlogEntry>('publish', { id: path[0], revision: positiveInt(body.expectedRevision, 'De te publiceren revisie'), idempotencyKey: key }, db);
      invalidateBlog();
      const verified = await verifyPublishedBlog(post);
      return reply({ post: { ...post, publicationVerified: verified }, publication: { state: verified ? 'published' : 'publishing' } }, verified ? 200 : 202);
    }
    return reply({ code: 'NOT_FOUND', error: 'Route niet gevonden.' }, 404);
  } catch (error) { return failure(error); }
}
