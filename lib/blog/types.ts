export type BlogDocument = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: BlogDocument[];
};

export type BlogImage = {
  src: string;
  alt: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
};

export type BlogFields = {
  type: 'blog' | 'article';
  locale: string;
  title: string;
  slug: string;
  slugManual?: boolean;
  excerpt: string;
  content: BlogDocument;
  seoTitle: string;
  seoDescription: string;
  authorId: string;
  categoryId: string;
  author: string;
  category: string;
  tags: string[];
  hero: BlogImage | null;
  shareImage: BlogImage | null;
};

export type BlogEntry = {
  id: string;
  externalId: string | null;
  source: 'manual' | 'socialhero';
  draft: BlogFields;
  revision: number;
  published: BlogFields | null;
  publishedRevision: number | null;
  publishedAt: string | null;
  publishedUpdatedAt?: string | null;
  updatedAt: string;
  createdAt: string;
};

export const BLOG_CATEGORIES = ['Planning', 'Werkbonnen', 'Klantportaal', 'Team & onboarding'] as const;

export function normalizeSlug(input: string): string {
  return input.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').slice(0, 100).replace(/^-+|-+$/g, '');
}

export function emptyBlogFields(): BlogFields {
  return {
    type: 'blog', locale: 'nl-NL', title: '', slug: '', excerpt: '',
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    seoTitle: '', seoDescription: '', authorId: 'fieldgrid-redactie', categoryId: 'planning', author: 'Fieldgrid',
    category: BLOG_CATEGORIES[0], tags: [], hero: null, shareImage: null,
  };
}
