import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const script = readFileSync('scripts/fieldgrid-phase2-w11-cross-surface-acceptance.mjs', 'utf8');
const workflow = readFileSync('.github/workflows/fieldgrid-playwright.yml', 'utf8');
const runbook = readFileSync('docs/phase-2/w11-staging-smoke-runbook.md', 'utf8');
const matrix = readFileSync('docs/phase-2/w11-cross-surface-acceptance.md', 'utf8');
const evidence = JSON.parse(readFileSync('artifacts/fieldgrid-phase2-w11/cross-surface-acceptance-evidence.json', 'utf8'));

test('W11 evidence fixes planned versus actual execution times and preserves plan history', () => {
  const journey = evidence.journeys.find((entry) => entry.id === 'planned-vs-actual-execution');
  assert.equal(journey.plannedWindow.startsAt, '2026-07-17T11:00:00.000Z');
  assert.equal(journey.plannedWindow.endsAt, '2026-07-17T12:00:00.000Z');
  assert.equal(journey.actualWindow.startedAt, '2026-07-17T09:22:00.000Z');
  assert.equal(journey.actualWindow.completedAt, '2026-07-17T09:44:00.000Z');
  assert.equal(journey.plannedHistoryPreserved, true);
  assert.deepEqual(Object.keys(journey.projections).sort(), ['personnel', 'planboard']);
});

test('W11 evidence covers all required cross-surface journeys', () => {
  const ids = evidence.journeys.map((entry) => entry.id).sort();
  assert.deepEqual(ids, [
    'availability-conflict',
    'credential-recovery',
    'customer-visibility',
    'interest-selection',
    'multi-person-execution',
    'offline-replay',
    'planned-vs-actual-execution',
    'tenant-guards',
  ]);
  assert.equal(evidence.journeys.find((entry) => entry.id === 'offline-replay').replayCount, 1);
  assert.equal(evidence.journeys.find((entry) => entry.id === 'offline-replay').duplicateEvidenceCount, 0);
  assert.equal(evidence.journeys.find((entry) => entry.id === 'tenant-guards').tenantACannotReadTenantB, true);
  assert.equal(evidence.journeys.find((entry) => entry.id === 'tenant-guards').tenantACannotMutateTenantB, true);
});

test('W11 CI contract requires real local runtime, no live provider, no browser service role, and artifact validation', () => {
  assert.match(workflow, /postgres:17/u);
  assert.match(workflow, /postgrest\/postgrest:v12\.2\.8/u);
  assert.match(workflow, /Confirm browser processes have no service-role credential/u);
  assert.match(workflow, /test -z "\$\{SUPABASE_SERVICE_ROLE_KEY:-\}"/u);
  assert.match(workflow, /pnpm fieldgrid:phase2-w11:check/u);
  assert.match(workflow, /artifacts\/fieldgrid-phase2-w11\/\*\*/u);
  assert.match(script, /liveProviders: false/u);
  assert.match(script, /serviceRoleBrowserVariable: false/u);
  assert.match(script, /deterministicFixtures: true/u);
});

test('W11 staging runbook is post-merge only and forbids deployment', () => {
  assert.match(runbook, /Post-merge staging smoke plan/u);
  assert.match(runbook, /Do not deploy/u);
  assert.match(runbook, /main@\$\{GITHUB_SHA\}/u);
  assert.match(runbook, /planned 11:00–12:00/u);
  assert.match(runbook, /start 09:22/u);
  assert.match(runbook, /complete 09:44/u);
  assert.match(runbook, /Tenant A cannot read or mutate Tenant B/u);
});

test('W11 matrix maps sub-agent evidence ownership to artifacts', () => {
  for (const phrase of [
    'PostgreSQL/RLS fixture and integration coverage',
    'Playwright backoffice/planboard scenarios',
    'Playwright personnel PWA/offline scenarios',
    'Playwright customer portal and credential scenarios',
    'Accessibility, artifact validator and staging runbook',
    'fixture evidence',
    'data-path proof',
    'browser summary',
    'accessibility summary',
    'failure summary',
    'redacted logs',
  ]) assert.ok(matrix.includes(phrase), `missing ${phrase}`);
});
