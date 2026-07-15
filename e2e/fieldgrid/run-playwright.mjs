#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const artifactDir = join(process.cwd(), 'artifacts', 'fieldgrid-playwright');
const logsDir = join(artifactDir, 'logs');
const statusPath = join(artifactDir, 'startup-status.json');
const startupTimeoutMs = 180_000;
const pollIntervalMs = 2_000;
const stack = { process: undefined };
let shuttingDown = false;

async function ensureDirs() {
  await mkdir(logsDir, { recursive: true });
}

function spawnLogged(name, command, args, options = {}) {
  const stdoutPath = join(logsDir, `${name}.stdout.log`);
  const stderrPath = join(logsDir, `${name}.stderr.log`);
  const stdout = createWriteStream(stdoutPath, { flags: 'a' });
  const stderr = createWriteStream(stderrPath, { flags: 'a' });
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);
  return child;
}

async function readText(path, maxBytes = 80_000) {
  if (!existsSync(path)) return `[missing] ${path}`;
  const text = await readFile(path, 'utf8').catch((error) => `[unreadable] ${path}: ${error.message}`);
  return text.length > maxBytes ? `${text.slice(-maxBytes)}\n[truncated to last ${maxBytes} bytes]` : text;
}

async function printDiagnostics(reason, latest = {}) {
  console.error(`\n[fieldgrid-playwright] ${reason}`);
  console.error(`\n[health probe]\n${JSON.stringify(latest, null, 2)}`);
  console.error(`\n[startup-status.json]\n${await readText(statusPath)}`);
  for (const file of [
    'orchestrator.stderr.log',
    'backoffice.stderr.log',
    'personnel.stderr.log',
    'customer.stderr.log',
    'postgrest.log',
  ]) {
    console.error(`\n[${file}]\n${await readText(join(logsDir, file))}`);
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth() {
  const startedAt = Date.now();
  let latest = { status: 'not-probed' };
  while (Date.now() - startedAt < startupTimeoutMs) {
    if (stack.process?.exitCode !== null && stack.process?.exitCode !== undefined) {
      latest = { status: 'runner-exited', exitCode: stack.process.exitCode };
      break;
    }
    try {
      const response = await fetch('http://127.0.0.1:9325/healthz', { signal: AbortSignal.timeout(5_000) });
      const body = await response.text();
      latest = { status: response.status, body };
      if (response.status === 200) return;
    } catch (error) {
      latest = { status: 'probe-error', error: error instanceof Error ? error.message : String(error) };
    }
    await sleep(pollIntervalMs);
  }
  await printDiagnostics(`Timed out waiting ${startupTimeoutMs}ms for http://127.0.0.1:9325/healthz`, latest);
  throw new Error('Fieldgrid Playwright stack did not become healthy.');
}

async function terminateStack() {
  if (shuttingDown) return;
  shuttingDown = true;
  const child = stack.process;
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(15_000).then(() => child.kill('SIGKILL')),
  ]);
}

async function runPlaywright() {
  const child = spawn('pnpm', ['exec', 'playwright', 'test'], { stdio: 'inherit', shell: false });
  return await new Promise((resolve) => child.once('exit', (code, signal) => resolve(signal ? 1 : code ?? 1)));
}

async function main() {
  await ensureDirs();
  stack.process = spawnLogged('orchestrator', 'node', ['e2e/fieldgrid/start-real-apps.mjs'], { env: process.env });
  try {
    await waitForHealth();
    process.exitCode = await runPlaywright();
  } finally {
    await terminateStack();
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => terminateStack().finally(() => process.exit(130)));
}
process.on('uncaughtException', (error) => {
  console.error(error);
  terminateStack().finally(() => process.exit(1));
});
process.on('unhandledRejection', (error) => {
  console.error(error);
  terminateStack().finally(() => process.exit(1));
});

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  await terminateStack();
  process.exit(1);
});
