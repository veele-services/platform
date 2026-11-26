'use client';

import { useEffect, useState } from 'react';
import { Clock3, RefreshCw } from 'lucide-react';
import { blogAdmin, type BlogHistory } from './admin-api';
import styles from './settings.module.css';

function date(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Amsterdam' }).format(parsed) : 'Onbekend tijdstip';
}

export function RevisionHistory({ id, revision, publishedRevision, publicationVerified }: { id?: string; revision?: number; publishedRevision?: number | null; publicationVerified?: boolean }) {
  const [refresh, setRefresh] = useState(0);
  const key = [id, revision, publishedRevision, publicationVerified, refresh].join(':');
  const [result, setResult] = useState<{ key: string; history: BlogHistory | null; error: string } | null>(null);
  const loading = Boolean(id && result?.key !== key);
  const history = result?.history ?? null;
  const error = result?.key === key ? result.error : '';
  useEffect(() => {
    if (!id) return;
    let current = true;
    blogAdmin.revisions(id).then(history => { if (current) setResult({ key, history, error: '' }); }).catch(value => {
      if (current) setResult({ key, history: null, error: value instanceof Error ? value.message : 'De revisiehistorie kon niet worden geladen.' });
    });
    return () => { current = false; };
  }, [id, key]);

  const events = history ? [
    ...history.revisions.map(item => ({ ...item, kind: 'draft' as const, date: item.createdAt })),
    ...history.publishEvents.map(item => ({ ...item, kind: 'publish' as const, date: item.publishedAt })),
  ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || b.revision - a.revision || (a.kind === b.kind ? 0 : a.kind === 'publish' ? -1 : 1)) : [];

  return <section className={`fg-editor-card ${styles.history}`} aria-labelledby="blog-revision-history">
    <div className={styles.sectionHeading}><h2 id="blog-revision-history"><Clock3 size={18} aria-hidden="true" /> Revisiehistorie</h2>{id && <button type="button" className="fg-editor-btn" disabled={loading} onClick={() => setRefresh(value => value + 1)} aria-label="Revisiehistorie vernieuwen"><RefreshCw size={15} aria-hidden="true" /></button>}</div>
    <p className={styles.explanation}>Opgeslagen revisies en publicaties blijven apart zichtbaar. Een nieuw concept wijzigt de live versie pas bij publicatie.</p>
    {!id ? <p className={styles.empty}>Sla het artikel op om de revisiehistorie op te bouwen.</p> : error ? <p role="alert" className="fg-editor-flash error">{error}</p> : !history && loading ? <p role="status" className={styles.empty}>Revisiehistorie laden…</p> : !events.length ? <p className={styles.empty}>Er zijn nog geen historische revisies beschikbaar.</p> : <ol className={styles.timeline}>{events.map((item, index) => <li key={`${item.kind}-${item.revision}-${item.date}-${index}`}>
      <span className={styles.timelineDot} data-published={item.kind === 'publish'} aria-hidden="true" />
      <div><div className={styles.eventHeading}><strong>{item.kind === 'publish' ? publicationVerified === false && item.revision === publishedRevision ? 'Publicatie wordt gecontroleerd' : 'Gepubliceerd' : 'Revisie opgeslagen'} · revisie {item.revision}</strong>{item.kind === 'publish' && item.revision === publishedRevision ? <span className={publicationVerified === false ? styles.draftBadge : styles.liveBadge}>{publicationVerified === false ? 'Openbare bevestiging volgt' : 'Huidige live versie'}</span> : item.kind === 'draft' && item.revision === revision ? <span className={styles.draftBadge}>Huidige redactieversie</span> : null}</div>
        {'title' in item && item.title && <p className={styles.revisionTitle}>{item.title}</p>}
        <p className={styles.eventMeta}><time dateTime={item.date}>{date(item.date)}</time><span>·</span>{item.actorName || (item.source === 'socialhero' ? 'SocialHero' : 'Redactie')}{item.actorName && <><span>·</span>{item.source === 'socialhero' ? 'SocialHero' : 'Redactie'}</>}</p>
      </div>
    </li>)}</ol>}
  </section>;
}
