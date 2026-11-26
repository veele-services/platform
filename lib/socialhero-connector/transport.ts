import 'server-only';
import { lookup } from 'node:dns/promises';
import http, { type ClientRequest, type IncomingMessage, type RequestOptions } from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';

export class ConnectorError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly retryAfter?: number) {
    super(message);
    this.name = 'ConnectorError';
  }
}

type Address = { address: string; family: number };
type TransportOptions = { allowLocalTest?: boolean };
type Dependencies = {
  resolve?: (hostname: string) => Promise<Address[]>;
  send?: (url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;
};
const maxBytes = 32_768;
const timeoutMs = 10_000;
const prefix = '/api/integrations/blog/v1/pairings';
const verifyPath = new RegExp(`^${prefix}/[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/verify$`, 'i');
const unavailable = (status = 503) => new ConnectorError(status, 'PAIRING_UNAVAILABLE', 'SocialHero is tijdelijk niet bereikbaar. Probeer de koppeling opnieuw.');

const blockedV4 = new BlockList();
for (const [address, prefixLength] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blockedV4.addSubnet(address, prefixLength, 'ipv4');
blockedV4.addAddress('168.63.129.16', 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const blockedV6 = new BlockList();
for (const [address, prefixLength] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20],
] as const) blockedV6.addSubnet(address, prefixLength, 'ipv6');

function publicAddress(address: string): boolean {
  if (address.includes('%')) return false;
  const family = isIP(address);
  if (family === 4) return !blockedV4.check(address, 'ipv4');
  return family === 6 && globalV6.check(address, 'ipv6') && !blockedV6.check(address, 'ipv6');
}
function loopback(address: string) {
  return address === '127.0.0.1' || address === '::1';
}
function destination(origin: string, allowLocalTest: boolean): { url: URL; local: boolean; hostname: string } {
  if (typeof origin !== 'string' || origin.length > 2048 || /[\s\\\u0000-\u001f]/.test(origin)) throw unavailable();
  let url: URL;
  try { url = new URL(origin); } catch { throw unavailable(); }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const local = allowLocalTest && url.protocol === 'http:' && ['127.0.0.1', '::1', 'localhost'].includes(hostname)
    && /^http:\/\/(?:127\.0\.0\.1|\[::1\]|localhost):[1-9][0-9]{0,4}$/.test(origin) && !!url.port;
  if (origin !== url.origin || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || !(local || url.protocol === 'https:' && !url.port)
    || !local && (hostname.endsWith('.') || /(^|\.)(localhost|local|internal)$/.test(hostname))) throw unavailable();
  return { url, local, hostname };
}
function seconds(value: string | string[] | undefined): number | undefined {
  if (typeof value !== 'string') return undefined;
  const number = /^\d{1,6}$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return Number.isSafeInteger(number) && number >= 0 ? Math.min(number, 86_400) : undefined;
}
const safeErrors: Record<string, { status: number; message: string }> = {
  INVALID_PAIRING_CODE: { status: 400, message: 'De koppelcode is ongeldig. Controleer de code of maak een nieuwe code in SocialHero.' },
  PAIRING_EXPIRED: { status: 410, message: 'De koppelcode is verlopen. Maak een nieuwe code in SocialHero.' },
  DESTINATION_MISMATCH: { status: 409, message: 'De koppelcode hoort bij een andere website of omgeving.' },
  ENVIRONMENT_MISMATCH: { status: 409, message: 'De koppeling hoort bij een andere omgeving.' },
  INVALID_CREDENTIAL: { status: 401, message: 'De voorlopige koppeling is ongeldig. Koppel de website opnieuw.' },
  PERMISSION_DENIED: { status: 403, message: 'De website heeft niet de vereiste rechten voor deze koppeling.' },
  PAIRING_IN_PROGRESS: { status: 409, message: 'De koppeling wordt nog bevestigd. Probeer het opnieuw.' },
  INVALID_CAPABILITIES: { status: 422, message: 'De website heeft de koppelgegevens niet geldig bevestigd.' },
  RATE_LIMITED: { status: 429, message: 'Er zijn te veel koppelpogingen. Wacht even en probeer opnieuw.' },
};

async function perform(origin: string, path: string, body: unknown | null, token: string | undefined, options: TransportOptions, dependencies: Dependencies): Promise<unknown> {
  const { url, local, hostname } = destination(origin, options.allowLocalTest === true);
  const claim = path === `${prefix}/claim`;
  if (!claim && !verifyPath.test(path) || claim && token !== undefined || !claim && (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token))) throw unavailable();
  let payload: Buffer | undefined;
  try { payload = body === null ? undefined : Buffer.from(JSON.stringify(body)); } catch { throw unavailable(); }
  if (payload && payload.length > maxBytes) throw unavailable();
  const controller = new AbortController();
  let agent: http.Agent | undefined;
  let request: ClientRequest | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); request?.destroy(); reject(unavailable()); }, timeoutMs);
    timer.unref();
  });
  const exchange = async () => {
    const entries = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }]
      : await (dependencies.resolve || (host => lookup(host, { all: true, verbatim: true })))(hostname);
    if (controller.signal.aborted) throw unavailable();
    if (!entries.length || entries.some(entry => ![4, 6].includes(entry.family) || isIP(entry.address) !== entry.family || !(local ? loopback(entry.address) : publicAddress(entry.address)))) throw unavailable();
    const selected = entries[0];
    const pinned = new BlockList();
    pinned.addAddress(selected.address, selected.family === 4 ? 'ipv4' : 'ipv6');
    // No proxy values are inherited. Next's ProcessEnv type requires NODE_ENV.
    const proxyEnv = { NODE_ENV: 'production' as const };
    agent = url.protocol === 'https:' ? new https.Agent({ keepAlive: false, proxyEnv }) : new http.Agent({ keepAlive: false, proxyEnv });
    const headers: Record<string, string> = { accept: 'application/json', 'content-length': String(payload?.length ?? 0), host: url.host };
    if (payload) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    return await new Promise<unknown>((resolve, reject) => {
      const send = dependencies.send || ((target, requestOptions, callback) => (target.protocol === 'https:' ? https : http).request(target, requestOptions, callback));
      request = send(url, {
        method: 'POST', path, headers, agent, signal: controller.signal,
        ...(url.protocol === 'https:' && !isIP(hostname) ? { servername: hostname } : {}),
        lookup: (_hostname, lookupOptions, callback) => {
          if (lookupOptions.all) callback(null, [{ address: selected.address, family: selected.family }]);
          else callback(null, selected.address, selected.family);
        },
      }, response => {
        const status = response.statusCode ?? 0;
        // Native requests do not follow redirects. Never process a redirect body.
        if (status >= 300 && status < 400 || Number(response.headers['content-length'] ?? 0) > maxBytes) {
          response.destroy(); reject(unavailable(502)); return;
        }
        const chunks: Buffer[] = [];
        let length = 0;
        response.on('data', (chunk: Buffer) => {
          length += chunk.length;
          if (length > maxBytes) { response.destroy(); reject(unavailable(502)); }
          else chunks.push(chunk);
        });
        response.once('error', () => reject(unavailable()));
        response.once('aborted', () => reject(unavailable()));
        response.once('end', () => {
          let value: Record<string, unknown>;
          try {
            if (!/^application\/json(?:\s*;|$)/i.test(String(response.headers['content-type'] ?? ''))) throw new Error();
            const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
            value = parsed as Record<string, unknown>;
          } catch { reject(unavailable(502)); return; }
          if (status === 200) { resolve(value); return; }
          const safe = typeof value.code === 'string' ? safeErrors[value.code] : undefined;
          if (safe && safe.status === status) reject(new ConnectorError(safe.status, String(value.code), safe.message, status === 429 ? seconds(response.headers['retry-after']) ?? 60 : seconds(response.headers['retry-after'])));
          else reject(unavailable(status >= 500 ? 503 : 502));
        });
      });
      request.once('socket', socket => {
        const checkPeer = () => {
          const address = socket.remoteAddress ?? '';
          const family = isIP(address);
          if (!family || !pinned.check(address, family === 4 ? 'ipv4' : 'ipv6')) { request?.destroy(); reject(unavailable()); }
        };
        if (socket.connecting) socket.once('connect', checkPeer);
        else checkPeer();
      });
      request.once('error', () => reject(unavailable()));
      request.end(payload);
    });
  };
  try { return await Promise.race([exchange(), deadline]); }
  catch (error) { throw error instanceof ConnectorError ? error : unavailable(); }
  finally { if (timer) clearTimeout(timer); controller.abort(); request?.destroy(); agent?.destroy(); }
}

/** Trusted dependency injection for adapter tests; production callers use requestSocialHero. */
export function createSocialHeroTransport(dependencies: Dependencies) {
  return (origin: string, path: string, body: unknown | null, token?: string, options: TransportOptions = {}) => perform(origin, path, body, token, options, dependencies);
}

export function requestSocialHero(origin: string, path: string, body: unknown | null, token?: string, options: TransportOptions = {}): Promise<unknown> {
  return perform(origin, path, body, token, options, {});
}
