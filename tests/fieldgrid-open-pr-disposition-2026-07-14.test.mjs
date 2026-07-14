import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dispositionPath = new URL('../docs/readiness/open-pr-disposition-2026-07-14.json', import.meta.url);
const data = JSON.parse(await readFile(dispositionPath, 'utf8'));
const requiredOpenPrs = [279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 292, 293];
const expected = new Map([
  [279, ['cross-surface functional flow map', 'audit/documentation', 'f3717074f3547c5a26d08e297c2d9fb885f16e00', 'EXTRACT_EVIDENCE_THEN_CLOSE']],
  [280, ['old runtime entrypoint inventory', 'tooling', '3bfc31d95983cf058464af573775e2a6b77c5271', 'SUPERSEDED_CLOSE']],
  [281, ['auth provider boundary ADR', 'architecture/documentation', '9514e926b8449b6a0c8cc871ed7bd2aa2b994f4c', 'SUPERSEDED_CLOSE']],
  [282, ['platform administration audit', 'audit/documentation', '5ed1bc48893cb1ec05ee0dd572ad7c76b64bb850', 'EXTRACT_EVIDENCE_THEN_CLOSE']],
  [283, ['customer PWA audit', 'audit/documentation', '86867013c1082b7377e99195dfadabd48acb1419', 'EXTRACT_EVIDENCE_THEN_CLOSE']],
  [284, ['interest selection/scheduling', 'implementation', '920fd658a0d4612086d508174574721c6b80b8ef', 'RETAIN_REBASE_COMPLETE']],
  [285, ['tenant backoffice audit', 'audit/documentation', '7511251b702599517a48fe25bb819bcccce1a2c0', 'EXTRACT_EVIDENCE_THEN_CLOSE']],
  [286, ['credential challenge/reset', 'implementation with migration', '1810a20b9092623c420a23e1c6363694e63148bc', 'REBUILD_FROM_CURRENT_MAIN']],
  [287, ['personnel PWA audit', 'audit/documentation', 'bb2772eb8e9e586eaedec1f14a993f77cb62cd68', 'EXTRACT_EVIDENCE_THEN_CLOSE']],
  [288, ['assignment P0 evidence', 'reproduction', '2253f4bf857cc1e33112ac2c0ad0268e6d08a700', 'EXTRACT_EVIDENCE_THEN_CLOSE']],
  [289, ['atomic personnel availability', 'implementation', 'cb9a92ab2fbf57a9f7fdc883dc86ff9d1ade890d', 'RETAIN_REBASE_COMPLETE']],
  [290, ['finance/webhook/worker integrity', 'reproduction', 'cde9bc640598ff3febd561bb97c4a4ed2374a4a6', 'EXTRACT_EVIDENCE_THEN_CLOSE']],
  [292, ['multi-person execution model', 'architecture', 'ce9055f007117d5e938e0af202f8b99c00a82022', 'PARK_ARCHITECTURE']],
  [293, ['old pre-Phase-B register', 'documentation/register', '9e2e708eee1c3c684b6bdb8ac22f2945540dbc2b', 'SUPERSEDED_CLOSE']],
]);

test('all fourteen audited open PRs occur exactly once', () => {
  const numbers = data.openPrs.map((pr) => pr.number).sort((a, b) => a - b);
  assert.deepEqual(numbers, requiredOpenPrs);
  assert.equal(new Set(numbers).size, 14);
});

test('there are zero legacy auth placeholder strings', () => {
  const legacyPlaceholder = ['UNKNOWN', 'AUTH', 'REQUIRED'].join('_');
  assert.equal(JSON.stringify(data).includes(legacyPlaceholder), false);
});

test('exact titles, types, head SHAs, and dispositions are recorded', () => {
  for (const pr of data.openPrs) {
    const [title, type, headSha, disposition] = expected.get(pr.number);
    assert.equal(pr.title, title, `PR #${pr.number} title`);
    assert.equal(pr.type, type, `PR #${pr.number} type`);
    assert.equal(pr.currentHeadSha, headSha, `PR #${pr.number} head SHA`);
    assert.equal(pr.disposition, disposition, `PR #${pr.number} disposition`);
  }
});

test('implementation PRs #284, #286, and #289 have dependencies', () => {
  for (const number of [284, 286, 289]) {
    const pr = data.openPrs.find((entry) => entry.number === number);
    assert.ok(pr.implementationDependencies.length > 0, `PR #${number} has implementation dependencies`);
  }
});

test('superseded legacy PRs point to their replacements', () => {
  assert.equal(data.openPrs.find((pr) => pr.number === 280).replacementPr, 302);
  assert.equal(data.openPrs.find((pr) => pr.number === 281).replacementPr, 298);
  assert.equal(data.openPrs.find((pr) => pr.number === 293).replacementPr, 297);
});

test('commands contain no angle-bracket placeholders', () => {
  for (const pr of data.openPrs) {
    assert.equal(/[<>]/.test(pr.nextCommandLevelAction), false, `PR #${pr.number} command has no placeholder angle brackets`);
  }
});

test('audit documentation is never marked as a runtime fix and stale migrations are not direct merge', () => {
  for (const pr of data.openPrs) {
    if (pr.type === 'audit/documentation') {
      assert.equal(pr.runtimeCode, false, `PR #${pr.number} audit documentation is not runtime code`);
      assert.equal(pr.mergeReadyRuntimeFix, false, `PR #${pr.number} audit documentation is not a runtime fix`);
    }
    if (pr.staleMigrationPr) {
      assert.notEqual(pr.disposition, 'RETAIN_REBASE_COMPLETE', `PR #${pr.number} stale migration is not retained for direct merge`);
    }
  }
});
