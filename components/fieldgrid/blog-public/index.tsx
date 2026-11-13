import { ArrowRight, ArrowUpRight, Clock3, FileText, Search } from 'lucide-react';
import type { BlogEntry } from '@/lib/blog/types';
import { CoverImage, formatBlogDate } from './article';
import { articleText, readingTime } from './body';
import styles from './blog.module.css';

function PostCard({ post }: { post: BlogEntry }) {
  const fields = post.published;
  if (!fields) return null;
  return <article className={styles.card}>
    <a className={styles.cardLink} href={`/blog/${fields.slug}`}>
      <div className={styles.cardCover}><CoverImage image={fields.hero} /></div>
      <div className={styles.cardCopy}>
        <div className={styles.cardMeta}>
          <span className={styles.label}>{fields.category}</span>
          <span><Clock3 size={13} aria-hidden="true" /> {readingTime(fields.content)} min</span>
        </div>
        <h3>{fields.title}</h3>
        <p>{fields.excerpt}</p>
        <div className={styles.cardFoot}>
          {post.publishedAt && <time dateTime={post.publishedAt}>{formatBlogDate(post.publishedAt)}</time>}
          <span className={styles.cardArrow} aria-hidden="true"><ArrowUpRight size={19} /></span>
        </div>
      </div>
    </a>
  </article>;
}

function PostCards({ posts }: { posts: BlogEntry[] }) {
  return <div className={styles.cards}>{posts.map(post => <PostCard key={post.id} post={post} />)}</div>;
}

export function HomeBlogSection({ posts }: { posts: BlogEntry[] }) {
  const latest = posts.filter(post => post.published).slice(0, 3);
  if (!latest.length) return null;
  return <section className={styles.home} aria-labelledby="fieldgrid-home-blog">
    <div className="container">
      <div className={styles.sectionHead}>
        <div>
          <span className="eyebrow"><span /> Fieldgrid Blog</span>
          <h2 id="fieldgrid-home-blog">Kennis voor de werkdag.</h2>
          <p>Praktische artikelen over planning, werken op locatie en samenwerken met je klant.</p>
        </div>
        <a className="button button-outline" href="/blog">Bekijk alle artikelen <ArrowRight size={16} aria-hidden="true" /></a>
      </div>
      <PostCards posts={latest} />
    </div>
  </section>;
}

export function RelatedPosts({ posts }: { posts: BlogEntry[] }) {
  const related = posts.filter(post => post.published).slice(0, 3);
  if (!related.length) return null;
  return <section className={styles.related} aria-labelledby="fieldgrid-related">
    <div className="container">
      <div className={styles.sectionHead}>
        <h2 id="fieldgrid-related">Lees ook</h2>
        <a className={styles.textLink} href="/blog">Naar alle artikelen <ArrowRight size={16} aria-hidden="true" /></a>
      </div>
      <PostCards posts={related} />
    </div>
  </section>;
}

function filterLink(category: string, query: string) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (category) params.set('categorie', category);
  const search = params.toString();
  return search ? `/blog?${search}` : '/blog';
}

export function BlogOverview({ posts, query, category }: { posts: BlogEntry[]; query: string; category: string }) {
  const categories = [...new Set(posts.flatMap(post => post.published?.category || []))].sort((a, b) => a.localeCompare(b, 'nl'));
  const normalizedQuery = query.toLocaleLowerCase('nl-NL');
  const filtered = posts.filter(({ published }) => {
    if (!published || (category && published.category !== category)) return false;
    const searchable = [published.title, published.excerpt, published.author, published.category, ...published.tags, articleText(published.content)].join(' ').toLocaleLowerCase('nl-NL');
    return normalizedQuery.split(/\s+/).every(word => searchable.includes(word));
  });

  return <>
    <section className={styles.overviewHero}>
      <div className={`container ${styles.overviewIntro}`}>
        <div>
          <span className="eyebrow"><span /> Fieldgrid Blog</span>
          <h1>Een betere werkdag<br /><em>begint hier.</em></h1>
          <p>Praktische kennis voor servicebedrijven. Van de eerste planning tot een werkbon die klaar is voor je klant.</p>
        </div>
        <img src="/fieldgrid-site-assets/branding/icon.svg" alt="" className={styles.heroMotif} aria-hidden="true" />
      </div>
    </section>
    <section className={`container ${styles.directory}`} aria-labelledby="fieldgrid-article-list">
      <div className={styles.filters}>
        <nav className={styles.categories} aria-label="Filter op categorie">
          <a href={filterLink('', query)} aria-current={!category ? 'true' : undefined}>Alles</a>
          {categories.map(item => <a key={item} href={filterLink(item, query)} aria-current={item === category ? 'true' : undefined}>{item}</a>)}
        </nav>
        <form className={styles.search} action="/blog" method="get" role="search" aria-label="Zoeken in de blog">
          <Search size={18} aria-hidden="true" />
          <label className={styles.visuallyHidden} htmlFor="fieldgrid-blog-search">Zoek artikelen</label>
          <input id="fieldgrid-blog-search" type="search" name="q" placeholder="Zoek artikelen" defaultValue={query} maxLength={100} />
          {category && <input type="hidden" name="categorie" value={category} />}
          <button type="submit" aria-label="Zoeken"><ArrowRight size={19} aria-hidden="true" /></button>
        </form>
      </div>
      <div className={styles.resultsHead}>
        <h2 id="fieldgrid-article-list">{query ? `Resultaten voor ‘${query}’` : category || 'Laatste artikelen'}</h2>
        <p>{filtered.length} {filtered.length === 1 ? 'artikel' : 'artikelen'}</p>
      </div>
      {filtered.length ? <PostCards posts={filtered} /> : <div className={styles.empty}>
        <FileText size={25} aria-hidden="true" />
        <h3>{query || category ? 'Geen artikelen gevonden' : 'Er staan nog geen artikelen klaar'}</h3>
        <p>{query || category ? 'Probeer een ander zoekwoord of bekijk alle artikelen.' : 'Kom later terug voor nieuwe artikelen over werken op locatie.'}</p>
        {(query || category) && <a className={styles.textLink} href="/blog">Wis filters <ArrowRight size={16} aria-hidden="true" /></a>}
      </div>}
    </section>
  </>;
}
