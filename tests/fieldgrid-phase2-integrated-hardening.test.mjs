import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync('lib/db/migrations/20260717120000_phase2_integrated_runtime_hardening.sql', 'utf8');
const staffing = readFileSync('lib/db/src/interest-selection-staffing.ts', 'utf8');
const register = readFileSync('docs/security/fieldgrid-hardening-register.md', 'utf8');

test('staffing cancellation preserves history and blocks in-progress unassignment', () => {
  assert.doesNotMatch(staffing, /DELETE FROM public\.assignment_personnel/u);
  assert.match(staffing, /participant_status/u);
  assert.match(staffing, /assignment_execution_started/u);
  assert.match(staffing, /SET status = 'cancelled'/u);
  assert.match(staffing, /participant_status = 'removed'/u);
  assert.match(staffing, /status = ANY\(\$2::text\[\]\)/u);
});

test('forward corrective migration hardens credential recovery table and unassign RPC', () => {
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/u);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/u);
  assert.match(migration, /REVOKE ALL ON TABLE public\.credential_recovery_challenges FROM PUBLIC, anon, authenticated/u);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.credential_recovery_challenges TO service_role/u);
  assert.match(migration, /SECURITY DEFINER/u);
  assert.match(migration, /SET search_path = pg_catalog, public/u);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.fieldgrid_unassign_assignment_personnel/u);
  assert.match(migration, /assignment_execution_started/u);
});

test('FG-HARD-025 is closed only with Phase 2.1 evidence references', () => {
  assert.match(register, /FG-HARD-025 \| legacy customer reset code must not become auth password \| P0 \| auth\/reset \| closed/u);
  assert.match(register, /Source guard blocks reset-code-as-password paths/u);
  assert.match(register, /W11 runtime evidence/u);
});
