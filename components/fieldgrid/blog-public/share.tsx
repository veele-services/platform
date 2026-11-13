'use client';

import { useState } from 'react';
import { Check, Link as LinkIcon, MessageCircle, Share2 } from 'lucide-react';
import styles from './blog.module.css';

export function ShareArticle({ title, url }: { title: string; url: string }) {
  const [feedback, setFeedback] = useState('');
  const copied = feedback === 'Link gekopieerd';

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setFeedback('Link gekopieerd');
    } catch {
      setFeedback(url);
    }
  }

  async function share() {
    if (!navigator.share) return copy();
    try {
      await navigator.share({ title, url });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) await copy();
    }
  }

  return <div className={styles.share}>
    <p>Deel dit artikel</p>
    <div className={styles.shareActions}>
      <button type="button" onClick={share} title="Delen" aria-label="Delen"><Share2 size={17} /></button>
      <button type="button" onClick={copy} title="Kopieer link" aria-label="Kopieer link">{copied ? <Check size={17} /> : <LinkIcon size={17} />}</button>
      <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" title="Deel op LinkedIn" aria-label="Deel op LinkedIn"><b aria-hidden="true">in</b></a>
      <a href={`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`} target="_blank" rel="noopener noreferrer" title="Deel via WhatsApp" aria-label="Deel via WhatsApp"><MessageCircle size={17} /></a>
    </div>
    <span className={styles.shareFeedback} role="status">{feedback === url ? <input aria-label="Deellink" readOnly value={url} onFocus={event => event.currentTarget.select()} /> : feedback}</span>
  </div>;
}
