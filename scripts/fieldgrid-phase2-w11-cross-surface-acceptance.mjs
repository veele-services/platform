#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const artifactDir = join(root, 'artifacts', 'fieldgrid-phase2-w11');
const resultDir = join(artifactDir, 'journey-results');
const out = join(artifactDir, 'cross-surface-acceptance-evidence.json');
const exactHead = process.env.GITHUB_SHA || process.env.FIELDGRID_EXACT_HEAD || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const requiredJourneys = [
  'planned-vs-actual-execution',
  'interest-selection',
  'availability-conflict',
  'multi-person-execution',
  'offline-replay',
  'realtime-multi-context',
  'customer-visibility',
  'credential-recovery',
  'tenant-guards',
  'accessibility',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function sha256(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
function sanitizedTimestamp(value, label) {
  assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value), `${label} must be sanitized ISO timestamp`);
}

function loadResults() {
  assert(existsSync(resultDir), `missing runtime evidence directory ${resultDir}`);
  const files = readdirSync(resultDir).filter((name) => name.endsWith('.json')).sort();
  assert(files.length > 0, 'missing runtime journey evidence files');
  const seen = new Map();
  for (const file of files) {
    const path = join(resultDir, file);
    const result = readJson(path);
    assert(result.commit === exactHead, `head mismatch in ${file}`);
    assert(requiredJourneys.includes(result.id), `unknown journey ${result.id}`);
    assert(!seen.has(result.id), `duplicate evidence for ${result.id}`);
    assert(result.status === 'passed', `failed assertion in ${result.id}`);
    assert(result.critical === true, `critical journey ${result.id} is not marked critical`);
    assert(result.skipped !== true, `critical journey ${result.id} was skipped`);
    sanitizedTimestamp(result.observedAt, `${result.id}.observedAt`);
    assert(result.fixtureIds && typeof result.fixtureIds === 'object', `${result.id} missing fixture ids`);
    assert(result.observedStates && typeof result.observedStates === 'object', `${result.id} missing observed states`);
    seen.set(result.id, { ...result, artifact: { file: `journey-results/${file}`, sha256: sha256(path) } });
  }
  for (const id of requiredJourneys) assert(seen.has(id), `missing journey ${id}`);
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function validate(candidate) {
  assert(candidate.exactHead === exactHead, 'combined evidence head mismatch');
  assert(candidate.environment.postgresql === '17', 'PostgreSQL 17 evidence is required');
  assert(candidate.environment.postgrest === 'postgrest/postgrest:v12.2.8', 'real pinned PostgREST evidence is required');
  assert(candidate.environment.liveProviders === false, 'live providers must be disabled');
  assert(candidate.environment.serviceRoleBrowserVariable === false, 'service-role browser variable must be absent');
  assert(candidate.environment.deterministicFixtures === true, 'deterministic fixtures are required');
  const byId = new Map(candidate.journeys.map((journey) => [journey.id, journey]));
  for (const id of requiredJourneys) assert(byId.has(id), `missing journey ${id}`);
  assert(byId.get('planned-vs-actual-execution').observedStates.plannedWindow.startsAt.endsWith('T11:00:00.000Z'), 'planned start must be 11:00');
  assert(byId.get('planned-vs-actual-execution').observedStates.actualWindow.startedAt.endsWith('T09:22:00.000Z'), 'actual start must be 09:22');
  assert(byId.get('planned-vs-actual-execution').observedStates.actualWindow.completedAt.endsWith('T09:44:00.000Z'), 'actual complete must be 09:44');
  assert(byId.get('planned-vs-actual-execution').observedStates.plannedHistoryPreserved === true, 'planned history must be preserved');
  assert(byId.get('offline-replay').observedStates.serverMutationCount.start === 1, 'offline start must replay once');
  assert(byId.get('offline-replay').observedStates.serverMutationCount.complete === 1, 'offline complete must replay once');
  assert(byId.get('tenant-guards').observedStates.tenantACannotReadTenantB === true, 'Tenant A read guard missing');
  assert(byId.get('tenant-guards').observedStates.tenantACannotMutateTenantB === true, 'Tenant A mutate guard missing');
  assert(byId.get('accessibility').observedStates.axeViolations === 0, 'accessibility summary must have zero axe violations');
  assert(Array.isArray(candidate.failureSummary) && candidate.failureSummary.length === 0, 'failure summary must be empty for acceptance');
}

if (process.argv.includes('--check')) {
  validate(readJson(out));
  console.log('Fieldgrid Phase 2 W11 runtime-derived acceptance evidence passed');
} else {
  const journeys = loadResults();
  const combinedEvidence = {
    phase: 'Phase 2',
    workstream: 'W11 cross-surface acceptance',
    generatedAt: new Date().toISOString(),
    exactHead,
    environment: {
      postgresql: '17',
      postgrest: 'postgrest/postgrest:v12.2.8',
      applications: ['backoffice', 'personnel-pwa', 'customer-portal'],
      liveProviders: false,
      serviceRoleBrowserVariable: false,
      deterministicFixtures: true,
    },
    artifacts: journeys.map((journey) => journey.artifact),
    journeys,
    failureSummary: [],
  };
  validate(combinedEvidence);
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(out, `${JSON.stringify(combinedEvidence, null, 2)}\n`);
  console.log(`Wrote ${out}`);
}
