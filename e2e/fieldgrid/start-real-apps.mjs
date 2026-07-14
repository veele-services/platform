import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { join } from 'node:path';

const logDir = join(process.cwd(), 'artifacts', 'playwright', 'app-logs');
await mkdir(logDir, { recursive: true });

const orchestrator = {
  host: '127.0.0.1',
  port: Number(process.env.FIELDGRID_E2E_ORCHESTRATOR_PORT || 9325),
};

const appSpecs = [
  {
    app: 'backoffice',
    logPrefix: 'backoffice',
    cwd: 'artifacts/backoffice',
    port: 9321,
    readyPath: '/login',
    hostHeader: 'tenant-a.runtime.fieldgrid.test',
    expectedStatuses: [200],
  },
  {
    app: 'personeel',
    logPrefix: 'personeel',
    cwd: 'artifacts/personeel-pwa',
    port: 9322,
    readyPath: '/personeel/opdrachten',
    hostHeader: 'tenant-a.runtime.fieldgrid.test',
    expectedStatuses: [200, 302, 303, 307, 308],
  },
  {
    app: 'klant',
    logPrefix: 'klant',
    cwd: 'artifacts/klant-pwa',
    port: 9323,
    readyPath: '/klant/opdrachten',
    hostHeader: 'tenant-a.runtime.fieldgrid.test',
    expectedStatuses: [200, 302, 303, 307, 308],
  },
  {
    app: 'provider',
    logPrefix: 'provider',
    cwd: '.',
    port: 9324,
    readyPath: '/healthz',
    hostHeader: '127.0.0.1',
    expectedStatuses: [200],
    command: 'node',
    args: ['e2e/fieldgrid/fixtures/provider-server.mjs'],
  },
];

const status = {
  generatedAt: new Date().toISOString(),
  orchestrator: { url: `http://${orchestrator.host}:${orchestrator.port}/healthz`, ready: false },
  apps: Object.fromEntries(appSpecs.map((app) => [app.app, {
    app: app.app,
    command: null,
    cwd: app.cwd,
    pid: null,
    port: app.port,
    hostHeader: app.hostHeader,
    readyUrl: `http://127.0.0.1:${app.port}${app.readyPath}`,
    expectedStatuses: app.expectedStatuses,
    observedStatus: null,
    readinessResult: { ok: false, error: null, checkedAt: null },
    exitCode: null,
    terminationReason: null,
  }])),
};

let statusWrite = Promise.resolve();
async function writeStatusNow() {
  status.generatedAt = new Date().toISOString();
  const target = join(logDir, 'startup-status.json');
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(status, null, 2)}\n`);
  await rename(tmp, target);
}
function writeStatus() {
  statusWrite = statusWrite.then(writeStatusNow, writeStatusNow);
  return statusWrite;
}
await writeStatus();

if (!process.env.DATABASE_URL) {
  status.error = 'DATABASE_URL is required; run the Runtime Safety PostgreSQL setup and fixtures before Fieldgrid Playwright.';
  await writeStatus();
  throw new Error(status.error);
}

const children = [];
let shuttingDown = false;
let startupFailed = false;

const readinessServer = http.createServer((req, res) => {
  if (req.url !== '/healthz') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not_found' }));
    return;
  }
  const payload = { ok: status.orchestrator.ready, apps: status.apps };
  res.writeHead(status.orchestrator.ready ? 200 : 503, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
});
await new Promise((resolve) => readinessServer.listen(orchestrator.port, orchestrator.host, resolve));

const baseEnv = {
  ...process.env,
  NODE_ENV: 'development',
  FIELDGRID_E2E_AUTH_ENABLED: 'true',
  FIELDGRID_E2E_NO_LIVE_PROVIDERS: 'true',
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:9324/supabase',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'fieldgrid-local-e2e-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'fieldgrid-local-e2e-service-key',
  SESSION_SECRET: process.env.SESSION_SECRET || 'fieldgrid-local-e2e-session-secret-minimum-32-bytes',
  EMAIL_PROVIDER: 'mock',
  PAYMENT_PROVIDER: 'mock',
  MAPS_PROVIDER: 'mock',
  PUSH_PROVIDER: 'mock',
};

async function packageScript(cwd, scriptName) {
  const raw = await readFile(join(process.cwd(), cwd, 'package.json'), 'utf8');
  const pkg = JSON.parse(raw);
  const script = pkg.scripts?.[scriptName];
  if (!script) throw new Error(`${pkg.name ?? cwd} does not define package script "${scriptName}"`);
  return script;
}

async function resolveCommand(app) {
  if (app.command) return { command: app.command, args: app.args ?? [], display: [app.command, ...(app.args ?? [])].join(' ') };
  const script = await packageScript(app.cwd, 'dev');
  return { command: 'pnpm', args: ['run', 'dev'], display: `pnpm run dev (${script})` };
}

function probe(app) {
  return new Promise((resolve) => {
    const request = http.request({
      host: '127.0.0.1',
      port: app.port,
      path: app.readyPath,
      method: 'GET',
      headers: {
        Host: app.hostHeader,
        'x-forwarded-host': app.hostHeader,
        'x-forwarded-proto': 'http',
      },
      timeout: 3000,
    }, (res) => {
      res.resume();
      const observedStatus = res.statusCode ?? null;
      resolve({
        ok: observedStatus !== 404 && observedStatus !== null && app.expectedStatuses.includes(observedStatus),
        observedStatus,
        error: null,
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error('timeout'));
    });
    request.on('error', (error) => resolve({ ok: false, observedStatus: null, error: error.message }));
    request.end();
  });
}

async function waitForReady(app, timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const result = await probe(app);
    status.apps[app.app].observedStatus = result.observedStatus;
    status.apps[app.app].readinessResult = { ok: result.ok, error: result.error, checkedAt: new Date().toISOString() };
    await writeStatus();
    if (result.ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  status.apps[app.app].readinessResult = { ...status.apps[app.app].readinessResult, ok: false, error: status.apps[app.app].readinessResult.error ?? 'readiness_timeout' };
  await writeStatus();
  return false;
}

async function startApp(app) {
  const resolved = await resolveCommand(app);
  status.apps[app.app].command = resolved.display;
  const stdout = createWriteStream(join(logDir, `${app.logPrefix}.stdout.log`), { flags: 'a' });
  const stderr = createWriteStream(join(logDir, `${app.logPrefix}.stderr.log`), { flags: 'a' });
  const child = spawn(resolved.command, resolved.args, {
    cwd: app.cwd,
    env: { ...baseEnv, PORT: String(app.port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  status.apps[app.app].pid = child.pid ?? null;
  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);
  child.stdout.on('data', (chunk) => process.stdout.write(`[${app.logPrefix}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${app.logPrefix}] ${chunk}`));
  child.on('exit', (code, signal) => {
    status.apps[app.app].exitCode = code;
    status.apps[app.app].terminationReason = signal ?? (shuttingDown ? 'shutdown' : 'exited');
    writeStatus().catch(() => {});
    if (!shuttingDown && !status.apps[app.app].readinessResult.ok) {
      console.error(`[${app.logPrefix}] exited before readiness`, { code, signal });
      startupFailed = true;
      shutdown(code ?? 1).catch(() => {});
    }
  });
  children.push(child);
  await writeStatus();
}

async function shutdown(exitCode = process.exitCode ?? 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  status.orchestrator.ready = false;
  readinessServer.close();
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  await writeStatus().catch(() => {});
  setTimeout(() => process.exit(exitCode), 500).unref();
}
process.on('SIGTERM', () => { shutdown(0).catch(() => {}); });
process.on('SIGINT', () => { shutdown(130).catch(() => {}); });

try {
  for (const app of appSpecs) await startApp(app);
  const readiness = await Promise.all(appSpecs.map((app) => waitForReady(app)));
  status.orchestrator.ready = readiness.every(Boolean);
  await writeStatus();
  if (!status.orchestrator.ready) {
    const failed = appSpecs.filter((_, index) => !readiness[index]).map((app) => app.app).join(', ');
    throw new Error(`Fieldgrid E2E app readiness failed for: ${failed}`);
  }
  console.log('FIELDGRID_E2E_REAL_APPS_READY');
  setInterval(() => {}, 1 << 30);
} catch (error) {
  startupFailed = true;
  status.error = error instanceof Error ? error.message : String(error);
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  await writeStatus();
  await shutdown(1);
}
