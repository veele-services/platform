import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dispositionPath = new URL('../docs/readiness/open-pr-disposition-2026-07-14.json', import.meta.url);
const data = JSON.parse(await readFile(dispositionPath, 'utf8'));
const canonicalText = JSON.stringify(data);
const requiredOpenPrs = [279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 292, 293];
const expectedDisposition = new Map([
  [279, 'EXTRACT_EVIDENCE_THEN_CLOSE'],
  [280, 'SUPERSEDED_CLOSE'],
  [281, 'SUPERSEDED_CLOSE'],
  [282, 'EXTRACT_EVIDENCE_THEN_CLOSE'],
  [283, 'EXTRACT_EVIDENCE_THEN_CLOSE'],
  [284, 'RETAIN_REBASE_COMPLETE'],
  [285, 'EXTRACT_EVIDENCE_THEN_CLOSE'],
  [286, 'REBUILD_FROM_CURRENT_MAIN'],
  [287, 'EXTRACT_EVIDENCE_THEN_CLOSE'],
  [288, 'EXTRACT_EVIDENCE_THEN_CLOSE'],
  [289, 'RETAIN_REBASE_COMPLETE'],
  [290, 'EXTRACT_EVIDENCE_THEN_CLOSE'],
  [292, 'PARK_ARCHITECTURE'],
  [293, 'SUPERSEDED_CLOSE'],
]);
const expectedMetadata = new Map([
  [279, ['cross-surface functional flow map', 'audit/documentation', 'f3717074f3547c5a26d08e297c2d9fb885f16e00']],
  [280, ['old runtime entrypoint inventory', 'tooling', '3bfc31d95983cf058464af573775e2a6b77c5271']],
  [281, ['auth provider boundary ADR', 'architecture/documentation', '9514e926b8449b6a0c8cc871ed7bd2aa2b994f4c']],
  [282, ['platform administration audit', 'audit/documentation', '5ed1bc48893cb1ec05ee0dd572ad7c76b64bb850']],
  [283, ['customer PWA audit', 'audit/documentation', '86867013c1082b7377e99195dfadabd48acb1419']],
  [284, ['interest selection/scheduling', 'implementation', '920fd658a0d4612086d508174574721c6b80b8ef']],
  [285, ['tenant backoffice audit', 'audit/documentation', '7511251b702599517a48fe25bb819bcccce1a2c0']],
  [286, ['credential challenge/reset', 'implementation with migration', '1810a20b9092623c420a23e1c6363694e63148bc']],
  [287, ['personnel PWA audit', 'audit/documentation', 'bb2772eb8e9e586eaedec1f14a993f77cb62cd68']],
  [288, ['assignment P0 evidence', 'reproduction', '2253f4bf857cc1e33112ac2c0ad0268e6d08a700']],
  [289, ['atomic personnel availability', 'implementation', 'cb9a92ab2fbf57a9f7fdc883dc86ff9d1ade890d']],
  [290, ['finance/webhook/worker integrity', 'reproduction', 'cde9bc640598ff3febd561bb97c4a4ed2374a4a6']],
  [292, ['multi-person execution model', 'architecture', 'ce9055f007117d5e938e0af202f8b99c00a82022']],
  [293, ['old pre-Phase-B register', 'documentation/register', '9e2e708eee1c3c684b6bdb8ac22f2945540dbc2b']],
]);

test('all fourteen PRs occur exactly once', () => {
  const numbers = data.openPrs.map((pr) => pr.number).sort((a, b) => a - b);
  assert.deepEqual(numbers, requiredOpenPrs);
  assert.equal(new Set(numbers).size, 14);
});

test('exact canonical disposition mapping is durable', () => {
  for (const pr of data.openPrs) {
    assert.equal(pr.disposition, expectedDisposition.get(pr.number), `PR #${pr.number} disposition`);
    const [title, actualType, auditedHeadSha] = expectedMetadata.get(pr.number);
    assert.equal(pr.title, title, `PR #${pr.number} title`);
    assert.equal(pr.actualType, actualType, `PR #${pr.number} actual type`);
    assert.equal(pr.actualSubject, title, `PR #${pr.number} actual subject`);
    assert.equal(pr.auditedHeadSha, auditedHeadSha, `PR #${pr.number} audited head SHA`);
  }
});

test('canonical schema contains no placeholder or volatile metadata strings', () => {
  const forbidden = [
    ['UNKNOWN', 'AUTH', 'REQUIRED'].join('_'),
    ['requires', 'authenticated'].join(' '),
    ['requires', 'branch', 'test'].join(' '),
    ['current', ['merge', 'ability'].join('')].join(' '),
    ['ahead', 'behind'].join('/'),
    ['changed', 'Files'].join(''),
    ['workflow', 'Runs'].join(''),
    ['next', 'Command', 'Level', 'Action'].join(''),
  ];
  for (const token of forbidden) {
    assert.equal(canonicalText.includes(token), false, `forbidden token remains: ${token}`);
  }
});

test('canonical PR entries do not expose volatile live-state fields', () => {
  for (const pr of data.openPrs) {
    assert.equal(Object.hasOwn(pr, ['merge', 'ability'].join('')), false, `PR #${pr.number} has no live merge state field`);
    assert.equal(Object.hasOwn(pr, ['behind', 'Ahead', 'Relative', 'To', 'Main'].join('')), false, `PR #${pr.number} has no live divergence field`);
    assert.equal(Object.hasOwn(pr, ['changed', 'Files'].join('')), false, `PR #${pr.number} has no file-diff field`);
    assert.equal(Object.hasOwn(pr, ['workflow', 'Runs'].join('')), false, `PR #${pr.number} has no CI-run field`);
  }
});

test('human actions contain no placeholder angle-bracket commands', () => {
  for (const pr of data.openPrs) {
    assert.equal(/[<>]/.test(pr.exactHumanAction), false, `PR #${pr.number} human action has no placeholder angle brackets`);
  }
});

test('implementation PRs #284, #286 and #289 have explicit runtime dependencies', () => {
  for (const number of [284, 286, 289]) {
    const pr = data.openPrs.find((entry) => entry.number === number);
    assert.equal(pr.containsRuntimeCode, true, `PR #${number} contains runtime code`);
    assert.ok(pr.dependencies.length > 0, `PR #${number} has runtime dependencies`);
  }
});

test('superseded PRs point to canonical replacements', () => {
  assert.equal(data.openPrs.find((pr) => pr.number === 280).replacementPr, 302);
  assert.equal(data.openPrs.find((pr) => pr.number === 281).replacementPr, 298);
  assert.equal(data.openPrs.find((pr) => pr.number === 293).replacementPr, 297);
});

test('audit-only PRs are never runtime fixes and migration PR #286 is not direct-merge-ready', () => {
  for (const pr of data.openPrs.filter((entry) => entry.actualType === 'audit/documentation')) {
    assert.equal(pr.containsRuntimeCode, false, `PR #${pr.number} audit-only entry is not runtime code`);
    assert.doesNotMatch(pr.reason, /runtime fix/i, `PR #${pr.number} audit-only reason is not runtime-fix language`);
  }
  const migrationPr = data.openPrs.find((pr) => pr.number === 286);
  assert.equal(migrationPr.containsMigration, true);
  assert.equal(migrationPr.disposition, 'REBUILD_FROM_CURRENT_MAIN');
  assert.doesNotMatch(migrationPr.reason, /direct merge/i);
});
