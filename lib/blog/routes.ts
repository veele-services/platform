/** The only server-to-server methods accepted on the public marketing host. */
export function isBlogServiceRequest(path: string, method: string): boolean {
  if (path === '/api/socialhero/v1/capabilities') return method === 'GET';
  if (path === '/api/socialhero/v1/media') return method === 'POST';
  if (/^\/api\/socialhero\/v1\/posts\/[^/]{1,600}$/.test(path)) return method === 'GET' || method === 'PUT';
  return /^\/api\/socialhero\/v1\/posts\/[^/]{1,600}\/publish$/.test(path) && method === 'POST';
}
export function isBlogMediaRequest(path: string, method: string): boolean {
  return /^\/blog-media\/[a-f0-9-]{36}$/.test(path) && ['GET', 'HEAD'].includes(method);
}
export function isLocalBlogPath(path: string, method: string): boolean {
  return isBlogServiceRequest(path, method) || isBlogMediaRequest(path, method)
    || ['GET', 'HEAD'].includes(method) && (/^\/blog(?:\/[^/]+)?$/.test(path) || ['/sitemap.xml', '/robots.txt'].includes(path));
}
