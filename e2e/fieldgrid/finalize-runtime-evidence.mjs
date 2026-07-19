#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const artifactDir = join(root, 'artifacts', 'fieldgrid-playwright');
const resultPath = join(artifactDir, 'playwright-results.json');

function iso(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid runtime timestamp: ${value}`);
  return date.toISOString();
}

function flattenSuites(suites, file = null, titlePath = []) {
  const records = [];
  for (const suite of suites ?? []) {
    const nextFile = suite.file ?? file;
    const nextTitle = suite.title ? [...titlePath, suite.title] : titlePath;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        for (const result of test.results ?? []) {
          const startedAt = iso(result.startTime);
          records.push({
            testId: spec.id,
            file: nextFile,
            title: [...nextTitle, spec.title].filter(Boolean).join(' › '),
            projectName: test.projectName,
            expectedStatus: test.expectedStatus,
            status: result.status,
            startedAt,
            finishedAt: new Date(new Date(startedAt).getTime() + Number(result.duration ?? 0)).toISOString(),
            retry: result.retry ?? 0,
            errors: (result.errors ?? []).map((error) => ({ message: error.message ?? String(error), location: error.location ?? null })),
            attachments: (result.attachments ?? []).map((attachment) => ({ name: attachment.name, contentType: attachment.contentType, path: attachment.path ? relative(root, attachment.path) : null })),
          });
        }
      }
    }
    records.push(...flattenSuites(suite.suites, nextFile, nextTitle));
  }
  return records;
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

await mkdir(artifactDir, { recursive: true });
if (!existsSync(resultPath)) throw new Error(`Missing Playwright JSON result: ${resultPath}`);
const raw = JSON.parse(await readFile(resultPath, 'utf8'));
const tests = flattenSuites(raw.suites);
if (tests.length === 0) throw new Error('Playwright JSON contains no executed test results.');

const failures = tests.filter((entry) => entry.status !== 'passed' || entry.expectedStatus !== 'passed');
const browserSummary = {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  source: { path: relative(root, resultPath), sha256: await sha256(resultPath) },
  counts: {
    total: tests.length,
    passed: tests.filter((entry) => entry.status === 'passed' && entry.expectedStatus === 'passed').length,
    failed: tests.filter((entry) => entry.status === 'failed' || entry.status === 'timedOut' || entry.status === 'interrupted').length,
    skipped: tests.filter((entry) => entry.status === 'skipped' || entry.expectedStatus === 'skipped').length,
  },
  tests,
};
await writeFile(join(artifactDir, 'browser-summary.json'), `${JSON.stringify(browserSummary, null, 2)}\n`);
await writeFile(join(artifactDir, 'failure-summary.json'), `${JSON.stringify({ schemaVersion: '1.0.0', generatedAt: new Date().toISOString(), failures }, null, 2)}\n`);

const accessibilityDir = join(artifactDir, 'accessibility');
const accessibilityFiles = existsSync(accessibilityDir)
  ? (await readdir(accessibilityDir)).filter((name) => name.endsWith('.json')).sort()
  : [];
const accessibilityResults = await Promise.all(accessibilityFiles.map(async (name) => {
  const path = join(accessibilityDir, name);
  return { ...JSON.parse(await readFile(path, 'utf8')), artifact: { path: relative(root, path), sha256: await sha256(path) } };
}));
const accessibilitySummary = {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  status: accessibilityResults.length > 0 && accessibilityResults.every((entry) => entry.status === 'passed') ? 'passed' : 'failed',
  seriousOrCriticalViolations: accessibilityResults.reduce((count, entry) => count + Number(entry.seriousOrCriticalViolations ?? 0), 0),
  keyboardFailures: accessibilityResults.reduce((count, entry) => count + Number(entry.keyboardFailures ?? 0), 0),
  results: accessibilityResults,
};
await writeFile(join(artifactDir, 'accessibility-summary.json'), `${JSON.stringify(accessibilitySummary, null, 2)}\n`);

const exactGitHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const expectedGitHead = process.env.FIELDGRID_EXACT_HEAD || process.env.GITHUB_SHA || exactGitHead;
if (exactGitHead !== expectedGitHead) throw new Error(`Evidence head ${exactGitHead} differs from expected ${expectedGitHead}.`);
const offlineEvidencePath = join(artifactDir, 'offline-reconnect-evidence.json');
if (!existsSync(offlineEvidencePath)) throw new Error(`Missing runtime-derived offline reconnect evidence: ${offlineEvidencePath}`);
const offlineEvidence = JSON.parse(await readFile(offlineEvidencePath, 'utf8'));
if (offlineEvidence.exactGitHead !== exactGitHead) throw new Error('Offline reconnect evidence belongs to another git head.');
if (offlineEvidence.status !== 'passed' || offlineEvidence.mandatoryJourneySkipped !== false) {
  throw new Error('Offline reconnect journey did not produce a mandatory runtime pass.');
}
const runBinding = {
  schemaVersion: '1.0.0',
  exactGitHead,
  expectedGitHead,
  sourceHeadGitHead: process.env.GITHUB_HEAD_SHA || null,
  workflowRunId: process.env.GITHUB_RUN_ID || null,
  workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  workflow: process.env.GITHUB_WORKFLOW || null,
  event: process.env.GITHUB_EVENT_NAME || 'local',
  repository: process.env.GITHUB_REPOSITORY || null,
  environment: process.env.CI ? 'ci-disposable-postgresql-17' : 'local-disposable-postgresql-17',
  generatedAt: new Date().toISOString(),
};
await writeFile(join(artifactDir, 'run-binding.json'), `${JSON.stringify(runBinding, null, 2)}\n`);

console.log(JSON.stringify({
  browser: browserSummary.counts,
  accessibility: { status: accessibilitySummary.status, results: accessibilityResults.length },
  offlineReconnect: {
    status: offlineEvidence.status,
    queueBefore: offlineEvidence.queueBeforeReconnect,
    queueAfter: offlineEvidence.queueAfterReconnect,
    serverMutationCount: offlineEvidence.serverMutationCount,
  },
}));
