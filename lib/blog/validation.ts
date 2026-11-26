import { lexer, type Token, type Tokens } from 'marked';
import { emptyBlogFields, normalizeSlug, type BlogDocument, type BlogFields, type BlogImage } from './types';

export class BlogError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function invalid(message: string, code = 'INVALID_FIELDS'): never {
  throw new BlogError(400, code, message);
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('De aanvraag moet een object zijn.');
  return value as Record<string, unknown>;
}

export function text(value: unknown, limit: number, label: string): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > limit) invalid(`${label} bevat maximaal ${limit} tekens.`);
  return value.trim();
}

export function positiveInt(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) invalid(`${label} ontbreekt of is ongeldig.`);
  return value;
}

export function safeLink(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(value)) return '';
  if (value.startsWith('#') || (value.startsWith('/') && !value.startsWith('//'))) return value;
  try {
    const url = new URL(value);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) return url.href;
  } catch { return ''; }
  return '';
}

export const blogAssetPattern = /^\/blog-media\/([a-f0-9-]{36})$/;

function mediaSrc(value: unknown): string {
  if (typeof value !== 'string') return '';
  return blogAssetPattern.test(value) ? value : '';
}

function integerIn(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function focal(value: unknown): number {
  if (value === undefined) return 0.5;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) invalid('Een focuspunt moet tussen 0 en 1 liggen.');
  return value;
}

function image(value: unknown): BlogImage | null {
  if (value === undefined || value === null) return null;
  const data = asRecord(value);
  const src = mediaSrc(data.src);
  if (!src) invalid('Gebruik een geüploade afbeelding of een bestaande afbeelding van Fieldgrid.', 'INVALID_MEDIA');
  return {
    src, alt: text(data.alt, 240, 'De alt-tekst'), x: focal(data.x), y: focal(data.y),
    width: integerIn(data.width, 1, 8192, 0) || undefined,
    height: integerIn(data.height, 1, 8192, 0) || undefined,
  };
}

const nodeTypes = new Set([
  'doc', 'text', 'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'codeBlock',
  'hardBreak', 'horizontalRule', 'image', 'table', 'tableRow', 'tableHeader', 'tableCell', 'taskList', 'taskItem',
]);
const markTypes = new Set(['bold', 'italic', 'strike', 'underline', 'code', 'highlight', 'link']);
const alignments = new Set(['left', 'center', 'right', 'justify']);
const inline = new Set(['text', 'hardBreak']);
const block = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'horizontalRule', 'image', 'table', 'taskList']);
const childrenByNode: Record<string, Set<string>> = {
  doc: block, paragraph: inline, heading: inline, codeBlock: new Set(['text']), blockquote: block,
  bulletList: new Set(['listItem']), orderedList: new Set(['listItem']), listItem: block,
  taskList: new Set(['taskItem']), taskItem: block,
  table: new Set(['tableRow']), tableRow: new Set(['tableCell', 'tableHeader']), tableCell: block, tableHeader: block,
};
const requiredContent = new Set(['doc', 'bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem', 'blockquote', 'table', 'tableRow', 'tableCell', 'tableHeader']);

function sanitizeNode(value: unknown, limits: { nodes: number }, depth = 0): BlogDocument {
  if (++limits.nodes > 4000 || depth > 24) invalid('Het artikel is te groot of heeft te veel geneste onderdelen.');
  const raw = asRecord(value);
  const type = raw.type;
  if (typeof type !== 'string' || !nodeTypes.has(type) || ((type === 'doc') !== (depth === 0))) {
    invalid('Het artikel bevat een onbekend inhoudsblok.');
  }
  const node: BlogDocument = { type };
  const attr = raw.attrs && typeof raw.attrs === 'object' ? raw.attrs as Record<string, unknown> : {};
  if (type === 'text') {
    if (typeof raw.text !== 'string' || !raw.text.length || raw.text.length > 40000) invalid('Ongeldig tekstblok in artikel.');
    node.text = raw.text;
  }
  if (type === 'heading') node.attrs = { level: integerIn(attr.level, 2, 4, 2) };
  if ((type === 'heading' || type === 'paragraph') && typeof attr.textAlign === 'string' && alignments.has(attr.textAlign)) {
    node.attrs = { ...node.attrs, textAlign: attr.textAlign };
  }
  if (type === 'image') {
    const src = mediaSrc(attr.src);
    if (!src) invalid('Upload afbeeldingen in de editor voordat je ze in de inhoud gebruikt.', 'INVALID_MEDIA');
    node.attrs = { src, alt: text(attr.alt, 240, 'De alt-tekst'), title: text(attr.title, 240, 'De afbeeldingstitel') };
    if (integerIn(attr.width, 1, 8192, 0)) node.attrs.width = attr.width;
    if (integerIn(attr.height, 1, 8192, 0)) node.attrs.height = attr.height;
  }
  if (type === 'orderedList') node.attrs = { start: integerIn(attr.start, 1, 10000, 1) };
  if (type === 'taskItem') node.attrs = { checked: attr.checked === true };
  if (type === 'codeBlock' && typeof attr.language === 'string' && /^[a-z0-9+_-]{1,30}$/i.test(attr.language)) node.attrs = { language: attr.language };
  if (type === 'tableCell' || type === 'tableHeader') {
    const colspan = integerIn(attr.colspan, 1, 16, 1);
    const rowspan = integerIn(attr.rowspan, 1, 30, 1);
    node.attrs = { colspan, rowspan };
    if (Array.isArray(attr.colwidth) && attr.colwidth.length === colspan && attr.colwidth.every(width => integerIn(width, 1, 2000, 0))) node.attrs.colwidth = attr.colwidth;
  }
  if (Array.isArray(raw.marks) && type === 'text') {
    node.marks = raw.marks.slice(0, 12).flatMap(value => {
      const mark = asRecord(value);
      if (typeof mark.type !== 'string' || !markTypes.has(mark.type)) return [];
      if (mark.type !== 'link') return [{ type: mark.type }];
      const href = safeLink((mark.attrs as Record<string, unknown> | undefined)?.href);
      if (!href) invalid('Deze link gebruikt een onveilig protocol.');
      return [{ type: 'link', attrs: { href } }];
    });
  }
  const allowedChildren = childrenByNode[type];
  if (Array.isArray(raw.content) && allowedChildren) {
    node.content = raw.content.map(item => sanitizeNode(item, limits, depth + 1));
    if (node.content.some(item => !allowedChildren.has(item.type))) invalid('Een onderdeel staat op een ongeldige plek in het artikel.');
  }
  if (requiredContent.has(type) && !node.content?.length) invalid('Een onderdeel van het artikel is onvolledig.');
  if (['listItem', 'taskItem'].includes(type) && node.content?.[0]?.type !== 'paragraph') invalid('Een lijstitem moet beginnen met tekst.');
  return node;
}

const unescapeMarkdown = (value: string) => value.replace(/&(?:amp|lt|gt|quot|#39);/g, match => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[match] ?? match);
const textNode = (value: string): BlogDocument[] => value ? [{ type: 'text', text: unescapeMarkdown(value) }] : [];

function inlines(tokens: Token[], depth: number): BlogDocument[] {
  if (depth > 20) invalid('De Markdown bevat te veel geneste onderdelen.');
  return tokens.flatMap((token): BlogDocument[] => {
    switch (token.type) {
      case 'br': return [{ type: 'hardBreak' }];
      case 'image': {
        const media = token as Tokens.Image;
        return mediaSrc(media.href) ? [{ type: 'image', attrs: { src: media.href, alt: media.text, title: media.title } }] : textNode(media.text);
      }
      case 'strong': case 'em': case 'del': case 'link': case 'codespan': {
        const markType = ({ strong: 'bold', em: 'italic', del: 'strike', link: 'link', codespan: 'code' })[token.type];
        const href = token.type === 'link' ? safeLink((token as Tokens.Link).href) : '';
        const raw = token as { text: string; tokens?: Token[] };
        const nodes = raw.tokens ? inlines(raw.tokens, depth + 1) : textNode(raw.text);
        return nodes.map(node => node.type === 'text' && (markType !== 'link' || href) ? {
          ...node,
          marks: [...(node.marks ?? []), { type: markType, ...(href ? { attrs: { href } } : {}) }],
        } : node);
      }
      default: {
        const raw = token as { text?: string; tokens?: Token[]; raw: string };
        return raw.tokens ? inlines(raw.tokens, depth + 1) : textNode(raw.text ?? raw.raw);
      }
    }
  });
}

function inlineBlocks(nodes: BlogDocument[], heading?: number): BlogDocument[] {
  const output: BlogDocument[] = [];
  let run: BlogDocument[] = [];
  for (const node of nodes) {
    if (node.type !== 'image') {
      run.push(node);
      continue;
    }
    if (run.length) output.push(heading ? { type: 'heading', attrs: { level: heading }, content: run } : { type: 'paragraph', content: run });
    output.push(node);
    run = [];
  }
  if (run.length) output.push(heading ? { type: 'heading', attrs: { level: heading }, content: run } : { type: 'paragraph', content: run });
  return output;
}

function blocks(tokens: Token[], depth = 0): BlogDocument[] {
  if (depth > 20) invalid('De Markdown bevat te veel geneste onderdelen.');
  return tokens.flatMap((token): BlogDocument[] => {
    switch (token.type) {
      case 'space': case 'def': return [];
      case 'hr': return [{ type: 'horizontalRule' }];
      case 'heading': {
        const heading = token as Tokens.Heading;
        return inlineBlocks(inlines(heading.tokens, depth), Math.min(4, Math.max(2, heading.depth)));
      }
      case 'code': {
        const code = token as Tokens.Code;
        return [{ type: 'codeBlock', attrs: { language: code.lang }, content: code.text ? [{ type: 'text', text: code.text }] : [] }];
      }
      case 'blockquote': {
        const content = blocks((token as Tokens.Blockquote).tokens, depth + 1);
        return content.length ? [{ type: 'blockquote', content }] : [];
      }
      case 'list': {
        const list = token as Tokens.List;
        const task = list.items.length > 0 && list.items.every(item => item.task);
        return [{ type: task ? 'taskList' : list.ordered ? 'orderedList' : 'bulletList', attrs: { start: list.start }, content: list.items.map(item => {
          const content = blocks(item.tokens, depth + 1);
          if (content[0]?.type !== 'paragraph') content.unshift({ type: 'paragraph' });
          return { type: task ? 'taskItem' : 'listItem', attrs: task ? { checked: item.checked } : undefined, content };
        }) }];
      }
      case 'table': {
        const table = token as Tokens.Table;
        const row = (cells: Tokens.TableCell[], type: string): BlogDocument => ({ type: 'tableRow', content: cells.map(cell => {
          const content = inlineBlocks(inlines(cell.tokens, depth));
          return { type, content: content.length ? content : [{ type: 'paragraph' }] };
        }) });
        return [{ type: 'table', content: [row(table.header, 'tableHeader'), ...table.rows.map(cells => row(cells, 'tableCell'))] }];
      }
      default: {
        const raw = token as { tokens?: Token[]; text?: string; raw: string };
        const content = raw.tokens ? inlines(raw.tokens, depth) : textNode(raw.text ?? raw.raw);
        return inlineBlocks(content);
      }
    }
  });
}

export function markdownDocument(input: unknown): BlogDocument {
  const body = text(input, 120000, 'De Markdown-inhoud');
  let nodes: BlogDocument[];
  try { nodes = blocks(lexer(body)); }
  catch (error) {
    if (error instanceof BlogError) throw error;
    invalid('De Markdown-inhoud kon niet worden verwerkt.');
  }
  return sanitizeNode({ type: 'doc', content: nodes.length ? nodes : [{ type: 'paragraph' }] }, { nodes: 0 });
}

export function validateBlogFields(value: unknown): BlogFields {
  const raw = asRecord(value);
  const defaults = emptyBlogFields();
  const type = raw.type ?? defaults.type;
  if (type !== 'blog' && type !== 'article') invalid('Kies blog of artikel.');
  const locale = text(raw.locale ?? defaults.locale, 25, 'De taal');
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/.test(locale)) invalid('Kies een geldige taal, bijvoorbeeld nl-NL.');
  const title = text(raw.title, 180, 'De titel');
  const slug = normalizeSlug(text(raw.slug, 180, 'De slug') || title);
  if (raw.tags !== undefined && (!Array.isArray(raw.tags) || raw.tags.length > 15)) invalid('Kies maximaal 15 tags.');
  const tags = Array.isArray(raw.tags) ? [...new Set(raw.tags.map(tag => text(tag, 45, 'Elke tag')).filter(Boolean))] : [];
  const content = sanitizeNode(raw.content ?? defaults.content, { nodes: 0 });
  return {
    type, locale, title, slug, slugManual: raw.slugManual === true, content, tags,
    excerpt: text(raw.excerpt, 320, 'De samenvatting'),
    seoTitle: text(raw.seoTitle, 120, 'De SEO-titel'),
    seoDescription: text(raw.seoDescription, 240, 'De metaomschrijving'),
    authorId: text(raw.authorId ?? defaults.authorId, 100, 'De auteur-ID'),
    categoryId: text(raw.categoryId ?? defaults.categoryId, 80, 'De categorie-ID'),
    author: text(raw.author ?? defaults.author, 100, 'De auteur'),
    category: text(raw.category, 80, 'De categorie'),
    hero: image(raw.hero), shareImage: image(raw.shareImage),
  };
}

function hasContent(node: BlogDocument): boolean {
  return Boolean(node.text?.trim()) || (node.content?.some(hasContent) ?? false);
}

export function assertPublishable(fields: BlogFields) {
  if (!fields.title || !fields.slug || !fields.excerpt || !fields.author || !fields.category || !hasContent(fields.content)) {
    invalid('Vul een titel, URL-slug, samenvatting, auteur, categorie en artikeltekst in om te publiceren.');
  }
  if (!fields.hero?.alt.trim()) invalid('Voeg een hero-afbeelding met alt-tekst toe om te publiceren.', 'INVALID_MEDIA');
}

export function assetIds(fields: BlogFields): string[] {
  const result = new Set<string>();
  const add = (src: unknown) => {
    const id = typeof src === 'string' ? blogAssetPattern.exec(src)?.[1] : undefined;
    if (id) result.add(id);
  };
  function walk(node: BlogDocument) {
    if (node.type === 'image') add(node.attrs?.src);
    node.content?.forEach(walk);
  }
  add(fields.hero?.src);
  add(fields.shareImage?.src);
  walk(fields.content);
  if (result.size > 35) invalid('Een artikel mag maximaal 35 geüploade afbeeldingen gebruiken.', 'INVALID_MEDIA');
  return [...result];
}
