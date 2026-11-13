import 'server-only';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ticketRpc } from '@/lib/tickets/rpc';
import { HOST_KIND_HEADER, TENANT_SLUG_HEADER, resolveHostContext } from '@/lib/tenancy/hostname';
import { getServerEnv } from '@/lib/env/server';
import { blogEnvironment, localBlogOrigin } from './origin';
import { BlogError } from './validation';

export function requireBlogHost(request: Request, kind: 'marketing' | 'platform') {
  const env = getServerEnv();
  const host = resolveHostContext(request.headers.get('host'), env.APP_URL, env.DEPLOY_TARGET);
  const local = kind === 'marketing' && localBlogOrigin() && request.headers.get('host') === new URL(localBlogOrigin()!).host;
  if ((!local && host.kind !== kind) || request.headers.get(HOST_KIND_HEADER) !== kind || request.headers.has(TENANT_SLUG_HEADER)) throw new BlogError(403, 'PERMISSION_DENIED', 'Deze bestemming heeft geen toegang tot blogbeheer.');
}

/** Called by each page, preview and API; a reused layout grants no authority. */
export async function requireBlogEditor() {
  const incoming = await headers();
  requireBlogHost(new Request(getServerEnv().APP_URL, { headers: incoming }), 'platform');
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new BlogError(403, 'PERMISSION_DENIED', 'Actueel platformbeheer is vereist.');
  try {
    await ticketRpc(db, 'fieldgrid_blog_admin_read', { operation: 'taxonomy', payload: { siteId: 'fieldgrid', environment: blogEnvironment() } });
  } catch (error) {
    if ((error as { code?: string })?.code === '42501') throw new BlogError(403, 'PERMISSION_DENIED', 'Actueel platformbeheer is vereist.');
    throw error;
  }
  return db;
}

export type BlogCredential = { id: string; siteId: string; environment: string; scopes: string[]; tokenHash: string };
export async function requireBlogCredential(request: Request, scope: 'read' | 'media:write' | 'draft:write' | 'publish'): Promise<BlogCredential> {
  requireBlogHost(request, 'marketing');
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer [A-Za-z0-9_-]{32,256}$/.test(authorization)) throw new BlogError(401, 'PERMISSION_DENIED', 'Een geldig websitecredential is vereist.');
  const tokenHash = createHash('sha256').update(authorization.slice(7)).digest('hex');
  const db = createAdminClient();
  const credential = await ticketRpc(db, 'fieldgrid_blog_authenticate', { token_hash: tokenHash }) as Omit<BlogCredential, 'tokenHash'> | null;
  if (!credential || credential.siteId !== 'fieldgrid' || credential.environment !== blogEnvironment() || !credential.scopes.includes(scope)) throw new BlogError(403, 'PERMISSION_DENIED', 'Het websitecredential is verlopen, ingetrokken of mist rechten.');
  const rate = await ticketRpc(db, 'fieldgrid_blog_write', { operation: 'rate', payload: { siteId: 'fieldgrid', environment: blogEnvironment(), credentialId: credential.id, tokenHash } }) as { allowed: boolean; retryAfter?: number };
  if (!rate.allowed) throw new BlogError(429, 'RATE_LIMITED', 'Te veel aanvragen. Probeer het over een minuut opnieuw.');
  return { ...credential, tokenHash };
}

export function requireSameOrigin(request: Request) {
  const env = getServerEnv();
  const origin = new URL(env.APP_URL);
  const host = request.headers.get('host');
  if (!host) throw new BlogError(403, 'PERMISSION_DENIED', 'Ongeldige aanvraag.');
  origin.host = host;
  if (request.headers.get('origin') !== origin.origin) throw new BlogError(403, 'PERMISSION_DENIED', 'Ongeldige aanvraagherkomst.');
}
