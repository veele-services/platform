import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
vi.mock('server-only', () => ({}));
vi.mock('./data', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({}));
import { decodeBlogMedia } from './media';

function request(bytes: Uint8Array, type = 'image/png') {
  const form = new FormData();
  form.set('file', new File([bytes as BlobPart], 'image.png', { type }));
  return new Request('http://localhost/media', { method: 'POST', body: form });
}
describe('decoded upload boundary', () => {
  it('derives real dimensions, strips embedded metadata and validates the complete file', async () => {
    const png = await sharp({ create: { width: 24, height: 36, channels: 3, background: '#fcb900' } }).png().toBuffer();
    const media = await decodeBlogMedia(request(png));
    expect(media).toMatchObject({ width: 24, height: 36, type: 'image/png' });
    expect(media.sha256).toHaveLength(64);
    await expect(decodeBlogMedia(request(png, 'image/jpeg'))).rejects.toMatchObject({ code: 'INVALID_MEDIA' });
    await expect(decodeBlogMedia(request(png.subarray(0, 30)))).rejects.toMatchObject({ code: 'INVALID_MEDIA' });
    await expect(decodeBlogMedia(request(Buffer.from('<svg onload="alert(1)"/>')))).rejects.toMatchObject({ code: 'INVALID_MEDIA' });
  });
  it('rejects huge declared payloads before buffering', async () => {
    const req = new Request('http://localhost/media', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': '12000000' }, body: 'x' });
    await expect(decodeBlogMedia(req)).rejects.toThrow('Request body too large');
  });
});
