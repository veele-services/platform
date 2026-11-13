'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, BookOpen, Check, ChevronRight, CircleHelp,
  CloudUpload, ExternalLink, Eye, FileText, ImageIcon, Link2, Plus, Search,
} from 'lucide-react';
import { emptyBlogFields, normalizeSlug, type BlogEntry, type BlogFields } from '@/lib/blog/types';
import { blogAdmin, type BlogTaxonomy } from './admin-api';
import { MediaField } from './media-field';
import { RichEditor } from './rich-editor';

const emptyFields = emptyBlogFields();
const statusOf = (entry: BlogEntry) => {
  if (!entry.published) return 'Concept';
  if (entry.revision !== entry.publishedRevision) return 'Revisie open';
  return 'Live';
};
const dateText = (value: string) => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Amsterdam' }).format(new Date(value));
const sourceOf = (entry: BlogEntry) => ({ manual: 'Redactie', socialhero: 'SocialHero' })[entry.source];

type Status = 'Alle' | ReturnType<typeof statusOf>;
type Tab = 'content' | 'seo' | 'media';

function StatusChip({ entry }: { entry?: BlogEntry }) {
  const status = entry ? statusOf(entry) : 'Concept';
  return <span className="fg-editor-status" data-status={status}><i />{status}</span>;
}

function BlogIndex({ posts, onOpen, onCreate }: { posts: BlogEntry[]; onOpen: (entry: BlogEntry) => void; onCreate: () => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Status>('Alle');
  const filters: Status[] = ['Alle', 'Concept', 'Revisie open', 'Live'];
  const normalized = query.trim().toLocaleLowerCase('nl-NL');
  const visible = posts.filter((post) => (filter === 'Alle' || statusOf(post) === filter)
    && [post.draft.title, post.draft.category, ...post.draft.tags].some((text) => text.toLocaleLowerCase('nl-NL').includes(normalized)));

  return <>
    <div className="fg-editor-intro">
      <div><h1>Blogbeheer</h1><p>Schrijf, bewerk en publiceer artikelen voor de Fieldgrid-website.</p></div>
      <button type="button" className="fg-editor-btn primary" onClick={onCreate}><Plus size={17} /> Nieuw artikel</button>
    </div>
    <div className="fg-editor-metrics" aria-label="Artikelstatussen">
      {([
        ['Live', 'Live', 'Laatste revisie gepubliceerd', BookOpen],
        ['Concepten', 'Concept', 'Nog niet gepubliceerd', FileText],
        ['Open revisies', 'Revisie open', 'Eerdere versie blijft live', CloudUpload],
      ] as const).map(([label, state, description, Icon]) => <button key={state} type="button" className="fg-editor-metric" onClick={() => setFilter(state)} aria-pressed={filter === state}>
        <Icon size={20} /><span>{label}</span><strong>{posts.filter((post) => statusOf(post) === state).length}</strong><small>{description}</small>
      </button>)}
    </div>
    <section className="fg-editor-card fg-editor-list">
      <div className="fg-editor-list-header">
        <h2>Artikelen</h2>
        <label className="fg-editor-search"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek op titel, categorie of tag" aria-label="Zoek op titel, categorie of tag" /></label>
      </div>
      <div className="fg-editor-filter" aria-label="Filter op status">
        {filters.map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}
      </div>
      {visible.length ? <div className="fg-editor-rows" aria-label="Artikelen">
        {visible.map((entry) => <button type="button" className="fg-editor-row" key={entry.id} onClick={() => onOpen(entry)}>
          <div className="fg-editor-row-image">{entry.draft.hero ? <img src={entry.draft.hero.src} alt="" /> : <FileText size={21} />}</div>
          <div className="fg-editor-row-name">
            <strong>{entry.draft.title || 'Naamloos artikel'}</strong>
            <small>{entry.draft.category || 'Zonder categorie'} <span>·</span> {sourceOf(entry)}</small>
          </div>
          <StatusChip entry={entry} />
          <time dateTime={entry.updatedAt}>{dateText(entry.updatedAt)}</time>
          <ChevronRight size={18} aria-hidden="true" />
        </button>)}
      </div> : <div className="fg-editor-empty"><Search size={23} /><h3>{posts.length ? 'Geen artikelen gevonden' : 'Nog geen artikelen'}</h3>
        <p>{posts.length ? 'Probeer een andere zoekterm of status.' : 'Maak een eerste artikel aan om te beginnen.'}</p>
        <button className="fg-editor-btn" type="button" onClick={posts.length ? () => { setQuery(''); setFilter('Alle'); } : onCreate}>{posts.length ? 'Filters wissen' : 'Nieuw artikel'}</button>
      </div>}
    </section>
  </>;
}

function SeoPreview({ fields, blogBase }: { fields: BlogFields; blogBase: string }) {
  const [mode, setMode] = useState<'search' | 'social'>('search');
  const image = fields.shareImage ?? fields.hero;
  const host = new URL(blogBase).hostname;
  const title = fields.seoTitle || fields.title || 'Titel van je artikel';
  const description = fields.seoDescription || fields.excerpt || 'De omschrijving van je artikel verschijnt hier.';
  return <div className="fg-editor-card fg-editor-seo-preview">
    <h2>SEO- en deelvoorbeeld</h2>
    <div className="fg-editor-filter" aria-label="Kies voorbeeld">
      <button type="button" aria-pressed={mode === 'search'} onClick={() => setMode('search')}><Search size={15} /> Zoekresultaat</button>
      <button type="button" aria-pressed={mode === 'social'} onClick={() => setMode('social')}><Link2 size={15} /> Social media</button>
    </div>
    {mode === 'search' ? <div className="fg-search-preview">
      <div><img src="/fieldgrid-site-assets/branding/icon.svg" alt="" width={26} height={26} /><span><b>Fieldgrid</b><small>{host} › blog{fields.slug ? ' › ' + fields.slug : ''}</small></span></div>
      <strong>{title}</strong><p>{description}</p>
    </div> : <div className="fg-social-preview">
      {image ? <img src={image.src} alt={image.alt} style={{ objectPosition: `${image.x * 100}% ${image.y * 100}%` }} /> : <div><ImageIcon size={26} /></div>}
      <section><small>{host.toUpperCase()}</small><strong>{title}</strong><p>{description}</p></section>
    </div>}
  </div>;
}

function SeoChecklist({ fields, onTab }: { fields: BlogFields; onTab: (tab: Tab) => void }) {
  const items = [
    { label: 'Titel en URL ingevuld', ready: Boolean(fields.title.trim() && fields.slug), tab: 'content' },
    { label: 'SEO-titel 30–60 tekens', ready: fields.seoTitle.trim().length >= 30 && fields.seoTitle.trim().length <= 60, tab: 'seo' },
    { label: 'Metaomschrijving 120–160 tekens', ready: fields.seoDescription.trim().length >= 120 && fields.seoDescription.trim().length <= 160, tab: 'seo' },
    { label: 'Hero met alt-tekst', ready: Boolean(fields.hero?.alt.trim()), tab: 'media' },
    { label: 'Breed deelbeeld (optioneel)', ready: Boolean(fields.shareImage), tab: 'media' },
  ] as const;
  return <section className="fg-editor-card fg-editor-checklist">
    <div><h2>SEO-controle</h2><small>{items.filter((item) => item.ready).length}/{items.length}</small></div>
    <ul>{items.map((item) => <li key={item.label}><button type="button" onClick={() => onTab(item.tab)} data-ready={item.ready}>
      {item.ready ? <Check size={16} /> : <CircleHelp size={16} />}{item.label}
    </button></li>)}</ul>
  </section>;
}

function EditArticle({ entry, onBack, onSaved, blogBase, taxonomy }: { entry?: BlogEntry; onBack: () => void; onSaved: (entry: BlogEntry) => void; blogBase: string; taxonomy: BlogTaxonomy }) {
  const router = useRouter();
  const [record, setRecord] = useState(entry);
  const [fields, setFields] = useState<BlogFields>(entry?.draft ?? emptyFields);
  const [tagText, setTagText] = useState(entry?.draft.tags.join(', ') ?? '');
  const [tab, setTab] = useState<Tab>('content');
  const [slugEdited, setSlugEdited] = useState(entry?.draft.slugManual ?? Boolean(entry?.draft.slug && entry.draft.slug !== normalizeSlug(entry.draft.title)));
  const [changeUrl, setChangeUrl] = useState(false);
  const [busy, setBusy] = useState<'save' | 'preview' | 'publish' | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [confirmPublish, setConfirmPublish] = useState(false);
  const allowNavigation = useRef(false);
  const publishConfirm = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);

  const change = <K extends keyof BlogFields,>(key: K, value: BlogFields[K]) => setFields((current) => ({ ...current, [key]: value }));
  const payload: BlogFields = { ...fields, tags: [...new Set(tagText.split(',').map((tag) => tag.trim()).filter(Boolean))] };
  const dirty = JSON.stringify(payload) !== JSON.stringify(record?.draft ?? emptyFields);
  const urlWillChange = Boolean(record?.published && normalizeSlug(fields.slug || fields.title) !== record.published.slug);
  const canonical = blogBase + '/' + normalizeSlug(fields.slug || fields.title);

  useEffect(() => {
    if (confirmPublish) publishConfirm.current?.focus();
  }, [confirmPublish]);

  useEffect(() => {
    if (!dirty && !uploading) return;
    const guard = (event: BeforeUnloadEvent) => { if (!allowNavigation.current) event.preventDefault(); };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, uploading]);

  function back() {
    if ((!dirty && !uploading) || window.confirm('Teruggaan zonder je wijzigingen op te slaan?')) onBack();
  }

  function updateTitle(value: string) {
    setFields((current) => ({
      ...current,
      title: value,
      slug: !slugEdited && !record?.published ? normalizeSlug(value) : current.slug,
      slugManual: slugEdited || Boolean(current.slugManual),
    }));
  }

  async function upload(file: File) {
    setUploading(true);
    try { return await blogAdmin.upload(file); }
    finally { setUploading(false); }
  }

  async function apply(mode: 'save' | 'preview' | 'publish') {
    if (uploading || busy) return;
    if (!fields.title.trim()) { setError('Vul eerst de titel in.'); setTab('content'); return; }
    if (payload.tags.length > 15 || payload.tags.some((tag) => tag.length > 45)) {
      setError('Gebruik maximaal 15 tags van maximaal 45 tekens per tag.');
      setTab('content');
      return;
    }
    setBusy(mode);
    setNotice('');
    setError('');
    setConfirmPublish(false);
    try {
      let post = record;
      if (!post) post = (await blogAdmin.create(payload)).post;
      else if (dirty) post = (await blogAdmin.save(post.id, payload, post.revision)).post;
      setRecord(post);
      onSaved(post);
      setFields(post.draft);
      setTagText(post.draft.tags.join(', '));
      if (mode === 'publish') {
        post = (await blogAdmin.publish(post.id, post.revision)).post;
        setRecord(post);
        onSaved(post);
        setFields(post.draft);
        setChangeUrl(false);
      }
      if (mode === 'preview') {
        allowNavigation.current = true;
        router.push('/platform/blog/preview/' + encodeURIComponent(post.id));
      } else {
        setNotice(mode === 'publish' ? 'Artikel gepubliceerd.'
          : dirty && post.published ? 'Revisie opgeslagen.' : 'Concept opgeslagen.');
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Opslaan is niet gelukt.');
    } finally {
      setBusy(null);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void apply('save');
  }

  return <form className="fg-article-editor" onSubmit={submit}>
    <button type="button" className="fg-editor-back" disabled={Boolean(busy)} onClick={back}><ArrowLeft size={17} /> Alle artikelen</button>
    <div className="fg-editor-intro fg-editor-edit-intro">
      <div><div className="fg-editor-edit-label"><StatusChip entry={record} />{record?.source === 'socialhero' && <span>SocialHero</span>}{record && <span>Revisie {record.revision}</span>}</div>
        <h1>{fields.title || 'Nieuw artikel'}</h1>
        {record?.published && <a className="fg-editor-live-link" href={`${blogBase}/${record.published.slug}`} target="_blank" rel="noreferrer">Bekijk live versie <ExternalLink size={14} /></a>}
      </div>
      <div className="fg-editor-actions">
        <button className="fg-editor-btn" type="button" disabled={Boolean(busy) || uploading} onClick={() => void apply('preview')}><Eye size={16} />{busy === 'preview' ? 'Laden…' : 'Voorbeeld'}</button>
        <button className="fg-editor-btn" type="submit" disabled={Boolean(busy) || uploading || (!dirty && Boolean(record))}>{busy === 'save' ? 'Opslaan…' : record?.published ? 'Revisie opslaan' : 'Concept opslaan'}</button>
        <button className="fg-editor-btn primary" type="button" disabled={Boolean(busy) || uploading || Boolean(record?.published && !dirty && record.revision === record.publishedRevision)}
          onClick={() => setConfirmPublish(true)}><CloudUpload size={17} />{busy === 'publish' ? 'Publiceren…' : 'Publiceren'}</button>
      </div>
    </div>
    {error && <p role="alert" className="fg-editor-flash error">{error}</p>}
    {notice && <p role="status" className="fg-editor-flash success"><Check size={17} /> {notice}</p>}
    {confirmPublish && <div ref={publishConfirm} tabIndex={-1} className="fg-editor-flash confirm" aria-label="Publicatie bevestigen"
      onKeyDown={(event) => { if (event.key === 'Escape') setConfirmPublish(false); }}>
      <div><strong>{urlWillChange ? 'Publiceren en de URL wijzigen?' : 'Artikel publiceren?'}</strong><p>{urlWillChange ? `/blog/${record?.published?.slug} verwijst na publicatie permanent door naar /blog/${fields.slug}.` : 'Deze revisie wordt zichtbaar op de blog.'}</p></div>
      <div className="fg-editor-actions"><button type="button" className="fg-editor-btn" onClick={() => setConfirmPublish(false)}>Annuleren</button><button type="button" className="fg-editor-btn primary" disabled={uploading} onClick={() => void apply('publish')}>Publicatie bevestigen</button></div>
    </div>}
    <div className="fg-editor-split">
      <div className="fg-editor-card fg-editor-form-card">
        <div className="fg-editor-form-tabs" aria-label="Artikelinstellingen">
          {([[ 'content', 'Inhoud', FileText ], [ 'seo', 'SEO', Search ], [ 'media', 'Afbeeldingen', ImageIcon ]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}><Icon size={17} /> {label}</button>
          ))}
        </div>
        <fieldset disabled={Boolean(busy) || uploading} className="fg-editor-form-content">
          <div hidden={tab !== 'content'}>
            <label className="fg-editor-label">Titel<input value={fields.title} maxLength={180} onChange={(event) => updateTitle(event.target.value)} placeholder="De titel van je artikel" /></label>
            <label className="fg-editor-label">Slug
              <span className="fg-editor-slug"><span>/blog/</span><input value={fields.slug} maxLength={100} onChange={(event) => { setSlugEdited(true); setFields(current => ({ ...current, slug: event.target.value, slugManual: true })); }} onBlur={() => change('slug', normalizeSlug(fields.slug || fields.title))} readOnly={Boolean(record?.published && !changeUrl)} placeholder="je-artikel" /></span>
            </label>
            <div className="fg-editor-field-hint"><span>{canonical}{fields.slug ? '' : '…'}</span>
              {record?.published && !changeUrl && <button type="button" onClick={() => setChangeUrl(true)}>URL wijzigen</button>}
            </div>
            <label className="fg-editor-label">Samenvatting<textarea value={fields.excerpt} maxLength={320} rows={3} onChange={(event) => change('excerpt', event.target.value)} placeholder="Waar gaat het artikel over?" /></label>
            <span className="fg-editor-label">Artikelinhoud</span>
            <RichEditor initial={fields.content} editable={!busy && !uploading} onChange={(value) => change('content', value)} upload={upload} />
            <div className="fg-editor-form-grid">
              <label className="fg-editor-label">Type<select aria-label="Type" value={fields.type} onChange={(event) => change('type', event.target.value as BlogFields['type'])}><option value="blog">Blog</option><option value="article">Artikel</option></select></label>
              <label className="fg-editor-label">Taal<select aria-label="Taal" value={fields.locale} onChange={(event) => change('locale', event.target.value)}><option value="nl-NL">Nederlands (Nederland)</option><option value="en-GB">Engels (Verenigd Koninkrijk)</option><option value="nl-BE">Nederlands (België)</option>{!['nl-NL', 'nl-BE', 'en-GB'].includes(fields.locale) && <option value={fields.locale}>{fields.locale}</option>}</select></label>
              <label className="fg-editor-label">Auteur<select aria-label="Auteur" value={fields.authorId} onChange={(event) => { const author = taxonomy.authors.find(item => item.id === event.target.value); if (author) setFields(current => ({ ...current, authorId: author.id, author: author.name })); }}>{taxonomy.authors.map(author => <option key={author.id} value={author.id}>{author.name}</option>)}</select></label>
              <label className="fg-editor-label">Categorie<select aria-label="Categorie" value={fields.categoryId} onChange={(event) => { const category = taxonomy.categories.find(item => item.id === event.target.value); if (category) setFields(current => ({ ...current, categoryId: category.id, category: category.name })); }}>{taxonomy.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            </div>
            <label className="fg-editor-label">Tags<input value={tagText} maxLength={300} onChange={(event) => setTagText(event.target.value)} placeholder="planning, werkbonnen, uitvoering" /></label>
            <p className="fg-editor-field-hint">Scheid maximaal 15 tags met een komma.</p>
          </div>
          <div hidden={tab !== 'seo'}>
            <h2>Zoekmachines en delen</h2>
            <label className="fg-editor-label">SEO-titel<input value={fields.seoTitle} maxLength={120} onChange={(event) => change('seoTitle', event.target.value)} placeholder={fields.title || 'SEO-titel'} /></label>
            <p className="fg-editor-field-hint">{fields.seoTitle.length} tekens · aanbevolen 30–60</p>
            <label className="fg-editor-label">Metaomschrijving<textarea value={fields.seoDescription} maxLength={240} rows={4} onChange={(event) => change('seoDescription', event.target.value)} placeholder={fields.excerpt || 'Omschrijf het artikel in één of twee zinnen'} /></label>
            <p className="fg-editor-field-hint">{fields.seoDescription.length} tekens · aanbevolen 120–160</p>
            <label className="fg-editor-label">Canonieke URL<input readOnly value={canonical} /></label>
          </div>
          <div hidden={tab !== 'media'}>
            <MediaField title="Hero-afbeelding" image={fields.hero} onChange={(image) => change('hero', image)} upload={upload} uploading={uploading} />
            <MediaField title="Breed deelbeeld" image={fields.shareImage} wide onChange={(image) => change('shareImage', image)} upload={upload} uploading={uploading} />
          </div>
        </fieldset>
      </div>
      <aside className="fg-editor-aside">
        <SeoPreview fields={fields} blogBase={blogBase} />
        <SeoChecklist fields={fields} onTab={setTab} />
      </aside>
    </div>
  </form>;
}

export function BlogEditorDashboard({ initialId, blogBase, initialPosts, taxonomy }: { initialId?: string; blogBase: string; initialPosts: BlogEntry[]; taxonomy: BlogTaxonomy }) {
  const [posts, setPosts] = useState<BlogEntry[]>(initialPosts);
  const [selected, setSelected] = useState<BlogEntry | 'new' | null>(() => initialPosts.find(post => post.id === initialId) ?? null);

  function save(post: BlogEntry) {
    setPosts(current => [post, ...current.filter(item => item.id !== post.id)]);
  }

  function selectUrl(post: BlogEntry) {
    const path = '/platform/blog?id=' + encodeURIComponent(post.id);
    if (window.location.pathname + window.location.search !== path) window.history.replaceState(null, '', path);
  }

  function open(post: BlogEntry) {
    selectUrl(post);
    setSelected(post);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  return <section className="fg-editor-shell" aria-label="Fieldgrid redactie">
    <div className="fg-editor-main">
      {selected ? <EditArticle key={selected === 'new' ? 'new' : selected.id} blogBase={blogBase} taxonomy={taxonomy} entry={selected === 'new' ? undefined : selected} onBack={() => {
        setSelected(null);
        if (window.location.search) window.history.replaceState(null, '', '/platform/blog');
      }} onSaved={post => { save(post); selectUrl(post); }} /> :
        <BlogIndex posts={posts} onOpen={open} onCreate={() => { setSelected('new'); window.scrollTo({ top: 0, behavior: 'instant' }); }} />}
    </div>
  </section>;
}
