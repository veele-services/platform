'use client';

import Link from 'next/link';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Archive, ArrowLeft, Check, Plus, RefreshCw, RotateCcw, Settings2 } from 'lucide-react';
import { blogAdmin, type BlogTaxonomy, type BlogTaxonomyItem } from './admin-api';
import styles from './settings.module.css';

type Kind = 'author' | 'category';
type Change = { kind: Kind; id?: string; name: string; active: boolean };

function TaxonomyRow({ item, kind, busy, save }: { item: BlogTaxonomyItem; kind: Kind; busy: boolean; save: (change: Change) => Promise<boolean> }) {
  const [name, setName] = useState(item.name);
  const id = useId();
  const active = item.active !== false;
  const dirty = name.trim() !== item.name;
  async function submit(event: FormEvent) { event.preventDefault(); if (name.trim()) await save({ kind, id: item.id, name: name.trim(), active }); }
  return <li className={styles.taxonomyRow} data-active={active}>
    <form onSubmit={submit}><label htmlFor={id} className={styles.srOnly}>{kind === 'author' ? 'Naam auteur' : 'Naam categorie'} {item.name}</label><input id={id} className={styles.nameInput} value={name} maxLength={kind === 'author' ? 100 : 80} required disabled={busy} onChange={event => setName(event.target.value)} /><button className="fg-editor-btn" type="submit" disabled={busy || !dirty || !name.trim()}>Opslaan</button></form>
    <div className={styles.rowMeta}><span className={active ? styles.activeBadge : styles.archivedBadge}>{active ? 'Actief' : 'Gearchiveerd'}</span><button className={styles.archiveButton} type="button" disabled={busy || dirty} title={dirty ? 'Sla eerst de gewijzigde naam op' : undefined} onClick={() => void save({ kind, id: item.id, name: item.name, active: !active })}>{active ? <Archive size={14} aria-hidden="true" /> : <RotateCcw size={14} aria-hidden="true" />}{active ? 'Archiveren' : 'Opnieuw activeren'}<span className={styles.srOnly}>: {item.name}</span></button></div>
  </li>;
}

function TaxonomyGroup({ kind, items, busy, save }: { kind: Kind; items: BlogTaxonomyItem[]; busy: boolean; save: (change: Change) => Promise<boolean> }) {
  const [name, setName] = useState('');
  const id = useId();
  async function submit(event: FormEvent) { event.preventDefault(); if (name.trim() && await save({ kind, name: name.trim(), active: true })) setName(''); }
  return <section className={`fg-editor-card ${styles.taxonomyCard}`} aria-labelledby={`${id}-title`}>
    <div className={styles.sectionHeading}><h2 id={`${id}-title`}>{kind === 'author' ? 'Auteurs' : 'Categorieën'}</h2><span className={styles.count}>{items.filter(item => item.active !== false).length} actief</span></div>
    <p className={styles.explanation}>{kind === 'author' ? 'Auteurs verschijnen bij artikelen en in de openbare artikelgegevens.' : 'Categorieën helpen lezers en de redactie artikelen terug te vinden.'}</p>
    <form onSubmit={submit} className={styles.addForm}><label htmlFor={id}>{kind === 'author' ? 'Nieuwe auteur' : 'Nieuwe categorie'}</label><div><input id={id} value={name} maxLength={kind === 'author' ? 100 : 80} disabled={busy} required placeholder={kind === 'author' ? 'Naam van de auteur' : 'Naam van de categorie'} onChange={event => setName(event.target.value)} /><button className="fg-editor-btn primary" disabled={busy || !name.trim()} type="submit"><Plus size={16} aria-hidden="true" /> Toevoegen</button></div></form>
    {items.length ? <ul className={styles.taxonomyList}>{items.map(item => <TaxonomyRow key={`${item.id}:${item.name}`} kind={kind} item={item} busy={busy} save={save} />)}</ul> : <p className={styles.empty}>{kind === 'author' ? 'Er zijn nog geen auteurs.' : 'Er zijn nog geen categorieën.'}</p>}
  </section>;
}

export function BlogTaxonomySettings() {
  const [taxonomy, setTaxonomy] = useState<BlogTaxonomy | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let current = true;
    blogAdmin.taxonomy().then(value => { if (current) setTaxonomy(value); }).catch(value => { if (current) setError(value instanceof Error ? value.message : 'De instellingen konden niet worden geladen.'); }).finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, []);
  async function refresh() {
    setBusy(true); setError(''); setNotice('');
    try { setTaxonomy(await blogAdmin.taxonomy()); }
    catch (value) { setError(value instanceof Error ? value.message : 'De instellingen konden niet worden geladen.'); }
    finally { setBusy(false); }
  }
  async function save(change: Change) {
    if (busy) return false;
    setBusy(true); setError(''); setNotice('');
    try {
      setTaxonomy(await blogAdmin.saveTaxonomy(change));
      setNotice(change.id ? change.active ? 'De wijzigingen zijn opgeslagen.' : 'Het item is gearchiveerd. Bestaande artikelen blijven bewaard.' : change.kind === 'author' ? 'De auteur is toegevoegd.' : 'De categorie is toegevoegd.');
      return true;
    } catch (value) { setError(value instanceof Error ? value.message : 'De wijziging kon niet worden opgeslagen.'); return false; }
    finally { setBusy(false); }
  }
  return <section className="fg-editor-shell" aria-label="Bloginstellingen"><div className="fg-editor-main">
    <Link className="fg-editor-back" href="/platform/blog" prefetch={false}><ArrowLeft size={17} aria-hidden="true" /> Terug naar blogbeheer</Link>
    <div className="fg-editor-intro"><div><h1>Bloginstellingen</h1><p>Beheer de auteurs en categorieën voor de blogredactie en SocialHero.</p></div><button className="fg-editor-btn" type="button" onClick={() => void refresh()} disabled={busy}><RefreshCw size={16} aria-hidden="true" /> Vernieuwen</button></div>
    {error && <p role="alert" className="fg-editor-flash error">{error}</p>}{notice && <p role="status" className="fg-editor-flash success"><Check size={17} aria-hidden="true" />{notice}</p>}
    <p className={styles.settingsNote}><Settings2 size={18} aria-hidden="true" />Gearchiveerde auteurs en categorieën blijven bij bestaande artikelen en revisies bewaard. Voor nieuwe artikelen kies je een actief item.</p>
    {!taxonomy && busy ? <p role="status" className={styles.empty}>Bloginstellingen laden…</p> : taxonomy && <div className={styles.settingsGrid}><TaxonomyGroup kind="author" items={taxonomy.authors} busy={busy} save={save} /><TaxonomyGroup kind="category" items={taxonomy.categories} busy={busy} save={save} /></div>}
  </div></section>;
}
