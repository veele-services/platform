import { createHash } from 'node:crypto';

export const CONTRACT = 'fieldgrid-wp1-reset-v2';
export const PROJECT = 'olyfmekyqozxrbrwwszu';
export const REPOSITORY = 'veele-services/platform';
export const WORKFLOW = '.github/workflows/fieldgrid-v1-wp1-clean-base.yml';
export const CONFIRM = Object.freeze({ diagnose: 'fieldgrid-v1-wp1-clean-reset-v1', apply: 'fieldgrid-v1-wp1-staging-application-cleanup-v2', verify: 'fieldgrid-v1-wp1-clean-reset-v1' });
export const MAX_ROWS = 20000;
export const MAX_OBJECTS = 5000;
export const MAX_BYTES = 64 * 1024 * 1024;
export class Wp1Error extends Error {
  constructor(code, phase = 'preflight') { super(`WP1 ${code}`); this.name = 'Wp1Error'; this.code = code; this.phase = phase; }
}
export function fail(code, phase) { throw new Wp1Error(code, phase); }
export function requireThat(condition, code) { if (condition !== true) fail(code); }
export function safeError(error, phase) { return error instanceof Wp1Error ? error : new Wp1Error('OPERATION_FAILED', phase); }
export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
export function hash(value) { return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
export function textHash(value) { return createHash('sha256').update(value).digest('hex'); }
export function uuid(value) { return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5a-f0-9][a-f0-9]{3}-[89ab0-9a-f][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value); }
export function count(value) { return Number.isSafeInteger(value) && value >= 0; }
export function sha(value) { return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value); }
export function digest(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
export function identifier(value) { requireThat(typeof value === 'string' && /^[a-z_][a-z0-9_]{0,62}$/.test(value), 'IDENTIFIER_INVALID'); return `"${value}"`; }
export function relation(value) { const parts = value.split('.'); requireThat(parts.length === 2, 'RELATION_INVALID'); return parts.map(identifier).join('.'); }
export function rowsDigest(rows) { return hash(rows.map(row => JSON.stringify(stable(row))).sort()); }
export function assertReady(report) {
  requireThat(report?.contract === CONTRACT && report.environment === 'staging' && report.project === PROJECT, 'REPORT_IDENTITY');
  requireThat(Array.isArray(report.blockers) && report.blockers.length === 0 && report.readyForReset === true, 'RESET_BLOCKED');
  requireThat(digest(report.inventoryDigest) && digest(report.catalogDigest) && digest(report.journalDigest), 'REPORT_DIGEST');
}
export function publicReport({ sha: sourceSha, mode, inventory, blockers, result = null }) {
  requireThat(sha(sourceSha), 'SHA_INVALID');
  const unique = [...new Set(blockers)].sort();
  requireThat(unique.every(value => typeof value === 'string' && /^[A-Z0-9_]+$/.test(value)), 'BLOCKER_INVALID');
  const counts = Object.fromEntries(Object.entries(inventory.counts).map(([name, value]) => {
    requireThat(/^[a-z_][a-z0-9_]*$/.test(name) && count(value), 'COUNT_INVALID');
    return [name, value];
  }));
  return { contract: CONTRACT, environment: 'staging', project: PROJECT, sha: sourceSha, mode,
    generatedAt: new Date().toISOString(), inventoryDigest: inventory.fingerprint,
    catalogDigest: inventory.catalogDigest, journalDigest: inventory.journalDigest,
    counts, authCandidateCount: inventory.authCandidates.length, storageCandidateCount: inventory.storageCandidates?.length ?? 0,
    blockers: unique, readyForReset: mode === 'diagnose' && unique.length === 0, result };
}
