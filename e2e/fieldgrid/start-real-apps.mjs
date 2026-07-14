import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { join } from 'node:path';

const logDir = join(process.cwd(), 'artifacts', 'playwright', 'app-logs');
await mkdir(logDir, { recursive: true });

if (!process.env.DATABASE_URL) {
  await writeFile(join(logDir, 'startup-status.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), apps: {}, error: 'DATABASE_URL is required; run the Runtime Safety PostgreSQL setup and fixtures before Fieldgrid Playwright.' }, null, 2)}\n`);
  throw new Error('DATABASE_URL is required; run the Runtime Safety PostgreSQL setup and fixtures before Fieldgrid Playwright.');
}

const appSpecs = [
  { key: 'backoffice', label: 'backoffice', cwd: 'artifacts/backoffice', packageName: '@workspace/backoffice', port: '9321', readyUrl: 'http://127.0.0.1:9321/login' },
  { key: 'personeel', label: 'personeel', cwd: 'artifacts/personeel-pwa', packageName: '@workspace/personeel-pwa', port: '9322', readyUrl: 'http://127.0.0.1:9322/healthz' },
  { key: 'klant', label: 'klant', cwd: 'artifacts/klant-pwa', packageName: '@workspace/klant-pwa', port: '9323', readyUrl: 'http://127.0.0.1:9323/healthz' },
  { key: 'provider', label: 'provider', cwd: '.', port: '9324', readyUrl: 'http://127.0.0.1:9324/healthz', command: 'node', args: ['e2e/fieldgrid/fixtures/provider-server.mjs'] },
];

const status = Object.fromEntries(appSpecs.map((app) => [app.key, {
  command: null,
  cwd: app.cwd,
  port: Number(app.port),
  pid: null,
  readyUrl: app.readyUrl,
  readyResult: { ok: false, statusCode: null, error: null },
  exitCode: null,
  terminationReason: null,
}])) ;
const children = [];
let shuttingDown = false;

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

async function writeStatus() {
  await writeFile(join(logDir, 'startup-status.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), apps: status }, null, 2)}\n`);
}

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

function waitForReady(app, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tick = () => {
      const req = http.get(app.readyUrl, (res) => {
        res.resume();
        status[app.key].readyResult = { ok: (res.statusCode ?? 500) < 500, statusCode: res.statusCode ?? null, error: null };
        writeStatus().catch(() => {});
        if ((res.statusCode ?? 500) < 500) resolve(true);
        else retry(`HTTP ${res.statusCode}`);
      });
      req.on('error', (error) => retry(error.message));
      req.setTimeout(2_000, () => { req.destroy(); retry('timeout'); });
    };
    const retry = (message) => {
      status[app.key].readyResult = { ok: false, statusCode: null, error: message };
      writeStatus().catch(() => {});
      if (Date.now() > deadline) resolve(false);
      else setTimeout(tick, 500);
    };
    tick();
  });
}

async function startApp(app) {
  const resolved = await resolveCommand(app);
  status[app.key].command = resolved.display;
  const stdout = createWriteStream(join(logDir, `${app.label}.stdout.log`), { flags: 'a' });
  const stderr = createWriteStream(join(logDir, `${app.label}.stderr.log`), { flags: 'a' });
  const child = spawn(resolved.command, resolved.args, {
    cwd: app.cwd,
    env: { ...baseEnv, PORT: app.port },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  status[app.key].pid = child.pid ?? null;
  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);
  child.stdout.on('data', (chunk) => process.stdout.write(`[${app.label}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${app.label}] ${chunk}`));
  child.on('exit', (code, signal) => {
    status[app.key].exitCode = code;
    status[app.key].terminationReason = signal ?? (shuttingDown ? 'shutdown' : 'exited');
    writeStatus().catch(() => {});
    if (!shuttingDown && !status[app.key].readyResult.ok) {
      console.error(`[${app.label}] exited before readiness`, { code, signal });
      process.exitCode = code ?? 1;
      shutdown();
    }
  });
  children.push(child);
  await writeStatus();
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  await writeStatus().catch(() => {});
  setTimeout(() => process.exit(process.exitCode ?? 0), 500).unref();
}
process.on('SIGTERM', () => { shutdown(); });
process.on('SIGINT', () => { shutdown(); });
process.on('exit', () => { writeStatus().catch(() => {}); });

try {
  for (const app of appSpecs) await startApp(app);
  const readiness = await Promise.all(appSpecs.map((app) => waitForReady(app)));
  await writeStatus();
  if (!readiness.every(Boolean)) {
    const failed = appSpecs.filter((_, index) => !readiness[index]).map((app) => app.key).join(', ');
    throw new Error(`Fieldgrid E2E app readiness failed for: ${failed}`);
  }
  console.log('FIELDGRID_E2E_REAL_APPS_READY');
  setInterval(() => {}, 1 << 30);
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
  await shutdown();
}
