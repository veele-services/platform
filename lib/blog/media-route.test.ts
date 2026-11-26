import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ environment: vi.fn(), query: vi.fn(), adminQuery: vi.fn(), editor: vi.fn() }));
vi.mock('./origin', () => ({ blogEnvironment: mocks.environment }));
vi.mock('./auth', () => ({ requireBlogEditor: mocks.editor, requireBlogHost: vi.fn() }));
vi.mock('./data', () => ({ blogQuery: mocks.query, blogAdminQuery: mocks.adminQuery }));
vi.mock('./http', () => ({ failure: () => new Response(null, { status: 503 }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ storage: { from: () => ({ download: async () => ({ data: new Blob(['image'], { type: 'image/png' }), error: null }) }) } }) }));
import { GET } from '@/app/(workspace)/blog-media/[id]/route';
const id = '01234567-89ab-4cde-af01-234567890abc';
const media = { assetId: id, storagePath: `fieldgrid/production/${id}.png`, type: 'image/png' };
const request = (kind: string) => new Request(`https://www.fieldgrid.nl/blog-media/${id}`, { headers: { 'x-fieldgrid-host-kind': kind } });
const context = () => ({ params: Promise.resolve({ id }) });
beforeEach(() => { vi.clearAllMocks(); mocks.environment.mockReturnValue('production'); mocks.query.mockResolvedValue(media); mocks.adminQuery.mockResolvedValue(media); });
describe('editorial media crawlability', () => {
  it('allows current live production images to be indexed while preserving staging noindex', async () => {
    const live = await GET(request('marketing'), context());
    expect(live.status).toBe(200);expect(live.headers.get('x-robots-tag')).toBeNull();
    mocks.environment.mockReturnValue('staging');
    const staging = await GET(request('marketing'), context());
    expect(staging.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });
  it('keeps draft media private and authenticated platform previews noindex', async () => {
    mocks.query.mockResolvedValue(null);
    expect((await GET(request('marketing'), context())).status).toBe(404);
    expect(mocks.editor).not.toHaveBeenCalled();
    const preview = await GET(request('platform'), context());
    expect(preview.status).toBe(200);expect(preview.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(mocks.editor).toHaveBeenCalledOnce();
  });
});
