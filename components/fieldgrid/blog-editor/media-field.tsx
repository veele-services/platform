'use client';

import { useId, useRef, useState, type MouseEvent } from 'react';
import { ImagePlus, Upload, X } from 'lucide-react';
import type { BlogImage } from '@/lib/blog/types';

export function MediaField({ title, image, onChange, upload, uploading, wide = false }: {
  title: string;
  image: BlogImage | null;
  onChange: (image: BlogImage | null) => void;
  upload: (file: File) => Promise<BlogImage>;
  uploading: boolean;
  wide?: boolean;
}) {
  const fieldId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pickFile(file?: File) {
    if (!file || uploading) return;
    setBusy(true);
    setError('');
    try {
      const value = await upload(file);
      onChange({ ...value, alt: image?.alt ?? '' });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Uploaden is niet gelukt.');
    } finally {
      setBusy(false);
    }
  }

  function setFocalPoint(event: MouseEvent<HTMLButtonElement>) {
    if (!image || event.detail === 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = (value: number) => Math.max(0, Math.min(1, Math.round(value * 100) / 100));
    onChange({ ...image, x: fraction((event.clientX - box.left) / box.width), y: fraction((event.clientY - box.top) / box.height) });
  }

  return (
    <div className="fg-media-field">
      <div className="fg-media-title"><h3>{title}</h3><span>{wide ? '1,91:1 aanbevolen' : '4:5 aanbevolen'}</span></div><p className="fg-editor-field-hint">{wide ? 'Dit beeld verschijnt in de socialpreview en bij delen. Zonder deelbeeld gebruiken we de hero.' : 'Dit beeld verschijnt bovenaan het artikel, in de artikellijst en bij delen als er geen breed deelbeeld is.'}</p>
      {image ? (
        <div className="fg-media-picked">
          {wide ? <div className="fg-media-cover wide"><img src={image.src} alt={image.alt} /></div> : <>
            <figure className="fg-media-figure">
              <button type="button" className="fg-media-cover fg-media-original" onClick={setFocalPoint} aria-label="Kies het focuspunt op de originele afbeelding">
                <img src={image.src} alt={image.alt} />
                <i style={{ left: `${image.x * 100}%`, top: `${image.y * 100}%` }} aria-hidden="true" />
              </button>
              <figcaption>Origineel · klik voor focus</figcaption>
            </figure>
            <figure className="fg-media-figure fg-media-crop">
              <div className="fg-media-cover"><img src={image.src} alt="" style={{ objectPosition: `${image.x * 100}% ${image.y * 100}%` }} /></div>
              <figcaption>Portretuitsnede</figcaption>
            </figure>
          </>}
          <button type="button" className="fg-editor-btn icon" aria-label={`${title} verwijderen`} title={`${title} verwijderen`} onClick={() => onChange(null)}><X size={17} /></button>
        </div>
      ) : <div className="fg-media-empty"><ImagePlus size={23} /><p>{wide ? 'Zonder deelbeeld wordt de hero gebruikt.' : 'Kies een portretbeeld voor je artikel.'}</p></div>}
      <p className="fg-editor-field-hint fg-media-formats">
        {image?.width && image.height ? `${image.width} × ${image.height} px · ` : ''}JPEG, PNG of WebP · maximaal 1,5 MB
      </p>
      <div className="fg-editor-actions">
        <button type="button" className="fg-editor-btn" disabled={uploading} onClick={() => fileInput.current?.click()}><Upload size={15} />{busy ? 'Uploaden…' : image ? 'Vervang bestand' : 'Upload afbeelding'}</button>
        <input hidden ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => { void pickFile(event.target.files?.[0]); event.target.value = ''; }} />
      </div>
      {image && <>
        <label className="fg-editor-label">{wide ? 'Alt-tekst deelbeeld' : 'Alt-tekst hero'}<input value={image.alt} maxLength={200} onChange={(event) => onChange({ ...image, alt: event.target.value })} placeholder="Beschrijf de afbeelding" /></label>
        {!wide && <div className="fg-editor-focus-controls">
          <label htmlFor={`${fieldId}-x`}>Focus horizontaal <output aria-hidden="true">{Math.round(image.x * 100)}%</output><input id={`${fieldId}-x`} aria-label="Focus horizontaal" aria-valuetext={`${Math.round(image.x * 100)}%`} type="range" min={0} max={1} step={0.01} value={image.x} onChange={(event) => onChange({ ...image, x: Number(event.target.value) })} /></label>
          <label htmlFor={`${fieldId}-y`}>Focus verticaal <output aria-hidden="true">{Math.round(image.y * 100)}%</output><input id={`${fieldId}-y`} aria-label="Focus verticaal" aria-valuetext={`${Math.round(image.y * 100)}%`} type="range" min={0} max={1} step={0.01} value={image.y} onChange={(event) => onChange({ ...image, y: Number(event.target.value) })} /></label>
        </div>}
      </>}
      {error && <p className="fg-editor-error" role="alert">{error}</p>}
    </div>
  );
}
