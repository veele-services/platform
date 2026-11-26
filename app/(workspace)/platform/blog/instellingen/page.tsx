import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireBlogEditor } from '@/lib/blog/auth';
import { BlogError } from '@/lib/blog/validation';
import { BlogTaxonomySettings } from '@/components/fieldgrid/blog-editor/taxonomy-settings';
import '@/components/fieldgrid/blog-editor/editor.css';

export const metadata: Metadata = { title: 'Bloginstellingen | Fieldgrid', robots: { index: false, follow: false } };

export default async function BlogSettingsPage() {
  try { await requireBlogEditor(); }
  catch (error) {
    if (error instanceof BlogError && error.code === 'PERMISSION_DENIED') notFound();
    throw error;
  }
  return <BlogTaxonomySettings />;
}
