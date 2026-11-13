import { describe, expect, it } from 'vitest';
import { assetIds, assertPublishable, markdownDocument, validateBlogFields } from './validation';
import { emptyBlogFields } from './types';
import { isBlogServiceRequest, isBlogMediaRequest, isLocalBlogPath } from './routes';

describe('public editorial content boundary', () => {
  it('imports structured Markdown with H2 headings, links, tables and no executable HTML', () => {
    const document = markdownDocument('# Titel\n\n**Vet** en [veilig](https://www.fieldgrid.nl/demo)\n\n<script>alert(1)</script>\n\n| Naam | Waarde |\n| --- | --- |\n| Werk | Klaar |');
    const text = JSON.stringify(document);
    expect(document.content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 2 } });
    expect(text).toContain('table');
    expect(text).not.toContain('"type":"script"');
    expect(validateBlogFields({ ...emptyBlogFields(), title: 'Een échte titel', content: document })).toMatchObject({ slug: 'een-echte-titel', authorId: 'fieldgrid-redactie', categoryId: 'planning' });
  });
  it('rejects executable links, unknown content, excessive nesting and foreign media references', () => {
    const base = emptyBlogFields();
    for (const content of [
      { type: 'doc', content: [{ type: 'script' }] },
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Klik', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] },
      { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://private.invalid/secret.png' } }] },
    ]) expect(() => validateBlogFields({ ...base, content })).toThrow();
    let nested: unknown = { type: 'paragraph' };
    for (let i = 0; i < 30; i++) nested = { type: 'blockquote', content: [nested] };
    expect(() => validateBlogFields({ ...base, content: { type: 'doc', content: [nested] } })).toThrow();
  });
  it('retains explicit slug decisions and extracts only owned media IDs', () => {
    const image = { src: '/blog-media/01234567-89ab-4cde-af01-234567890abc', alt: 'Een planner', x: 0.25, y: 0.75 };
    const fields = validateBlogFields({ ...emptyBlogFields(), title: 'Nieuwe titel', slug: 'bewuste-url', slugManual: true, hero: image });
    expect(fields).toMatchObject({ slug: 'bewuste-url', slugManual: true });
    expect(assetIds(fields)).toEqual(['01234567-89ab-4cde-af01-234567890abc']);
    expect(() => validateBlogFields({ ...fields, hero: { ...image, x: 1.1 } })).toThrow();
    expect(() => assertPublishable(fields)).toThrow();
  });
});

describe('marketing service allowlist', () => {
  it('permits exactly the contract methods and one concrete external identifier', () => {
    expect(isBlogServiceRequest('/api/socialhero/v1/capabilities', 'GET')).toBe(true);
    expect(isBlogServiceRequest('/api/socialhero/v1/media', 'POST')).toBe(true);
    expect(isBlogServiceRequest('/api/socialhero/v1/posts/id', 'PUT')).toBe(true);
    expect(isBlogServiceRequest('/api/socialhero/v1/posts/id/publish', 'POST')).toBe(true);
    for (const [path, method] of [['/api/socialhero/v1/capabilities', 'POST'], ['/api/socialhero/v1/media', 'GET'], ['/api/socialhero/v1/posts/id/publish', 'PUT'], ['/api/socialhero/v1/posts/id/nested/publish', 'POST'], ['/api/blog-admin', 'POST']]) expect(isBlogServiceRequest(path, method)).toBe(false);
    expect(isBlogMediaRequest('/blog-media/01234567-89ab-4cde-af01-234567890abc', 'GET')).toBe(true);
    expect(isBlogMediaRequest('/blog-media/01234567-89ab-4cde-af01-234567890abc', 'POST')).toBe(false);
    expect(isLocalBlogPath('/platform', 'GET')).toBe(false);
    expect(isLocalBlogPath('/app/nieuws', 'GET')).toBe(false);
  });
});
