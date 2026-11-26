import type { BlogEntry, BlogFields, BlogImage } from '@/lib/blog/types';

export type BlogTaxonomyItem = { id: string; name: string; active?: boolean };
export type BlogTaxonomy = { authors: BlogTaxonomyItem[]; categories: BlogTaxonomyItem[] };
export type BlogRevision = { revision: number; title: string; createdAt: string; source: 'manual' | 'socialhero'; actorName?: string; actorUserId?: string; actorCredentialId?: string };
export type BlogPublishEvent = { revision: number; publishedAt: string; source: 'manual' | 'socialhero'; actorName?: string; actorUserId?: string; actorCredentialId?: string };
export type BlogHistory = { revisions: BlogRevision[]; publishEvents: BlogPublishEvent[] };

async function request<T>(path = '', method = 'GET', payload?: object): Promise<T> {
  const form = payload instanceof FormData;
  const response = await fetch('/api/blog-admin' + path, {
    method,
    cache: 'no-store',
    headers: payload && !form ? { 'Content-Type': 'application/json' } : undefined,
    body: form ? payload : payload ? JSON.stringify(payload) : undefined,
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const message = data && typeof data === 'object' ? 'error' in data ? data.error : 'message' in data ? data.message : undefined : undefined;
    throw new Error(typeof message === 'string' ? message : 'Deze handeling kon niet worden uitgevoerd.');
  }
  return data as T;
}

export const blogAdmin = {
  list: () => request<{ posts: BlogEntry[]; configured: boolean } & BlogTaxonomy>(),
  taxonomy: () => request<BlogTaxonomy>('/taxonomy'),
  saveTaxonomy: (item: { kind: 'author' | 'category'; id?: string; name: string; active: boolean }) => request<BlogTaxonomy>('/taxonomy', 'POST', item),
  revisions: (id: string) => request<BlogHistory>(`/${encodeURIComponent(id)}/revisions`),
  create: (fields: BlogFields) => request<{ post: BlogEntry }>('', 'POST', { fields }),
  save: (id: string, fields: BlogFields, revision: number) => request<{ post: BlogEntry }>(`/${encodeURIComponent(id)}`, 'PATCH', { fields, expectedRevision: revision }),
  publish: (id: string, revision: number) => request<{ post: BlogEntry }>(`/${encodeURIComponent(id)}/publish`, 'POST', { expectedRevision: revision }),
  async upload(file: File, postId?: string): Promise<BlogImage> {
    const form = new FormData();
    form.set('file', file);
    const media = await request<{ image: BlogImage }>('/media' + (postId ? `?postId=${encodeURIComponent(postId)}` : ''), 'POST', form);
    return media.image;
  },
};
