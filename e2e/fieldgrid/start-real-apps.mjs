import { spawn } from 'node:child_process';
import http from 'node:http';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required; run the Runtime Safety PostgreSQL setup and fixtures before Fieldgrid Playwright.');
}

const apps = [
  { name: 'backoffice', cwd: 'artifacts/backoffice', port: '9321' },
  { name: 'personeel-pwa', cwd: 'artifacts/personeel-pwa', port: '9322' },
  { name: 'klant-pwa', cwd: 'artifacts/klant-pwa', port: '9323' },
  { name: 'provider-mocks', cwd: '.', port: '9324', command: 'node', args: ['e2e/fieldgrid/fixtures/provider-server.mjs'] },
];

const children = [];
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

function wait(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if ((res.statusCode ?? 500) < 500) resolve();
        else retry();
      });
      req.on('error', retry);
      req.setTimeout(2_000, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() > deadline) reject(new Error(`Timed out waiting for ${url}`));
      else setTimeout(tick, 500);
    };
    tick();
  });
}

for (const app of apps) {
  const child = spawn(app.command || 'pnpm', app.args || ['run', 'dev'], {
    cwd: app.cwd,
    env: { ...baseEnv, PORT: app.port },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[${app.name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${app.name}] ${chunk}`));
  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`[${app.name}] exited unexpectedly`, { code, signal });
      process.exitCode = code ?? 1;
      shutdown();
    }
  });
  children.push(child);
}

let shuttingDown = false;
function shutdown() {
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(process.exitCode ?? 0), 500).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await Promise.all([
  wait('http://127.0.0.1:9321/login'),
  wait('http://127.0.0.1:9322/healthz'),
  wait('http://127.0.0.1:9323/healthz'),
  wait('http://127.0.0.1:9324/healthz'),
]);
console.log('FIELDGRID_E2E_REAL_APPS_READY');
setInterval(() => {}, 1 << 30);
