import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { ticketRpc } from '@/lib/tickets/rpc';
import { blogEnvironment, blogOrigin, blogUrl } from './origin';
import type { BlogEntry } from './types';

/** Read only original head metadata; body content can never impersonate a marker. */
export function publicationHeadMatches(html: string, externalId: string, revision: number) {
  const end = html.indexOf('</head>');
  if (end < 0) return false;
  const values = new Map<string, string>();
  for (const tag of html.slice(0, end).match(/<meta\s[^>]*>/gi) ?? []) {
    const attributes = new Map([...tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(match => [match[1].toLowerCase(), match[2]]));
    const name = attributes.get('name');
    if (name?.startsWith('socialhero:')) {
      if (values.has(name)) return false;
      values.set(name, attributes.get('content') ?? '');
    }
  }
  return values.get('socialhero:external-id') === externalId && values.get('socialhero:revision') === String(revision);
}

async function originalHead(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let text = '', bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) return text;
      bytes += next.value.byteLength;
      if (bytes > 131_072) return '';
      text += decoder.decode(next.value, { stream: true });
      if (text.includes('</head>')) return text.slice(0, text.indexOf('</head>') + 7);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** The fixed environment origin is the verification target; SEO canonical is separate. */
export async function verifyPublishedBlog(entry: BlogEntry, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!entry.published || !entry.publishedRevision || !entry.externalId) return false;
  if (entry.publicationVerified === true) return true;
  const db = createAdminClient();
  const payload = { siteId: 'fieldgrid', environment: blogEnvironment(), id: entry.id, revision: entry.publishedRevision };
  const status = await ticketRpc(db, 'fieldgrid_blog_connector_server_read', { operation: 'publication.status', payload }) as { verified: boolean };
  if (status.verified) return true;
  let matches = false;
  try {
    const response = await fetcher(blogUrl(`/blog/${entry.published.slug}`, blogOrigin()), {
      method: 'GET', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(5_000),
      headers: { accept: 'text/html', 'user-agent': 'Fieldgrid-Publication-Check/1' },
    });
    if (response.status === 200 && response.headers.get('content-type')?.includes('text/html')) matches = publicationHeadMatches(await originalHead(response), entry.externalId, entry.publishedRevision);
  } catch { /* The durable live revision remains in publishing state for a later check. */ }
  if (!matches) return false;
  const confirmed = await ticketRpc(db, 'fieldgrid_blog_connector_server_read', { operation: 'publication.confirm', payload }) as { verified: boolean };
  return confirmed.verified;
}
