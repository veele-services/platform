import { cache } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, permanentRedirect } from 'next/navigation';
import SignatureHome from '@/components/fieldgrid/marketing/homes/Signature';
import { sectors, products } from '@/lib/marketing/fieldgrid/content';
import { SiteChrome } from '@/components/fieldgrid/marketing/site-chrome';
import { SectorPage, ProductPage } from '@/components/fieldgrid/marketing/detail-pages';
import { BranchesPage, PlatformPage, WorkflowPage, AboutPage, DemoPage, PrivacyPage } from '@/components/fieldgrid/marketing/standard-pages';
import { TrialPage, AppointmentPage } from '@/components/fieldgrid/marketing/conversion-pages';
import { makeMetadata, pageMeta, pageSchema, schemaText } from '@/lib/marketing/fieldgrid/seo';
import { BlogOverview, HomeBlogSection, RelatedPosts } from '@/components/fieldgrid/blog-public';
import { BlogArticle } from '@/components/fieldgrid/blog-public/article';
import { articleImages, getBlogImages } from '@/components/fieldgrid/blog-public/seo';
import { getPublicBlog, getPublishedBlog } from '@/lib/blog/data';
import { blogOrigin, blogUrl } from '@/lib/blog/origin';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ path?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const legacy = ['signature', 'horizon', 'atlas', 'flow', 'people'];
const pages = { branches: BranchesPage, platform: PlatformPage, werkwijze: WorkflowPage, over: AboutPage, demo: DemoPage, privacy: PrivacyPage };
const lookupBlog = cache(getPublicBlog);
const blogTitle = 'Fieldgrid Blog | Praktische kennis voor servicebedrijven';
const blogDescription = 'Lees praktische artikelen over planning, digitale werkbonnen, klantportalen en samenwerken op locatie.';
const indexable = () => process.env.DEPLOY_TARGET === 'production';

function resolve(path: string[]) {
  const key = path.join('/');
  if (path.length === 0) return pageMeta[''];
  if (path.length === 2 && path[0] === 'branches') {
    const sector = sectors.find(s => s.slug === path[1]);
    if (sector) return { title: sector.metaTitle, description: sector.metaDescription, image: sector.image, sector };
  }
  if (path.length === 2 && path[0] === 'platform') {
    const product = products.find(p => p.slug === path[1]);
    if (product) return { title: product.metaTitle ?? `${product.name} | Fieldgrid`, description: product.metaDescription ?? product.intro.slice(0, 160), image: product.slug === 'onboarding' ? '/fieldgrid-site-assets/images/onboarding.webp' : '/fieldgrid-site-assets/images/kantoor-planning.webp', product };
  }
  if (path.length === 1 && pageMeta[key]) return pageMeta[key];
  return null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  let { path = [] } = await params;
  if (legacy.includes(path[0])) path = path.slice(1);
  if (path[0] === 'blog' && path.length === 1) {
    const search = await searchParams;
    const images = [{ url: blogUrl('/fieldgrid-site-assets/images/kantoor-planning.webp', blogOrigin()), alt: 'Een team werkt samen aan de planning op kantoor' }];
    return {
      title: blogTitle, description: blogDescription, alternates: { canonical: blogUrl('/blog') },
      robots: { index: indexable() && !search.q && !search.categorie, follow: indexable() },
      openGraph: { type: 'website', siteName: 'Fieldgrid', locale: 'nl_NL', title: blogTitle, description: blogDescription, url: blogUrl('/blog'), images },
      twitter: { card: 'summary_large_image', title: blogTitle, description: blogDescription, images },
    };
  }
  if (path[0] === 'blog' && path.length === 2) {
    const result = await lookupBlog(path[1]);
    if (!result || !('entry' in result) || !result.entry.published) return { title: 'Fieldgrid Blog', robots: { index: false, follow: false } };
    const { entry } = result;
    const fields = entry.published!;
    const title = fields.seoTitle || `${fields.title} | Fieldgrid`;
    const description = fields.seoDescription || fields.excerpt;
    const url = blogUrl(`/blog/${fields.slug}`);
    const images = getBlogImages(fields);
    return {
      title, description, alternates: { canonical: url }, authors: [{ name: fields.author }],
      robots: { index: indexable(), follow: indexable() },
      openGraph: { type: 'article', siteName: 'Fieldgrid', locale: fields.locale.replace('-', '_'), title, description, url, images, publishedTime: entry.publishedAt ?? undefined, modifiedTime: entry.publishedUpdatedAt ?? entry.publishedAt ?? undefined, authors: [fields.author], section: fields.category, tags: fields.tags },
      twitter: { card: 'summary_large_image', title, description, images },
      other: { 'socialhero:revision': String(entry.publishedRevision), ...(entry.externalId ? { 'socialhero:external-id': entry.externalId } : {}) },
    };
  }
  const metadata = resolve(path);
  return metadata ? { ...makeMetadata('/' + path.join('/'), metadata.title, metadata.description, metadata.image), robots: { index: indexable(), follow: indexable() } } : { title: 'Pagina niet gevonden | Fieldgrid', robots: { index: false, follow: false } };
}

export default async function Page({ params, searchParams }: Props) {
  const { path = [] } = await params;
  if (legacy.includes(path[0])) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams)) for (const item of typeof value === 'string' ? [value] : value || []) query.append(key, item);
    permanentRedirect('/' + path.slice(1).join('/') + (query.size ? '?' + query : ''));
  }
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  if (path[0] === 'blog' && path.length === 1) {
    const [posts, search] = await Promise.all([getPublishedBlog(), searchParams]);
    const query = typeof search.q === 'string' ? search.q.trim().slice(0, 100) : '';
    const category = typeof search.categorie === 'string' ? search.categorie.trim().slice(0, 80) : '';
    return <SiteChrome><BlogOverview posts={posts} query={query} category={category} /></SiteChrome>;
  }
  if (path[0] === 'blog' && path.length === 2) {
    const result = await lookupBlog(path[1]);
    if (!result) notFound();
    if ('redirect' in result) {
      if (!/^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.redirect)) notFound();
      permanentRedirect(result.redirect);
    }
    const { entry } = result;
    const fields = entry.published;
    if (!fields) notFound();
    const otherPosts = (await getPublishedBlog()).filter(post => post.id !== entry.id);
    const related = [...otherPosts.filter(post => post.published?.categoryId === fields.categoryId), ...otherPosts.filter(post => post.published?.categoryId !== fields.categoryId)];
    const schema = {
      '@context': 'https://schema.org', '@type': fields.type === 'article' ? 'Article' : 'BlogPosting',
      mainEntityOfPage: { '@type': 'WebPage', '@id': blogUrl(`/blog/${fields.slug}`) }, headline: fields.title,
      description: fields.seoDescription || fields.excerpt, inLanguage: fields.locale,
      author: { '@type': fields.authorId === 'fieldgrid-redactie' ? 'Organization' : 'Person', '@id': blogUrl(`/blog#author-${fields.authorId}`), name: fields.author },
      publisher: { '@type': 'Organization', name: 'Fieldgrid', logo: { '@type': 'ImageObject', url: blogUrl('/fieldgrid-site-assets/branding/logo.svg') } },
      datePublished: entry.publishedAt, dateModified: entry.publishedUpdatedAt ?? entry.publishedAt,
      articleSection: fields.category, keywords: fields.tags.join(', '), image: articleImages(fields),
    };
    return <SiteChrome><script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: schemaText(schema) }} /><BlogArticle fields={fields} publishedAt={entry.publishedAt} /><RelatedPosts posts={related} /></SiteChrome>;
  }
  const metadata = resolve(path);
  if (!metadata) notFound();
  let content: React.ReactNode;
  let category: { name: string; path: string } | undefined;
  if (path.length === 0) content = <SignatureHome concept="signature" blog={<HomeBlogSection posts={await getPublishedBlog()} />} />;
  else if ('sector' in metadata && metadata.sector) { content = <SectorPage sector={metadata.sector} concept="signature" />; category = { name: 'Branches', path: '/branches' }; }
  else if ('product' in metadata && metadata.product) { content = <ProductPage product={metadata.product} concept="signature" />; category = { name: 'Het platform', path: '/platform' }; }
  else if (path[0] === 'proberen') content = <TrialPage />;
  else if (path[0] === 'afspraak') content = <AppointmentPage initialKind={(await searchParams).type === 'demo' ? 'demo' : 'appointment'} />;
  else { const Content = pages[path[0] as keyof typeof pages]; if (!Content) notFound(); content = <Content concept="signature" />; }
  return <SiteChrome><script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: schemaText(pageSchema('/' + path.join('/'), metadata.title, metadata.description, category)) }} />{content}</SiteChrome>;
}
