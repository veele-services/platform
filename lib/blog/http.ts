import 'server-only';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { readBoundedJson, RequestBodyTooLargeError } from '@/lib/http/request-body';
import { BlogError, asRecord, positiveInt } from './validation';
import { blogOrigin, blogUrl } from './origin';
import type { BlogEntry } from './types';
import { ConnectorError } from '@/lib/socialhero-connector/transport';

export function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow', ...headers } });
}
export function failure(error: unknown, requestId = randomUUID()): Response {
  const respond = (code: string, message: string, status: number, headers: Record<string, string> = {}) => {
    // Never include request data, credentials, raw provider/SQL errors or URLs.
    console.info(JSON.stringify({ event: 'blog_api_result', requestId, code, status }));
    return reply({ code, message, error: message, requestId }, status, { 'x-request-id': requestId, ...headers });
  };
  if (error instanceof RequestBodyTooLargeError) return respond('PAYLOAD_TOO_LARGE', 'De aanvraag is te groot.', 413);
  if (error instanceof SyntaxError) return respond('VALIDATION_ERROR', 'Ongeldige JSON-inhoud.', 400);
  if (error instanceof ConnectorError) return respond(error.code, error.message, error.status, error.retryAfter ? { 'retry-after': String(error.retryAfter) } : {});
  if (error instanceof BlogError) return respond(error.code, error.message, error.status, error.code === 'RATE_LIMITED' ? { 'retry-after': '60' } : error.code === 'PAIRING_IN_PROGRESS' ? { 'retry-after': '5' } : {});
  const database = error as { code?: string; message?: string } | null;
  if (database?.message?.includes('PAIRING_CANCELLED')) return respond('PAIRING_EXPIRED', 'Deze koppelactie is vervangen of ontkoppeld. Vernieuw de status en koppel zo nodig opnieuw.', 410);
  const conflicts: Record<string, string> = {
    SLUG_CONFLICT: 'Deze URL is gereserveerd voor een ander artikel. Kies een andere slug.',
    REVISION_CONFLICT: 'Er is een nieuwere revisie. Laad het artikel opnieuw en controleer de wijzigingen.',
    IDEMPOTENCY_CONFLICT: 'Deze operatiesleutel is eerder met andere inhoud gebruikt.',
    INVALID_MEDIA: 'Deze afbeelding is ongeldig of hoort bij een andere website of omgeving.',
    PERMISSION_DENIED: 'Actuele toegangsrechten zijn vereist.',
    PAIRING_IN_PROGRESS: 'De koppeling wordt nog bevestigd. Probeer het over enkele seconden opnieuw.',
    PAIRING_EXPIRED: 'Deze koppelactie is verlopen. Vraag een nieuwe code aan.',
    DESTINATION_MISMATCH: 'De koppelactie hoort niet bij deze website of bestemming.',
    INVALID_CREDENTIAL: 'Het websitecredential is ongeldig of ingetrokken.',
    POST_NOT_FOUND: 'Artikel niet gevonden.',
  };
  for (const [code, message] of Object.entries(conflicts)) {
    if (database?.message?.includes(code)) {
      const status = ({ PERMISSION_DENIED: 403, INVALID_MEDIA: 422, INVALID_CREDENTIAL: 401, POST_NOT_FOUND: 404, PAIRING_EXPIRED: 410 } as Record<string, number>)[code] ?? 409;
      return respond(code, message, status, code === 'PAIRING_IN_PROGRESS' ? { 'retry-after': '5' } : {});
    }
  }
  if (database?.code === '42501') return respond('PERMISSION_DENIED', conflicts.PERMISSION_DENIED, 403);
  if (['22023', '23514', '22P02'].includes(database?.code ?? '')) return respond('VALIDATION_ERROR', 'Controleer de artikelvelden en gekozen taxonomie.', 422);
  if (database?.code === 'P0002') return respond('POST_NOT_FOUND', 'Artikel niet gevonden.', 404);
  return respond('TEMPORARILY_UNAVAILABLE', 'Blogpublicatie is tijdelijk niet beschikbaar.', 503, { 'retry-after': '30' });
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
export function publication(entry: BlogEntry, modern = false, verified = true) {
  const publicUrl = entry.published && entry.publishedAt ? blogUrl(`/blog/${entry.published.slug}`, blogOrigin()) : null;
  if (modern) return {
    postId: entry.id, externalId: entry.externalId, slug: entry.draft.slug,
    state: entry.publishedRevision ? verified ? 'published' : 'publishing' : 'draft', revision: entry.revision,
    draftRevision: entry.publishedRevision === entry.revision ? null : entry.revision,
    publishedRevision: entry.publishedRevision,
    // The private editor is a different origin; the wire contract permits null.
    // Do not return a cross-origin preview the SocialHero client must reject.
    previewUrl: null,
    publicUrl, publishedAt: entry.publishedAt,
  };
  return {
    id: entry.id, externalId: entry.externalId, revision: entry.revision, draftRevision: entry.revision,
    liveRevision: entry.publishedRevision, publishedRevision: entry.publishedRevision,
    status: entry.publishedRevision === entry.revision ? verified ? 'published' : 'publishing' : 'draft',
    ...(entry.published && entry.publishedAt ? { publicUrl: blogUrl(`/blog/${entry.published.slug}`, blogOrigin()), canonicalUrl: blogUrl(`/blog/${entry.published.slug}`), publishedAt: entry.publishedAt } : {}),
  };
}
export function invalidateBlog() {
  // Marketing URLs are rewritten: invalidate the actual route destination.
  revalidatePath('/fieldgrid-site/[[...path]]', 'page');
  revalidatePath('/fieldgrid-site/sitemap.xml');
  revalidatePath('/platform/blog');
}
