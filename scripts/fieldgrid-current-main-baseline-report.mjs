import { readFileSync } from 'node:fs';
const report = JSON.parse(readFileSync(new URL('../docs/testing/current-main-baseline-2026-07-14.json', import.meta.url), 'utf8'));
if (report.baseSha !== '42edb5664ed507ed914b8bebf8847ab1f6e39f74') throw new Error('Unexpected base SHA');
if (report.root.total !== report.root.passed + report.root.failed + report.root.skipped) throw new Error('Root totals do not add up');
if (report.root.failed !== report.failures.length) throw new Error('Failure records do not match failed count');
if (!report.runs.every((run) => run.command && Number.isInteger(run.exitCode) && run.log && run.layer && run.status)) throw new Error('Run evidence is incomplete');
if (!report.failures.every((failure) => failure.test && failure.file && failure.error && failure.existing && failure.ownerTrack && failure.severity && failure.reproducibility && typeof failure.featureFreezeBlocker === 'boolean' && failure.proposedRepairTask)) throw new Error('Failure records are incomplete');
console.log(JSON.stringify({ ok: true, root: report.root, failures: report.failures.length }, null, 2));
