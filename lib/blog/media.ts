import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { readBoundedRequestBody } from '@/lib/http/request-body';
import { createAdminClient } from '@/lib/supabase/admin';
import { blogAdminWrite, blogQuery, blogWrite, type BlogMedia } from './data';
import type { BlogCredential } from './auth';
import { blogEnvironment } from './origin';
import { BlogError } from './validation';

export const BLOG_MEDIA_LIMIT = 10_485_760;
export const BLOG_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export async function decodeBlogMedia(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) throw new BlogError(415, 'INVALID_MEDIA', 'Gebruik multipart/form-data.');
  const bytes = await readBoundedRequestBody(request, BLOG_MEDIA_LIMIT + 65_536);
  const form = await new Request('http://localhost/upload', { method: 'POST', headers: { 'content-type': contentType }, body: bytes }).formData().catch(() => { throw new BlogError(422, 'INVALID_MEDIA', 'Het uploadformulier is ongeldig.'); });
  const files = form.getAll('file');
  if (files.length !== 1 || !(files[0] instanceof File) || [...form.keys()].some(key => key !== 'file')) throw new BlogError(422, 'INVALID_MEDIA', 'Kies precies één afbeelding.');
  const file = files[0];
  if (!file.size || file.size > BLOG_MEDIA_LIMIT || !BLOG_MEDIA_TYPES.includes(file.type)) throw new BlogError(422, 'INVALID_MEDIA', 'Gebruik een JPEG, PNG of WebP van maximaal 10 MB.');
  const input = Buffer.from(await file.arrayBuffer());
  try {
    const decoder = sharp(input, { failOn: 'warning', limitInputPixels: 24_000_000, animated: false });
    const meta = await decoder.metadata();
    const mime = ({ jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as Record<string, string>)[meta.format ?? ''];
    if (mime !== file.type || !meta.width || !meta.height || meta.width > 8192 || meta.height > 8192 || (meta.pages ?? 1) !== 1) throw new Error('Invalid image');
    // Fully decode and re-encode: filename, MIME header and metadata are never
    // accepted as evidence that a file is a usable, non-executable image.
    const oriented = decoder.rotate();
    const output = await (mime === 'image/png' ? oriented.png() : mime === 'image/jpeg' ? oriented.jpeg({ quality: 90 }) : oriented.webp({ quality: 90 })).toBuffer({ resolveWithObject: true });
    if (output.data.length > BLOG_MEDIA_LIMIT) throw new Error('Image too large');
    return { data: output.data, sha256: createHash('sha256').update(input).digest('hex'), width: output.info.width, height: output.info.height, type: mime };
  } catch {
    throw new BlogError(422, 'INVALID_MEDIA', 'De afbeelding kan niet volledig worden gelezen of heeft ongeldige afmetingen.');
  }
}

export async function uploadBlogMedia(request: Request, key: string, credential?: BlogCredential) {
  const media = await decodeBlogMedia(request);
  // Deterministic identity makes a write interrupted after Storage resumable.
  // The request digest also prevents a conflicting retry overwriting bytes.
  const digest = createHash('sha256').update(`fieldgrid:${blogEnvironment()}:${key}:${media.sha256}`).digest('hex');
  const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  const extension = media.type === 'image/jpeg' ? 'jpg' : media.type.split('/')[1];
  const storagePath = `fieldgrid/${blogEnvironment()}/${id}.${extension}`;
  const storage = createAdminClient().storage.from('fieldgrid-blog-media');
  const { error } = await storage.upload(storagePath, media.data, { contentType: media.type, upsert: false, cacheControl: '0' });
  if (error && !['409', 'Duplicate'].includes(String((error as { statusCode?: string; error?: string }).statusCode ?? (error as { error?: string }).error))) throw new BlogError(503, 'TEMPORARILY_UNAVAILABLE', 'De mediaopslag is tijdelijk niet beschikbaar.');
  const payload = { assetId: id, storagePath, type: media.type, width: media.width, height: media.height, bytes: media.data.length, sha256: media.sha256, idempotencyKey: key, ...(credential ? { credentialId: credential.id, tokenHash: credential.tokenHash } : {}) };
  return credential ? blogWrite<{ assetId: string; src: string; width: number; height: number; type: string }>('media', payload) : blogAdminWrite<{ assetId: string; src: string; width: number; height: number; type: string }>('media', payload);
}

export async function getBlogAsset(assetId: unknown, alt: unknown = '', focal: unknown = null) {
  if (typeof assetId !== 'string' || !/^[a-f0-9-]{36}$/.test(assetId)) throw new BlogError(422, 'INVALID_MEDIA', 'Ongeldig asset-ID.');
  const media = await blogQuery<BlogMedia | null>('media', { assetId });
  if (!media) throw new BlogError(422, 'INVALID_MEDIA', 'De afbeelding hoort niet bij deze website en omgeving.');
  const point = focal && typeof focal === 'object' ? focal as Record<string, unknown> : {};
  return { src: `/blog-media/${media.assetId}`, alt, x: point.x ?? 0.5, y: point.y ?? 0.5, width: media.width, height: media.height };
}
