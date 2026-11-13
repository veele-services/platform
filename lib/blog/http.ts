import 'server-only';
import { revalidatePath } from 'next/cache';
import { readBoundedJson, RequestBodyTooLargeError } from '@/lib/http/request-body';
import { BlogError, asRecord, positiveInt } from './validation';
import { blogOrigin, blogUrl } from './origin';
import type { BlogEntry } from './types';

export function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow', ...headers } });
}
export function failure(error: unknown): Response {
  if (error instanceof RequestBodyTooLargeError) return reply({ code: 'PAYLOAD_TOO_LARGE', error: 'De aanvraag is te groot.' }, 413);
  if (error instanceof SyntaxError) return reply({ code: 'VALIDATION_ERROR', error: 'Ongeldige JSON-inhoud.' }, 400);
  if (error instanceof BlogError) return reply({ code: error.code, error: error.message }, error.status, error.code === 'RATE_LIMITED' ? { 'retry-after': '60' } : {});
  const database = error as { code?: string; message?: string } | null;
  const conflicts: Record<string, string> = {
    SLUG_CONFLICT: 'Deze URL is gereserveerd voor een ander artikel. Kies een andere slug.',
    REVISION_CONFLICT: 'Er is een nieuwere revisie. Laad het artikel opnieuw en controleer de wijzigingen.',
    IDEMPOTENCY_CONFLICT: 'Deze operatiesleutel is eerder met andere inhoud gebruikt.',
    INVALID_MEDIA: 'Deze afbeelding is ongeldig of hoort bij een andere website of omgeving.',
    PERMISSION_DENIED: 'Actuele toegangsrechten zijn vereist.',
  };
  for (const [code, message] of Object.entries(conflicts)) {
    if (database?.message?.includes(code)) return reply({ code, error: message }, code === 'PERMISSION_DENIED' ? 403 : code === 'INVALID_MEDIA' ? 422 : 409);
  }
  if (database?.code === '42501') return reply({ code: 'PERMISSION_DENIED', error: conflicts.PERMISSION_DENIED }, 403);
  if (['22023', '23514', '22P02'].includes(database?.code ?? '')) return reply({ code: 'VALIDATION_ERROR', error: 'Controleer de artikelvelden en gekozen taxonomie.' }, 422);
  if (database?.code === 'P0002') return reply({ code: 'NOT_FOUND', error: 'Artikel niet gevonden.' }, 404);
  return reply({ code: 'TEMPORARILY_UNAVAILABLE', error: 'Blogpublicatie is tijdelijk niet beschikbaar.' }, 503, { 'retry-after': '30' });
}
export async function json(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new BlogError(415, 'VALIDATION_ERROR', 'Gebruik application/json.');
  return asRecord(await readBoundedJson(request, 512_000));
}
export function idempotencyKey(request: Request) {
  const key = request.headers.get('idempotency-key') ?? '';
  if (!/^[A-Za-z0-9_:/.-]{1,240}$/.test(key)) throw new BlogError(400, 'VALIDATION_ERROR', 'Een geldige Idempotency-Key is vereist.');
  return key;
}
export function expectedRevision(request: Request) {
  const value = request.headers.get('if-match');
  if (value === null) return 0;
  if (!/^"[1-9][0-9]{0,9}"$/.test(value)) throw new BlogError(409, 'REVISION_CONFLICT', 'Gebruik de actuele revisie in If-Match.');
  return positiveInt(Number(value.slice(1, -1)), 'De verwachte revisie');
}
export function externalId(value: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(value)) throw new BlogError(400, 'VALIDATION_ERROR', 'Ongeldige externe artikelidentiteit.');
  return value;
}
export function publication(entry: BlogEntry) {
  return {
    id: entry.id, externalId: entry.externalId, revision: entry.revision, draftRevision: entry.revision,
    liveRevision: entry.publishedRevision, publishedRevision: entry.publishedRevision,
    status: entry.publishedRevision === entry.revision ? 'published' : 'draft',
    ...(entry.published && entry.publishedAt ? { publicUrl: blogUrl(`/blog/${entry.published.slug}`, blogOrigin()), canonicalUrl: blogUrl(`/blog/${entry.published.slug}`), publishedAt: entry.publishedAt } : {}),
  };
}
export function invalidateBlog() {
  // Marketing URLs are rewritten: invalidate the actual route destination.
  revalidatePath('/fieldgrid-site/[[...path]]', 'page');
  revalidatePath('/fieldgrid-site/sitemap.xml');
  revalidatePath('/platform/blog');
}
