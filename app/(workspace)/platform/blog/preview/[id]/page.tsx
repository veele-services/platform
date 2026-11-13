import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, PencilLine } from 'lucide-react';
import { requireBlogEditor } from '@/lib/blog/auth';
import { BlogError } from '@/lib/blog/validation';
import { getBlog } from '@/lib/blog/data';
import { ArticlePreview } from '@/components/fieldgrid/blog-public/article';
import '@/components/fieldgrid/marketing/signature.css';
import '@/components/fieldgrid/blog-editor/editor.css';

export const metadata: Metadata = { title: 'Afgeschermd artikelvoorbeeld | Fieldgrid', robots: { index: false, follow: false } };

export default async function BlogPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  try { await requireBlogEditor(); }
  catch (error) {
    if (error instanceof BlogError && error.code === 'PERMISSION_DENIED') notFound();
    throw error;
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const entry = await getBlog(id);
  if (!entry) notFound();
  return <div className="fg-blog-private-preview">
    <div className="fg-editor-preview-bar"><span><PencilLine size={16} /> Afgeschermd concept · revisie {entry.revision}</span><a className="fg-editor-btn" href={`/platform/blog?id=${encodeURIComponent(entry.id)}`}><ArrowLeft size={15} /> Terug naar de redactie</a></div>
    <div className="fieldgrid-marketing"><ArticlePreview fields={entry.draft} /></div>
  </div>;
}
