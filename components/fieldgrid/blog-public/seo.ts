import type { BlogFields, BlogImage } from '@/lib/blog/types';

import { blogOrigin, blogUrl } from '@/lib/blog/origin';

export { blogUrl };

export function safeBlogUrl(value: unknown) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f\\]/.test(value)) return undefined;
  if (/^\/(?!\/)/.test(value) || /^#[a-z\d][\w-]*$/i.test(value)) return value;
  if (!/^https?:\/\//i.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (!url.username && !url.password) return url.href;
  } catch {
    return undefined;
  }
}

function imageMeta(image: BlogImage | null) {
  const src = safeBlogUrl(image?.src);
  if (!image || !src || src.startsWith('#')) return;
  return {
    url: blogUrl(src, blogOrigin()),
    alt: image.alt,
    ...(image.width && image.height ? { width: image.width, height: image.height } : {}),
  };
}

export function getBlogImages(fields: BlogFields) {
  const primary = imageMeta(fields.shareImage) ?? imageMeta(fields.hero);
  return primary ? [primary] : [];
}

export function articleImages(fields: BlogFields) {
  return [...new Set([imageMeta(fields.hero)?.url, imageMeta(fields.shareImage)?.url].filter((url): url is string => Boolean(url)))];
}
