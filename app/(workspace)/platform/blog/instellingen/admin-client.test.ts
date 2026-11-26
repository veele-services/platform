import { afterEach, describe, expect, it, vi } from 'vitest';
import { blogAdmin } from '@/components/fieldgrid/blog-editor/admin-api';

afterEach(() => vi.unstubAllGlobals());
const image = { src: '/blog-media/00000000-0000-4000-8000-000000000001', width: 800, height: 600, alt: '', x: .5, y: .5 };

describe('blog editor browser API contract', () => {
  it('associates manual replacement media with the existing article without exposing destination credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ image }));
    vi.stubGlobal('fetch', fetcher);
    const postId = '00000000-0000-4000-8000-000000000002';
    const file = new File(['fixture'], 'replacement.png', { type: 'image/png' });
    expect(await blogAdmin.upload(file, postId)).toEqual(image);
    expect(fetcher.mock.calls[0][0]).toBe(`/api/blog-admin/media?postId=${postId}`);
    const request = fetcher.mock.calls[0][1];
    expect(request.method).toBe('POST');
    expect(request.body).toBeInstanceOf(FormData);
    expect([...request.body.keys()]).toEqual(['file']);
    expect(request.headers).toBeUndefined();
  });

  it('keeps media for a new unsaved article unbound and encodes an existing article query value', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ image })));
    vi.stubGlobal('fetch', fetcher);
    const file = new File(['fixture'], 'new.png', { type: 'image/png' });
    await blogAdmin.upload(file);
    await blogAdmin.upload(file, 'invalid/id?credential=none');
    expect(fetcher.mock.calls[0][0]).toBe('/api/blog-admin/media');
    expect(fetcher.mock.calls[1][0]).toBe('/api/blog-admin/media?postId=invalid%2Fid%3Fcredential%3Dnone');
  });

  it('preserves a pending public verification returned with HTTP202', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ post: { id: 'fixture', revision: 2, publicationVerified: false }, publication: { state: 'publishing' } }, { status: 202 }));
    vi.stubGlobal('fetch', fetcher);
    expect(await blogAdmin.publish('fixture', 2)).toMatchObject({ post: { revision: 2, publicationVerified: false } });
    expect(fetcher.mock.calls[0][1].body).toBe(JSON.stringify({ expectedRevision: 2 }));
  });
});
