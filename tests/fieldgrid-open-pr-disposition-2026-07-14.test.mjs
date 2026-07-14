import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dispositionPath = new URL('../docs/readiness/open-pr-disposition-2026-07-14.json', import.meta.url);
const data = JSON.parse(await readFile(dispositionPath, 'utf8'));
const requiredOpenPrs = [279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 292, 293];
const mergedPrs = [278, 291, 294, 295, 296];
const allowedDispositions = new Set([
  'RETAIN_REBASE_COMPLETE',
  'REBUILD_FROM_CURRENT_MAIN',
  'EXTRACT_EVIDENCE_THEN_CLOSE',
  'SUPERSEDED_CLOSE',
  'PARK_ARCHITECTURE',
  'DO_NOT_MERGE',
]);

test('all 14 audited open PRs occur exactly once', () => {
  const numbers = data.openPrs.map((pr) => pr.number).sort((a, b) => a - b);
  assert.deepEqual(numbers, requiredOpenPrs);
  assert.equal(new Set(numbers).size, 14);
});

test('every PR has exactly one allowed disposition', () => {
  for (const pr of data.openPrs) {
    assert.equal(typeof pr.disposition, 'string', `PR #${pr.number} has a disposition string`);
    assert.ok(allowedDispositions.has(pr.disposition), `PR #${pr.number} uses an allowed disposition`);
  }
});

test('implementation PRs declare dependencies', () => {
  for (const pr of data.openPrs.filter((entry) => entry.type === 'implementation')) {
    assert.ok(Array.isArray(pr.implementationDependencies), `PR #${pr.number} has dependencies array`);
    assert.ok(pr.implementationDependencies.length > 0, `PR #${pr.number} has at least one dependency`);
  }
});

test('audit-only PRs are not marked merge-ready runtime fixes', () => {
  for (const pr of data.openPrs.filter((entry) => entry.type === 'audit')) {
    assert.equal(pr.runtimeCode, false, `PR #${pr.number} audit entry is not runtime code`);
    assert.equal(pr.mergeReadyRuntimeFix, false, `PR #${pr.number} audit entry is not merge-ready runtime fix`);
  }
});

test('stale migration PRs are not marked direct merge', () => {
  for (const pr of data.openPrs.filter((entry) => entry.staleMigrationPr)) {
    assert.notEqual(pr.disposition, 'RETAIN_REBASE_COMPLETE', `PR #${pr.number} stale migration is not direct merge`);
  }
});

test('merged PRs are not listed as open', () => {
  const openNumbers = new Set(data.openPrs.map((pr) => pr.number));
  for (const number of mergedPrs) {
    assert.equal(openNumbers.has(number), false, `merged PR #${number} is excluded from open list`);
  }
  assert.deepEqual(data.mergedPrsExcluded, mergedPrs);
});
