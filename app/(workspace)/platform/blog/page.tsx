import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireBlogEditor } from '@/lib/blog/auth';
import { BlogError } from '@/lib/blog/validation';
import { getBlogTaxonomy, listBlogEntries } from '@/lib/blog/data';
import { blogOrigin, blogUrl } from '@/lib/blog/origin';
import { BlogEditorDashboard } from '@/components/fieldgrid/blog-editor/dashboard';
import '@/components/fieldgrid/blog-editor/editor.css';

export const metadata: Metadata = { title: 'Blogredactie | Fieldgrid', robots: { index: false, follow: false } };

export default async function BlogEditorPage({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  try { await requireBlogEditor(); }
  catch (error) {
    if (error instanceof BlogError && error.code === 'PERMISSION_DENIED') notFound();
    throw error;
  }
  const [posts, taxonomy, search] = await Promise.all([listBlogEntries(), getBlogTaxonomy(), searchParams]);
  return <BlogEditorDashboard initialId={typeof search.id === 'string' ? search.id : undefined} initialPosts={posts} taxonomy={taxonomy} blogBase={blogUrl('/blog', blogOrigin())} />;
}
