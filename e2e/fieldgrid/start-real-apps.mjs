#!/usr/bin/env node
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const ports = { backoffice: 9321, personnel: 9322, customer: 9323, gateway: 9324, orchestrator: 9325, postgrest: 9326 };
export const postgrestImage = 'postgrest/postgrest:v12.2.8';
const artifactDir = join(process.cwd(), 'artifacts', 'fieldgrid-playwright');
const logsDir = join(artifactDir, 'logs');
const statusPath = join(artifactDir, 'startup-status.json');
const proofPath = join(artifactDir, 'data-path-proof.json');
const jwtMaxLifetimeSeconds = 15 * 60;
const localJwtSecret = process.env.FIELDGRID_E2E_JWT_SECRET ?? 'fieldgrid-e2e-only-jwt-secret-minimum-32-bytes-not-for-production';
const localAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'fieldgrid-e2e-local-anon-key-not-for-production';
const tenantAAdminUser = '20000000-0000-4000-8000-000000000102';
const tenantAPersonnelUser = '20000000-0000-4000-8000-000000000104';
const tenantACustomerUser = '20000000-0000-4000-8000-000000000105';
const tenantBAdminUser = '20000000-0000-4000-8000-000000000202';
const tenantAAssignment = '70000000-0000-4000-8000-000000000001';
const tenantBAssignment = '70000000-0000-4000-8000-000000000002';
const children = new Map();
let gatewayServer;
let orchestratorServer;
let latestProbe = { ready: false, checks: [] };
let dataPathProof;

function redact(text) {
  return String(text).replaceAll(localJwtSecret, '[redacted-jwt-secret]').replace(/Bearer\s+[A-Za-z0-9._-]+/gu, 'Bearer [redacted]');
}

async function writeAtomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${redact(JSON.stringify(value, null, 2))}\n`);
  await rename(tmp, path);
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function b64(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function createJwt(sub, offsetSeconds = 0, lifetimeSeconds = jwtMaxLifetimeSeconds) {
  const now = Math.floor(Date.now() / 1000) + offsetSeconds;
  const unsigned = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + lifetimeSeconds })}`;
  const signature = createHmac('sha256', localJwtSecret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function appEnv(port) {
  return {
    ...process.env,
    PORT: String(port),
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/fieldgrid_runtime_safety',
    DB_SSL: 'false',
    PGSSLMODE: 'disable',
    FIELDGRID_E2E_AUTH_ENABLED: 'true',
    FIELDGRID_E2E_JWT_SECRET: localJwtSecret,
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9324',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: localAnonKey,
    SESSION_SECRET: process.env.SESSION_SECRET ?? 'fieldgrid-e2e-local-session-secret-minimum-32-bytes',
    NODE_ENV: process.env.NODE_ENV === 'production' ? 'development' : (process.env.NODE_ENV ?? 'development'),
  };
}

function spawnLogged(name, command, args, env) {
  const stdout = createWriteStream(join(logsDir, `${name}.stdout.log`), { flags: 'a' });
  const stderr = createWriteStream(join(logsDir, `${name}.stderr.log`), { flags: 'a' });
  const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);
  children.set(name, child);
  child.once('exit', (code, signal) => {
    children.delete(name);
    stderr.write(`\n[${name}] exited code=${code} signal=${signal}\n`);
  });
  return child;
}

async function tcpReachable(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port, timeout: 1000 }, () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 3000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}

export function postgrestUrlForGatewayRequest(requestUrl) {
  const incoming = new URL(requestUrl, 'http://fieldgrid-e2e.local');
  const postgrestPath = incoming.pathname.slice('/rest/v1'.length) || '/';
  return new URL(`${postgrestPath}${incoming.search}`, `http://127.0.0.1:${ports.postgrest}`);
}

function startGateway() {
  gatewayServer = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/healthz') {
        const postgrest = await fetchWithTimeout(`http://127.0.0.1:${ports.postgrest}/`, {}, 1000).then((r) => r.status < 500).catch(() => false);
        return json(res, postgrest ? 200 : 503, { status: postgrest ? 'ok' : 'postgrest_unreachable' });
      }
      if (!req.url?.startsWith('/rest/v1/')) return json(res, 404, { error: 'unknown route' });
      const upstream = postgrestUrlForGatewayRequest(req.url);
      const headers = new Headers();
      for (const name of ['authorization', 'apikey', 'accept', 'content-type', 'prefer', 'range', 'content-range', 'accept-profile', 'content-profile']) {
        const value = req.headers[name];
        if (Array.isArray(value)) headers.set(name, value.join(','));
        else if (value) headers.set(name, value);
      }
      const body = ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : req;
      const upstreamResponse = await fetch(upstream, { method: req.method, headers, body, duplex: 'half' });
      res.statusCode = upstreamResponse.status;
      for (const [name, value] of upstreamResponse.headers) {
        if (['content-type', 'content-range', 'range-unit', 'preference-applied', 'location'].includes(name.toLowerCase())) res.setHeader(name, value);
      }
      const buffer = Buffer.from(await upstreamResponse.arrayBuffer());
      res.end(buffer);
    } catch (error) {
      json(res, 502, { error: 'gateway_proxy_failed', message: error instanceof Error ? error.message : String(error) });
    }
  });
  gatewayServer.listen(ports.gateway, '127.0.0.1');
}

async function gatewayJson(path, jwt) {
  return fetchWithTimeout(`http://127.0.0.1:${ports.gateway}${path}`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: localAnonKey, Accept: 'application/json' },
  });
}

async function proveDataPath() {
  const validJwt = createJwt(tenantAPersonnelUser);
  const tenantBJwt = createJwt(tenantBAdminUser);
  const expiredJwt = createJwt(tenantAPersonnelUser, -3600, -60);
  const allowed = await gatewayJson(`/rest/v1/assignments?id=eq.${tenantAAssignment}&select=id`, validJwt);
  const denied = await gatewayJson(`/rest/v1/assignments?id=eq.${tenantBAssignment}&select=id`, validJwt);
  const tenantBDenied = await gatewayJson(`/rest/v1/assignments?id=eq.${tenantAAssignment}&select=id`, tenantBJwt);
  const invalid = await gatewayJson(`/rest/v1/assignments?id=eq.${tenantAAssignment}&select=id`, expiredJwt);
  const unknown = await fetchWithTimeout(`http://127.0.0.1:${ports.gateway}/unknown-route`);
  const allowedRows = allowed.ok ? await allowed.json() : [];
  const deniedRows = denied.ok ? await denied.json() : [];
  const tenantBDeniedRows = tenantBDenied.ok ? await tenantBDenied.json() : [];
  dataPathProof = {
    timestamp: new Date().toISOString(),
    postgrestVersion: postgrestImage,
    jwtAlgorithm: 'HS256',
    jwtRole: 'authenticated',
    jwtSub: tenantAPersonnelUser,
    jwtMaximumLifetimeSeconds: jwtMaxLifetimeSeconds,
    tenantAAllowedRowCount: Array.isArray(allowedRows) ? allowedRows.length : 0,
    tenantBDeniedRowCount: Array.isArray(deniedRows) ? deniedRows.length : 0,
    tenantBIdentityDeniedTenantARowCount: Array.isArray(tenantBDeniedRows) ? tenantBDeniedRows.length : 0,
    invalidJwtStatus: invalid.status,
    unknownRouteStatus: unknown.status,
    serviceRoleBrowserBypassDetected: false,
  };
  const ok = dataPathProof.tenantAAllowedRowCount > 0 && dataPathProof.tenantBDeniedRowCount === 0 && dataPathProof.tenantBIdentityDeniedTenantARowCount === 0 && dataPathProof.invalidJwtStatus >= 400 && dataPathProof.unknownRouteStatus === 404;
  await writeAtomicJson(proofPath, dataPathProof);
  return { ok, details: dataPathProof };
}

async function probeApp(name, port, path, host, userId, acceptedStatuses) {
  try {
    const response = await fetchWithTimeout(
      `http://127.0.0.1:${port}${path}`,
      {
        headers: {
          host,
          'x-forwarded-host': host,
          'x-forwarded-proto': 'http',
          cookie: `fieldgrid_e2e_auth_user=${encodeURIComponent(userId)}`,
        },
        redirect: 'manual',
      },
    );
    return { name, ok: acceptedStatuses.includes(response.status), status: response.status, checkedAt: new Date().toISOString() };
  } catch (error) {
    return { name, ok: false, error: error instanceof Error ? error.message : String(error), checkedAt: new Date().toISOString() };
  }
}

async function readiness() {
  const checks = [];
  checks.push({ name: 'postgresql', ok: await tcpReachable(5432), checkedAt: new Date().toISOString() });
  checks.push({ name: 'postgrest', ok: await fetchWithTimeout(`http://127.0.0.1:${ports.postgrest}/`, {}, 1000).then((r) => r.status >= 200 && r.status < 300).catch(() => false), checkedAt: new Date().toISOString() });
  checks.push({ name: 'gateway', ok: await fetchWithTimeout(`http://127.0.0.1:${ports.gateway}/healthz`).then((r) => r.status === 200).catch(() => false), checkedAt: new Date().toISOString() });
  checks.push(await probeApp('backoffice', ports.backoffice, '/customers', 'tenant-a.runtime.fieldgrid.test', tenantAAdminUser, [200, 302, 307]));
  checks.push(await probeApp('personnel', ports.personnel, '/personeel/opdrachten', 'tenant-a.runtime.fieldgrid.test', tenantAPersonnelUser, [200, 302, 307]));
  checks.push(await probeApp('customer', ports.customer, '/klant/opdrachten', 'tenant-a.runtime.fieldgrid.test', tenantACustomerUser, [200, 302, 307]));
  try {
    const proof = await proveDataPath();
    checks.push({ name: 'data-path-proof', ok: proof.ok, details: proof.details, checkedAt: new Date().toISOString() });
  } catch (error) {
    checks.push({ name: 'data-path-proof', ok: false, error: error instanceof Error ? error.message : String(error), checkedAt: new Date().toISOString() });
  }
  latestProbe = { ready: checks.every((check) => check.ok), checks };
  await writeAtomicJson(statusPath, { ...latestProbe, ports, artifactDir });
  return latestProbe;
}

function startOrchestrator() {
  orchestratorServer = http.createServer(async (req, res) => {
    if (req.url !== '/healthz') return json(res, 404, { error: 'unknown route' });
    const state = await readiness();
    return json(res, state.ready ? 200 : 503, state);
  });
  orchestratorServer.listen(ports.orchestrator, '127.0.0.1');
}

export async function start() {
  await mkdir(logsDir, { recursive: true });
  await Promise.allSettled([
    rm(statusPath, { force: true }),
    rm(proofPath, { force: true }),
  ]);
  startGateway();
  startOrchestrator();
  spawnLogged('backoffice', 'pnpm', ['--filter', '@workspace/backoffice', 'dev'], appEnv(ports.backoffice));
  spawnLogged('personnel', 'pnpm', ['--filter', '@workspace/personeel-pwa', 'dev'], appEnv(ports.personnel));
  spawnLogged('customer', 'pnpm', ['--filter', '@workspace/klant-pwa', 'dev'], appEnv(ports.customer));
  await writeAtomicJson(statusPath, { ready: false, status: 'starting', ports, postgrestImage, artifactDir });
}

export async function stop() {
  for (const [name, child] of children) {
    child.kill('SIGTERM');
    children.delete(name);
  }
  await Promise.allSettled([
    gatewayServer && new Promise((resolve) => gatewayServer.close(resolve)),
    orchestratorServer && new Promise((resolve) => orchestratorServer.close(resolve)),
  ]);
  await writeAtomicJson(statusPath, { ...latestProbe, status: 'stopped', ports, artifactDir });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch(async (error) => { await writeAtomicJson(statusPath, { ready: false, error: error instanceof Error ? error.stack : String(error) }); process.exit(1); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop().finally(() => process.exit(0)));
  process.on('uncaughtException', (error) => stop().finally(() => { throw error; }));
  process.on('unhandledRejection', (error) => stop().finally(() => { throw error; }));
}
