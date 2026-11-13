import { FIELDGRID_MARKETING_ORIGIN } from '@/lib/marketing/fieldgrid/routes';

export const BLOG_CANONICAL_ORIGIN = FIELDGRID_MARKETING_ORIGIN;
export function blogEnvironment(): 'development' | 'staging' | 'production' {
  const target = process.env.DEPLOY_TARGET ?? 'local';
  if (!['local', 'staging', 'production'].includes(target)) throw new Error('Ongeldige blogomgeving.');
  return target === 'local' ? 'development' : target as 'staging' | 'production';
}

/** Explicit loopback-only destination; never reads a local env file. */
export function localBlogOrigin(): string | null {
  if (blogEnvironment() !== 'development' || !process.env.FIELDGRID_BLOG_LOCAL_ORIGIN) return null;
  const url = new URL(process.env.FIELDGRID_BLOG_LOCAL_ORIGIN);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Ongeldige lokale blogbestemming.');
  return url.origin;
}

export function blogOrigin(): string {
  return blogEnvironment() === 'production' ? BLOG_CANONICAL_ORIGIN
    : blogEnvironment() === 'staging' ? 'https://www.staging.fieldgrid.nl'
    : localBlogOrigin() ?? 'http://www.localhost:3000';
}

export function blogUrl(path: string, origin = BLOG_CANONICAL_ORIGIN): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) throw new Error('Ongeldig blogpad.');
  const url = new URL(path, origin);
  if (url.origin !== new URL(origin).origin) throw new Error('Ongeldig blogpad.');
  return url.href;
}
