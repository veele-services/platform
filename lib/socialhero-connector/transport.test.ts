import { EventEmitter } from 'node:events';
import http, { type ClientRequest, type IncomingMessage, type RequestOptions } from 'node:http';
import { randomBytes } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { ConnectorError, createSocialHeroTransport, requestSocialHero } from './transport';

const origin = 'https://socialhero.example';
const claim = '/api/integrations/blog/v1/pairings/claim';
const verify = '/api/integrations/blog/v1/pairings/773cad54-5e51-4a0e-974d-36cd14a2d807/verify';
const publicIp = '93.184.216.34';
type FakeOptions = { status?: number; value?: unknown; raw?: string; headers?: Record<string, string | undefined>; peer?: string; hanging?: boolean };

function fakeSend(settings: FakeOptions = {}) {
  const ended = vi.fn();
  const destroyed = vi.fn();
  const send = vi.fn((_url: URL, _options: RequestOptions, callback: (response: IncomingMessage) => void) => {
    const emitter = new EventEmitter();
    let closed = false;
    const request = Object.assign(emitter, {
      destroy: () => { closed = true; destroyed(); return request; },
      end: (payload?: Buffer) => {
        ended(payload);
        queueMicrotask(() => {
          const socket = Object.assign(new EventEmitter(), { connecting: true, remoteAddress: settings.peer ?? publicIp });
          emitter.emit('socket', socket);
          socket.emit('connect');
          if (closed || settings.hanging) return;
          const response = Object.assign(new PassThrough(), {
            statusCode: settings.status ?? 200,
            headers: { 'content-type': 'application/json', ...settings.headers },
          });
          callback(response as unknown as IncomingMessage);
          response.end(settings.raw ?? JSON.stringify(settings.value ?? { ok: true }));
        });
        return request;
      },
    });
    return request as unknown as ClientRequest;
  });
  return { send, ended, destroyed };
}

afterEach(() => vi.useRealTimers());

describe('fixed SocialHero transport boundary', () => {
  it('uses only POST, pins the validated address, preserves TLS hostname and bypasses inherited proxies', async () => {
    const network = fakeSend();
    const resolve = vi.fn(async () => [{ address: publicIp, family: 4 }]);
    const request = createSocialHeroTransport({ resolve, send: network.send });
    const token = randomBytes(32).toString('base64url');
    await expect(request(origin, verify, null, token)).resolves.toEqual({ ok: true });
    expect(resolve).toHaveBeenCalledExactlyOnceWith('socialhero.example');
    const [url, options] = network.send.mock.calls[0];
    expect(url.origin).toBe(origin);
    expect(options).toMatchObject({ method: 'POST', path: verify, servername: 'socialhero.example', headers: { authorization: `Bearer ${token}`, host: 'socialhero.example', 'content-length': '0' } });
    expect((options.agent as http.Agent & { options: { proxyEnv: unknown } }).options.proxyEnv).toEqual({ NODE_ENV: 'production' });
    const callback = vi.fn();
    options.lookup!('socialhero.example', { all: true }, callback);
    expect(callback).toHaveBeenCalledExactlyOnceWith(null, [{ address: publicIp, family: 4 }]);
    const single = vi.fn();
    options.lookup!('socialhero.example', {}, single);
    expect(single).toHaveBeenCalledExactlyOnceWith(null, publicIp, 4);
  });

  it.each([
    'https://socialhero.example/', 'https://SOCIALHERO.example', 'https://socialhero.example:443',
    'https://socialhero.example:8443', 'https://user:password@socialhero.example',
    'https://socialhero.example/api', 'https://socialhero.example?x=1', 'https://socialhero.example#x',
    'https://socialhero.example.', 'https://server.internal', 'http://socialhero.example',
    'http://127.0.0.1:3307', 'https://127.1', 'https://0x7f000001',
  ])('rejects an unnormalized or unsafe origin before a request: %s', async value => {
    const network = fakeSend();
    const resolve = vi.fn(async () => [{ address: publicIp, family: 4 }]);
    await expect(createSocialHeroTransport({ resolve, send: network.send })(value, claim, {})).rejects.toBeInstanceOf(ConnectorError);
    expect(resolve).not.toHaveBeenCalled();
    expect(network.send).not.toHaveBeenCalled();
  });

  it.each([
    '/', '/api/integrations/blog/v1/pairings/claim?next=other',
    '/api/integrations/blog/v1/pairings/claim/../claim',
    '/api/integrations/blog/v1/pairings/773cad54-5e51-4a0e-974d-36cd14a2d807/verify?x=1',
    '/api/integrations/blog/v1/pairings/773cad54-5e51-4a0e-974d-36cd14a2d807%2fverify',
  ])('rejects every noncontract path: %s', async path => {
    const network = fakeSend();
    await expect(createSocialHeroTransport({ send: network.send })(origin, path, {})).rejects.toBeInstanceOf(ConnectorError);
    expect(network.send).not.toHaveBeenCalled();
  });

  it.each([
    '0.0.0.0', '10.1.1.1', '100.100.100.200', '127.0.0.1', '169.254.169.254',
    '172.16.2.1', '192.0.0.1', '192.0.2.5', '192.168.1.1', '198.18.0.1',
    '198.51.100.1', '203.0.113.1', '224.1.1.1', '255.255.255.255', '168.63.129.16',
    '::1', '::', '::ffff:127.0.0.1', '::ffff:8.8.8.8', '64:ff9b::a00:1',
    'fc00::1', 'fe80::1', '2001:db8::1', '2001::1', '2002:7f00:1::', '3fff::1',
  ])('rejects nonpublic DNS answers including metadata and transition ranges: %s', async address => {
    const network = fakeSend();
    await expect(createSocialHeroTransport({ resolve: async () => [{ address, family: address.includes(':') ? 6 : 4 }], send: network.send })(origin, claim, {})).rejects.toMatchObject({ code: 'PAIRING_UNAVAILABLE' });
    expect(network.send).not.toHaveBeenCalled();
  });

  it('rejects mixed public/private answers and an unexpected TCP peer', async () => {
    const mixed = fakeSend();
    await expect(createSocialHeroTransport({ resolve: async () => [{ address: publicIp, family: 4 }, { address: '127.0.0.1', family: 4 }], send: mixed.send })(origin, claim, {})).rejects.toBeInstanceOf(ConnectorError);
    expect(mixed.send).not.toHaveBeenCalled();
    const rebound = fakeSend({ peer: '127.0.0.1' });
    await expect(createSocialHeroTransport({ resolve: async () => [{ address: publicIp, family: 4 }], send: rebound.send })(origin, claim, {})).rejects.toMatchObject({ status: 503 });
    expect(rebound.destroyed).toHaveBeenCalled();
  });

  it('allows a public IPv6 answer and matches its actual peer', async () => {
    const address = '2606:4700:4700::1111';
    const network = fakeSend({ peer: address });
    await expect(createSocialHeroTransport({ resolve: async () => [{ address, family: 6 }], send: network.send })(origin, claim, {})).resolves.toEqual({ ok: true });
  });

  it('does not follow redirects or expose their body', async () => {
    const network = fakeSend({ status: 307, value: { accessToken: randomBytes(32).toString('base64url') }, headers: { location: 'http://169.254.169.254/' } });
    await expect(createSocialHeroTransport({ resolve: async () => [{ address: publicIp, family: 4 }], send: network.send })(origin, claim, {})).rejects.toMatchObject({ status: 502, code: 'PAIRING_UNAVAILABLE' });
    expect(network.send).toHaveBeenCalledTimes(1);
  });

  it('maps known provider codes, redacts provider messages, and retains a bounded retry delay', async () => {
    const privateValue = randomBytes(32).toString('base64url');
    const network = fakeSend({ status: 429, value: { code: 'RATE_LIMITED', message: privateValue, accessToken: privateValue }, headers: { 'retry-after': '120' } });
    const error = await createSocialHeroTransport({ resolve: async () => [{ address: publicIp, family: 4 }], send: network.send })(origin, claim, {}).catch(value => value);
    if (!(error instanceof ConnectorError)) throw new Error('Expected a controlled connector error');
    expect(error).toMatchObject({ status: 429, code: 'RATE_LIMITED', retryAfter: 120 });
    expect(error.message).not.toContain(privateValue);
    expect(JSON.stringify(error)).not.toContain(privateValue);
    expect(error.cause).toBeUndefined();
  });

  it.each([
    { status: 400, value: { code: 'SOMETHING_PRIVATE', message: 'private details' } },
    { status: 500, value: { code: 'INVALID_PAIRING_CODE', message: 'private details' } },
    { status: 200, raw: '{accessToken=private details}' },
    { status: 200, value: [], headers: { 'content-type': 'text/html' } },
    { status: 200, raw: 'x'.repeat(32_769) },
    { status: 200, headers: { 'content-length': '32769' } },
  ])('rejects unsafe or oversized provider replies without raw details', async settings => {
    const network = fakeSend(settings);
    const error = await createSocialHeroTransport({ resolve: async () => [{ address: publicIp, family: 4 }], send: network.send })(origin, claim, {}).catch(value => value);
    expect(error).toBeInstanceOf(ConnectorError);
    if (!(error instanceof ConnectorError)) throw new Error('Expected a controlled connector error');
    expect(error.code).toBe('PAIRING_UNAVAILABLE');
    expect(error.message).not.toContain('private details');
  });

  it('redacts network failures and times out DNS and HTTP within ten seconds', async () => {
    const failure = await createSocialHeroTransport({ resolve: async () => { throw new Error('secret DNS details'); } })(origin, claim, {}).catch(value => value);
    expect(failure).toMatchObject({ status: 503, code: 'PAIRING_UNAVAILABLE' });
    if (!(failure instanceof ConnectorError)) throw new Error('Expected a controlled connector error');
    expect(failure.message).not.toContain('secret');
    vi.useFakeTimers();
    const dns = createSocialHeroTransport({ resolve: () => new Promise(() => {}) })(origin, claim, {});
    const dnsExpectation = expect(dns).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(10_000);
    await dnsExpectation;
    const hanging = fakeSend({ hanging: true });
    const stalled = createSocialHeroTransport({ resolve: async () => [{ address: publicIp, family: 4 }], send: hanging.send })(origin, claim, {});
    const stalledExpectation = expect(stalled).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(10_000);
    await stalledExpectation;
    expect(hanging.destroyed).toHaveBeenCalled();
  });

  it('never sends credentials on claim or accepts malformed verify credentials', async () => {
    const network = fakeSend();
    const request = createSocialHeroTransport({ send: network.send });
    await expect(request(origin, claim, {}, randomBytes(32).toString('base64url'))).rejects.toBeInstanceOf(ConnectorError);
    await expect(request(origin, verify, null, 'invalid\r\nAuthorization: secret')).rejects.toBeInstanceOf(ConnectorError);
    expect(network.send).not.toHaveBeenCalled();
  });

  it('permits real HTTP only on explicitly enabled exact loopback and always sends POST', async () => {
    const seen: { method?: string; body: string; authorization?: string }[] = [];
    const server = http.createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      seen.push({ method: request.method, body: Buffer.concat(chunks).toString(), authorization: request.headers.authorization });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing test listener');
      const localOrigin = `http://127.0.0.1:${address.port}`;
      await expect(requestSocialHero(localOrigin, claim, { contractVersion: 1 })).rejects.toBeInstanceOf(ConnectorError);
      await expect(requestSocialHero(localOrigin, claim, { contractVersion: 1 }, undefined, { allowLocalTest: true })).resolves.toEqual({ ok: true });
      const token = randomBytes(32).toString('base64url');
      await expect(requestSocialHero(localOrigin, verify, null, token, { allowLocalTest: true })).resolves.toEqual({ ok: true });
      expect(seen).toEqual([{ method: 'POST', body: '{"contractVersion":1}', authorization: undefined }, { method: 'POST', body: '', authorization: `Bearer ${token}` }]);
      await expect(requestSocialHero('http://169.254.169.254:80', claim, {}, undefined, { allowLocalTest: true })).rejects.toBeInstanceOf(ConnectorError);
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
});
