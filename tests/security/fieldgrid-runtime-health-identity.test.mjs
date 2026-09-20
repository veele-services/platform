import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { runtimeHealthHeaders } from '../../lib/db/src/runtime-health-identity.ts';
import { verifyRuntimeHealthResponse, proveRuntimeHealth } from '../../scripts/fieldgrid-runtime-health-proof.mjs';

const sha = randomBytes(20).toString('hex');
const priorSha = randomBytes(20).toString('hex');
const expected = { environment: 'production', sha, service: 'api' };
const response = ({ environment = 'production', release = sha, service = 'api', status = 200,
  body = '{"status":"ok"}', cache = 'no-store, max-age=0', extra = '' } = {}) =>
  `HTTP/1.1 ${status} Result\r\nContent-Type: application/json; charset=utf-8\r\nCache-Control: ${cache}\r\nX-Fieldgrid-Environment: ${environment}\r\nX-Fieldgrid-Release: ${release}\r\nX-Fieldgrid-Service: ${service}\r\n${extra}\r\n${body}`;

test('identity is captured from the physical process release, independent of current and environment updates', t => {
  const root = mkdtempSync(join(tmpdir(), 'fieldgrid-runtime-identity-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, value] of [['old', priorSha], ['new', sha]]) {
    mkdirSync(join(root, name, 'artifacts', 'backoffice'), { recursive: true });
    writeFileSync(join(root, name, '.fieldgrid-release-sha'), `${value}\n`);
  }
  symlinkSync(join(root, 'old'), join(root, 'current'));
  const old = runtimeHealthHeaders('backoffice', { cwd: join(root, 'current', 'artifacts', 'backoffice'), environment: 'production' });
  unlinkSync(join(root, 'current')); symlinkSync(join(root, 'new'), join(root, 'current'));
  assert.equal(old['X-Fieldgrid-Release'], priorSha);
  assert.equal(old['X-Fieldgrid-Environment'], 'production');
  assert.ok(Object.isFrozen(old));
  assert.equal(runtimeHealthHeaders('backoffice', { cwd: join(root, 'new', 'artifacts', 'backoffice'), environment: 'staging' })['X-Fieldgrid-Release'], sha);
  assert.equal(runtimeHealthHeaders('api', { cwd: join(root, 'new', 'artifacts', 'backoffice'), environment: 'production' })['X-Fieldgrid-Release'], 'unknown');
});

test('missing, oversized, malformed and symlinked markers keep local health usable but cannot pass hosted proof', t => {
  const root = mkdtempSync(join(tmpdir(), 'fieldgrid-runtime-marker-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = join(root, 'artifacts', 'api-server'); mkdirSync(cwd, { recursive: true });
  const marker = join(root, '.fieldgrid-release-sha');
  const secret = randomBytes(32).toString('hex');
  for (const value of [null, secret, `${sha}\n\n`, `${sha} `, 'x'.repeat(8192)]) {
    if (value !== null) writeFileSync(marker, value);
    const headers = runtimeHealthHeaders('api', { cwd, environment: secret });
    assert.equal(headers['X-Fieldgrid-Release'], 'unknown');
    assert.equal(headers['X-Fieldgrid-Environment'], 'unknown');
    assert.ok(!JSON.stringify(headers).includes(secret));
  }
  unlinkSync(marker); writeFileSync(join(root, 'target'), sha); symlinkSync(join(root, 'target'), marker);
  assert.equal(runtimeHealthHeaders('api', { cwd, environment: 'production' })['X-Fieldgrid-Release'], 'unknown');
  assert.throws(() => verifyRuntimeHealthResponse(response({ release: 'unknown' }), expected));
});

test('HTTP 200 from staging on the same commit, another service, or another release fails', () => {
  assert.equal(verifyRuntimeHealthResponse(response(), expected), true);
  assert.equal(verifyRuntimeHealthResponse(`HTTP/1.1 103 Early Hints\r\n\r\n${response()}`, expected), true);
  for (const data of [
    { environment: 'staging' }, { release: priorSha }, { service: 'customer' },
    { environment: 'unknown' }, { status: 302 }, { cache: 'public, max-age=3600' },
    { extra: `x-fieldgrid-release: ${sha}\r\n` },
  ]) assert.throws(() => verifyRuntimeHealthResponse(response(data), expected));
  assert.throws(() => verifyRuntimeHealthResponse('HTTP/1.1 200 OK\r\n\r\nOK', expected));
  assert.throws(() => verifyRuntimeHealthResponse(response({ body: 'x'.repeat(17000) }), expected));
});

test('public API root proves the precise unauthenticated 401, never a Next 404 or unrelated denial', () => {
  const configuration = { ...expected, mode: 'api-auth-required' };
  assert.equal(verifyRuntimeHealthResponse(response({ status: 401, body: '{"error":"Authenticatie vereist"}' }), configuration), true);
  for (const data of [
    { status: 404, body: '{"error":"Authenticatie vereist"}' },
    { status: 401, body: '{"error":"Ongeldig toegangstoken"}' },
    { status: 401, body: '<html>login</html>' },
    { status: 401, body: '{"error":"Authenticatie vereist","details":"unexpected"}' },
    { status: 401, body: '{"error":"Authenticatie vereist"}', environment: 'staging' },
  ]) assert.throws(() => verifyRuntimeHealthResponse(response(data), configuration));
});

test('transport failures and private headers never escape through error messages', t => {
  const root = mkdtempSync(join(tmpdir(), 'fieldgrid-runtime-transport-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const secret = randomBytes(32).toString('hex');
  const curl = join(root, 'curl');
  writeFileSync(curl, `#!/bin/sh\nprintf '%s' '${secret}' >&2\nexit 7\n`, { mode: 0o700 });
  assert.throws(() => proveRuntimeHealth({ ...expected, url: 'https://app.fieldgrid.nl/api/healthz', curl }), error => {
    assert.ok(!String(error).includes(secret)); return true;
  });
});

test('real HTTP transport proves health and authenticated API-root responses without credentials or redirects', async t => {
  const requests = [];
  const server = createServer((request, reply) => {
    requests.push(request.headers);
    reply.setHeader('Content-Type', 'application/json');
    reply.setHeader('Cache-Control', 'no-store');
    reply.setHeader('X-Fieldgrid-Environment', 'production');
    reply.setHeader('X-Fieldgrid-Release', sha);
    reply.setHeader('X-Fieldgrid-Service', 'api');
    reply.statusCode = request.url === '/api/' ? 401 : 200;
    reply.end(request.url === '/api/' ? '{"error":"Authenticatie vereist"}' : '{"status":"ok"}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const script = fileURLToPath(new URL('../../scripts/fieldgrid-runtime-health-proof.mjs', import.meta.url));
  for (const [path, mode] of [['/api/healthz', 'health'], ['/api/', 'api-auth-required']]) {
    const result = await promisify(execFile)(process.execPath, [script, '--url', `${base}${path}`,
      '--mode', mode, '--environment', 'production', '--sha', sha, '--service', 'api']);
    assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
  }
  assert.equal(requests.length, 2);
  for (const headers of requests) {
    assert.equal(headers.authorization, undefined); assert.equal(headers.cookie, undefined);
    assert.equal(headers['cache-control'], 'no-cache');
  }
});

test('all four server routes use isolated shared identity and the backoffice bypass is exact GET/HEAD only', () => {
  const paths = [
    ['../../artifacts/backoffice/src/app/healthz/route.ts', 'backoffice'],
    ['../../artifacts/personeel-pwa/src/app/healthz/route.ts', 'personnel'],
    ['../../artifacts/klant-pwa/src/app/healthz/route.ts', 'customer'],
    ['../../artifacts/api-server/src/routes/health.ts', 'api'],
  ];
  for (const [path, service] of paths) {
    const text = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(text, new RegExp(`runtimeHealthHeaders\\("${service}"\\)`));
    const identityImport = /import \{ runtimeHealthHeaders \} from "([^"]+)";/.exec(text);
    assert.ok(identityImport, 'server route imports the isolated identity helper');
    assert.equal(new URL(`${identityImport[1]}.ts`, new URL(path, import.meta.url)).href,
      new URL('../../lib/db/src/runtime-health-identity.ts', import.meta.url).href);
    if (service !== 'api') assert.match(text, /dynamic = "force-dynamic"/);
  }
  const middleware = readFileSync(new URL('../../artifacts/backoffice/src/middleware.ts', import.meta.url), 'utf8');
  assert.match(middleware, /\(request\.method === "GET" \|\| request\.method === "HEAD"\) && normalizedPathname === "\/healthz"/);
  const helper = readFileSync(new URL('../../lib/db/src/runtime-health-identity.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(helper, /from ["'](?:\.\/index|pg|drizzle-orm)/);
});
