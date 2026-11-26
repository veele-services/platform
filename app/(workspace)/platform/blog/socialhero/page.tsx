import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireBlogEditor } from '@/lib/blog/auth';
import { BlogError } from '@/lib/blog/validation';
import { BlogConnectorPanel } from '@/components/fieldgrid/blog-connector/panel';

export const metadata: Metadata = { title: 'SocialHero-koppeling | Fieldgrid', robots: { index: false, follow: false } };

export default async function SocialHeroConnectionPage() {
  try { await requireBlogEditor(); }
  catch (error) {
    if (error instanceof BlogError && error.code === 'PERMISSION_DENIED') notFound();
    throw error;
  }
  return <BlogConnectorPanel />;
}
