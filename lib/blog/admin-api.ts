import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { requireBlogEditor, requireBlogHost, requireSameOrigin } from './auth';
import { blogAdminQuery, blogAdminWrite, type BlogTaxonomy } from './data';
import { uploadBlogMedia } from './media';
import { failure, invalidateBlog, json, reply } from './http';
import { BlogError, positiveInt, validateBlogFields } from './validation';
import type { BlogEntry } from './types';
import { blogEnvironment } from './origin';

export async function blogAdminApi(request: Request, path: string[] = []) {
  try {
    requireBlogHost(request, 'platform');
    const db = await requireBlogEditor();
    if (request.method === 'GET' && !path.length) {
      const [posts, taxonomy] = await Promise.all([blogAdminQuery<BlogEntry[]>('list', {}, db), blogAdminQuery<BlogTaxonomy>('taxonomy', {}, db)]);
      return reply({ posts, configured: true, ...taxonomy });
    }
    requireSameOrigin(request);
    const key = request.headers.get('idempotency-key') ?? randomUUID();
    if (request.method === 'POST' && path.length === 1 && path[0] === 'media') {
      const media = await uploadBlogMedia(request, key);
      return reply({ ...media, image: { src: media.src, width: media.width, height: media.height, alt: '', x: 0.5, y: 0.5 } }, 201);
    }
    const body = await json(request);
    if (request.method === 'POST' && !path.length) {
      const externalId = `manual:${createHash('sha256').update(`fieldgrid:${blogEnvironment()}:${key}`).digest('hex')}`;
      const post = await blogAdminWrite<BlogEntry>('draft', { externalId, source: 'manual', fields: validateBlogFields(body.fields), expectedRevision: 0, idempotencyKey: key }, db);
      return reply({ post }, 201);
    }
    if (!/^[a-f0-9-]{36}$/.test(path[0] ?? '')) throw new BlogError(404, 'NOT_FOUND', 'Artikel niet gevonden.');
    if (request.method === 'PATCH' && path.length === 1) {
      const current = await blogAdminQuery<BlogEntry | null>('get', { id: path[0] }, db);
      if (!current) throw new BlogError(404, 'NOT_FOUND', 'Artikel niet gevonden.');
      const post = await blogAdminWrite<BlogEntry>('draft', { externalId: current.externalId, source: current.source, fields: validateBlogFields(body.fields), expectedRevision: positiveInt(body.expectedRevision, 'De verwachte revisie'), idempotencyKey: key }, db);
      return reply({ post });
    }
    if (request.method === 'POST' && path.length === 2 && path[1] === 'publish') {
      const post = await blogAdminWrite<BlogEntry>('publish', { id: path[0], revision: positiveInt(body.expectedRevision, 'De te publiceren revisie'), idempotencyKey: key }, db);
      invalidateBlog();
      return reply({ post });
    }
    return reply({ code: 'NOT_FOUND', error: 'Route niet gevonden.' }, 404);
  } catch (error) { return failure(error); }
}
