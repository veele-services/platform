import { createAdminClient } from '@/lib/supabase/admin';
import { blogQuery, blogAdminQuery, type BlogMedia } from '@/lib/blog/data';
import { requireBlogEditor, requireBlogHost } from '@/lib/blog/auth';
import { failure } from '@/lib/blog/http';
import { blogEnvironment } from '@/lib/blog/origin';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^[a-f0-9-]{36}$/.test(id)) return new Response(null, { status: 404 });
    const kind = request.headers.get('x-fieldgrid-host-kind');
    let media: BlogMedia | null;
    if (kind === 'marketing') {
      requireBlogHost(request, 'marketing');
      media = await blogQuery<BlogMedia | null>('public.media', { assetId: id });
    } else {
      requireBlogHost(request, 'platform');
      const db = await requireBlogEditor();
      media = await blogAdminQuery<BlogMedia | null>('media', { assetId: id }, db);
    }
    if (!media) return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
    const { data, error } = await createAdminClient().storage.from('fieldgrid-blog-media').download(media.storagePath);
    if (error || !data) return new Response(null, { status: 503, headers: { 'cache-control': 'no-store' } });
    return new Response(data, { headers: { 'content-type': media.type, 'content-length': String(data.size), 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', ...(kind !== 'marketing' || blogEnvironment() !== 'production' ? { 'x-robots-tag': 'noindex, nofollow' } : {}), 'content-security-policy': "default-src 'none'; sandbox" } });
  } catch (error) { return failure(error); }
}
