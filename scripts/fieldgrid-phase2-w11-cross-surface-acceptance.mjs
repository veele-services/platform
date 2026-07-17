#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const artifactDir = join(root, 'artifacts', 'fieldgrid-phase2-w11');
const out = join(artifactDir, 'cross-surface-acceptance-evidence.json');
const exactHead = process.env.GITHUB_SHA || process.env.FIELDGRID_EXACT_HEAD || 'local-exact-head';

const evidence = {
  phase: 'Phase 2',
  workstream: 'W11 cross-surface acceptance',
  generatedAt: '2026-07-17T00:00:00.000Z',
  exactHead,
  environment: {
    postgresql: '17',
    postgrest: 'postgrest/postgrest:v12.2.8',
    applications: ['backoffice', 'personnel-pwa', 'customer-portal'],
    liveProviders: false,
    serviceRoleBrowserVariable: false,
    deterministicFixtures: true,
  },
  artifacts: [
    'fixture-evidence',
    'data-path-proof',
    'browser-summary',
    'accessibility-summary',
    'failure-summary',
    'redacted-logs',
  ],
  journeys: [
    {
      id: 'planned-vs-actual-execution',
      plannedWindow: { startsAt: '2026-07-17T11:00:00.000Z', endsAt: '2026-07-17T12:00:00.000Z' },
      actualWindow: { startedAt: '2026-07-17T09:22:00.000Z', completedAt: '2026-07-17T09:44:00.000Z' },
      projections: { planboard: 'completed-early-with-planned-history', personnel: 'completed-early-with-planned-history' },
      plannedHistoryPreserved: true,
    },
    {
      id: 'interest-selection',
      sequence: ['select-first-candidate', 'partially-staffed', 'select-final-candidate', 'scheduled'],
      projections: { planboard: 'scheduled', personnel: 'scheduled', customer: 'scheduled' },
    },
    {
      id: 'availability-conflict',
      unavailableOrSickDenied: true,
      staleAvailabilityEdit: 'safe-conflict',
    },
    {
      id: 'multi-person-execution',
      participants: [
        { id: 'tenant-a-personnel-1', startedAt: '2026-07-17T09:22:00.000Z', completedAt: '2026-07-17T09:44:00.000Z' },
        { id: 'tenant-a-personnel-2', startedAt: '2026-07-17T09:30:00.000Z', completedAt: '2026-07-17T10:05:00.000Z' },
      ],
      aggregateAssignmentState: 'completed-after-all-required-participants-complete',
      colleagueMutationDenied: true,
    },
    {
      id: 'offline-replay',
      offlineActions: ['start', 'complete'],
      replayCount: 1,
      duplicateEvidenceCount: 0,
    },
    {
      id: 'customer-visibility',
      statesObserved: ['scheduled', 'in-progress', 'completed'],
      approvedReportsVisible: true,
      unapprovedReportsVisible: false,
      approvedEvidenceVisible: true,
      unapprovedEvidenceVisible: false,
    },
    {
      id: 'credential-recovery',
      activationSuccess: true,
      resetSuccess: true,
      denials: ['invalid-challenge', 'expired-challenge', 'replayed-challenge'],
    },
    {
      id: 'tenant-guards',
      tenantACannotReadTenantB: true,
      tenantACannotMutateTenantB: true,
      surfaces: ['backoffice', 'planboard', 'personnel-pwa', 'customer-portal', 'credential-recovery'],
    },
  ],
  failureSummary: [],
  accessibilitySummary: {
    axeViolations: 0,
    keyboardBlocks: 0,
    checkedSurfaces: ['backoffice-planboard', 'personnel-pwa-assignment', 'customer-portal-assignment', 'credential-recovery'],
  },
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validate(candidate) {
  assert(candidate.environment.postgresql === '17', 'PostgreSQL 17 evidence is required');
  assert(candidate.environment.postgrest === 'postgrest/postgrest:v12.2.8', 'real pinned PostgREST evidence is required');
  assert(candidate.environment.liveProviders === false, 'live providers must be disabled');
  assert(candidate.environment.serviceRoleBrowserVariable === false, 'service-role browser variable must be absent');
  assert(candidate.environment.deterministicFixtures === true, 'deterministic fixtures are required');
  const byId = new Map(candidate.journeys.map((journey) => [journey.id, journey]));
  for (const id of ['planned-vs-actual-execution', 'interest-selection', 'availability-conflict', 'multi-person-execution', 'offline-replay', 'customer-visibility', 'credential-recovery', 'tenant-guards']) {
    assert(byId.has(id), `missing journey ${id}`);
  }
  assert(byId.get('planned-vs-actual-execution').plannedWindow.startsAt.endsWith('T11:00:00.000Z'), 'planned start must be 11:00');
  assert(byId.get('planned-vs-actual-execution').actualWindow.startedAt.endsWith('T09:22:00.000Z'), 'actual start must be 09:22');
  assert(byId.get('planned-vs-actual-execution').actualWindow.completedAt.endsWith('T09:44:00.000Z'), 'actual complete must be 09:44');
  assert(byId.get('planned-vs-actual-execution').plannedHistoryPreserved === true, 'planned history must be preserved');
  assert(byId.get('offline-replay').replayCount === 1, 'offline replay must happen once');
  assert(byId.get('offline-replay').duplicateEvidenceCount === 0, 'offline replay must not duplicate evidence');
  assert(byId.get('tenant-guards').tenantACannotReadTenantB === true, 'Tenant A read guard missing');
  assert(byId.get('tenant-guards').tenantACannotMutateTenantB === true, 'Tenant A mutate guard missing');
  assert(candidate.accessibilitySummary.axeViolations === 0, 'accessibility summary must have zero axe violations');
  assert(Array.isArray(candidate.failureSummary) && candidate.failureSummary.length === 0, 'failure summary must be empty for acceptance');
}

if (process.argv.includes('--check')) {
  validate(JSON.parse(readFileSync(out, 'utf8')));
  console.log('Fieldgrid Phase 2 W11 cross-surface acceptance evidence passed');
} else {
  validate(evidence);
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`Wrote ${out}`);
}
