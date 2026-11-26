import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/tickets/rpc', () => ({ ticketRpc: mocks.rpc }));
vi.mock('./origin', () => ({ blogEnvironment: () => 'staging', blogOrigin: () => 'https://www.staging.fieldgrid.nl', blogUrl: (path: string, origin: string) => new URL(path, origin).href }));
import { publicationHeadMatches, verifyPublishedBlog } from './publication-check';
import { emptyBlogFields, type BlogEntry } from './types';

const head = '<head><link rel="canonical" href="https://www.fieldgrid.nl/blog/proef"/><meta name="socialhero:external-id" content="article-1"/><meta name="socialhero:revision" content="2"/></head>';
const fields = { ...emptyBlogFields(), title: 'Proef', slug: 'proef' };
const post: BlogEntry = { id: '786465f2-555a-479f-aedd-89a107fb8bac', externalId: 'article-1', source: 'socialhero', draft: fields, revision: 2, published: fields, publishedRevision: 2, publishedAt: '2026-11-26T12:00:00.000Z', createdAt: '2026-11-26T11:00:00.000Z', updatedAt: '2026-11-26T12:00:00.000Z' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockImplementation(async (_client: unknown, _name: string, args: { operation: string }) => ({ verified: args.operation === 'publication.confirm' }));
});

describe('observable publication completion', () => {
  it('requires exact opaque revision and external identity in the original head', () => {
    expect(publicationHeadMatches(head, 'article-1', 2)).toBe(true);
    expect(publicationHeadMatches(head, 'article-1', 1)).toBe(false);
    expect(publicationHeadMatches(head, 'article-2', 2)).toBe(false);
    expect(publicationHeadMatches('<head></head><body>' + head + '</body>', 'article-1', 2)).toBe(false);
    expect(publicationHeadMatches(head.replace('</head>', '<meta name="socialhero:revision" content="1"/></head>'), 'article-1', 2)).toBe(false);
  });
  it('checks the staging article URL independently of its accepted production canonical', async () => {
    const fetcher = vi.fn(async () => new Response(head, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
    expect(await verifyPublishedBlog(post, fetcher)).toBe(true);
    expect(fetcher).toHaveBeenCalledWith('https://www.staging.fieldgrid.nl/blog/proef', expect.objectContaining({ redirect: 'manual', cache: 'no-store' }));
    expect(mocks.rpc).toHaveBeenLastCalledWith({}, 'fieldgrid_blog_connector_server_read', expect.objectContaining({ operation: 'publication.confirm', payload: expect.objectContaining({ id: post.id, revision: 2, environment: 'staging' }) }));
  });
  it.each([
    () => new Response(head.replace('content="2"', 'content="1"'), { headers: { 'content-type': 'text/html' } }),
    () => new Response(head, { status: 503, headers: { 'content-type': 'text/html' } }),
    () => Response.redirect('https://www.fieldgrid.nl/blog/proef', 308),
    () => new Response('x'.repeat(131_073) + head, { headers: { 'content-type': 'text/html' } }),
  ])('keeps processing state until the intended public response is observable', async response => {
    expect(await verifyPublishedBlog(post, vi.fn(async () => response()))).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][2].operation).toBe('publication.status');
  });
  it('retains historical confirmation across retries after a newer public revision appears', async () => {
    mocks.rpc.mockResolvedValue({ verified: true });
    const fetcher = vi.fn();
    expect(await verifyPublishedBlog(post, fetcher)).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
