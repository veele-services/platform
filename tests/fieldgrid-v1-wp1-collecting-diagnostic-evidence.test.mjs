import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Collector, DIAGNOSTIC_WORKFLOW } from '../scripts/wp1/diagnostic-core.mjs';
import { assertRun, assertDiagnoseReport } from '../scripts/wp1/evidence.mjs';
import { REPOSITORY, PROJECT, WORKFLOW } from '../scripts/wp1/contract.mjs';

test('existing apply evidence validators reject the collecting workflow and artifact', () => {
  const now = Date.now(), sha = 'a'.repeat(40);
  const run = { id: 123, repository: { full_name: REPOSITORY }, head_repository: { full_name: REPOSITORY }, path: WORKFLOW, head_branch: 'main', head_sha: sha, event: 'workflow_dispatch', status: 'completed', conclusion: 'success', updated_at: new Date(now).toISOString(), run_attempt: 1 };
  assert.throws(() => assertRun({ ...run, path: DIAGNOSTIC_WORKFLOW }, { id: 123, expectedSha: sha, now }));
  const c = new Collector({ project: PROJECT, environment: 'staging', sha, runId: 123, attempt: 1 });
  c.add('example', 'PASS');
  const report = c.report();
  assert.throws(() => assertDiagnoseReport(report, { run, expectedSha: sha, now }));
  assert.throws(() => assertDiagnoseReport({ ...report, readyForReset: true, blockers: [], backupRestoreVerified: true, resetRehearsalVerified: true }, { run, expectedSha: sha, now }));
});
