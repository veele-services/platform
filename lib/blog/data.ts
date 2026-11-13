import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { ticketRpc } from '@/lib/tickets/rpc';
import { blogEnvironment } from './origin';
import type { BlogEntry } from './types';

export type BlogTaxonomy = { authors: { id: string; name: string }[]; categories: { id: string; name: string }[] };
export type BlogMedia = { assetId: string; storagePath: string; type: string; width: number; height: number; bytes: number; sha256: string };
type Payload = Record<string, unknown>;
type BlogClient = Awaited<ReturnType<typeof createClient>>;
function scope(payload: Payload): Payload {
  // Callers cannot choose another site or environment through a request payload.
  return { ...payload, siteId: 'fieldgrid', environment: blogEnvironment() };
}

/** Service boundary; credentials never cross the browser boundary. */
export async function blogQuery<T = unknown>(operation: string, payload: Payload = {}): Promise<T> {
  const db = createAdminClient();
  if (operation === 'credential') return await ticketRpc(db, 'fieldgrid_blog_authenticate', { token_hash: payload.tokenHash }) as T;
  if (operation === 'media' && payload.publicOnly) operation = 'public.media';
  return await ticketRpc(db, 'fieldgrid_blog_read', { operation, payload: scope(payload) }) as T;
}

/** Only media/draft/publish/rate are accepted; SQL rechecks and locks the hashed credential. */
export async function blogWrite<T = unknown>(operation: string, payload: Payload): Promise<T> {
  return await ticketRpc(createAdminClient(), 'fieldgrid_blog_write', { operation, payload: scope(payload) }) as T;
}

/** The database checks the current user's active Auth session and platform administrator record. */
export async function blogAdminQuery<T = unknown>(operation: string, payload: Payload = {}, db?: BlogClient): Promise<T> {
  return await ticketRpc(db ?? await createClient(), 'fieldgrid_blog_admin_read', { operation, payload: scope(payload) }) as T;
}
export async function blogAdminWrite<T = unknown>(operation: string, payload: Payload, db?: BlogClient): Promise<T> {
  return await ticketRpc(db ?? await createClient(), 'fieldgrid_blog_admin_write', { operation, payload: scope(payload) }) as T;
}

async function publicQuery<T>(operation: string, payload: Payload = {}): Promise<T> {
  return await ticketRpc(createAdminClient(), 'fieldgrid_blog_public_read', { operation, payload: scope(payload) }) as T;
}
export async function getPublishedBlog(): Promise<BlogEntry[]> { return publicQuery('public.list'); }
export async function getPublicBlog(slug: string): Promise<{ entry: BlogEntry } | { redirect: string } | null> { return publicQuery('resolve', { slug }); }
export async function getBlog(id: string): Promise<BlogEntry | null> { return blogAdminQuery('get', { id }); }
export async function listBlogEntries(): Promise<BlogEntry[]> { return blogAdminQuery('list'); }
export async function getBlogTaxonomy(): Promise<BlogTaxonomy> { return publicQuery('taxonomy'); }
