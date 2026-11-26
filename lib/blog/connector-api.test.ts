import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn(), write: vi.fn(), read: vi.fn(), connectorWrite: vi.fn(), upload: vi.fn(), asset: vi.fn() }));
vi.mock('./auth', () => ({ requireBlogCredential: mocks.auth }));
vi.mock('./data', () => ({ blogQuery: mocks.query, blogWrite: mocks.write }));
vi.mock('./connector-data', () => ({ connectorRead: mocks.read, connectorWrite: mocks.connectorWrite }));
vi.mock('./media', () => ({ BLOG_MEDIA_LIMIT: 10_485_760, BLOG_MEDIA_TYPES: ['image/jpeg', 'image/png', 'image/webp'], uploadBlogMedia: mocks.upload, getBlogAsset: mocks.asset }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('./publication-check', () => ({ verifyPublishedBlog: async () => true }));
vi.mock('./origin', () => ({
  blogEnvironment: () => 'staging', blogOrigin: () => 'https://www.staging.fieldgrid.nl', BLOG_CANONICAL_ORIGIN: 'https://www.fieldgrid.nl',
  blogUrl: (path: string, origin = 'https://www.fieldgrid.nl') => new URL(path, origin).href,
}));
vi.mock('./connector-config', () => ({ fieldgridConnectorConfiguration: () => ({ siteId: 'fieldgrid', siteName: 'Fieldgrid', environment: 'staging', origin: 'https://www.staging.fieldgrid.nl' }) }));
import { socialHeroApi } from './service-api';
import { emptyBlogFields } from './types';
import { BlogError } from './validation';

const credential = { id: '5b6c5c5f-23a0-488c-9d31-ab7fa662126b', siteId: 'fieldgrid', environment: 'staging', tokenHash: 'a'.repeat(64), scopes: ['read', 'draft'], connectionId: 'ee40938f-e20b-4bcf-8243-59802f5ddc73', destinationId: 'ba0fab9f-0dc3-4393-8755-4b7f48f56d79', state: 'active' };
const taxonomy = { authors: [{ id: 'fieldgrid-redactie', name: 'Fieldgrid' }], categories: [{ id: 'planning', name: 'Planning' }] };
const fields = { ...emptyBlogFields(), title: 'Werk plannen', slug: 'werk-plannen', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Een echte proef.' }] }] } };
const post = { id: '55c9c47f-f6bf-4e75-991c-31a9ca32250b', externalId: 'article-1', draft: fields, revision: 1, published: null, publishedRevision: null, publishedAt: null };
const draft = { baseRevision: null, type: 'blog', locale: 'nl-NL', title: 'Werk plannen', content: { format: 'markdown', body: '## Planning\nEen echte proef.' } };
const request = (method: string, path: string[], body?: unknown) => new Request(`https://www.staging.fieldgrid.nl/api/socialhero/v1/${path.join('/')}`, {
  method, headers: { 'content-type': 'application/json', 'idempotency-key': 'request-1' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  mocks.auth.mockResolvedValue({ ...credential });
  mocks.query.mockResolvedValue(taxonomy);
  mocks.read.mockImplementation(async (_credential: unknown, operation: string) => operation === 'capabilities' ? { credential, ...taxonomy, unexpectedPrivateField: 'must-not-escape' } : null);
  mocks.connectorWrite.mockResolvedValue(post);
});

describe('paired website publication wire contract', () => {
  it('returns current connection permissions and separates the staging origin from its production canonical', async () => {
    const response = await socialHeroApi(request('GET', ['capabilities']), ['capabilities']);
    const body = await response.json();
    expect(body).toMatchObject({ contractVersion: 1, connectionId: credential.connectionId, destinationId: credential.destinationId, credentialState: 'active', origin: 'https://www.staging.fieldgrid.nl', scopes: ['read', 'draft'], authors: taxonomy.authors, media: { mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] } });
    expect(body.canonicalOrigin).toBe('https://www.fieldgrid.nl');
    expect(body).not.toHaveProperty('tokenHash');
    expect(body).not.toHaveProperty('unexpectedPrivateField');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('creates a scoped draft with explicit nullable wire fields and actual CMS defaults', async () => {
    const path = ['posts', 'article-1'];
    const response = await socialHeroApi(request('PUT', path, draft), path);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ postId: post.id, externalId: 'article-1', slug: fields.slug, state: 'draft', revision: 1, draftRevision: 1, publishedRevision: null, previewUrl: null, publicUrl: null, publishedAt: null });
    expect(mocks.connectorWrite).toHaveBeenCalledWith(credential, 'draft', expect.objectContaining({ expectedRevision: 0, externalId: 'article-1', fields: expect.objectContaining({ authorId: 'fieldgrid-redactie', categoryId: 'planning' }) }));
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it.each([
    { ...draft, baseRevision: undefined }, { ...draft, type: undefined }, { ...draft, locale: undefined },
    { ...draft, hero: { assetId: post.id } }, { ...draft, hero: { assetId: post.id, alt: '' } },
  ])('rejects incomplete modern wire fields before any CMS mutation', async body => {
    const response = await socialHeroApi(request('PUT', ['posts', 'article-1'], body), ['posts', 'article-1']);
    expect([400, 422]).toContain(response.status);
    expect((await response.json()).code).toBe('VALIDATION_ERROR');
    expect(mocks.connectorWrite).not.toHaveBeenCalled();
  });
  it('returns a durable receipt before later taxonomy normalization can change the operation', async () => {
    mocks.read.mockImplementation(async (_credential: unknown, operation: string) => operation === 'receipt' ? post : null);
    mocks.query.mockRejectedValue(new Error('taxonomy no longer available'));
    const response = await socialHeroApi(request('PUT', ['posts', 'article-1'], draft), ['posts', 'article-1']);
    expect(response.status).toBe(200);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.connectorWrite).not.toHaveBeenCalled();
  });
  it('reports a live revision alongside a newer draft and keeps its current public URL', async () => {
    mocks.read.mockResolvedValue({ ...post, revision: 2, draft: { ...fields, slug: 'new-draft' }, published: fields, publishedRevision: 1, publishedAt: '2026-11-26T10:00:00.000Z' });
    const response = await socialHeroApi(request('GET', ['posts', 'article-1']), ['posts', 'article-1']);
    expect(await response.json()).toMatchObject({ state: 'published', revision: 2, draftRevision: 2, publishedRevision: 1, publicUrl: 'https://www.staging.fieldgrid.nl/blog/werk-plannen', previewUrl: null });
  });
  it('refuses publishing when current local authority denies it and exposes only safe errors', async () => {
    mocks.auth.mockRejectedValue(new BlogError(403, 'PERMISSION_DENIED', 'De website staat deze actie niet toe.'));
    const response = await socialHeroApi(request('POST', ['posts', 'article-1', 'publish'], { revision: 1 }), ['posts', 'article-1', 'publish']);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'PERMISSION_DENIED', message: 'De website staat deze actie niet toe.', requestId: expect.any(String) });
    expect(mocks.connectorWrite).not.toHaveBeenCalled();
  });
  it('revokes only the authenticated credential with an empty no-store 204 response', async () => {
    const response = await socialHeroApi(request('DELETE', ['connection']), ['connection']);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.connectorWrite).toHaveBeenCalledWith(credential, 'revoke');
  });
});
