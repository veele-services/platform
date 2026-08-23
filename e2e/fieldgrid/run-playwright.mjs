#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const artifactDir = join(process.cwd(), 'artifacts', 'fieldgrid-playwright');
const logsDir = join(artifactDir, 'logs');
const statusPath = join(artifactDir, 'startup-status.json');
const preflightPath = join(artifactDir, 'preflight.json');
const startupTimeoutMs = 180_000;
const pollIntervalMs = 2_000;
const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/u;
const stack = { process: undefined };
let terminationPromise;
const phases = [
  {
    name: 'staffing',
    files: ['e2e/fieldgrid/tests/staffing-lifecycle.spec.ts'],
  },
  {
    name: 'core',
    files: [
      'e2e/fieldgrid/tests/accessibility.spec.ts',
      'e2e/fieldgrid/tests/golden-path.spec.ts',
    ],
  },
  {
    name: 'workflow-bot',
    files: ['e2e/fieldgrid/tests/workflow-bot.spec.ts'],
  },
];

function amsterdamDateKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

const e2eDateKey = process.env.FIELDGRID_E2E_DATE_KEY ?? amsterdamDateKey();
if (!dateKeyPattern.test(e2eDateKey)) {
  throw new Error('FIELDGRID_E2E_DATE_KEY must use YYYY-MM-DD.');
}
const exactHead = process.env.FIELDGRID_EXACT_HEAD
  ?? process.env.GITHUB_SHA
  ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[0-9a-f]{40}$/u.test(exactHead)) {
  throw new Error('FIELDGRID_EXACT_HEAD/GITHUB_SHA must be a full Git commit SHA.');
}
const invocationId = process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`
  : randomUUID().slice(0, 8);
const runEnvironment = Object.freeze({
  ...process.env,
  FIELDGRID_E2E_DATE_KEY: e2eDateKey,
  FIELDGRID_WORKFLOW_RUN_ID: process.env.FIELDGRID_WORKFLOW_RUN_ID
    ?? `${exactHead.slice(0, 12)}-${e2eDateKey}-${invocationId}`,
});

function phaseResultPath(name) {
  return join(artifactDir, `playwright-results-${name}.json`);
}

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
  console.error(`\n[preflight.json]\n${await readText(preflightPath)}`);
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

async function runAuthenticatedPreflight() {
  let response;
  try {
    response = await fetch('http://127.0.0.1:9325/preflight', { signal: AbortSignal.timeout(90_000) });
  } catch (error) {
    await printDiagnostics('Authenticated preflight request failed.', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('Fieldgrid Playwright authenticated preflight could not be reached.');
  }

  if (response.status === 200) return;

  await printDiagnostics('Authenticated preflight failed without retrying application authorization.', {
    status: response.status,
  });
  throw new Error('Fieldgrid Playwright authenticated preflight failed.');
}

async function terminateStack() {
  if (terminationPromise) return terminationPromise;
  const child = stack.process;
  if (!child || child.exitCode !== null) {
    stack.process = undefined;
    return;
  }
  terminationPromise = (async () => {
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      sleep(15_000),
    ]);
    if (child.exitCode === null) {
      child.kill('SIGKILL');
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        sleep(5_000),
      ]);
    }
    if (stack.process === child) stack.process = undefined;
  })();
  try {
    await terminationPromise;
  } finally {
    terminationPromise = undefined;
  }
}

async function startStack() {
  if (stack.process?.exitCode === null) throw new Error('Fieldgrid Playwright stack is already running.');
  stack.process = spawnLogged('orchestrator', 'node', ['e2e/fieldgrid/start-real-apps.mjs'], { env: runEnvironment });
  await waitForHealth();
  await runAuthenticatedPreflight();
}

async function runCommand(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
  return await new Promise((resolve) => child.once('exit', (code, signal) => resolve(signal ? 1 : code ?? 1)));
}

async function runPlaywright(phase) {
  return runCommand('pnpm', ['exec', 'playwright', 'test', ...phase.files], {
    env: {
      ...runEnvironment,
      PLAYWRIGHT_JSON_OUTPUT_FILE: phaseResultPath(phase.name),
      PLAYWRIGHT_JUNIT_OUTPUT_FILE: join(artifactDir, 'junit', `results-${phase.name}.xml`),
      PLAYWRIGHT_HTML_OUTPUT_DIR: join(artifactDir, `playwright-report-${phase.name}`),
    },
  });
}

async function runBrowserPhase(phase) {
  await startStack();
  try {
    return await runPlaywright(phase);
  } finally {
    await terminateStack();
  }
}

async function resetFixturesBetweenPhases() {
  const exitCode = await runCommand('node', ['e2e/fieldgrid/fixtures/seed-e2e-fixtures.mjs'], {
    env: runEnvironment,
  });
  if (exitCode !== 0) throw new Error('Fieldgrid Playwright fixture reset between isolated phases failed.');
}

async function mergePhaseReports(completedPhases) {
  const reports = await Promise.all(completedPhases.map(async (phase) => (
    JSON.parse(await readFile(phaseResultPath(phase.name), 'utf8'))
  )));
  if (reports.length === 0) throw new Error('No isolated Playwright phase produced a JSON report.');
  const starts = reports.map((report) => new Date(report.stats.startTime).getTime());
  const merged = {
    ...reports.at(-1),
    suites: reports.flatMap((report) => report.suites ?? []),
    errors: reports.flatMap((report) => report.errors ?? []),
    stats: {
      startTime: new Date(Math.min(...starts)).toISOString(),
      duration: reports.reduce((total, report) => total + Number(report.stats.duration ?? 0), 0),
      expected: reports.reduce((total, report) => total + Number(report.stats.expected ?? 0), 0),
      skipped: reports.reduce((total, report) => total + Number(report.stats.skipped ?? 0), 0),
      unexpected: reports.reduce((total, report) => total + Number(report.stats.unexpected ?? 0), 0),
      flaky: reports.reduce((total, report) => total + Number(report.stats.flaky ?? 0), 0),
    },
  };
  await writeFile(join(artifactDir, 'playwright-results.json'), `${JSON.stringify(merged, null, 2)}\n`);
}

async function main() {
  await ensureDirs();
  await Promise.all([
    rm(join(artifactDir, 'playwright-results.json'), { force: true }),
    ...phases.map((phase) => rm(phaseResultPath(phase.name), { force: true })),
  ]);
  const completedPhases = [];
  let exitCode = 0;
  for (const [index, phase] of phases.entries()) {
    exitCode = await runBrowserPhase(phase);
    completedPhases.push(phase);
    if (exitCode !== 0) break;
    if (index < phases.length - 1) await resetFixturesBetweenPhases();
  }
  await mergePhaseReports(completedPhases);
  process.exitCode = exitCode;
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
