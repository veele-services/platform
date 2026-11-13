import type { BlogEntry, BlogFields, BlogImage } from '@/lib/blog/types';

export type BlogTaxonomy = { authors: { id: string; name: string }[]; categories: { id: string; name: string }[] };

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
    const message = data && typeof data === 'object' && 'error' in data ? data.error : undefined;
    throw new Error(typeof message === 'string' ? message : 'Deze handeling kon niet worden uitgevoerd.');
  }
  return data as T;
}

export const blogAdmin = {
  list: () => request<{ posts: BlogEntry[]; configured: boolean } & BlogTaxonomy>(),
  create: (fields: BlogFields) => request<{ post: BlogEntry }>('', 'POST', { fields }),
  save: (id: string, fields: BlogFields, revision: number) => request<{ post: BlogEntry }>(`/${encodeURIComponent(id)}`, 'PATCH', { fields, expectedRevision: revision }),
  publish: (id: string, revision: number) => request<{ post: BlogEntry }>(`/${encodeURIComponent(id)}/publish`, 'POST', { expectedRevision: revision }),
  async upload(file: File): Promise<BlogImage> {
    const form = new FormData();
    form.set('file', file);
    const media = await request<{ image: BlogImage }>('/media', 'POST', form);
    return media.image;
  },
};
