import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const script = readFileSync('scripts/fieldgrid-phase2-w11-cross-surface-acceptance.mjs', 'utf8');
const workflow = readFileSync('.github/workflows/fieldgrid-playwright.yml', 'utf8');
const evidence = JSON.parse(readFileSync('artifacts/fieldgrid-phase2-w11/cross-surface-acceptance-evidence.json', 'utf8'));

test('W11 evidence is aggregated from runtime/browser result files, not constants', () => {
  assert.match(script, /journey-results/u);
  assert.match(script, /head mismatch/u);
  assert.match(script, /duplicate evidence/u);
  assert.match(script, /failed assertion/u);
  assert.doesNotMatch(script, /const evidence = \{/u);
  assert.ok(evidence.artifacts.every((artifact) => artifact.file.startsWith('journey-results/') && /^[a-f0-9]{64}$/u.test(artifact.sha256)));
});

test('W11 evidence fixes planned versus actual execution times and preserves plan history', () => {
  const journey = evidence.journeys.find((entry) => entry.id === 'planned-vs-actual-execution');
  assert.equal(journey.observedStates.plannedWindow.startsAt, '2026-07-17T11:00:00.000Z');
  assert.equal(journey.observedStates.plannedWindow.endsAt, '2026-07-17T12:00:00.000Z');
  assert.equal(journey.observedStates.actualWindow.startedAt, '2026-07-17T09:22:00.000Z');
  assert.equal(journey.observedStates.actualWindow.completedAt, '2026-07-17T09:44:00.000Z');
  assert.equal(journey.observedStates.plannedHistoryPreserved, true);
});

test('W11 evidence covers all required cross-surface journeys', () => {
  const ids = evidence.journeys.map((entry) => entry.id).sort();
  assert.deepEqual(ids, [
    'accessibility',
    'availability-conflict',
    'credential-recovery',
    'customer-visibility',
    'interest-selection',
    'multi-person-execution',
    'offline-replay',
    'planned-vs-actual-execution',
    'realtime-multi-context',
    'tenant-guards',
  ]);
  assert.equal(evidence.journeys.find((entry) => entry.id === 'offline-replay').observedStates.serverMutationCount.start, 1);
  assert.equal(evidence.journeys.find((entry) => entry.id === 'offline-replay').observedStates.serverMutationCount.complete, 1);
  assert.equal(evidence.journeys.find((entry) => entry.id === 'tenant-guards').observedStates.tenantACannotReadTenantB, true);
  assert.equal(evidence.journeys.find((entry) => entry.id === 'tenant-guards').observedStates.tenantACannotMutateTenantB, true);
  assert.equal(evidence.journeys.find((entry) => entry.id === 'accessibility').observedStates.axeViolations, 0);
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
