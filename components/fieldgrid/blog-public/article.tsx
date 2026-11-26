import { ArrowLeft, ArrowRight, Clock3 } from 'lucide-react';
import type { BlogFields, BlogImage } from '@/lib/blog/types';
import { ArticleBody, articleHeadings, readingTime } from './body';
import { blogUrl, safeBlogUrl } from './seo';
import { ShareArticle } from './share';
import styles from './blog.module.css';

export function formatBlogDate(date: string | null) {
  return date ? new Intl.DateTimeFormat('nl-NL', { dateStyle: 'long', timeZone: 'Europe/Amsterdam' }).format(new Date(date)) : '';
}

export function CoverImage({ image, eager = false }: { image: BlogImage | null; eager?: boolean }) {
  const src = safeBlogUrl(image?.src);
  if (!image || !src || src.startsWith('#')) return <div className={styles.coverFallback} aria-hidden="true"><img src="/fieldgrid-site-assets/branding/icon.svg" alt="" /></div>;
  return <img src={src} alt={image.alt} width={image.width} height={image.height}
    loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : undefined}
    decoding="async" style={{ objectPosition: `${image.x * 100}% ${image.y * 100}%` }} />;
}

function ArticleHeader({ fields, date }: { fields: BlogFields; date?: string | null }) {
  return <>
    <span className={styles.label}>{fields.category || (fields.type === 'article' ? 'Artikel' : 'Blog')}</span>
    <h1>{fields.title || 'Titel van het artikel'}</h1>
    {fields.excerpt && <p className={styles.articleLead}>{fields.excerpt}</p>}
    <div className={styles.byline}>
      <div className={styles.authorIcon} aria-hidden="true"><img src="/fieldgrid-site-assets/branding/icon.svg" alt="" /></div>
      <div><strong>{fields.author || 'Fieldgrid'}</strong><div>{date && <><time dateTime={date}>{formatBlogDate(date)}</time><span aria-hidden="true">·</span></>}
        <span><Clock3 size={13} aria-hidden="true" /> {readingTime(fields.content)} min leestijd</span></div></div>
    </div>
  </>;
}

export function ArticlePreview({ fields }: { fields: BlogFields }) {
  return <BlogArticle fields={fields} publishedAt={null} preview />;
}

export function BlogArticle({ fields, publishedAt, preview = false }: {
  fields: BlogFields;
  publishedAt: string | null;
  preview?: boolean;
}) {
  const headings = articleHeadings(fields.content);
  return <article lang={fields.locale}>
    <div className={styles.articleHero}>
      <div className={`container ${styles.articleHeroGrid}`}>
        <div>
          {!preview && <a className={styles.back} href="/blog"><ArrowLeft size={17} aria-hidden="true" /> Terug naar de blog</a>}
          <ArticleHeader fields={fields} date={publishedAt} />
        </div>
        <div className={styles.articleCover}><CoverImage image={fields.hero} eager /></div>
      </div>
    </div>
    <div className={`container ${styles.readingGrid}`}>
      <aside className={styles.articleAside}>
        {headings.length > 1 && <nav aria-label="In dit artikel"><h2>In dit artikel</h2><ul>{headings.map(heading => (
          <li key={heading.id}><a href={`#${heading.id}`}>{heading.label}</a></li>
        ))}</ul></nav>}
        {!preview && <ShareArticle title={fields.title} url={blogUrl(`/blog/${fields.slug}`)} />}
      </aside>
      <div className={styles.readingMain}>
        <ArticleBody document={fields.content} />
        {fields.tags.length > 0 && <ul className={styles.articleTags} aria-label="Onderwerpen">{fields.tags.map(tag => (
          <li key={tag}>{preview ? <span>{tag}</span> : <a href={`/blog?q=${encodeURIComponent(tag)}`}>{tag}</a>}</li>
        ))}</ul>}
        {!preview && <div className={styles.articleCta}>
          <div><h2>Breng je werkdag samen.</h2><p>Bekijk hoe Fieldgrid je planning, werkbonnen en klantcontact verbindt.</p></div>
          <a className="button button-primary" href="/demo">Bekijk de demo <ArrowRight size={16} aria-hidden="true" /></a>
        </div>}
      </div>
    </div>
  </article>;
}
